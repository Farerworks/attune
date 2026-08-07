import { z } from 'zod';
import { calculateSaju, getDailyPillars, pillarLabel, friendlyPillarName, STEM_NAMES } from '@/lib/saju';
import type { SajuChart, DailyPillar, Pillar, Element, TenStem } from '@/lib/saju';
import { getArchetype, getElementRelationship, localeVoiceBlock, ARCHETYPE_LOCALE } from '@/lib/interpretGuide';
import { formatChart } from '@/lib/briefing';
import { createLlmProvider, type ChatTurn } from '@/lib/llm';
import { checkRateLimit } from '@/lib/rateLimit';
import { detectSafetyTrigger } from '@/lib/safety';

export const maxDuration = 60;

// 1차 30s / 재시도·재생성 20s — 합 50s, maxDuration(60s) 안에 여유를 둔다 (BRIEF-100B §2).
const FIRST_CALL_TIMEOUT = 30_000;
const RETRY_CALL_TIMEOUT = 20_000;
const RATE_LIMIT  = 30;
const RATE_WINDOW = 60 * 60 * 1000;

const BANNED = ['weakness', 'exploit', 'leverage against', 'manipulate', 'vulnerable to', '약점', '조종', '공략', '사주상 충동적인', 'impulsive day in your chart'];

// SAFETY (BRIEF-096 §3 — verbatim, byte-for-byte):
const SAFETY_RULES = `SAFETY: You are not a crisis service. If the user mentions self-harm, suicide, or harming anyone, do not give relationship advice in that reply — acknowledge briefly; the app routes to human support. Never explain distress or danger through saju, elements, charts, or compatibility. Never tell someone to immediately break up; offer options, not verdicts.`;

// Label sets — single source of truth (BRIEF-100B §6). outputSpec below renders these via
// .join(' / '), so the assembled prompt text stays byte-identical to the pre-existing wording.
export const DECIDE_LABELS = ['LIKELY RECEPTION', 'WHAT COULD BACKFIRE', 'HOW TO IMPROVE YOUR ODDS'] as const;
export const UNDERSTAND_LABELS = ["WHAT'S LIKELY GOING ON", 'WHY THIS MAY HAVE HAPPENED', 'WHAT YOU CAN DO'] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`LLM timed out after ${ms}ms`)), ms),
    ),
  ]);
}

function extractJson(raw: string): unknown {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = fence ? fence[1].trim() : raw.trim();
  const start = candidate.indexOf('{');
  const end   = candidate.lastIndexOf('}');
  const jsonStr = start >= 0 && end > start ? candidate.slice(start, end + 1) : candidate;
  return JSON.parse(jsonStr);
}

function findBanned(text: string): string[] {
  const lower = text.toLowerCase();
  return BANNED.filter(w => lower.includes(w));
}

/** Today's day-pillar name candidates (hanja, ko reading, friendly ko/en) — assembled from pillarLabel/friendlyPillarName, no new calculation. */
function todayNameCandidates(dayPillar: Pillar): string[] {
  const hanja = dayPillar.stemHanja + dayPillar.branchHanja;
  const koMatch = pillarLabel(dayPillar).match(/\(([^)]+)\)/);
  const ko = koMatch ? koMatch[1] : '';
  const friendly = friendlyPillarName(dayPillar);
  return [hanja, ko, friendly.ko, friendly.en];
}

/** True if any assistant-role message in `history` already named today's day pillar. */
export function hasTodayIntroduced(
  history: Array<{ role: 'user' | 'assistant'; text: string }>,
  names: string[],
): boolean {
  return history.some(h => h.role === 'assistant' && names.some(n => n && h.text.includes(n)));
}

// Sino-Korean single-character hanja/reading for each element and polarity — not exported from
// saju.ts (which only has native-Korean element words like "나무" for the friendly day names).
// Needed here for "甲木"/"갑목"/"양 목" style identity-mention candidates (BRIEF-100 §8).
const ELEMENT_HANJA: Record<Element, string> = { wood: '木', fire: '火', earth: '土', metal: '金', water: '水' };
const ELEMENT_KO_SINO: Record<Element, string> = { wood: '목', fire: '화', earth: '토', metal: '금', water: '수' };
const POLARITY_KO: Record<'Yang' | 'Yin', string> = { Yang: '양', Yin: '음' };

/**
 * The other person's day-master/archetype name candidates, for detecting whether the assistant
 * has already introduced their identity in this conversation (BRIEF-100 §8). Deliberately
 * excludes bare single-hanja (`甲`) and bare element words (`목`, `목 기운`) — those collide with
 * unrelated mentions like today's day pillar ("甲子일"), so a match on them would be a false
 * positive, not evidence the person's identity was actually named.
 */
export function themNameCandidates(themChart: SajuChart): string[] {
  const { stem, element, polarity } = themChart.dayMaster;
  const stemHanja = STEM_NAMES[stem].hanja;
  const stemKo = STEM_NAMES[stem].ko;
  const elementHanja = ELEMENT_HANJA[element];
  const elementKo = ELEMENT_KO_SINO[element];
  const polarityKo = POLARITY_KO[polarity];
  const archetype = getArchetype(stem);
  const archetypeKo = ARCHETYPE_LOCALE[stem]?.name_ko;

  const candidates = [
    `${stemHanja}${elementHanja}`,   // e.g. 甲木
    `${stemKo}${elementKo}`,         // e.g. 갑목
    `${polarityKo} ${elementKo}`,    // e.g. 양 목
    `${polarityKo}${elementKo}`,     // e.g. 양목
    stem,                            // e.g. Yang Wood
    archetype.name,                  // e.g. The First Light
  ];
  if (archetypeKo) candidates.push(archetypeKo); // e.g. 첫 새벽
  return candidates;
}

/** Unicode NFKC + lowercase + collapsed whitespace — so matching is resilient to full/half-width
 * variants, casing, and incidental spacing differences the LLM's own output might introduce. */
function normalizeForMatch(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** True if any assistant-role message in `history` already named the other person's identity. */
export function hasPersonIntroduced(
  history: Array<{ role: 'user' | 'assistant'; text: string }>,
  candidates: string[],
): boolean {
  const normalizedCandidates = candidates.map(normalizeForMatch).filter(c => c.length > 0);
  return history.some(h => {
    if (h.role !== 'assistant') return false;
    const normText = normalizeForMatch(h.text);
    return normalizedCandidates.some(c => normText.includes(c));
  });
}

// ── §5: ALREADY-state reintroduction-bait projection (route-local, formatChart untouched) ──
// All 10 day stems, for scrubbing "Yang Wood (甲)"-style display names out of the THEM part
// of the prompt once the other person's identity is already introduced (BRIEF-100B §5).
const ALL_TEN_STEMS: TenStem[] = Object.keys(STEM_NAMES) as TenStem[];

/**
 * Replaces every "<TenStem EN name> (<hanja>)" occurrence (however it's padded/spaced —
 * formatChart pads differently per pillar slot) with "<hanja> (<element>, <polarity>)". This is
 * a probability-reducing projection over the ASSEMBLED text, not a guarantee — the model can
 * still reconstruct "Yang Wood" from "甲 (wood, yang)" if it wants to. The actual guarantee is
 * the output validator (§7) + its correction pass, not this substitution.
 */
function projectStemDisplayNames(text: string): string {
  let out = text;
  for (const stem of ALL_TEN_STEMS) {
    const { hanja, element } = STEM_NAMES[stem];
    const polarity = stem.startsWith('Yang') ? 'yang' : 'yin';
    const re = new RegExp(`${stem} +\\(${hanja}\\)`, 'g');
    out = out.replace(re, `${hanja} (${element}, ${polarity})`);
  }
  return out;
}

const THEM_ARCHETYPE_WITHHELD = `THEM ARCHETYPE: (name withheld — it was already introduced earlier in this conversation; never re-name or re-explain it. The trait notes below are your private reasoning only.)`;

// ── §3: askMode / continuation-hint detection (conservative — unsure => null/false) ──────────
// Table-driven so tests can assert against the exact pattern list, not just the function's
// aggregate decision (BRIEF-100B §3).

export type AskMode = 'strict_script' | 'verdict_probe' | null;

const COUNT_WORD = '(?:\\d+|한|두|세|네)';

export const STRICT_SCRIPT_PATTERNS: RegExp[] = [
  new RegExp(`문장\\s*${COUNT_WORD}\\s*개`),                    // "문장 두 개", "문장 3개"
  new RegExp(`${COUNT_WORD}\\s*문장(?:만)?\\s*(?:써|만들|뽑)`), // "3문장 써", "두문장만 뽑아"
  new RegExp(`멘트\\s*${COUNT_WORD}\\s*개`),                    // "멘트 두 개"
  /\b(?:write|give|draft)\b(?:\s+me)?\s+\d+\s+(?:lines?|sentences?|messages?)\b/i,
  /\bexactly\s+\d+\s+(?:lines?|sentences?)\b/i,
];

export const VERDICT_PROBE_PATTERNS: RegExp[] = [
  /원래\s*(?:그런|그렇)\s*(?:성격|사람|스타일)/,
  // No trailing \b — JS regex word-boundary is ASCII-\w-based and doesn't work reliably right
  // after a Hangul syllable (neither side of the boundary counts as \w), so a `\b` here would
  // silently fail to match "원래 그래?" etc.
  /원래\s*(?:그래|그런가)/,
  /항상\s*(?:그래|이래)/,
  /원래\s*\S*?(?:형|타입)이야/,
  /\bis\s+(?:he|she|that)\s+always\s+like\b/i,
  /\bjust\s+(?:how|who)\s+(?:he|she)\s+is\b/i,
];

export const CONTINUATION_HINT_PATTERNS: RegExp[] = [
  /그래서\s*내가/,
  /그러자\s*\S+[이가]/,
  /아니,\s*사실은/,
  /라고\s*했어/,
];

/** Conservative: only fires on an explicit count ("문장 두 개 써줘"), never on a bare request
 * ("뭐라고 답할까?", "보낼 문장 써줘") — a false trigger here is worse than missing one. */
export function detectAskMode(latestUserText: string): AskMode {
  if (STRICT_SCRIPT_PATTERNS.some(p => p.test(latestUserText))) return 'strict_script';
  if (VERDICT_PROBE_PATTERNS.some(p => p.test(latestUserText))) return 'verdict_probe';
  return null;
}

/** Hint only — never gates validation or forces a shape, just nudges the model (BRIEF-100B §3). */
export function detectContinuationHint(latestUserText: string): boolean {
  return CONTINUATION_HINT_PATTERNS.some(p => p.test(latestUserText));
}

// ── §4: state-block verbatim strings (added to the prompt only when detected) ────────────────

const STRICT_SCRIPT_BLOCK = `SCRIPT REQUEST — the user asked for message lines to send, with an explicit count. Contract for THIS answer: respond in shape 2 ({"text": ...}) — no parts, no labels, no headings. Give exactly the requested number of lines, each ready to send as-is, plus at most one short sentence of framing. No chart talk, no archetype, no day-pillar/today talk, no followUp. This contract outranks every other block for this turn, including TODAY first-mention duty — skip it here.`;

const VERDICT_PROBE_BLOCK = `CHARACTER QUESTION — the user is asking whether this is the other person's fixed personality. Contract for THIS answer: (1) never open with a confirmation ("네", "맞아요", "Yes") and never confirm a fixed trait; (2) start with one short line of honest uncertainty — a few moments aren't enough to define someone; (3) offer at least two different situational readings of the same behavior; (4) give one concrete thing to watch next time that would tell the readings apart; (5) the chart may color a tendency but must never serve as proof of character. Keep it compact.`;

const CONTINUATION_HINT_BLOCK = `CONTINUATION HINT — the latest message reads as a continuation of the same scene (added facts, their reaction, or a correction), not a new question. Shape 2 (short {"text"}) is almost certainly right here; do not restart the 3-part card unless it is clearly a new independent question.`;

// ── Prompt builder ─────────────────────────────────────────────────────────────

export function buildAskSystem(
  mode: 'me' | 'person' | 'general',
  meChart: SajuChart,
  themChart: SajuChart | null,
  briefing: Record<string, unknown> | undefined,
  dailyPillars: DailyPillar[],
  meName?: string,
  themName?: string,
  memory?: string[],
  todayIntroduced?: boolean,
  personIntroduced?: boolean,
  askMode?: AskMode,
  continuationHint?: boolean,
): string {
  // Chart context
  let chartBlock = '';
  if (mode !== 'general') {
    const myArch = getArchetype(meChart.dayMaster.stem);
    const myArchKo = ARCHETYPE_LOCALE[meChart.dayMaster.stem]?.name_ko;
    chartBlock = `${formatChart(meChart, `ME${meName ? ` — ${meName}` : ''}`)}

ME ARCHETYPE: ${myArch.name}${myArchKo ? ` (KO: ${myArchKo})` : ''}
  Drive: ${myArch.coreDrive}
  Communication: ${myArch.communication}
  Under stress: ${myArch.stress}`;

    if (mode === 'person' && themChart) {
      const themArch  = getArchetype(themChart.dayMaster.stem);
      const themArchKo = ARCHETYPE_LOCALE[themChart.dayMaster.stem]?.name_ko;
      const elemAxis  = getElementRelationship(meChart.dayMaster.stem, themChart.dayMaster.stem);

      // (a) ALREADY: withhold the name; NOT YET: name it as before (BRIEF-100B §5).
      const themArchetypeLine = personIntroduced
        ? THEM_ARCHETYPE_WITHHELD
        : `THEM ARCHETYPE: ${themArch.name}${themArchKo ? ` (KO: ${themArchKo})` : ''}`;

      // "THEM part" — chart table + archetype + Drive/Communication/Stress + ELEMENT AXIS
      // (+ pillarsKnown note + BRIEFING SUMMARY, appended below) is the exact scope the §5
      // projection applies to. RELATIONSHIP NOTES (memory) is appended AFTER, unprocessed —
      // user-sourced data is never rewritten (see §5's exception table).
      let themPart = `

${formatChart(themChart, `THEM${themName ? ` — ${themName}` : ''}`)}

${themArchetypeLine}
  Drive: ${themArch.coreDrive}
  Communication: ${themArch.communication}
  Under stress: ${themArch.stress}

ELEMENT AXIS (ME → THEM): ${elemAxis}`;

      if (themChart.pillarsKnown === 6) {
        themPart += `
Note: their birth time is unknown — 6 of 8 pillars available. Avoid overconfident assertions.`;
      }

      if (briefing) {
        const dyn = briefing.dynamic as Record<string, unknown> | undefined;
        if (dyn) {
          const click = (dyn.click as { takeaway?: string } | undefined)?.takeaway ?? '';
          const clash = (dyn.clash as { takeaway?: string } | undefined)?.takeaway ?? '';
          themPart += `\n\nBRIEFING SUMMARY (pre-computed context)
  Resonance: ${String(dyn.resonance ?? '')}
  Click: ${click}
  Clash: ${clash}`;
        }
      }

      // (b) ALREADY only: scrub "<TenStem> (<hanja>)" display names out of the them-part.
      if (personIntroduced) {
        themPart = projectStemDisplayNames(themPart);
      }

      chartBlock += themPart;

      if (memory && memory.length > 0) {
        chartBlock += `\n\nRELATIONSHIP NOTES — facts learned in earlier conversations (background context; use naturally, never recite back as a list):
${memory.map(f => `- ${f}`).join('\n')}`;
      }
    }
  }

  // Daily pillars
  const pillarsText = dailyPillars.map(p => {
    const dt  = new Date(p.date + 'T12:00:00');
    const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getDay()];
    return `${p.date} (${dow}): ${p.stem} / ${p.branch} — ${p.element}`;
  }).join('\n');

  // Today's identity line — year/month/day pillars named plainly (no hour; today has no birth time)
  const today = dailyPillars[0]?.date ?? new Date().toISOString().split('T')[0];
  const todayChart = calculateSaju({ date: today });
  const todayFriendly = friendlyPillarName(todayChart.pillars.day);
  const todayLine = `TODAY — ${today}: ${pillarLabel(todayChart.pillars.year)} year · ${pillarLabel(todayChart.pillars.month)} month · ${pillarLabel(todayChart.pillars.day)} day. Friendly day name: ${todayFriendly.en} (${todayFriendly.ko}). Hour is unknown.`;

  const todayNamingBlock = todayIntroduced
    ? `TODAY ALREADY INTRODUCED earlier in this conversation. Do NOT announce or restate today's day name in any answer opening — never begin with "오늘은" + the day name in any form (formal, friendly, or element words). If the day genuinely matters mid-answer, weave the short handle once ("물 호랑이 기운이…"); otherwise leave it out entirely.`
    : `FIRST mention of today in a conversation: Korean → 「오늘은 임인(壬寅)일 — '물 호랑이' 날이에요」 style (formal name + friendly gloss, once). English → "a Water Tiger day" (short name only; ganzhi optional in parentheses).
AFTER that: use only the short handle, woven in ("물 호랑이 기운이…" / "with this Water Tiger energy…") — never repeat the full announcement.`;

  // Output schema per mode
  const outputSpec = mode === 'person'
    ? `Choose the 3 part labels to fit the question (labels in English, UPPERCASE):
- If the user is deciding whether to DO something (should I…, is it a good idea…): ${DECIDE_LABELS.join(' / ')}.
- If the user is trying to UNDERSTAND (why is…, what's going on…, how does he feel…): ${UNDERSTAND_LABELS.join(' / ')}.

Respond ONLY with valid JSON (no markdown fences, no extra keys). Choose ONE shape:
1) If the latest message is a NEW substantive question — a new situation, a decision to make, an explicit ask for advice, or a real re-judgment of your earlier conclusion:
{
  "parts": [
    { "label": "<chosen label>", "text": "2–3 sentences, specific and actionable. HARD LIMIT: max 3 sentences, max 55 words." },
    { "label": "<chosen label>", "text": "2–3 sentences. HARD LIMIT: max 3 sentences, max 55 words." },
    { "label": "<chosen label>", "text": "2–3 sentences. HARD LIMIT: max 3 sentences, max 55 words." }
  ],
  "timing": "ONLY if the question is about timing. MUST be a single plain-text string — NEVER an object or array. Name 2–3 favorable dates (YYYY-MM-DD, day-of-week, reason) and 1–2 to avoid. Omit this key entirely if not a timing question.",
  "followUp": "OPTIONAL. One short line (12 words max), ONLY when the next answer genuinely depends on it: a missing fact, fact-vs-guess, an unclear goal, or safety. When you've already given enough to act on, end without a question. Omit the key otherwise.",
  "memory": ["OPTIONAL array of 0–2 short strings — NEW facts learned in THIS exchange worth remembering about the other person or the situation (events, dates, decisions, circumstances). Facts the user stated only — never feelings you inferred, never your own advice, never anything already in RELATIONSHIP NOTES. Same language as the conversation. Omit the key when nothing new."]
}
2) If the latest message continues the same scene: it adds facts, confirms or corrects your reading, or reacts — with no new independent request for advice:
{ "text": "Under 100 words. Conversational and direct, same coaching voice. Answer the follow-up specifically — do not restate your previous answer.", "followUp": "OPTIONAL. One short line (12 words max), ONLY when the next answer genuinely depends on it: a missing fact, fact-vs-guess, an unclear goal, or safety. When you've already given enough to act on, end without a question. Omit the key otherwise.", "memory": ["OPTIONAL. Same rule as above."] }`
    : `Respond ONLY with valid JSON (no markdown fences, no extra keys):
{ "text": "Under 120 words. Warm, practical coach tone. Describe tendencies, not predictions.", "followUp": "OPTIONAL. One short line (12 words max): either a gentle check-back inviting the user to report how it went, or ONE question that would sharpen your next answer. Same language as the answer. Omit this key entirely when it would feel forced." }`;

  const persona = mode === 'person'
    ? 'You are Attune, a relationship coach who uses Four Pillars as one lens. Your job is to help the user understand the other person and navigate this specific relationship. Start from what the user has told you and what has actually happened between them; use the chart as a supporting lens for personalization the facts alone can\'t give — never as the sole cause of a specific action. Always frame your read as understanding and connection — never as a way to control, pressure, or outmaneuver them.'
    : mode === 'me'
    ? 'You are Attune, a Four Pillars self-awareness coach. Help the user understand their own behavioral tendencies through their saju chart. Warm, grounded, concise. If a question isn\'t really about their chart, still answer it practically and warmly — the chart is helpful context, never a limitation.'
    : 'You are Attune, a thoughtful life coach who uses Four Pillars of Destiny as one lens. Answer practically and concisely.';

  const PERSON_RULES = `RULES (non-negotiable):
1. Use hedged language — "likely", "tends to", "may", "~할 가능성이 있어요". Never state a reaction as certainty; never "will".
2. No yes/no verdicts. No numerical probabilities or scores.
3. You MAY describe the other person's likely feelings, motives, and reactions — that is the point. Ground every read first in what the user told you and what has happened in this conversation; bring the chart in only per BASIS PRIORITY, and keep it hedged.
4. Forbidden words: weakness, exploit, leverage against, manipulate, vulnerable to. Never frame guidance as controlling or pressuring the other person.
5. Help the user understand the other person AND adjust their own approach. Offer moves the user can make; never tactics to manipulate or corner the other person.
6. No medical, legal, or financial advice.
7. This is an ongoing conversation. Build on earlier turns instead of repeating them, and address what the user just asked.
8. Answer the user's actual question directly and first. Whether their day master / archetype may be named is governed by the IDENTITY state block; outside that allowance, do not recite chart labels back to the reader — the chart is your private reasoning.
9. Refer to the other person by their name when given. LANGUAGE: detect the question's language and write all free text in it, never mixing. In English, address the user as "you" and tie your read of the other person to what the user can do. In Korean, follow the KOREAN VOICE block below (omit 당신; use the other person's name). JSON keys and part labels stay in English.
10. Each part must contain one concrete, specific scene tied to THIS relationship — not a generic personality statement. Text over 3 sentences / 55 words is cut.
11. Do not re-explain a chart-based trait you already explained — not even in new wording. When an already-explained trait is relevant again, connect it to the current moment in one short clause, or bring a genuinely NEW chart angle per BASIS PRIORITY — otherwise leave the chart out of this answer.
12. Always speak TO the user in second person; never describe the user in third person alongside the other person. (Korean: addressing the user as <이름>님 is fine and warm — but never narrate the user like a bystander in an answer addressed to them.)
13. Labels: pick ONE label set per answer and use all three from that set — never mix labels across the two sets.
14. If the question asks about dates beyond the listed DAILY PILLARS window, use the {text} shape: say briefly that you can see about three months ahead, offer what you CAN (general element flow, or suggest asking again closer to the date). Never produce a 3-part report just to say you don't know.

BASIS PRIORITY — for every answer, and especially the WHY part, ground your reasoning in this order:
1) Facts the user has told you. 2) What just happened in the latest exchange. 3) Patterns observed repeatedly across this conversation. 4) The chart — a supporting lens only: bring it in when the first three don't explain the moment, or when it adds a genuinely new angle. Never present the chart as the definitive cause of a specific action.
Consecutive answers must not open WHY with the same basis or a near-identical sentence. If you have no new basis to add, keep WHY to one short sentence — without the chart.
When the user has given you no concrete facts yet, say so briefly and offer possibilities — do not let the chart fill the gap as if it were evidence.

BALANCE: Explain both sides. Separate intent from impact — the user may have meant to check facts while it landed on the other person as an evaluation. Never lecture the user; never only validate them.

NO CHARACTER VERDICTS: Never confirm a stable personality trait from a single incident. Without repeated observation, offer two plausible readings and one thing to watch next time. Even when the chart suggests a tendency: "the chart leans that way, but one moment isn't enough to be sure" — never "that's just how they are."

SCRIPTS: Suggested lines must sound like something an adult actually says to a close adult — no exaggerated praise, no therapist/parent/teacher tone. Prefer: confirm the fact → name the misunderstanding → make the next request. An apology briefly acknowledges how it landed — not self-abasement. Stay close to the user's own register.`;

  const SELF_RULES = `RULES (non-negotiable):
1. Use hedged language — "tends to", "may", "~하는 편이에요". Never certainty; never "will".
2. No yes/no verdicts. No numerical probabilities or scores.
3. Forbidden words: weakness, exploit, leverage against, manipulate, vulnerable to.
4. No medical, legal, or financial advice.
5. This is an ongoing conversation. Build on earlier turns; don't repeat earlier answers.
6. Answer the actual question directly. Do NOT recite archetype names or chart labels back; use them only as private reasoning.
7. LANGUAGE: detect the question's language, write all free text in it (no mixing). In English address the user as "you". In Korean follow the KOREAN VOICE block below (no 당신). JSON keys stay in English.
8. Do not repeat the same chart-based explanation you already gave in a recent answer; when it's relevant again, rephrase and add one new detail.`;

  const PREDICTION_RULES = `TIMING & PREDICTION QUESTIONS
Two different asks — handle them differently.

A) A baseless yes/no about an outcome the user can't control ("will I win", "will I pass", "does he like me", "will it work out"):
- Don't hand down a verdict and don't dodge. In ONE short line, note this isn't a yes/no the chart settles — and word that line freshly every time; never reuse a set phrase.
- Then pivot to what the current pattern shows and the one move that fits now.

B) Timing / an auspicious day for something the user DOES control ("a good day to start / submit / sign / ask", "when should I…", "a day to buy X"):
- This you answer. Use the DAILY PILLARS to name concrete good days for that action and say briefly why (which day's energy supports it).
- Recommend the ACTION's timing — never promise the OUTCOME. (A good day to buy a ticket is fine; "you'll win that day" is not.)

Never emit a canned refusal template. Every decline is freshly worded.`;

  const IDENTITY_MENTIONS_RULES = `IDENTITY MENTIONS — AVOID THE BROKEN RECORD
The person's element/archetype identity is context, not a greeting.
1. Do NOT re-introduce their identity ("as a Metal-forward Straight Line", "○○님은 ~기운이라") in answer after answer. Within the same day of a conversation, one framing is plenty.
2. It IS natural to name it again when: a [new day — …] marker shows time has passed, the chart trait is genuinely the point of this answer, or the user asks about it. Even then, vary the wording — never repeat the same formula.
3. Otherwise refer to the trait implicitly ("that head-on streak of theirs") or just answer the question.
4. Vary answer openings: lead with the situation, the read, or the move — not the chart. This applies in every language.`;

  // person mode only — replaces IDENTITY_MENTIONS_RULES with an explicit, mutually-exclusive
  // state the server has already determined from `personIntroduced` (BRIEF-100 §4/§8). me/general
  // keep IDENTITY_MENTIONS_RULES unchanged, since the "has this been introduced" detection is
  // person-chart-specific.
  const IDENTITY_STATE_BLOCK = personIntroduced
    ? `IDENTITY — ALREADY INTRODUCED: Their day master / archetype has been named earlier in this conversation. From here: (a) never re-introduce it ("민수는 갑목이라…", "첫 새벽 성향이라…"); (b) never re-explain the same base-temperament summary (drive, directness, goal-focus) in any wording; (c) you MAY connect the known temperament to THIS specific moment in one short clause; (d) you MAY use a genuinely NEW chart angle (element balance, the axis between your two charts, click/clash) when it adds real insight.`
    : `IDENTITY — NOT YET INTRODUCED: You may name their day master / archetype once, briefly, if it genuinely helps this answer. One framing is plenty for the whole conversation.`;

  // KOREAN VOICE lives in src/lib/interpretGuide.ts (LOCALE_VOICE.Korean) — off-limits to edit
  // directly (BRIEF-100B §11 "src/lib 전체 무접촉"). Since it's the ONLY entry in that table,
  // localeVoiceBlock() always returns exactly that string, so appending item 8 here (person mode
  // only — "the other person" doesn't exist as a concept in me/general) is safe and keeps
  // me/general's assembled prompt byte-identical to before this BRIEF (§5 보존 테스트 ③).
  const koreanVoiceBase = localeVoiceBlock();
  const koreanVoice = mode === 'person'
    ? `${koreanVoiceBase}
8) Mirror the user's way of naming the other person (e.g., "지현이" stays "지현이", "지현님" stays "지현님") — never upgrade or downgrade the honorific on your own. If the user's term for them is an insult, use the plain name.`
    : koreanVoiceBase;

  // §4 state blocks — added only when detected, turn-specific, so placed last (closest to the
  // output schema, where recency-weighted instructions land hardest).
  const modeBlocks: string[] = [];
  if (askMode === 'strict_script') modeBlocks.push(STRICT_SCRIPT_BLOCK);
  if (askMode === 'verdict_probe') modeBlocks.push(VERDICT_PROBE_BLOCK);
  if (continuationHint) modeBlocks.push(CONTINUATION_HINT_BLOCK);
  const modeBlocksText = modeBlocks.length > 0 ? `\n\n${modeBlocks.join('\n\n')}` : '';

  return `${persona}

${chartBlock ? `SAJU CONTEXT:\n${chartBlock}\n\nRead the WHOLE chart — all pillars and the element balance — not just the day master. Weave at most one or two specific chart details into an answer when they genuinely matter; never recite or dump the chart.\n\n` : ''}DAILY PILLARS — NEXT 90 DAYS (server-computed, do not modify):
${todayLine}
${pillarsText}
Use the daily pillars for timing / auspicious-day questions (see TIMING & PREDICTION) and whenever the question is about when to act.
When the user asks what today is, today's energy, or today's saju, state today's pillars plainly by name (lead with the day pillar / 일진), then interpret. Never answer only in abstract element talk.
Use ONLY the names given in TODAY — never derive or translate day names yourself.
${todayNamingBlock}
TODAY-MENTION RESTRAINT — same discipline as identity mentions: do NOT re-announce today's pillars in answer after answer. Name them when the user asks about today/timing or when a specific day genuinely drives the answer — once per day of conversation is plenty. Otherwise leave the date out or refer to it implicitly ("with today's restless energy"), and never open consecutive answers with the same "오늘은 ~일이라" formula.
If today was already named earlier in this conversation, never cold-open with the announcement again — acknowledge briefly ("아까 말한 물 호랑이 날 흐름대로 —") and move straight to the answer. Two consecutive answers must never begin with the same sentence.

${mode === 'person' ? PERSON_RULES : SELF_RULES}

${SAFETY_RULES}

${PREDICTION_RULES}

${mode === 'person' ? IDENTITY_STATE_BLOCK : IDENTITY_MENTIONS_RULES}

If you name an archetype in a Korean answer, use its Korean name (the KO value) — never mix the English archetype name into Korean prose.

${koreanVoice}

FOLLOW-UP RULE: at most ONE followUp per answer. Never re-ask what the user already told you. Never stack questions. In Korean, no 당신 — e.g. "해보고 어땠는지 알려줘요" / "혹시 지현이 먼저 연락한 적도 있어요?". Skip it entirely on heavy or emotional moments where a question would feel pushy.${modeBlocksText}

${outputSpec}`;
}

// ── Chat turns ──────────────────────────────────────────────────────────────────

export function buildAskTurns(
  history: Array<{ role: 'user' | 'assistant'; text: string; at?: string }>,
  question: string,
  today?: string,
): ChatTurn[] {
  const newDayMarker = (date: string) => `[new day — ${date}]\n`;

  let lastKnownDate: string | undefined;
  const turns: ChatTurn[] = history.map(h => {
    let text = h.text;
    if (h.at !== undefined) {
      if (lastKnownDate !== undefined && h.at !== lastKnownDate) {
        text = newDayMarker(h.at) + text;
      }
      lastKnownDate = h.at;
    }
    return { role: h.role === 'user' ? 'user' as const : 'model' as const, text };
  });
  if (turns.length > 0 && turns[0].role === 'model') turns.shift(); // Gemini는 user로 시작

  let questionText = question;
  if (lastKnownDate !== undefined && today !== undefined && today !== lastKnownDate) {
    questionText = newDayMarker(today) + questionText;
  }
  turns.push({ role: 'user', text: questionText });
  return turns;
}

// ── Answer normalizer (validate shape + convert timing objects to string) ────────

function normalizeAnswer(
  mode: 'me' | 'person' | 'general',
  raw: unknown,
): Record<string, unknown> | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;

  if (mode === 'me' || mode === 'general') {
    return typeof r.text === 'string' ? { text: r.text, ...(typeof r.followUp === 'string' && r.followUp ? { followUp: r.followUp } : {}) } : null;
  }

  // person mode — either a short {text} follow-up, or exactly 3 parts with label:string + text:string
  const mem = Array.isArray(r.memory)
    ? (r.memory as unknown[]).filter((x): x is string => typeof x === 'string' && x.trim() !== '').slice(0, 2)
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
    const item = p as Record<string, unknown>;
    if (typeof item.label !== 'string' || typeof item.text !== 'string') return null;
  }

  let timing: string | undefined;
  if (r.timing !== undefined) {
    if (typeof r.timing === 'string') {
      timing = r.timing || undefined;
    } else if (typeof r.timing === 'object' && r.timing !== null) {
      // LLM returned an object — convert favorable_dates / avoid_dates to a sentence
      const t = r.timing as Record<string, unknown>;
      const segs: string[] = [];
      if (Array.isArray(t.favorable_dates) && (t.favorable_dates as unknown[]).length > 0)
        segs.push(`Favorable: ${(t.favorable_dates as string[]).join(', ')}.`);
      if (Array.isArray(t.avoid_dates) && (t.avoid_dates as unknown[]).length > 0)
        segs.push(`Avoid: ${(t.avoid_dates as string[]).join(', ')}.`);
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

// ── §6/§7: answer validator (pure — reads the answer, never mutates it) ──────────────────────

export type AskViolationType = 'label_set' | 'label_order' | 'strict_script_parts' | 'reintroduction' | 'verdict_opening';
export interface AskViolation { type: AskViolationType; detail?: string }
export interface AskValidationCtx {
  askMode: AskMode;
  personIntroduced?: boolean;
  candidates: string[];
  latestUserText: string;
}

function partsLabels(answer: Record<string, unknown>): string[] | null {
  if (!Array.isArray(answer.parts)) return null;
  return (answer.parts as Array<{ label: string }>).map(p => p.label);
}

function isExactSet(labels: string[], set: readonly string[]): boolean {
  return labels.length === set.length && set.every(l => labels.includes(l));
}

/**
 * Reads an already-normalized answer and reports violations — never mutates. `label_order` is
 * reported here for standalone testability, but the route fixes it in place (no regen spent)
 * BEFORE calling this in the real pipeline, so it should never actually reach the regen decision
 * (BRIEF-100B §1's "라벨 순서만 위반" row).
 */
export function validateAskAnswer(answer: Record<string, unknown>, ctx: AskValidationCtx): AskViolation[] {
  const violations: AskViolation[] = [];
  const labels = partsLabels(answer);

  if (ctx.askMode === 'strict_script' && labels !== null) {
    violations.push({ type: 'strict_script_parts' });
  }

  if (labels !== null) {
    const matchesUnderstand = isExactSet(labels, UNDERSTAND_LABELS);
    const matchesDecide = isExactSet(labels, DECIDE_LABELS);
    if (!matchesUnderstand && !matchesDecide) {
      violations.push({ type: 'label_set' });
    } else {
      const canonical = matchesUnderstand ? UNDERSTAND_LABELS : DECIDE_LABELS;
      const inOrder = labels.every((l, i) => l === canonical[i]);
      if (!inOrder) violations.push({ type: 'label_order' });
    }
  }

  // Reintroduction — person + ALREADY only. The user's own latest message is exempt (they may
  // have asked "첫 새벽이라 그런 거야?" directly — the assistant must be able to answer that).
  if (ctx.personIntroduced) {
    const normalizedAnswer = normalizeForMatch(JSON.stringify(answer));
    const normalizedUserText = normalizeForMatch(ctx.latestUserText);
    for (const candidate of ctx.candidates) {
      const nc = normalizeForMatch(candidate);
      if (!nc || normalizedUserText.includes(nc)) continue;
      if (normalizedAnswer.includes(nc)) { violations.push({ type: 'reintroduction', detail: candidate }); break; }
    }
  }

  // verdict_probe leading-affirmation — a SOFT signal only (§6's own documented limitation:
  // an unflagged verdict sentence can still slip through, and a flagged opening isn't always
  // actually a verdict — the real defense is the §4 contract block, this is a backstop nudge).
  if (ctx.askMode === 'verdict_probe') {
    const opening = labels !== null
      ? String((answer.parts as Array<{ text: string }>)[0]?.text ?? '')
      : String(answer.text ?? '');
    const trimmed = opening.trim();
    // Same Hangul-\b caveat as above: use a negative lookahead (not followed by another Hangul
    // syllable) for the Korean words instead of \b; "Yes" is plain ASCII so \b works normally.
    const startsWithAffirm = /^(?:(?:네|맞아요|맞아)(?![가-힣])|Yes\b)/.test(trimmed);
    const firstSentence = trimmed.split(/(?<=[.!?。])\s|\n/)[0] ?? trimmed;
    const affirmPattern = /원래\s*그런\s*(?:편|성격|사람)/.test(firstSentence);
    if (startsWithAffirm || affirmPattern) violations.push({ type: 'verdict_opening' });
  }

  return violations;
}

/** Order-only fix — free (no regen budget spent), applied immediately wherever label_order is
 * the issue (BRIEF-100B §1's "재생성 없이... 1차에서 즉시" row). Leaves an invalid set alone. */
function fixLabelOrder(answer: Record<string, unknown>): { answer: Record<string, unknown>; fixed: boolean } {
  const labels = partsLabels(answer);
  if (labels === null) return { answer, fixed: false };
  const matchesUnderstand = isExactSet(labels, UNDERSTAND_LABELS);
  const matchesDecide = isExactSet(labels, DECIDE_LABELS);
  if (!matchesUnderstand && !matchesDecide) return { answer, fixed: false };
  const canonical = matchesUnderstand ? UNDERSTAND_LABELS : DECIDE_LABELS;
  if (labels.every((l, i) => l === canonical[i])) return { answer, fixed: false };
  const parts = answer.parts as Array<{ label: string; text: string }>;
  const reordered = canonical.map(label => parts.find(p => p.label === label)!);
  return { answer: { ...answer, parts: reordered }, fixed: true };
}

/** Label-SET violation final disposition — stamps the majority-matching set's 3 canonical
 * labels onto the existing parts positionally; text content is untouched (BRIEF-100B §1). */
function normalizeLabels(answer: Record<string, unknown>): Record<string, unknown> {
  const parts = answer.parts as Array<{ label: string; text: string }>;
  const labels = parts.map(p => p.label);
  const understandMatches = labels.filter(l => (UNDERSTAND_LABELS as readonly string[]).includes(l)).length;
  const decideMatches = labels.filter(l => (DECIDE_LABELS as readonly string[]).includes(l)).length;
  const winning = understandMatches >= decideMatches ? UNDERSTAND_LABELS : DECIDE_LABELS;
  const newParts = parts.map((p, i) => ({ ...p, label: winning[i] }));
  return { ...answer, parts: newParts };
}

/** strict_script + parts final disposition — downgrades to shape 2 by joining the 3 part
 * texts with a blank line, dropping `parts`/`timing` (BRIEF-100B §1). */
function downgradeToText(answer: Record<string, unknown>): Record<string, unknown> {
  const parts = answer.parts as Array<{ text: string }>;
  const combined = parts.map(p => p.text).join('\n\n');
  const { parts: _p, timing: _t, ...rest } = answer;
  void _p; void _t;
  return { ...rest, text: combined };
}

/** Final, deterministic disposition for whatever violations remain after the (at most one)
 * correction attempt — never returns null; only call/parse/schema/banned can hard-fail, and
 * those are handled before this is ever called (BRIEF-100B §1's disposition table). */
function applyFinalDisposition(
  answer: Record<string, unknown>,
  violations: AskViolation[],
): { answer: Record<string, unknown>; flags: Array<{ stage: string; action: string }> } {
  let out = answer;
  const flags: Array<{ stage: string; action: string }> = [];
  const hasType = (t: AskViolationType) => violations.some(v => v.type === t);

  if (hasType('strict_script_parts')) {
    out = downgradeToText(out);
    flags.push({ stage: 'script', action: 'downgrade' });
  } else if (hasType('label_set')) {
    out = normalizeLabels(out);
    flags.push({ stage: 'labels', action: 'normalize' });
  }
  if (hasType('reintroduction')) flags.push({ stage: 'reintro', action: 'soft' });
  if (hasType('verdict_opening')) flags.push({ stage: 'verdict', action: 'soft' });
  return { answer: out, flags };
}

function stageOf(type: AskViolationType): string {
  switch (type) {
    case 'label_set':
    case 'label_order':
      return 'labels';
    case 'strict_script_parts':
      return 'script';
    case 'reintroduction':
      return 'reintro';
    case 'verdict_opening':
      return 'verdict';
  }
}

function buildCorrectionWarnings(schemaInvalid: boolean, banned: string[], violations: AskViolation[]): string[] {
  const warnings: string[] = [];
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
      case 'label_order':
        break; // fixed in place, never reaches here
    }
  }
  return warnings;
}

// ── §2: call classification + logging (route-local — llm.ts itself is untouched) ─────────────

interface CallOk { ok: true; raw: string }
interface CallFail { ok: false; status?: number; timeout: boolean; failFast: boolean; errName: string }
type CallResult = CallOk | CallFail;

async function callModel(system: string, turns: ChatTurn[], timeoutMs: number): Promise<CallResult> {
  try {
    const llm = createLlmProvider();
    const raw = await withTimeout(llm.generateJsonChat(system, turns, { maxTokens: 4096, thinkingBudget: 1024, temperature: 0.7 }), timeoutMs);
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
    return { ok: false, timeout: false, failFast: false, errName }; // other network-ish exception -> retry
  }
}

function tryParse(raw: string): { ok: true; value: unknown } | { ok: false; errName: string } {
  try { return { ok: true, value: extractJson(raw) }; }
  catch (err) { return { ok: false, errName: err instanceof Error ? err.name : 'Error' }; }
}

/** [ask] rid=<rid> stage=<...> action=<...> status=<숫자|-> timeout=<y|n> [rawLen=<n>] [err=<name>]
 * Never logs raw response/conversation content — only lengths and error names (BRIEF-100B §2,
 * fixing the prior privacy defect where response bodies were logged via rawAnswer.slice(0,300)). */
function logAsk(
  rid: string,
  stage: string,
  action: string,
  opts: { status?: number; timeout?: boolean; rawLen?: number; errName?: string } = {},
): void {
  const status = opts.status !== undefined ? String(opts.status) : '-';
  const timeout = opts.timeout ? 'y' : 'n';
  let line = `[ask] rid=${rid} stage=${stage} action=${action} status=${status} timeout=${timeout}`;
  if (opts.rawLen !== undefined) line += ` rawLen=${opts.rawLen}`;
  if (opts.errName) line += ` err=${opts.errName}`;
  console.error(line);
}

function errorResponse(code: 'call' | 'parse' | 'schema' | 'banned', status: number) {
  return Response.json({ error: "Attune couldn't finish that thought — ask again.", code }, { status });
}

// ── Request schema ─────────────────────────────────────────────────────────────

const RequestSchema = z.object({
  mode: z.enum(['me', 'person', 'general']),
  me: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
    time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    name: z.string().optional(),
  }),
  them: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    name: z.string().optional(),
  }).optional(),
  briefing: z.record(z.string(), z.unknown()).optional(),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    text: z.string(),
    at: z.string().optional(),
  })).max(20),
  question: z.string().min(1).max(500),
  todayLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  memory: z.array(z.string().max(200)).max(10).optional(),
  safetyAck: z.boolean().optional(),
}).refine(
  data => !(data.mode === 'person' && !data.them),
  { message: '"them" is required when mode is "person"', path: ['them'] },
);

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // Rate limit
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  const rl = checkRateLimit(`${ip}:ask`, RATE_LIMIT, RATE_WINDOW);
  if (!rl.allowed) {
    return Response.json(
      { error: 'Rate limit exceeded', retryAfterMinutes: Math.ceil(rl.retryAfterMs / 60_000) },
      { status: 429 },
    );
  }

  // Parse body
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }

  const { mode, me: meInput, them: themInput, briefing, history, question } = parsed.data;

  // Safety gate (BRIEF-096 §3) — bypass defense: independent of the client's own pre-check.
  // Triggered + no safetyAck (the client's one-time "already confirmed safe" flag) -> no LLM call, no quota impact.
  if (!parsed.data.safetyAck) {
    const trigger = detectSafetyTrigger(question);
    if (trigger) {
      return Response.json({ safety: trigger });
    }
  }

  // Saju calculations (server-side only, never LLM)
  const meChart   = calculateSaju(meInput);
  const themChart = themInput ? calculateSaju(themInput) : null;

  // Daily pillars — client-local today when provided (avoids UTC date drift), else server's today
  const today = parsed.data.todayLocal ?? new Date().toISOString().split('T')[0];
  const dailyPillars = getDailyPillars(today, 90);

  // Has today's day pillar already been named earlier in this conversation?
  const todayNames = todayNameCandidates(calculateSaju({ date: today }).pillars.day);
  const todayIntroduced = hasTodayIntroduced(history, todayNames);

  // Has the other person's day master / archetype already been named earlier (person mode only,
  // BRIEF-100 §8) — bounded by the same `history` window the client sends (§8's known limit).
  const personIntroduced = mode === 'person' && themChart
    ? hasPersonIntroduced(history, themNameCandidates(themChart))
    : undefined;

  // §3: askMode / continuation hint — detected for all 3 modes, from the latest question only.
  const askMode = detectAskMode(question);
  const continuationHint = detectContinuationHint(question);
  const candidates = mode === 'person' && themChart ? themNameCandidates(themChart) : [];
  const ctx: AskValidationCtx = { askMode, personIntroduced, candidates, latestUserText: question };

  const system = buildAskSystem(
    mode, meChart, themChart,
    briefing as Record<string, unknown> | undefined,
    dailyPillars,
    parsed.data.me.name, themInput?.name,
    mode === 'person' ? parsed.data.memory : undefined,
    todayIntroduced,
    personIntroduced,
    askMode,
    continuationHint,
  );
  const turns = buildAskTurns(history, question, today);
  const rid = crypto.randomUUID().slice(0, 8);

  // ── §1/§2 pipeline: 1 primary call + at most 1 shared extra call (retry OR correction) ──────

  let usedExtraCall = false;

  let callRes = await callModel(system, turns, FIRST_CALL_TIMEOUT);
  if (!callRes.ok) {
    if (callRes.failFast) {
      logAsk(rid, 'call', 'fail', callRes);
      return errorResponse('call', 502);
    }
    logAsk(rid, 'call', 'retry', callRes);
    usedExtraCall = true;
    callRes = await callModel(system, turns, RETRY_CALL_TIMEOUT);
    if (!callRes.ok) {
      logAsk(rid, 'call', 'fail', callRes);
      return errorResponse('call', 502);
    }
  }

  let raw = callRes.raw;
  let parseRes = tryParse(raw);

  if (!parseRes.ok) {
    if (usedExtraCall) {
      logAsk(rid, 'parse', 'fail', { rawLen: raw.length, errName: parseRes.errName });
      return errorResponse('parse', 502);
    }
    logAsk(rid, 'parse', 'retry', { rawLen: raw.length, errName: parseRes.errName });
    usedExtraCall = true;
    const retryCall = await callModel(system, turns, RETRY_CALL_TIMEOUT);
    if (!retryCall.ok) {
      logAsk(rid, 'call', 'fail', retryCall);
      return errorResponse('call', 502);
    }
    raw = retryCall.raw;
    parseRes = tryParse(raw);
    if (!parseRes.ok) {
      logAsk(rid, 'parse', 'fail', { rawLen: raw.length, errName: parseRes.errName });
      return errorResponse('parse', 502);
    }
  }

  let answer = normalizeAnswer(mode, parseRes.value);
  if (answer) {
    const orderFix = fixLabelOrder(answer);
    if (orderFix.fixed) { answer = orderFix.answer; logAsk(rid, 'labels', 'reorder', {}); }
  }
  let banned = answer ? findBanned(JSON.stringify(answer)) : [];
  let violations = answer ? validateAskAnswer(answer, ctx) : [];

  if (!answer || banned.length > 0 || violations.length > 0) {
    if (usedExtraCall) {
      // Budget already spent on a call/parse retry — resolve deterministically, no more calls.
      if (!answer) { logAsk(rid, 'schema', 'fail', {}); return errorResponse('schema', 502); }
      if (banned.length > 0) { logAsk(rid, 'banned', 'fail', {}); return errorResponse('banned', 502); }
      const disposition = applyFinalDisposition(answer, violations);
      for (const f of disposition.flags) logAsk(rid, f.stage, f.action, {});
      return Response.json({ answer: disposition.answer });
    }

    // Spend the single shared correction attempt.
    usedExtraCall = true;
    if (!answer) logAsk(rid, 'schema', 'regen', {});
    if (banned.length > 0) logAsk(rid, 'banned', 'regen', {});
    for (const v of violations) logAsk(rid, stageOf(v.type), 'regen', {});

    const warnings = buildCorrectionWarnings(!answer, banned, violations);
    const correctionTurns: ChatTurn[] = [
      ...turns,
      { role: 'model', text: raw },
      { role: 'user', text: warnings.join('\n\n') },
    ];

    const correctionRes = await callModel(system, correctionTurns, RETRY_CALL_TIMEOUT);
    if (!correctionRes.ok) {
      logAsk(rid, 'call', 'fail', correctionRes);
      return errorResponse('call', 502);
    }
    raw = correctionRes.raw;
    parseRes = tryParse(raw);
    if (!parseRes.ok) {
      logAsk(rid, 'parse', 'fail', { rawLen: raw.length, errName: parseRes.errName });
      return errorResponse('parse', 502);
    }

    answer = normalizeAnswer(mode, parseRes.value);
    if (answer) {
      const orderFix2 = fixLabelOrder(answer);
      if (orderFix2.fixed) { answer = orderFix2.answer; logAsk(rid, 'labels', 'reorder', {}); }
    }
    if (!answer) { logAsk(rid, 'schema', 'fail', {}); return errorResponse('schema', 502); }

    banned = findBanned(JSON.stringify(answer));
    if (banned.length > 0) { logAsk(rid, 'banned', 'fail', {}); return errorResponse('banned', 502); }

    violations = validateAskAnswer(answer, ctx);
    if (violations.length > 0) {
      const disposition = applyFinalDisposition(answer, violations);
      for (const f of disposition.flags) logAsk(rid, f.stage, f.action, {});
      return Response.json({ answer: disposition.answer });
    }
  }

  return Response.json({ answer });
}
