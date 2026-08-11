#!/usr/bin/env node
/**
 * VERIFY-KIT — voice baseline collector (BRIEF-104A).
 *
 * Runs the fixed 6-turn §4 scenario (EN + KO, 2 runs each = 24 base calls) through the REAL
 * /api/ask assembly + REAL Gemini, and saves what the user actually saw (`finalPass`) alongside
 * the model's raw first attempt (`firstPass`) before any correction turn. This script changes
 * NOTHING in `src/` — it is read-only against the product code.
 *
 * Usage:
 *   npx tsx scripts/verify/voice-baseline.mjs --selftest
 *     Pure-function checks only (§3 metric functions). No API key needed, no network calls.
 *
 *   GEMINI_MODEL=gemini-3.5-flash-lite npx tsx scripts/verify/voice-baseline.mjs
 *     Full collection run: 24 base calls + any correction calls the product itself would spend.
 *     Requires GEMINI_API_KEY (from .env.local or env) and GEMINI_MODEL=gemini-3.5-flash-lite —
 *     see §2.1 below for why the model must be pinned explicitly.
 *
 *   npx tsx scripts/verify/voice-baseline.mjs --metrics [--date=YYYYMMDD]
 *     Reads the saved samples/voice-baseline/*.json for that date and writes
 *     samples/voice-baseline/metrics-<date>.tsv (§3). No network calls.
 *
 * Optional flags for the collection run:
 *   --force-model=<name>   Bypass the model gate for a DIAGNOSTIC run only. Such a run is tagged
 *                           `modelGateForced: true` in its output and does NOT count toward the
 *                           104A completion condition (BRIEF-104A §2.1).
 *   --interval=<ms>        Override the delay between Gemini calls (default 4000ms — see §2.3).
 *
 * §2 server-only bypass (identical technique to prompt-assembly.mjs — process-local only, never
 * touches node_modules on disk):
 */

import Module from 'node:module';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const SELF_PATH = fileURLToPath(import.meta.url);

const originalLoad = Module._load;
Module._load = function (request, _parent, _isMain) {
  void _parent; void _isMain;
  if (request === 'server-only') return {};
  return originalLoad.apply(this, arguments);
};

// ── CLI args ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const has = flag => argv.includes(flag);
const opt = (name, def) => {
  const pre = `--${name}=`;
  const hit = argv.find(a => a.startsWith(pre));
  return hit ? hit.slice(pre.length) : def;
};

const MODE_SELFTEST = has('--selftest');
const MODE_METRICS = has('--metrics');
const FORCE_MODEL = opt('force-model', null);
const CALL_INTERVAL_MS = Number(opt('interval', '4000'));
const METRICS_DATE = opt('date', null);

// ═══════════════════════════════════════════════════════════════════════════════
// §3 — pure metric functions (M1–M7). No API calls, no route.ts imports needed —
// these operate only on already-collected turn records, so --selftest can run
// under plain `node` (no TypeScript involved) as well as `npx tsx`.
// ═══════════════════════════════════════════════════════════════════════════════

// Vocabulary constant for M2 (see scripts/verify/README.md §5 for the full rationale/list).
export const CHART_VOCAB_TOKENS = [
  // Five elements (EN)
  'wood', 'fire', 'earth', 'metal', 'water',
  // Five elements (KO — Sino-Korean single char + native word)
  '목', '화', '토', '금', '수', '나무', '불', '흙', '쇠', '물',
  // Ten heavenly stems (hanja + KO reading)
  '甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸',
  '갑', '을', '병', '정', '무', '기', '경', '신', '임', '계',
  // Twelve earthly branches (hanja + KO reading + KO animal name)
  '子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥',
  '자', '축', '인', '묘', '진', '사', '오', '미', '유', '술', '해',
  '쥐', '소', '호랑이', '토끼', '용', '뱀', '말', '양', '원숭이', '닭', '개', '돼지',
  // generic chart/archetype vocabulary
  'archetype', 'chart', 'day master', '사주', '일주', '원형', '기운', '오행',
];

/** M3's "user-visible body text" scope — parts[].text + timing + followUp, plain {text} + followUp.
 * Excludes: JSON keys, `memory` (never shown), and part LABELS (fixed constants, not prose —
 * see BRIEF-104A §3 M3 for why labels are deliberately excluded from length/word counts). */
export function extractDisplayTexts(answer) {
  if (!answer || typeof answer !== 'object') return [];
  const texts = [];
  if (Array.isArray(answer.parts)) {
    for (const p of answer.parts) {
      if (p && typeof p.text === 'string') texts.push(p.text);
    }
    if (typeof answer.timing === 'string' && answer.timing) texts.push(answer.timing);
  } else if (typeof answer.text === 'string') {
    texts.push(answer.text);
  }
  if (typeof answer.followUp === 'string' && answer.followUp) texts.push(answer.followUp);
  return texts;
}

export function shapeOf(answer) {
  return answer && Array.isArray(answer.parts) ? 'parts' : 'text';
}

/** Word count over the M3 scope. EN and KO both split on whitespace (Korean 어절 = space-separated
 * unit, same operation as an English word split — no morphological analysis needed or wanted here). */
export function countWords(texts) {
  const joined = texts.join(' ').trim();
  if (!joined) return 0;
  return joined.split(/\s+/).filter(Boolean).length;
}

/** M1 — reintroduction violation present, turns 2+ only (turn 1 can never be a re-introduction). */
export function computeM1(violations, turnNumber) {
  if (turnNumber < 2) return 0;
  return violations.some(v => v.type === 'reintroduction') ? 1 : 0;
}

/** M2 — chart-vocabulary token hits (occurrence count, not unique tokens). EN tokens use \b word
 * boundaries + case-insensitive match; KO/hanja tokens use plain substring count (Korean text has
 * no reliable \b boundary — see route.ts's own normalizeForMatch precedent for why this repo
 * avoids \b on Hangul). */
export function computeM2(text) {
  let count = 0;
  for (const tok of CHART_VOCAB_TOKENS) {
    const isAscii = /^[a-zA-Z ]+$/.test(tok);
    if (isAscii) {
      const re = new RegExp(`\\b${tok.replace(/ /g, '\\s+')}\\b`, 'gi');
      const m = text.match(re);
      if (m) count += m.length;
    } else {
      let idx = 0;
      while (true) {
        const found = text.indexOf(tok, idx);
        if (found === -1) break;
        count++;
        idx = found + tok.length;
      }
    }
  }
  return count;
}

/** M4 — assertive-language candidates. Word-boundary required on both sides (brief's explicit
 * requirement); Korean side uses a negative-lookahead in place of \b, same reasoning as M2/route.ts. */
const M4_EN = /\b(always|never|will|definitely|guarantee[ds]?)\b/gi;
const M4_KO = /(항상|절대|반드시|할\s*거예요|될\s*거예요)/g;

export function computeM4(text) {
  const contexts = [];
  let count = 0;
  for (const re of [M4_EN, M4_KO]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      count++;
      contexts.push(sentenceAround(text, m.index));
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  return { count, contexts };
}

/** M5 — first 12 words, verbatim, no classification (classification is a human/본부 step). */
export function computeM5(text) {
  return text.trim().split(/\s+/).filter(Boolean).slice(0, 12).join(' ');
}

/** M6 — hidden-truth/verdict-opening violations (from validateAskAnswer) + regex candidates. */
const M6_PATTERN = /(진짜\s*마음|진짜\s*이유|real(?:ly)?\s*feel|deep\s*down)/gi;

export function computeM6(text, violations) {
  const contexts = [];
  let count = 0;
  if (violations.some(v => v.type === 'hidden_truth_framing')) count++;
  if (violations.some(v => v.type === 'verdict_opening')) count++;
  M6_PATTERN.lastIndex = 0;
  let m;
  while ((m = M6_PATTERN.exec(text)) !== null) {
    count++;
    contexts.push(sentenceAround(text, m.index));
    if (m[0].length === 0) M6_PATTERN.lastIndex++;
  }
  return { count, contexts };
}

/** Best-effort sentence extraction around a regex match index, for M4/M6 evidence columns. */
function sentenceAround(text, index) {
  const before = text.lastIndexOf('.', index);
  const beforeAlt = Math.max(before, text.lastIndexOf('\n', index));
  const start = beforeAlt === -1 ? 0 : beforeAlt + 1;
  let end = text.indexOf('.', index);
  if (end === -1) end = text.length;
  else end += 1;
  return text.slice(start, end).trim();
}

/** M7 — surface duplication. Normalized-token Jaccard >= 0.6 between sentences of DIFFERENT turns.
 * `turnsSentences` = array (index = turn 0-based) of that turn's sentence array. Returns, per turn,
 * the count of its sentences that pair >=0.6 with any EARLIER turn's sentence (so summing the
 * per-turn column gives the run total without double-counting a pair from both sides). */
function normalizeTokens(sentence) {
  return sentence.toLowerCase().replace(/[.,!?;:'"()—–\-]/g, '').split(/\s+/).filter(Boolean);
}

function jaccard(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 && sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : inter / union;
}

export function computeM7PerTurn(turnsSentences) {
  const perTurn = turnsSentences.map(() => 0);
  for (let i = 0; i < turnsSentences.length; i++) {
    for (const si of turnsSentences[i]) {
      const ti = normalizeTokens(si);
      for (let j = 0; j < i; j++) {
        for (const sj of turnsSentences[j]) {
          const tj = normalizeTokens(sj);
          if (jaccard(ti, tj) >= 0.6) { perTurn[i]++; break; }
        }
      }
    }
  }
  return perTurn;
}

// ── §2.5 self-test (pure — no network, no route.ts import) ───────────────────────────────────
function runSelfTest() {
  const results = [];
  const check = (name, pass, detail) => results.push({ name, pass, detail });

  // M3 — extractDisplayTexts / shapeOf / countWords
  {
    const partsAnswer = {
      parts: [{ label: 'A', text: 'one two three' }, { label: 'B', text: 'four five' }],
      timing: 'six seven',
      followUp: 'eight',
      memory: ['should not be counted'],
    };
    const texts = extractDisplayTexts(partsAnswer);
    check('extractDisplayTexts: parts+timing+followUp collected, memory excluded',
      texts.join('|') === 'one two three|four five|six seven|eight', texts.join('|'));
    check('shapeOf: parts -> "parts"', shapeOf(partsAnswer) === 'parts', shapeOf(partsAnswer));
    check('countWords: 8 words total', countWords(texts) === 8, String(countWords(texts)));

    const textAnswer = { text: 'a b c', followUp: 'd e' };
    check('shapeOf: text -> "text"', shapeOf(textAnswer) === 'text', shapeOf(textAnswer));
    check('countWords: text+followUp = 5', countWords(extractDisplayTexts(textAnswer)) === 5, '');

    check('extractDisplayTexts: label text never included',
      !texts.some(t => t.includes('A') || t.includes('B')), '');
  }

  // M1
  {
    check('M1: turn 1 always 0 even with reintroduction violation',
      computeM1([{ type: 'reintroduction' }], 1) === 0, '');
    check('M1: turn 2 with reintroduction -> 1',
      computeM1([{ type: 'reintroduction' }], 2) === 1, '');
    check('M1: turn 3 with no reintroduction -> 0',
      computeM1([{ type: 'label_set' }], 3) === 0, '');
  }

  // M2
  {
    check('M2: EN element word boundary (does not match inside "firewood")',
      computeM2('firewood') === 0, String(computeM2('firewood')));
    check('M2: EN "fire" as its own word counts once',
      computeM2('a fire day') === 1, String(computeM2('a fire day')));
    check('M2: KO hanja stem 甲 counts as substring',
      computeM2('甲 energy') === 1, String(computeM2('甲 energy')));
  }

  // M4
  {
    const r1 = computeM4('This will definitely happen.');
    check('M4: "will" + "definitely" = 2 hits', r1.count === 2, String(r1.count));
    const r2 = computeM4('willpower is not a match');
    check('M4: "willpower" does not match bare "will" (word boundary)', r2.count === 0, String(r2.count));
    const r3 = computeM4('항상 할 거예요');
    check('M4: KO "항상" + "할 거예요" = 2 hits', r3.count === 2, String(r3.count));
  }

  // M5
  {
    const words = Array.from({ length: 20 }, (_, i) => `w${i + 1}`).join(' ');
    const first12 = computeM5(words);
    check('M5: exactly first 12 words, verbatim', first12 === Array.from({ length: 12 }, (_, i) => `w${i + 1}`).join(' '), first12);
  }

  // M6
  {
    const r1 = computeM6('진짜 마음을 알 수 있어요', []);
    check('M6: regex candidate "진짜 마음" counts', r1.count === 1, String(r1.count));
    const r2 = computeM6('plain text', [{ type: 'hidden_truth_framing' }, { type: 'verdict_opening' }]);
    check('M6: both violation types counted', r2.count === 2, String(r2.count));
  }

  // M7
  {
    const turnsSentences = [
      ['I think you should talk to them soon.'],
      ['You should probably talk to them soon.'], // near-duplicate of turn 0
      ['Completely unrelated sentence about weather.'],
    ];
    const perTurn = computeM7PerTurn(turnsSentences);
    check('M7: turn 0 has 0 duplicate pairs (nothing earlier to compare)', perTurn[0] === 0, JSON.stringify(perTurn));
    check('M7: turn 1 pairs with turn 0 (near-duplicate) -> 1', perTurn[1] === 1, JSON.stringify(perTurn));
    check('M7: turn 2 unrelated -> 0', perTurn[2] === 0, JSON.stringify(perTurn));
  }

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
    console.log(`[FAIL] ${failures} check(s) failed`);
    process.exit(1);
  }
}

if (MODE_SELFTEST) {
  runSelfTest();
}

// ═══════════════════════════════════════════════════════════════════════════════
// §3 — metrics TSV writer (reads saved JSON run files; no network, no route.ts import)
// ═══════════════════════════════════════════════════════════════════════════════

function pad2(n) { return String(n).padStart(2, '0'); }
function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

function splitSentencesLocal(text) {
  // Same regex as src/lib/hiddenTruth.ts's splitSentences (route.ts:15/hiddenTruth.ts) — mirrored
  // here (not imported) so --metrics mode never touches a .ts import and can run under plain
  // `node`, not just `npx tsx`.
  return text.split(/(?<=[.!?。])\s+|\n+/).filter(s => s.trim().length > 0);
}

function writeMetricsTsv() {
  const date = METRICS_DATE ?? todayYmd();
  const dir = path.join(ROOT, 'samples', 'voice-baseline');
  if (!existsSync(dir)) {
    console.error(`[FAIL] no samples directory: ${dir}`);
    process.exit(1);
  }
  const files = readdirSync(dir).filter(f => f.endsWith('.json') && f.includes(`-${date}-`));
  if (files.length === 0) {
    console.error(`[FAIL] no run JSON files found for date ${date} in ${dir}`);
    process.exit(1);
  }

  const rows = [];
  const header = [
    'run', 'lang', 'turn', 'userText',
    'M1_first', 'M1_final',
    'M2_first', 'M2_final',
    'M3_wordcount_first', 'M3_wordcount_final',
    'M3_shape_first', 'M3_shape_final',
    'M3_ratio_vs_turn1_first', 'M3_ratio_vs_turn1_final',
    'M4_first', 'M4_final', 'M4_context_first', 'M4_context_final',
    'M5_first', 'M5_final',
    'M6_first', 'M6_final', 'M6_context_first', 'M6_context_final',
    'M7_first', 'M7_final',
    'M7b_verdict', 'M7b_evidence',
    'extraCallUsed', 'corrected',
  ];
  rows.push(header.join('\t'));

  for (const file of files.sort()) {
    const full = JSON.parse(readFileSync(path.join(dir, file), 'utf-8'));
    const runId = file.replace(/\.json$/, '');
    const lang = full.meta.lang;
    const turns = full.turns;

    const firstSentences = turns.map(t => splitSentencesLocal(extractDisplayTexts(t.firstPass.parsed).join(' ')));
    const finalSentences = turns.map(t => splitSentencesLocal(extractDisplayTexts(t.finalPass.parsed).join(' ')));
    const m7First = computeM7PerTurn(firstSentences);
    const m7Final = computeM7PerTurn(finalSentences);

    let turn1WordsFirst = null;
    let turn1WordsFinal = null;

    turns.forEach((t, idx) => {
      const n = t.turn;
      const textFirst = extractDisplayTexts(t.firstPass.parsed).join(' ');
      const textFinal = extractDisplayTexts(t.finalPass.parsed).join(' ');
      const wcFirst = countWords(extractDisplayTexts(t.firstPass.parsed));
      const wcFinal = countWords(extractDisplayTexts(t.finalPass.parsed));
      if (n === 1) { turn1WordsFirst = wcFirst; turn1WordsFinal = wcFinal; }
      const ratioFirst = (n >= 4 && turn1WordsFirst) ? (wcFirst / turn1WordsFirst).toFixed(2) : '';
      const ratioFinal = (n >= 4 && turn1WordsFinal) ? (wcFinal / turn1WordsFinal).toFixed(2) : '';

      const m4First = computeM4(textFirst);
      const m4Final = computeM4(textFinal);
      const m6First = computeM6(textFirst, t.firstPass.violations);
      const m6Final = computeM6(textFinal, t.finalPass.violations);

      const cell = s => String(s ?? '').replace(/\t/g, ' ').replace(/\n/g, ' \\n ');

      rows.push([
        runId, lang, n, cell(t.userText),
        computeM1(t.firstPass.violations, n), computeM1(t.finalPass.violations, n),
        computeM2(textFirst), computeM2(textFinal),
        wcFirst, wcFinal,
        shapeOf(t.firstPass.parsed), shapeOf(t.finalPass.parsed),
        ratioFirst, ratioFinal,
        m4First.count, m4Final.count, cell(m4First.contexts.join(' / ')), cell(m4Final.contexts.join(' / ')),
        cell(computeM5(textFirst)), cell(computeM5(textFinal)),
        m6First.count, m6Final.count, cell(m6First.contexts.join(' / ')), cell(m6Final.contexts.join(' / ')),
        m7First[idx], m7Final[idx],
        '', '', // M7b_verdict / M7b_evidence — left blank per BRIEF-104A §6 (farr02 must not fill these)
        t.extraCallUsed, t.finalPass.corrected,
      ].join('\t'));
    });
  }

  mkdirSync(dir, { recursive: true });
  const outPath = path.join(dir, `metrics-${date}.tsv`);
  writeFileSync(outPath, rows.join('\n') + '\n', 'utf-8');
  console.log(`Saved → ${outPath}`);
  console.log(`${rows.length - 1} data rows from ${files.length} run file(s).`);
}

if (MODE_METRICS) {
  writeMetricsTsv();
  process.exit(0);
}

// ═══════════════════════════════════════════════════════════════════════════════
// §2.1 — fail-closed gates (collection mode only)
// ═══════════════════════════════════════════════════════════════════════════════

// Load .env.local the same way scripts/sample.ts does, without overwriting already-set env vars.
try {
  const envFile = readFileSync(path.join(ROOT, '.env.local'), 'utf-8');
  for (const line of envFile.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
} catch { /* no .env.local — rely on already-set env vars */ }

const PRODUCTION_MODEL = 'gemini-3.5-flash-lite';
let modelGateForced = false;

if (FORCE_MODEL) {
  process.env.GEMINI_MODEL = FORCE_MODEL;
  modelGateForced = true;
}

// Mirrors llm.ts:4's own default-fallback formula exactly (GEMINI_MODEL is not exported, so this
// one-line env-read is duplicated here only to gate BEFORE importing llm.ts — the real value that
// actually gets used for the API calls is computed independently, inside the imported llm.ts).
const EFFECTIVE_MODEL = (process.env.GEMINI_MODEL ?? '').trim() || 'gemini-2.5-flash';

if (EFFECTIVE_MODEL !== PRODUCTION_MODEL && !modelGateForced) {
  console.error(`[FAIL] model gate — GEMINI_MODEL resolves to "${EFFECTIVE_MODEL}", not "${PRODUCTION_MODEL}".`);
  console.error(`       A baseline collected on any other model is invalid (BRIEF-104A §2.1).`);
  console.error(`       Fix: run with GEMINI_MODEL=${PRODUCTION_MODEL} set in the environment.`);
  console.error(`       Diagnostic-only override: --force-model=<name> (excluded from the 104A completion condition).`);
  process.exit(1);
}
if (modelGateForced) {
  console.error(`[WARN] model gate FORCED to "${EFFECTIVE_MODEL}" via --force-model — this run does NOT count toward BRIEF-104A completion.`);
}

if (!process.env.GEMINI_API_KEY) {
  console.error('[FAIL] GEMINI_API_KEY is not set (checked .env.local and environment). exit 1 — BRIEF-104A §2.1 does not use scripts/sample.ts\'s exit-0 convention here.');
  process.exit(1);
}

const LLM_PROVIDER = process.env.LLM_PROVIDER ?? 'gemini';
if (LLM_PROVIDER !== 'gemini') {
  console.error(`[FAIL] LLM_PROVIDER="${LLM_PROVIDER}", not "gemini" (llm.ts:136 default). exit 1.`);
  process.exit(1);
}

const GENERATION_CONFIG_BRANCH = EFFECTIVE_MODEL.startsWith('gemini-2.') ? 'legacy(gemini-2.x: temperature+thinkingBudget)' : 'new(no temperature, thinkingLevel=minimal)';

console.log(`[gate] model=${EFFECTIVE_MODEL} (forced=${modelGateForced}) provider=${LLM_PROVIDER} generationConfigBranch=${GENERATION_CONFIG_BRANCH}`);

// ═══════════════════════════════════════════════════════════════════════════════
// §2.2 — imports (server-only bypass already installed above)
// ═══════════════════════════════════════════════════════════════════════════════

const { calculateSaju, getDailyPillars, pillarLabel, friendlyPillarName } =
  await import(path.join(ROOT, 'src/lib/saju.ts'));
const {
  buildAskSystem, buildAskTurns, hasTodayIntroduced, themNameCandidates, hasPersonIntroduced,
  detectAskMode, detectContinuationHint, validateAskAnswer, tryParse, tryPlainTextFallback,
} = await import(path.join(ROOT, 'src/app/api/ask/route.ts'));
const { createLlmProvider } = await import(path.join(ROOT, 'src/lib/llm.ts'));

// ═══════════════════════════════════════════════════════════════════════════════
// Functions mirrored from route.ts because they are NOT exported (route.ts:755, 933, 1070, 989,
// 109, 103/19) — src/ stays fully untouched (BRIEF-104A §6); these are read-only duplicates of
// pure logic, verified line-for-line against the base commit at the time of writing (see
// docs/reports/BRIEF-104A.md for the exact commit SHA these were copied from).
// ═══════════════════════════════════════════════════════════════════════════════

// route.ts:19
const BANNED = ['weakness', 'exploit', 'leverage against', 'manipulate', 'vulnerable to', '약점', '조종', '공략', '사주상 충동적인', 'impulsive day in your chart'];
// route.ts:103-106
function findBannedMirror(text) {
  const lower = text.toLowerCase();
  return BANNED.filter(w => lower.includes(w));
}

// route.ts:109-115
function todayNameCandidatesMirror(dayPillar) {
  const hanja = dayPillar.stemHanja + dayPillar.branchHanja;
  const koMatch = pillarLabel(dayPillar).match(/\(([^)]+)\)/);
  const ko = koMatch ? koMatch[1] : '';
  const friendly = friendlyPillarName(dayPillar);
  return [hanja, ko, friendly.ko, friendly.en];
}

// route.ts:31-38
function withTimeoutMirror(p, ms) {
  return Promise.race([
    p,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`LLM timed out after ${ms}ms`)), ms)),
  ]);
}

// route.ts:1117-1136
async function callModelMirror(provider, system, turns, timeoutMs) {
  try {
    const raw = await withTimeoutMirror(
      provider.generateJsonChat(system, turns, { maxTokens: 4096, thinkingBudget: 1024, temperature: 0.7 }),
      timeoutMs,
    );
    return { ok: true, raw };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const errName = err instanceof Error ? err.name : 'Error';
    const geminiMatch = msg.match(/^Gemini API error (\d+):/);
    if (geminiMatch) {
      const status = Number(geminiMatch[1]);
      const retryable = status === 429 || status >= 500;
      return { ok: false, status, timeout: false, failFast: !retryable, errName };
    }
    if (msg.includes('returned no text')) return { ok: false, timeout: false, failFast: false, errName };
    if (msg.includes('LLM timed out after')) return { ok: false, timeout: true, failFast: false, errName };
    if (msg.includes('GEMINI_API_KEY environment variable is not set')) return { ok: false, timeout: false, failFast: true, errName };
    return { ok: false, timeout: false, failFast: false, errName };
  }
}

// route.ts:755-807
function normalizeAnswerMirror(mode, raw) {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw;

  if (mode === 'me' || mode === 'general') {
    return typeof r.text === 'string' ? { text: r.text, ...(typeof r.followUp === 'string' && r.followUp ? { followUp: r.followUp } : {}) } : null;
  }

  const mem = Array.isArray(r.memory)
    ? r.memory.filter(x => typeof x === 'string' && x.trim() !== '').slice(0, 2)
    : [];

  if (typeof r.text === 'string' && !Array.isArray(r.parts)) {
    return {
      text: r.text,
      ...(typeof r.followUp === 'string' && r.followUp ? { followUp: r.followUp } : {}),
      ...(mem.length > 0 ? { memory: mem } : {}),
    };
  }

  if (!Array.isArray(r.parts) || r.parts.length !== 3) return null;
  for (const p of r.parts) {
    if (typeof p.label !== 'string' || typeof p.text !== 'string') return null;
  }

  let timing;
  if (r.timing !== undefined) {
    if (typeof r.timing === 'string') {
      timing = r.timing || undefined;
    } else if (typeof r.timing === 'object' && r.timing !== null) {
      const t = r.timing;
      const segs = [];
      if (Array.isArray(t.favorable_dates) && t.favorable_dates.length > 0) segs.push(`Favorable: ${t.favorable_dates.join(', ')}.`);
      if (Array.isArray(t.avoid_dates) && t.avoid_dates.length > 0) segs.push(`Avoid: ${t.avoid_dates.join(', ')}.`);
      timing = segs.length > 0 ? segs.join(' ') : undefined;
    }
  }

  return {
    parts: r.parts,
    ...(timing !== undefined ? { timing } : {}),
    ...(typeof r.followUp === 'string' && r.followUp ? { followUp: r.followUp } : {}),
    ...(mem.length > 0 ? { memory: mem } : {}),
  };
}

// route.ts:820-827 (helpers used by fixLabelOrderMirror)
const UNDERSTAND_LABELS_M = ["WHAT'S LIKELY GOING ON", 'WHY THIS MAY HAVE HAPPENED', 'WHAT YOU CAN DO'];
const DECIDE_LABELS_M = ['LIKELY RECEPTION', 'WHAT COULD BACKFIRE', 'HOW TO IMPROVE YOUR ODDS'];
function partsLabelsMirror(answer) {
  if (!Array.isArray(answer.parts)) return null;
  return answer.parts.map(p => p.label);
}
function isExactSetMirror(labels, set) {
  return labels.length === set.length && set.every(l => labels.includes(l));
}

// route.ts:933-944
function fixLabelOrderMirror(answer) {
  const labels = partsLabelsMirror(answer);
  if (labels === null) return { answer, fixed: false };
  const matchesUnderstand = isExactSetMirror(labels, UNDERSTAND_LABELS_M);
  const matchesDecide = isExactSetMirror(labels, DECIDE_LABELS_M);
  if (!matchesUnderstand && !matchesDecide) return { answer, fixed: false };
  const canonical = matchesUnderstand ? UNDERSTAND_LABELS_M : DECIDE_LABELS_M;
  if (labels.every((l, i) => l === canonical[i])) return { answer, fixed: false };
  const parts = answer.parts;
  const reordered = canonical.map(label => parts.find(p => p.label === label));
  return { answer: { ...answer, parts: reordered }, fixed: true };
}

// route.ts:948-956
function normalizeLabelsMirror(answer) {
  const parts = answer.parts;
  const labels = parts.map(p => p.label);
  const understandMatches = labels.filter(l => UNDERSTAND_LABELS_M.includes(l)).length;
  const decideMatches = labels.filter(l => DECIDE_LABELS_M.includes(l)).length;
  const winning = understandMatches >= decideMatches ? UNDERSTAND_LABELS_M : DECIDE_LABELS_M;
  const newParts = parts.map((p, i) => ({ ...p, label: winning[i] }));
  return { ...answer, parts: newParts };
}

// route.ts:960-966
function downgradeToTextMirror(answer) {
  const parts = answer.parts;
  const combined = parts.map(p => p.text).join('\n\n');
  const { parts: _p, timing: _t, ...rest } = answer;
  void _p; void _t;
  return { ...rest, text: combined };
}

// route.ts:969-973
function stripFollowUpMirror(answer) {
  const { followUp: _f, ...rest } = answer;
  void _f;
  return rest;
}

// route.ts:439-441
function splitNonEmptyLinesMirror(text) {
  return text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
}

// route.ts:417-437 — needed by truncateScriptLinesMirror via applyFinalDispositionMirror.
// (This one IS also duplicated even though a near-twin isn't exported; parseScriptRequest itself
// IS exported from route.ts, so we use the real one instead of mirroring it — see import below.)

// route.ts:978-983
function truncateScriptLinesMirror(answer, count) {
  if (typeof answer.text !== 'string') return answer;
  const lines = splitNonEmptyLinesMirror(answer.text);
  if (lines.length <= count) return answer;
  return { ...answer, text: lines.slice(0, count).join('\n') };
}

const { parseScriptRequest } = await import(path.join(ROOT, 'src/app/api/ask/route.ts'));

// route.ts:989-1048
function applyFinalDispositionMirror(answer, violations, ctx) {
  let out = answer;
  const flags = [];
  const hasType = t => violations.some(v => v.type === t);

  if (hasType('strict_script_parts')) {
    out = downgradeToTextMirror(out);
    flags.push({ stage: 'script', action: 'downgrade' });
  } else if (hasType('completion_parts')) {
    out = downgradeToTextMirror(out);
    flags.push({ stage: 'completion', action: 'downgrade' });
  } else if (hasType('label_set')) {
    out = normalizeLabelsMirror(out);
    flags.push({ stage: 'labels', action: 'normalize' });
  }

  const scriptViolations = violations.filter(v => v.type === 'script_contract');
  if (scriptViolations.some(v => v.detail === 'followup')) {
    out = stripFollowUpMirror(out);
    flags.push({ stage: 'script', action: 'strip_followup' });
  }
  if (scriptViolations.some(v => v.detail === 'count')) {
    const request = parseScriptRequest(ctx.latestUserText);
    const lineCount = typeof out.text === 'string' ? splitNonEmptyLinesMirror(out.text).length : -1;
    if (request && lineCount > request.count) {
      out = truncateScriptLinesMirror(out, request.count);
      flags.push({ stage: 'script', action: 'truncate' });
    } else {
      flags.push({ stage: 'script', action: 'soft' });
    }
  }
  if (scriptViolations.some(v => v.detail === 'format')) flags.push({ stage: 'script', action: 'soft' });
  if (scriptViolations.some(v => v.detail === 'unit')) flags.push({ stage: 'script', action: 'soft' });

  const completionViolations = violations.filter(v => v.type === 'completion_contract');
  if (completionViolations.some(v => v.detail === 'followup')) {
    out = stripFollowUpMirror(out);
    flags.push({ stage: 'completion', action: 'strip_followup' });
  }
  if (completionViolations.some(v => v.detail === 'format')) flags.push({ stage: 'completion', action: 'soft' });

  if (hasType('reintroduction')) flags.push({ stage: 'reintro', action: 'soft' });
  if (hasType('verdict_opening')) flags.push({ stage: 'verdict', action: 'soft' });
  if (hasType('hidden_truth_framing')) flags.push({ stage: 'framing', action: 'soft' });
  return { answer: out, flags };
}

// route.ts:1070-1109
function buildCorrectionWarningsMirror(schemaInvalid, banned, violations) {
  const warnings = [];
  if (schemaInvalid) warnings.push('⚠ SCHEMA VIOLATION — Response did not match required JSON shape. Return exactly the specified schema.');
  if (banned.length > 0) warnings.push(`⚠ BANNED PHRASES — Found: ${banned.map(v => `"${v}"`).join(', ')}. Regenerate without these phrases.`);
  for (const v of violations) {
    switch (v.type) {
      case 'label_set':
        warnings.push('⚠ LABEL SET VIOLATION — Use all three labels from exactly one set (never mix the DECIDE and UNDERSTAND sets). Regenerate with a single consistent label set.');
        break;
      case 'strict_script_parts':
        warnings.push('⚠ SCRIPT CONTRACT VIOLATION — The user asked for exact message lines. Respond in shape 2 ({"text": ...}) with no parts/labels. Regenerate in that shape.');
        break;
      case 'reintroduction':
        warnings.push(`⚠ REINTRODUCTION VIOLATION — You named "${v.detail}", but their identity was already introduced earlier in this conversation. Do not re-name or re-explain it. Regenerate without it.`);
        break;
      case 'verdict_opening':
        warnings.push('⚠ VERDICT OPENING VIOLATION — Do not open by confirming a fixed personality trait. Start with honest uncertainty and offer two situational readings instead. Regenerate.');
        break;
      case 'script_contract':
        if (v.detail === 'count') warnings.push('⚠ SCRIPT LINE COUNT VIOLATION — The number of lines did not match the count the user asked for. Regenerate with EXACTLY that many lines, one per line, nothing else.');
        else if (v.detail === 'format') warnings.push('⚠ SCRIPT FORMAT VIOLATION — No numbering, bullets, labels, or "/" separators are allowed in a script answer. Regenerate as plain lines only.');
        else if (v.detail === 'followup') warnings.push('⚠ SCRIPT FOLLOWUP VIOLATION — A script answer must not include a followUp. Regenerate without one.');
        else if (v.detail === 'unit') warnings.push('⚠ SCRIPT UNIT VIOLATION — The user asked for a count of sentences/messages, not lines. When the count is for sentences, each line must be exactly one sentence; when it is for messages, at most two short sentences per line. Regenerate respecting that unit.');
        break;
      case 'hidden_truth_framing':
        warnings.push('⚠ HIDDEN-TRUTH FRAMING VIOLATION — Do not claim the other person\'s real feelings or reasons can be known from a reaction or the chart. Regenerate without that claim — a limiting/uncertain phrasing is fine.');
        break;
      case 'completion_parts':
        warnings.push('⚠ COMPLETION CONTRACT VIOLATION — The user asked for something ready to send. Respond in shape 2 ({"text": ...}) with no parts/labels. Regenerate in that shape.');
        break;
      case 'completion_contract':
        if (v.detail === 'followup') warnings.push('⚠ COMPLETION FOLLOWUP VIOLATION — A ready-to-send answer must not include a followUp. Regenerate without one.');
        else if (v.detail === 'format') warnings.push('⚠ COMPLETION FORMAT VIOLATION — No numbering, bullets, labels, or "/" separators. Regenerate as plain sendable lines only.');
        break;
      case 'label_order':
        break;
    }
  }
  return warnings;
}

// ═══════════════════════════════════════════════════════════════════════════════
// §4 — fixed 6-turn scenario (verbatim from BRIEF-104A §4 — never edit these strings)
// ═══════════════════════════════════════════════════════════════════════════════

const ME = { date: '1993-07-14', time: '08:30' };
const THEM = { date: '1990-11-23', time: '21:00' };
const THEM_NAME = { EN: 'Riley', KO: '한결' };

const TURNS_EN = [
  'I want to ask Riley to work on a project with me. How should I bring it up?',
  "I brought it up yesterday and they just said they'd think about it.",
  'Should I ask again? When would be a good day?',
  'No reply today.',
  'Why are they being so lukewarm about this?',
  'Write me two messages I could send.',
];
const TURNS_KO = [
  '한결이한테 같이 프로젝트 하자고 제안하려는데 어떻게 꺼내는 게 좋을까?',
  '어제 얘기 꺼냈더니 생각해보겠다고만 했어.',
  '다시 물어봐도 될까? 언제가 좋을까?',
  '오늘은 답이 없었어.',
  '얘는 왜 이렇게 미지근한 걸까?',
  '그럼 보낼 만한 메시지 두 개만 써줘.',
];

const FIRST_CALL_TIMEOUT = 30_000; // route.ts:14
const RETRY_CALL_TIMEOUT = 20_000; // route.ts:15
const MEMORY_CAP = 10; // src/lib/askQuota.ts:7 MEMORY_CAP — NOTE: BRIEF-104A §2.2 point 5 says
// "최대 20", but the actual client (askQuota.ts appendMemory) caps at 10. This harness follows the
// real product behavior (10), not the brief's stated number — flagged as a discrepancy in the
// report per this session's standing practice of trusting code over brief text when they conflict.

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let totalCallsMade = 0;
let sawRateLimit429 = false;

async function callWithGate(provider, system, turns, timeoutMs) {
  await sleep(CALL_INTERVAL_MS);
  const res = await callModelMirror(provider, system, turns, timeoutMs);
  totalCallsMade++;
  if (!res.ok && res.status === 429) sawRateLimit429 = true;
  return res;
}

class HardFail extends Error {
  constructor(stage, detail) {
    super(`hard fail at ${stage}: ${JSON.stringify(detail)}`);
    this.stage = stage;
    this.detail = detail;
  }
}

/** Mirrors the POST handler's full §1/§2 pipeline (route.ts:1391-1504) for one turn. Returns
 * { firstPass, finalPass, extraCallUsed, systemPromptSha256 }. */
async function runOneTurn(provider, mode, meChart, themChart, dailyPillars, themName, memory, history, question, today) {
  const todayNames = todayNameCandidatesMirror(calculateSaju({ date: today }).pillars.day);
  const todayIntroduced = hasTodayIntroduced(history, todayNames);
  const candidates = mode === 'person' ? themNameCandidates(themChart) : [];
  const personIntroduced = mode === 'person' ? hasPersonIntroduced(history, candidates) : undefined;
  const askMode = detectAskMode(question);
  const continuationHint = detectContinuationHint(question);
  const ctx = { askMode, personIntroduced, candidates, latestUserText: question };

  const system = buildAskSystem(
    mode, meChart, themChart, undefined, dailyPillars,
    undefined, themName,
    mode === 'person' ? memory : undefined,
    todayIntroduced, personIntroduced, askMode, continuationHint,
  );
  const turns = buildAskTurns(history, question, today);
  const systemPromptSha256 = crypto.createHash('sha256').update(system, 'utf-8').digest('hex');

  let usedExtraCall = false;
  let extraCallKind = 'none';

  let callRes = await callWithGate(provider, system, turns, FIRST_CALL_TIMEOUT);
  if (!callRes.ok) {
    if (callRes.failFast) throw new HardFail('call', callRes);
    usedExtraCall = true; extraCallKind = 'retry';
    callRes = await callWithGate(provider, system, turns, RETRY_CALL_TIMEOUT);
    if (!callRes.ok) throw new HardFail('call', callRes);
  }

  let raw = callRes.raw;
  let parseRes = tryParse(raw);
  let fallbackAnswer = null;

  if (!parseRes.ok) {
    fallbackAnswer = tryPlainTextFallback(parseRes, raw, mode, ctx);
    if (!fallbackAnswer) {
      if (usedExtraCall) throw new HardFail('parse', parseRes);
      usedExtraCall = true; extraCallKind = 'retry';
      const retryCall = await callWithGate(provider, system, turns, RETRY_CALL_TIMEOUT);
      if (!retryCall.ok) throw new HardFail('call', retryCall);
      raw = retryCall.raw;
      parseRes = tryParse(raw);
      if (!parseRes.ok) {
        fallbackAnswer = tryPlainTextFallback(parseRes, raw, mode, ctx);
        if (!fallbackAnswer) throw new HardFail('parse', parseRes);
      }
    }
  }

  let answer = fallbackAnswer ?? normalizeAnswerMirror(mode, parseRes.value);
  if (answer && !fallbackAnswer) {
    const orderFix = fixLabelOrderMirror(answer);
    if (orderFix.fixed) answer = orderFix.answer;
  }
  let banned = answer ? findBannedMirror(JSON.stringify(answer)) : [];
  let violations = answer ? validateAskAnswer(answer, ctx) : [];

  const firstPass = { raw, parsed: answer, violations, banned };

  if (fallbackAnswer) {
    // §2.3 fallback used — this IS the finalPass, no further calls (mirrors handleParseFailure).
    return { firstPass, finalPass: { raw, parsed: answer, violations: [], corrected: false }, extraCallUsed: extraCallKind, systemPromptSha256 };
  }

  if (!answer || banned.length > 0 || violations.length > 0) {
    if (usedExtraCall) {
      if (!answer) throw new HardFail('schema', { raw });
      if (banned.length > 0) throw new HardFail('banned', { banned });
      const disposition = applyFinalDispositionMirror(answer, violations, ctx);
      return {
        firstPass,
        finalPass: { raw, parsed: disposition.answer, violations, corrected: true },
        extraCallUsed: extraCallKind,
        systemPromptSha256,
      };
    }

    usedExtraCall = true; extraCallKind = 'correction';
    const warnings = buildCorrectionWarningsMirror(!answer, banned, violations);
    const correctionTurns = [...turns, { role: 'model', text: raw }, { role: 'user', text: warnings.join('\n\n') }];
    const correctionRes = await callWithGate(provider, system, correctionTurns, RETRY_CALL_TIMEOUT);
    if (!correctionRes.ok) throw new HardFail('call', correctionRes);

    let raw2 = correctionRes.raw;
    let parseRes2 = tryParse(raw2);
    let fb2 = null;
    if (!parseRes2.ok) {
      fb2 = tryPlainTextFallback(parseRes2, raw2, mode, ctx);
      if (!fb2) throw new HardFail('parse', parseRes2);
    }

    let answer2 = fb2 ?? normalizeAnswerMirror(mode, parseRes2.value);
    if (answer2 && !fb2) {
      const orderFix2 = fixLabelOrderMirror(answer2);
      if (orderFix2.fixed) answer2 = orderFix2.answer;
    }
    if (!answer2) throw new HardFail('schema', { raw2 });

    const banned2 = findBannedMirror(JSON.stringify(answer2));
    if (banned2.length > 0) throw new HardFail('banned', { banned2 });

    const violations2 = fb2 ? [] : validateAskAnswer(answer2, ctx);
    if (violations2.length > 0) {
      const disposition = applyFinalDispositionMirror(answer2, violations2, ctx);
      return {
        firstPass,
        finalPass: { raw: raw2, parsed: disposition.answer, violations: violations2, corrected: true },
        extraCallUsed: extraCallKind,
        systemPromptSha256,
      };
    }
    return {
      firstPass,
      finalPass: { raw: raw2, parsed: answer2, violations: [], corrected: true },
      extraCallUsed: extraCallKind,
      systemPromptSha256,
    };
  }

  // No issues at all — finalPass === firstPass, explicitly (BRIEF-104A §2.2 point 3).
  return {
    firstPass,
    finalPass: { raw, parsed: answer, violations: [], corrected: false },
    extraCallUsed: extraCallKind,
    systemPromptSha256,
  };
}

/** Serializes an assistant answer into the `history[].text` format the real client sends back
 * (src/app/(tabs)/ask/page.tsx:301-309) — parts joined as "LABEL: text" lines, else plain text. */
function serializeForHistory(answer) {
  if (answer && Array.isArray(answer.parts)) {
    return answer.parts.map(p => `${p.label}: ${p.text}`).join('\n');
  }
  return (answer && answer.text) || '';
}

/** Mirrors src/lib/askQuota.ts:84-97 appendMemory — trim, dedupe by exact string, cap MEMORY_CAP. */
function appendMemoryMirror(memory, facts) {
  const merged = [...memory];
  for (const f of facts) {
    const t = f.trim();
    if (t && !merged.includes(t)) merged.push(t);
  }
  return merged.slice(-MEMORY_CAP);
}

async function runOneConversation(provider, lang, runNumber) {
  const questions = lang === 'EN' ? TURNS_EN : TURNS_KO;
  const themName = THEM_NAME[lang];
  const meChart = calculateSaju(ME);
  const themChart = calculateSaju(THEM);

  const d = new Date();
  const today = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const dailyPillars = getDailyPillars(today, 90);

  let history = [];
  let memory = [];
  const turnRecords = [];

  for (let i = 0; i < questions.length; i++) {
    const turnNumber = i + 1;
    const question = questions[i];
    console.log(`  [turn ${turnNumber}/6] calling…`);

    const result = await runOneTurn(provider, 'person', meChart, themChart, dailyPillars, themName, memory, history, question, today);

    if (sawRateLimit429) {
      console.error(`[FAIL] 429 rate-limit hit — stopping immediately. Total calls completed before stop: ${totalCallsMade}.`);
      return { turnRecords, aborted: true, lang, runNumber };
    }

    const wordCount = countWords(extractDisplayTexts(result.finalPass.parsed));
    const shape = shapeOf(result.finalPass.parsed);

    turnRecords.push({
      turn: turnNumber,
      userText: question,
      systemPromptSha256: result.systemPromptSha256,
      firstPass: result.firstPass,
      finalPass: result.finalPass,
      extraCallUsed: result.extraCallUsed,
      wordCount,
      shape,
    });

    history = [...history, { role: 'user', text: question, at: today }, { role: 'assistant', text: serializeForHistory(result.finalPass.parsed), at: today }];
    const newFacts = Array.isArray(result.finalPass.parsed?.memory) ? result.finalPass.parsed.memory : [];
    if (newFacts.length > 0) memory = appendMemoryMirror(memory, newFacts);
  }

  return { turnRecords, aborted: false, lang, runNumber };
}

async function collect() {
  const provider = createLlmProvider();
  // The BRIEF-104A §0 base commit `src/` was verified against — NOT `git rev-parse HEAD`, which
  // drifts forward on this branch as non-`src/` commits (brief archive, this script itself, the
  // report) land. `src/` is untouched on this branch (BRIEF-104A §6), so this constant stays the
  // true "what code produced these results" answer for the whole run.
  const baseCommitSha = '9054808ea79ba0d605952ecc23d162105ea7d7fc';
  const harnessFileSha256 = crypto.createHash('sha256').update(readFileSync(SELF_PATH), 'utf-8').digest('hex');
  const executedAt = new Date().toISOString();
  const dateTag = todayYmd();

  const outDir = path.join(ROOT, 'samples', 'voice-baseline');
  mkdirSync(outDir, { recursive: true });

  const plan = [['EN', 1], ['EN', 2], ['KO', 1], ['KO', 2]];
  let correctionCallsTotal = 0;
  let aborted = false;

  for (const [lang, runNumber] of plan) {
    if (aborted) break;
    console.log(`Run: ${lang} #${runNumber}`);
    const result = await runOneConversation(provider, lang, runNumber);

    const meta = {
      model: EFFECTIVE_MODEL,
      modelGateForced,
      generationConfigBranch: GENERATION_CONFIG_BRANCH,
      llmProvider: LLM_PROVIDER,
      baseCommitSha,
      executedAt,
      harnessFileSha256,
      lang,
      runNumber,
      callIntervalMs: CALL_INTERVAL_MS,
      aborted: result.aborted,
    };

    const outPath = path.join(outDir, `${EFFECTIVE_MODEL}-${dateTag}-${lang}-run${runNumber}.json`);
    writeFileSync(outPath, JSON.stringify({ meta, turns: result.turnRecords }, null, 2), 'utf-8');
    console.log(`  saved -> ${outPath} (${result.turnRecords.length} turns)`);

    correctionCallsTotal += result.turnRecords.filter(t => t.extraCallUsed === 'correction').length;
    if (result.aborted) aborted = true;
  }

  console.log('');
  console.log(`Total API calls made: ${totalCallsMade}`);
  console.log(`Correction calls used: ${correctionCallsTotal}`);
  if (aborted) {
    console.log('ABORTED — 429 rate limit hit mid-run. See per-run JSON `meta.aborted` for which run stopped early.');
    process.exit(1);
  }
  console.log('DONE');
}

try {
  await collect();
} catch (err) {
  if (err instanceof HardFail) {
    console.error(`[FAIL] ${err.message}`);
    console.error(`Total API calls made before failure: ${totalCallsMade}`);
    process.exit(1);
  }
  throw err;
}
