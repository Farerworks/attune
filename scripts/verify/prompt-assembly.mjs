#!/usr/bin/env node
/**
 * VERIFY-KIT — prompt assembly regression check.
 *
 * Builds real buildBriefingPrompt() output from two real charts (calculateSaju)
 * and checks a battery of BRIEF-070/075 invariants that vitest doesn't directly
 * assert on assembled prompt *text* (label non-leakage, section shape, etc).
 * Also re-checks the BRIEF-078 buildAskTurns date-marker cases standalone.
 *
 * Usage:
 *   npx tsx scripts/verify/prompt-assembly.mjs
 *
 * route.ts (via lib/llm.ts) imports the 'server-only' marker package, which
 * throws unless the Next.js "react-server" export condition is active. Since
 * this script runs as a plain Node/tsx process (no Next.js runtime), we patch
 * Node's CJS loader to hand back an empty module for that one request only —
 * see §2 below. Nothing on disk (node_modules included) is touched.
 */

import Module from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

// ── §2: server-only bypass (process-local, in-memory only) ──────────────────
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'server-only') return {};
  return originalLoad.apply(this, arguments);
};

const { calculateSaju, getDailyPillars, pillarLabel, friendlyPillarName } = await import(path.join(ROOT, 'src/lib/saju.ts'));
const { buildBriefingPrompt } = await import(path.join(ROOT, 'src/lib/briefing.ts'));
const { buildAskTurns, buildAskSystem, hasTodayIntroduced } = await import(path.join(ROOT, 'src/app/api/ask/route.ts'));
const { LENS_FRAGMENTS } = await import(path.join(ROOT, 'src/lib/promptFragments.ts'));
const { ILJU_PROFILES } = await import(path.join(ROOT, 'src/lib/iljuProfiles.ts'));

// ── Checklist harness ────────────────────────────────────────────────────────
const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
}

const INTERNAL_LABELS = [
  'The Mirror', 'The Spark', 'The Anchor', 'The Compass', 'The Root',
  'The Tailwind', 'The Quill', 'The Spotlight', 'The Horizon', 'The Deep Forest',
];

function extractSection(prompt, header) {
  const idx = prompt.indexOf(header);
  if (idx === -1) return '';
  const rest = prompt.slice(idx);
  const endIdx = rest.indexOf('\nOUTPUT INSTRUCTIONS');
  return endIdx === -1 ? rest : rest.slice(0, endIdx);
}

// ── Scenario 1: real charts — me: 1985-11-10 20:30, them: 1998-04-03 (no time) ──
const me   = calculateSaju({ date: '1985-11-10', time: '20:30' });
const them = calculateSaju({ date: '1998-04-03' });

const prompt = buildBriefingPrompt(me, them, 'friend', 'Catching up after a while.');

// 1) Exactly one lens fragment present
{
  const hits = Object.values(LENS_FRAGMENTS).filter(f => prompt.includes(f));
  check('lens fragment: exactly 1 present', hits.length === 1, `found ${hits.length}`);
}

// 2) None of the 10 internal labels leak
{
  const leaked = INTERNAL_LABELS.filter(l => prompt.includes(l));
  check('internal labels: 0 leaked', leaked.length === 0, leaked.join(', '));
}

// 3) Unknown-hour them never gets a "their Hour" branch slot
{
  check('them.pillarsKnown === 6 (fixture sanity)', them.pillarsKnown === 6, `got ${them.pillarsKnown}`);
  check('"their Hour" absent (their birth time is unknown)', !prompt.includes('their Hour'), '');
}

// 4) THEIR UNDERCURRENTS has at most 2 bullet lines
{
  const section = extractSection(prompt, '=== THEIR UNDERCURRENTS');
  const bulletCount = section ? section.split('\n').filter(l => l.startsWith('- ')).length : 0;
  check('THEIR UNDERCURRENTS: <=2 bullets', bulletCount <= 2, `found ${bulletCount}`);
}

// 5) THEIR DAY PROFILE block present, contains their essence, not mine
{
  const theirProfile = ILJU_PROFILES[them.pillars.day.stemHanja + them.pillars.day.branchHanja];
  const myProfile     = ILJU_PROFILES[me.pillars.day.stemHanja + me.pillars.day.branchHanja];
  check('THEIR DAY PROFILE block present', prompt.includes('THEIR DAY PROFILE'), '');
  check('their day-pillar essence present', !!theirProfile && prompt.includes(theirProfile.essence), '');
  check('my day-pillar essence absent', !!myProfile && !prompt.includes(myProfile.essence), '');
}

// 6) gifts / KO fields / traditionNote never leak — force them's day pillar to 癸丑
//    (a real day pillar with both gifts and a traditionNote mentioning "White Tiger")
{
  const guiChou = {
    ...them,
    pillars: {
      ...them.pillars,
      day: { stem: 'Yin Water', branch: 'Ox', stemHanja: '癸', branchHanja: '丑' },
    },
    dayMaster: { stem: 'Yin Water', element: 'water', polarity: 'Yin' },
  };
  const promptGuiChou = buildBriefingPrompt(me, guiChou, 'friend', 'Catching up after a while.');
  const profile = ILJU_PROFILES['癸丑'];

  check('gifts strings absent (癸丑 fixture)', profile.gifts.every(g => !promptGuiChou.includes(g)), '');
  check('KO fields absent (癸丑 fixture)', !promptGuiChou.includes(profile.essenceKo) && !promptGuiChou.includes(profile.coreKo), '');
  check('"White Tiger" (traditionNote) absent (癸丑 fixture)', !promptGuiChou.includes('White Tiger'), '');
}

// ── buildAskSystem TIMING & PREDICTION block (BRIEF-083) ────────────────────

{
  for (const mode of ['me', 'person', 'general']) {
    const system = buildAskSystem(mode, me, mode === 'person' ? them : null, undefined, [], 'Alex', 'Sam');
    check(`askSystem (${mode}): contains "TIMING & PREDICTION"`, system.includes('TIMING & PREDICTION'), '');
    check(`askSystem (${mode}): old canned Korean refusal sentence absent`, !system.includes('예/아니오로 답해 주는 질문은 아니에요'), '');
  }
}

// ── buildAskSystem TODAY identity line (BRIEF-084) ──────────────────────────

{
  const daily = getDailyPillars('2026-07-22', 90); // 2026-07-22 = 丁酉일 (Yin Fire / Rooster)
  const todayLabel = pillarLabel(calculateSaju({ date: '2026-07-22' }).pillars.day); // 丁酉(정유)
  for (const mode of ['me', 'person', 'general']) {
    const system = buildAskSystem(mode, me, mode === 'person' ? them : null, undefined, daily, 'Alex', 'Sam');
    check(`askSystem (${mode}): contains "TODAY" line`, system.includes('TODAY'), '');
    check(`askSystem (${mode}): today's day pillar matches dailyPillars[0]`, system.includes(todayLabel), '');
  }
}

// ── buildAskSystem TODAY-MENTION RESTRAINT (BRIEF-087) ───────────────────────

{
  const daily = getDailyPillars('2026-07-22', 90);
  for (const mode of ['me', 'person', 'general']) {
    const system = buildAskSystem(mode, me, mode === 'person' ? them : null, undefined, daily, 'Alex', 'Sam');
    check(`askSystem (${mode}): contains "TODAY-MENTION RESTRAINT"`, system.includes('TODAY-MENTION RESTRAINT'), '');
  }
}

// ── buildAskSystem friendly day name + context-reference restraint (BRIEF-088) ─

{
  const daily = getDailyPillars('2026-07-22', 90); // 2026-07-22 = 丁酉일 -> Yin Fire / Rooster
  const friendly = friendlyPillarName(calculateSaju({ date: '2026-07-22' }).pillars.day); // Fire Rooster / 불 닭
  for (const mode of ['me', 'person', 'general']) {
    const system = buildAskSystem(mode, me, mode === 'person' ? them : null, undefined, daily, 'Alex', 'Sam');
    check(`askSystem (${mode}): contains "丁酉" hanja`, system.includes('丁酉'), '');
    check(`askSystem (${mode}): contains "정유" reading`, system.includes('정유'), '');
    check(`askSystem (${mode}): contains friendly EN handle "${friendly.en}"`, system.includes(friendly.en), '');
    check(`askSystem (${mode}): contains friendly KO handle "${friendly.ko}"`, system.includes(friendly.ko), '');
    check(`askSystem (${mode}): contains naming rule "Use ONLY the names given in TODAY"`, system.includes('Use ONLY the names given in TODAY'), '');
    check(`askSystem (${mode}): contains context-reference restraint`, system.includes('never cold-open with the announcement again'), '');
  }
}

// ── hasTodayIntroduced + todayIntroduced branch + KO archetype (BRIEF-090) ────

{
  const names = ['乙巳', '을사', '나무 뱀', 'Wood Snake'];
  check(
    'hasTodayIntroduced: assistant message with the name -> true',
    hasTodayIntroduced([{ role: 'assistant', text: '오늘은 을사일이라 차분해요.' }], names) === true,
    '',
  );
  check(
    'hasTodayIntroduced: user-only message with the name -> false',
    hasTodayIntroduced([{ role: 'user', text: '오늘 을사일이야?' }], names) === false,
    '',
  );
}

{
  const daily = getDailyPillars('2026-07-22', 90);
  for (const mode of ['me', 'person', 'general']) {
    const introduced = buildAskSystem(mode, me, mode === 'person' ? them : null, undefined, daily, 'Alex', 'Sam', undefined, true);
    check(`askSystem (${mode}, todayIntroduced=true): contains "TODAY ALREADY INTRODUCED"`, introduced.includes('TODAY ALREADY INTRODUCED'), '');
    check(`askSystem (${mode}, todayIntroduced=true): "FIRST mention of today" absent`, !introduced.includes('FIRST mention of today'), '');

    const notIntroduced = buildAskSystem(mode, me, mode === 'person' ? them : null, undefined, daily, 'Alex', 'Sam', undefined, false);
    check(`askSystem (${mode}, todayIntroduced=false): contains "FIRST mention of today"`, notIntroduced.includes('FIRST mention of today'), '');
    check(`askSystem (${mode}, todayIntroduced=false): "TODAY ALREADY INTRODUCED" absent`, !notIntroduced.includes('TODAY ALREADY INTRODUCED'), '');
  }
}

{
  const daily = getDailyPillars('2026-07-22', 90);
  const meSystem = buildAskSystem('me', me, null, undefined, daily, 'Alex');
  check('askSystem (me): ME ARCHETYPE has a "(KO: ...)" gloss', /ME ARCHETYPE: .+\(KO: .+\)/.test(meSystem), '');

  const personSystem = buildAskSystem('person', me, them, undefined, daily, 'Alex', 'Sam');
  check('askSystem (person): ME ARCHETYPE has a "(KO: ...)" gloss', /ME ARCHETYPE: .+\(KO: .+\)/.test(personSystem), '');
  check('askSystem (person): THEM ARCHETYPE has a "(KO: ...)" gloss', /THEM ARCHETYPE: .+\(KO: .+\)/.test(personSystem), '');
  check('askSystem: contains the Korean-archetype-naming rule', meSystem.includes('never mix the English archetype name into Korean prose'), '');
}

// ── buildAskTurns date-marker cases (BRIEF-078) ──────────────────────────────

function countMarkers(text) {
  return (text.match(/\[new day — \d{4}-\d{2}-\d{2}\]\n/g) ?? []).length;
}

{
  const turns = buildAskTurns(
    [
      { role: 'user', text: 'hi', at: '2026-07-20' },
      { role: 'assistant', text: 'hello', at: '2026-07-20' },
    ],
    'next question',
    '2026-07-20',
  );
  const total = turns.reduce((s, t) => s + countMarkers(t.text), 0);
  check('askTurns: same-day history -> 0 markers', total === 0, `found ${total}`);
}

{
  const turns = buildAskTurns(
    [
      { role: 'user', text: 'hi', at: '2026-07-18' },
      { role: 'assistant', text: 'hello', at: '2026-07-18' },
      { role: 'user', text: 'follow up', at: '2026-07-19' },
      { role: 'assistant', text: 'answer', at: '2026-07-19' },
    ],
    'another question',
    '2026-07-19',
  );
  const total = turns.reduce((s, t) => s + countMarkers(t.text), 0);
  check('askTurns: mid-history date change -> 1 marker', total === 1, `found ${total}`);
}

{
  const turns = buildAskTurns(
    [
      { role: 'user', text: 'hi', at: '2026-07-19' },
      { role: 'assistant', text: 'hello', at: '2026-07-19' },
    ],
    'today question',
    '2026-07-20',
  );
  const last = turns[turns.length - 1];
  check('askTurns: yesterday history + today question -> marker on question', last.text.startsWith('[new day — 2026-07-20]\n'), last.text.slice(0, 40));
}

{
  const turns = buildAskTurns(
    [
      { role: 'user', text: 'hi' },
      { role: 'assistant', text: 'hello' },
    ],
    'question',
    '2026-07-20',
  );
  const total = turns.reduce((s, t) => s + countMarkers(t.text), 0);
  check('askTurns: no `at` anywhere (old client) -> 0 markers', total === 0, `found ${total}`);
}

// ── Report ────────────────────────────────────────────────────────────────────

let failures = 0;
for (const r of results) {
  const mark = r.pass ? 'PASS' : 'FAIL';
  if (!r.pass) failures++;
  console.log(`[${mark}] ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
}

console.log('');
if (failures === 0) {
  console.log('ALL PASS');
  process.exit(0);
} else {
  console.log(`${failures} check(s) FAILED`);
  process.exit(1);
}
