import { z } from 'zod';
import { calculateSaju, getDailyPillars, pillarLabel, friendlyPillarName, STEM_NAMES, BRANCH_NAMES } from '@/lib/saju';
import type { SajuChart, DailyPillar, Pillar, Element, TenStem, TwelveBranch } from '@/lib/saju';
import { getArchetype, getElementRelationship, localeVoiceBlock, ARCHETYPE_LOCALE } from '@/lib/interpretGuide';
import { formatChart } from '@/lib/briefing';
import { createLlmProvider, type ChatTurn } from '@/lib/llm';
import { checkRateLimit } from '@/lib/rateLimit';
import { detectSafetyTrigger } from '@/lib/safety';
import { findHiddenTruthFraming, splitSentences } from '@/lib/hiddenTruth';

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

// ── BRIEF-100B-FIX6 §2.1 — decisive, single-pass repair for literal control chars inside JSON
// string literals (the observed 502 cause: the model sometimes emits a raw LF instead of the
// escape sequence \n inside "text"). No regex — a regex can't reliably track quote-nesting state
// across escaped quotes (\") and escaped backslashes (\\) (BRIEF-100B-FIX6 §2.1 test ⑥). Chars
// OUTSIDE a string (e.g. pretty-print whitespace between braces) are never touched (test ⑤).
export function repairControlCharsInStrings(raw: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (!inString) {
      out += ch;
      if (ch === '"') inString = true;
      continue;
    }
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') { out += ch; escaped = true; continue; }
    if (ch === '"') { out += ch; inString = false; continue; }
    if (ch === '\n') { out += '\\n'; continue; }
    if (ch === '\r') { out += '\\r'; continue; }
    if (ch === '\t') { out += '\\t'; continue; }
    out += ch;
  }
  return out;
}

/** First non-whitespace-aware raw character, for [ask] log diagnostics only (BRIEF-100B-FIX6 §2.5). */
function classifyFirstChar(raw: string): 'brace' | 'quote' | 'fence' | 'hangul' | 'latin' | 'space' | 'other' {
  const c = raw[0];
  if (c === undefined) return 'other';
  if (raw.startsWith('```')) return 'fence';
  if (/\s/.test(c)) return 'space';
  if (c === '{') return 'brace';
  if (c === '"' || c === '\'' || c === '“' || c === '”') return 'quote';
  if (/[가-힣]/.test(c)) return 'hangul';
  if (/[a-zA-Z]/.test(c)) return 'latin';
  return 'other';
}

/** Fence-stripped, trimmed text — used ONLY for the §2.3 plain-text fallback's candidate `T`.
 * Always derived from the ORIGINAL raw, never from a repaired string: repair's `inString` tracker
 * keys off literal `"` characters, and plain prose can contain a stray quote (a casual "quote")
 * that would flip it on and start mangling unrelated text after it. Using the untouched raw for
 * a plain-text candidate sidesteps that risk entirely (user-clarified requirement). */
function stripFenceAndTrim(raw: string): string {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return (fence ? fence[1] : raw).trim();
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

// ── F5: hidden-truth framing (BRIEF-100B-FIX §1) — detector moved to src/lib/hiddenTruth.ts as a
// pure extraction (BRIEF-100B-FIX2 §1.1), so src/lib/briefing.ts can reuse it for `starters`
// without importing app code. Regex/judgment logic byte-for-byte unchanged — see that file. ──

/** Every user-visible string in an answer — 3-part card texts, plain {text}, and followUp — since F5
 * must be checked "답변 본문 · followUp · 추천 칩 전부" (the "recommended chip" IS the rendered followUp
 * text — src/app/(tabs)/ask/page.tsx has no separate model-generated chip field; confirmed by grep). */
function collectAnswerText(answer: Record<string, unknown>): string[] {
  const texts: string[] = [];
  if (typeof answer.text === 'string') texts.push(answer.text);
  if (Array.isArray(answer.parts)) {
    for (const p of answer.parts as Array<{ text?: string }>) {
      if (typeof p.text === 'string') texts.push(p.text);
    }
  }
  if (typeof answer.followUp === 'string') texts.push(answer.followUp);
  return texts;
}

/** Same scope as `collectAnswerText` (parts/text/followUp) PLUS `timing` — BRIEF-105 §2.2.2
 * explicitly widens the scope to include it for the date–pillar check only; `collectAnswerText`
 * itself is left unchanged since F5 (hidden-truth framing) and other callers rely on its existing
 * scope (a `timing` string is never prose the model free-writes about feelings, so F5 has no need
 * for it — this is a date–pillar-specific widening, not a general fix). */
function collectAnswerTextWithTiming(answer: Record<string, unknown>): string[] {
  const texts = collectAnswerText(answer);
  if (typeof answer.timing === 'string') texts.push(answer.timing);
  return texts;
}

// ── §3: askMode / continuation-hint detection (conservative — unsure => null/false) ──────────
// Table-driven so tests can assert against the exact pattern list, not just the function's
// aggregate decision (BRIEF-100B §3).

export type AskMode = 'strict_script' | 'verdict_probe' | 'completion' | null;

const COUNT_WORD = '(?:\\d+|한|두|세|네)';

export const STRICT_SCRIPT_PATTERNS: RegExp[] = [
  new RegExp(`문장\\s*${COUNT_WORD}\\s*개`),                    // "문장 두 개", "문장 3개"
  new RegExp(`${COUNT_WORD}\\s*문장(?:만)?\\s*(?:써|만들|뽑)`), // "3문장 써", "두문장만 뽑아"
  new RegExp(`멘트\\s*${COUNT_WORD}\\s*개`),                    // "멘트 두 개"
  // "메시지" (formal "message") — BRIEF-100B-FIX §4.5-style gap: the SMOKE brief's own §2 example
  // ("보낼 메시지 2개만 써줘") used this word, which the pre-existing patterns above never covered
  // (only the slangier "멘트" was). Added alongside "멘트", not replacing it.
  new RegExp(`메시지\\s*${COUNT_WORD}\\s*개`),                  // "메시지 두 개"
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

// ── Axis B (BRIEF-100B-FIX3 §1.2) — "write me something to send" WITHOUT an explicit count. ─────
// Deliberately requires a write-verb (COMPLETION_VERB) — never fires on a bare question like
// "뭐라고 답할까?" (no verb) — same conservative philosophy as STRICT_SCRIPT_PATTERNS above: a false
// trigger here steals the 3-part card from a real coaching question, which is worse than missing one.
const COMPLETION_OBJECT = '(?:메[시세][지제]|문자|답장|멘트|문장)';
const COMPLETION_VERB   = '(?:써|적어|만들어|뽑아)';

export const COMPLETION_PATTERNS: RegExp[] = [
  new RegExp(`${COMPLETION_OBJECT}[^\\n]{0,10}?${COMPLETION_VERB}`),                                   // "메시지 좀 써줘"
  new RegExp(`뭐라고[^\\n]{0,10}?(?:보낼지|답할지|말할지|쓸지)[^\\n]{0,10}?${COMPLETION_VERB}`),         // "뭐라고 보낼지 써줘"
  /\b(?:write|draft|give me)\b[^\n]{0,20}\b(?:message|text|reply|line)s?\b/i,
];

// "답장 안 써" / "답장 써야 할까?" — negation and deliberation, not a request for text to send.
// BRIEF-100B-FIX4-C §1.1: role changes here — no longer "exclude the whole input", but "this CLAUSE
// is not a request" (used inside detectCompletionRequest below). Name and content unchanged.
export const COMPLETION_EXCLUSIONS: RegExp[] = [
  /(?:안|못)\s*(?:써|적어|만들어|뽑아)/,                              // (기존 1)
  /(?:써|적어|만들어|뽑아)\S*\s*(?:할까|말까|될까)/,                   // (기존 2)

  // ── BRIEF-100B-FIX5 — 시제·상(相) 축. 이 절은 요청이 아니라 보고·숙고·의도다. ──
  // 완료·과거 보고: 이미 썼거나 보냈다는 서술.
  /(?:써|적어|만들어|뽑아)(?:서)?\s*(?:봤|놨|뒀|보냈)/,               // 써봤어 / 써놨어 / 써뒀어 / 써(서) 보냈어
  // `줬`은 완료형이지만 `줬으면`은 간접 요청이다 — 부정 전방탐색으로 요청만 살린다.
  /(?:써|적어|만들어|뽑아)줬(?!으면)/,                                // 써줬어 O / 써줬으면 좋겠어 X(통과)
  /(?:써|적어|만들어|뽑아)줘서\s*(?:고마|감사|좋았|다행)/,             // 써줘서 고마워
  /(?:써|적어|만들어|뽑아)준\s*(?:거|것|건|게)/,                       // 써준 거 보냈어
  // 의도 선언: 사용자가 자기가 쓰겠다고 말하는 형태.
  /(?:써|적어|만들어|뽑아)(?:볼|보|놓을|둘|줄)?\s*(?:게|야지|려고)/,   // 써볼게 / 써둘게 / 써야지 / 써보려고
  // 숙고: 사용자가 자기가 쓸지 고민하는 형태.
  /(?:써|적어|만들어|뽑아)(?:볼|놓을|둘)(?:까|지)/,                    // 써볼까? / 써볼지 고민이야 / 써놓을까?
];

// ── BRIEF-100B-FIX4-C §1.2 — clause-boundary + speaker-separation tables (all exported for
// table-level testing). Replaces the old "whole-text pattern + exclusion" completion check, which
// could not represent sentence order (a later cancellation) or quoted/reported speech (someone
// else's request). See BRIEF-100B-FIX4-C.md §1.4 for the design rationale behind each regex. ────

/** 절 경계. 인용·취소가 한 문장 안에 섞여 있을 때 나눈다. */
export const COMPLETION_SEGMENT_SPLIT: RegExp =
  /(?<=(?:는데|지만|다만|니까|라서|말고))\s+|(?<=[,;])\s*|(?<=아니다|아니야|아니|됐어|그만)\s+|\s+(?=그래도|그런데|근데|하지만|아니|아니다|그럼|대신|일단)/;

/** 직접 인용 — 따옴표로 묶인 구간. */
export const COMPLETION_QUOTE_SPAN: RegExp = /["'“”][^"'“”]*["'“”]/;

/** 간접·전달 인용 표지. 이 표지까지가 인용 영역이고, 표지 뒤는 사용자 영역이다.
 *  `줄래`의 `래`, `있대/없대`의 `대`는 요청·서술이므로 부정 후방탐색으로 제외한다.
 *  `라고`는 뒤에 전달 동사가 올 때만 표지다 — 그러지 않으면 `뭐라고 보낼지 써줘`가 죽는다. */
export const COMPLETION_REPORT_MARKER: RegExp =
  /(?:달라고|달라는데|달래(?![가-힣])|라고\s*(?:했|하|해|한|보냈|왔|들었|그러|말)|다고\s*(?:했|하|해|한)|라는데|라며|라더라|(?<![줄을])래(?![가-힣])|(?<![있없])대(?![가-힣]))/;

/** 후치 부정·금지 — 현재 생성 행위를 막는 형태. `지 마`와 `지 말고` 둘 다 덮는다. */
export const COMPLETION_FORBID: RegExp =
  /(?:(?:써|적어|만들어|뽑아)(?:주)?지\s*(?:마|말)|(?:쓰|적|만들|뽑)지\s*(?:마|말)|(?:안|못)\s*(?:써|적어|만들어|뽑아))/;

/** 취소·철회. 목적어가 함께 있는 절은 취소가 아니라 수정 요청이므로 §1.3에서 제외된다. */
export const COMPLETION_CANCEL: RegExp =
  /(?:아니|됐어|됐다|관두|놔둬|놔둘|취소|잠깐|기다려|그만)/;

export const COMPLETION_REQUEST_ENDINGS: RegExp =
  /(?:써|적어|만들어|뽑아)\s*(?:줘(?!서)|주라|줘라|줄래|주세요|주실래|주면|줬으면|주시면|달라|다오)/;

// ── BRIEF-100B-FIX4-C §1.3 — clause classification: separate quoted/reported speech from the
// user's own direct speech FIRST, then apply request/cancel/forbid + input order to the direct-
// speech clauses only. Deliberately NOT "find the one speaker of the sentence" — a single input can
// contain both a quote of someone else AND the user's own real request (§0 판정 원칙). ────────────

type CompletionPart = { kind: 'quote' | 'user'; text: string };

/** 한 문장을 절로 나누고, 각 절에서 인용 영역과 사용자 영역을 가른다. */
export function splitCompletionParts(sentence: string): CompletionPart[] {
  const out: CompletionPart[] = [];
  for (const raw of sentence.split(COMPLETION_SEGMENT_SPLIT)) {
    const s = raw.trim();
    if (!s) continue;
    const q = s.match(COMPLETION_QUOTE_SPAN);
    const from = q && q.index !== undefined ? q.index + q[0].length : 0;
    const rm = s.slice(from).match(COMPLETION_REPORT_MARKER);
    if (rm && rm.index !== undefined) {
      const cut = from + rm.index + rm[0].length;
      out.push({ kind: 'quote', text: s.slice(0, cut) });
      const tail = s.slice(cut).trim();
      if (tail) out.push({ kind: 'user', text: tail });
    } else if (q && q.index !== undefined && !s.slice(from).trim()) {
      out.push({ kind: 'quote', text: s });
    } else {
      out.push({ kind: 'user', text: s });
    }
  }
  return out;
}

export function detectCompletionRequest(text: string): boolean {
  let sawObject = false;                 // 앞 절에서 목적어 명사가 이미 나왔는가
  let last: 'request' | 'cancel' | 'forbid' | null = null;

  for (const sentence of splitSentences(text)) {
    for (const part of splitCompletionParts(sentence)) {
      if (part.kind === 'quote') continue;              // 인용·보고는 사용자의 요청이 아니다
      const t = part.text;

      if (COMPLETION_FORBID.test(t)) { last = 'forbid'; continue; }

      const hasObject = COMPLETION_PATTERNS.some(p => p.test(t));
      const nonRequest = COMPLETION_EXCLUSIONS.some(p => p.test(t));
      if (hasObject) sawObject = true;

      // 요청: 이 절에 목적어가 있거나(정상), 앞 절에서 목적어가 나온 뒤의 대용 요청이거나.
      if ((hasObject && !nonRequest) ||
          (sawObject && COMPLETION_REQUEST_ENDINGS.test(t) && !nonRequest)) {
        last = 'request'; continue;
      }
      // 취소: 목적어가 없는 절에서만. 목적어가 있으면 수정 요청이다("아니 문자로 써줘").
      if (COMPLETION_CANCEL.test(t) && !hasObject) { last = 'cancel'; continue; }
    }
  }
  return last === 'request';
}

/** Conservative: only fires on an explicit count ("문장 두 개 써줘"), never on a bare request
 * ("뭐라고 답할까?", "보낼 문장 써줘") — a false trigger here is worse than missing one.
 * Priority (fixed, BRIEF-100B-FIX3 §1.2, unchanged by FIX4-C): strict_script > verdict_probe >
 * completion > null — an explicit count always wins so the count contract is never silently lost
 * to the looser completion match. */
export function detectAskMode(latestUserText: string): AskMode {
  if (STRICT_SCRIPT_PATTERNS.some(p => p.test(latestUserText))) return 'strict_script';
  if (VERDICT_PROBE_PATTERNS.some(p => p.test(latestUserText))) return 'verdict_probe';
  if (detectCompletionRequest(latestUserText)) return 'completion';
  return null;
}

/** Hint only — never gates validation or forces a shape, just nudges the model (BRIEF-100B §3). */
export function detectContinuationHint(latestUserText: string): boolean {
  return CONTINUATION_HINT_PATTERNS.some(p => p.test(latestUserText));
}

// ── F2: output-contract enforcement (BRIEF-100B-FIX §1) ──────────────────────────────────────
// §4.5's diagnosis: the count/no-followUp contract already existed in STRICT_SCRIPT_BLOCK but was
// never checked. These helpers recover the requested count + unit from the SAME user text that
// already triggered `askMode === 'strict_script'`, so validateAskAnswer can actually enforce it.

const KOREAN_COUNT_WORDS: Record<string, number> = { 한: 1, 두: 2, 세: 3, 네: 4 };

function parseCountToken(matched: string): number | null {
  const digit = matched.match(/\d+/);
  if (digit) return Number(digit[0]);
  const word = matched.match(/[한두세네]/);
  return word ? KOREAN_COUNT_WORDS[word[0]] : null;
}

/** "문장"/"sentences" -> exactly-N-sentences contract; "메시지"/"멘트"/"messages"/"lines" -> exactly-N-
 * messages contract (each message may hold up to ~2 short sentences). Mirrors STRICT_SCRIPT_PATTERNS
 * 1:1 — returns null only if askMode was somehow 'strict_script' without a pattern actually matching
 * (shouldn't happen; stay defensive rather than throw). */
export function parseScriptRequest(text: string): { count: number; unit: 'sentence' | 'message' } | null {
  let m = text.match(new RegExp(`문장\\s*${COUNT_WORD}\\s*개`));
  if (m) return { count: parseCountToken(m[0]) ?? 0, unit: 'sentence' };

  m = text.match(new RegExp(`(${COUNT_WORD})\\s*문장(?:만)?\\s*(?:써|만들|뽑)`));
  if (m) return { count: parseCountToken(m[1]) ?? 0, unit: 'sentence' };

  m = text.match(new RegExp(`멘트\\s*${COUNT_WORD}\\s*개`));
  if (m) return { count: parseCountToken(m[0]) ?? 0, unit: 'message' };

  m = text.match(new RegExp(`메시지\\s*${COUNT_WORD}\\s*개`));
  if (m) return { count: parseCountToken(m[0]) ?? 0, unit: 'message' };

  m = text.match(/\b(?:write|give|draft)\b(?:\s+me)?\s+(\d+)\s+(lines?|sentences?|messages?)\b/i);
  if (m) return { count: Number(m[1]), unit: /sentence/i.test(m[2]) ? 'sentence' : 'message' };

  m = text.match(/\bexactly\s+(\d+)\s+(lines?|sentences?)\b/i);
  if (m) return { count: Number(m[1]), unit: /sentence/i.test(m[2]) ? 'sentence' : 'message' };

  return null;
}

function splitNonEmptyLines(text: string): string[] {
  return text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
}

// Format markers the contract forbids: leading numbering/bullets, "LABEL:" section headers, and a
// "/" used to separate two alternatives within a line.
const SCRIPT_LEADING_MARKER = /^(?:\d+[.)]|[-*•]|[①②③④⑤])\s+/;
const SCRIPT_LABEL_HEADER   = /^[A-Z][A-Z 0-9]*:/;
const SCRIPT_SLASH_SEPARATOR = /\S\/\S/;

function hasScriptFormatMarker(lines: string[]): boolean {
  return lines.some(l => SCRIPT_LEADING_MARKER.test(l) || SCRIPT_LABEL_HEADER.test(l) || SCRIPT_SLASH_SEPARATOR.test(l));
}

// ── §4: state-block verbatim strings (added to the prompt only when detected) ────────────────

// BRIEF-100B-FIX §1 F2 / §5 결재: "plus at most one short sentence of framing" removed — an explicit
// count means ONLY that count, nothing else. Sentence-vs-message unit distinction and the format-marker
// ban added so the prompt actually states what validateAskAnswer now enforces (§4.5's "계약은 있는데
// 집행이 없다" gap — this closes the prompt side of it; the code side is the new script_contract check).
// BRIEF-100B-FIX6 §2.4: the trailing sentence closes off the "nothing before it, nothing after
// it" instructions being misread as "drop the JSON envelope too" — the observed 502 cause. Typed
// as \\n (2 source backslashes) so the RUNTIME string holds \n (1 backslash + n, 2 chars) — never
// an actual line break (verified by test ⑭b).
const STRICT_SCRIPT_BLOCK = `SCRIPT REQUEST — the user asked for message lines to send, with an explicit count. Contract for THIS answer: respond in shape 2 ({"text": ...}) — no parts, no labels, no headings. Give EXACTLY the requested number of lines, each ready to send as-is, one per line — nothing before them, nothing after them, no leading explanation, no closing remark. If the count was for "문장"/sentences, each line is exactly one sentence. If the count was for "메시지"/"멘트"/messages/lines, each line may be up to two short sentences when that reads naturally (e.g. "오랜만이야! 잘 지내?"). No numbering, no bullets, no labels, no "/" separators between alternatives. No chart talk, no archetype, no day-pillar/today talk, no followUp. This contract outranks every other block for this turn, including TODAY first-mention duty — skip it here. Output format reminder: your entire reply must still be exactly one JSON object {"text": "..."} — every rule above describes the VALUE of "text", not the reply envelope. Newlines inside "text" must be written as \\n, never as a raw line break.`;

const VERDICT_PROBE_BLOCK = `CHARACTER QUESTION — the user is asking whether this is the other person's fixed personality. Contract for THIS answer: (1) never open with a confirmation ("네", "맞아요", "Yes") and never confirm a fixed trait; (2) start with one short line of honest uncertainty — a few moments aren't enough to define someone; (3) offer at least two different situational readings of the same behavior; (4) give one concrete thing to watch next time that would tell the readings apart; (5) the chart may color a tendency but must never serve as proof of character. Keep it compact.`;

const CONTINUATION_HINT_BLOCK = `CONTINUATION HINT — the latest message reads as a continuation of the same scene (added facts, their reaction, or a correction), not a new question. Shape 2 (short {"text"}) is almost certainly right here; do not restart the 3-part card unless it is clearly a new independent question.`;

// BRIEF-100B-FIX3 §1.3 — verbatim per the brief (no count given, so no "exactly N" language).
const COMPLETION_BLOCK = `COMPLETION REQUEST — the user asked you to write something they can send, without giving a count. Contract for THIS answer: respond in shape 2 ({"text": ...}) — no parts, no labels, no headings. Give only the sendable text itself, ready to copy as-is. Nothing before it, nothing after it: no leading explanation, no framing sentence, no closing remark, no commentary on why it works. One option by default; if two genuinely different directions are worth showing, put each on its own line. No numbering, no bullets, no labels, no "/" separators between alternatives. No chart talk, no archetype, no day-pillar/today talk, no followUp. This contract outranks every other block for this turn, including TODAY first-mention duty — skip it here. Output format reminder: your entire reply must still be exactly one JSON object {"text": "..."} — every rule above describes the VALUE of "text", not the reply envelope. Newlines inside "text" must be written as \\n, never as a raw line break.`;

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
    ? `TODAY ALREADY INTRODUCED earlier in this conversation. Do NOT announce or restate today's day name in any answer opening — never begin with "오늘은" + the day name in any form (formal, friendly, or element words). If the day genuinely matters mid-answer, weave the short handle once ("<날 이름> 기운이…"); otherwise leave it out entirely.`
    : `FIRST mention of today in a conversation: Korean → 「오늘은 <간지>(<한자>)일 — '<날 이름>' 날이에요」 style (formal name + friendly gloss, once). English → "a <Day Name> day" (short name only; ganzhi optional in parentheses).
AFTER that: use only the short handle, woven in ("<날 이름> 기운이…" / "with this <Day Name> energy…") — never repeat the full announcement.`;

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

SCRIPTS: Suggested lines must sound like something an adult actually says to a close adult — no exaggerated praise, no therapist/parent/teacher tone. Prefer: confirm the fact → name the misunderstanding → make the next request. An apology briefly acknowledges how it landed — not self-abasement. Stay close to the user's own register.

TEMPORAL STATE — track what the user has actually done versus what they're only planning. A stated intention ("~하기로 했어", "~할까 해", "~해볼까 봐") is NOT a completed event. Never ask about, or write as if you already know, the other person's reaction to something that hasn't happened yet. Only bring up or ask about their reaction after the user reports the action actually happened (past tense, or a stated result like "답이 없어", "반응이 이랬어"). When the user only shares a plan, acknowledge the plan and help them prepare for it — do not jump ahead to how it went.

EVIDENCE FOR CLAIMS ABOUT THEM — never state the other person's tastes, private thoughts, or future reactions as a known fact unless the user actually told you (this conversation or RELATIONSHIP NOTES). "은우가 좋아하는 커피" is fine ONLY if the user said Eun-woo likes coffee; otherwise use a conditional or optional framing ("평소 좋아한다고 말한 게 있다면", "부담이 적은 X처럼"). This is not a ban on possibility language — "~일 가능성이 커요" still needs to connect to something the user told you or a repeated pattern, and must not be the only explanation offered. Never promise how the other person will react ("반가워할 거예요", "마음의 문을 열 거예요", "되어줄 거예요") — a reaction is always a possibility, never a guarantee, even when the chart supports it. Do NOT avoid a preference the user actually stated just to be safe — use it naturally when relevant; you just don't have to bring it up in every single answer.

NO HIDDEN-TRUTH FRAMING — never claim you or the user can find out the other person's "real" hidden feelings, motives, or reasons from their behavior, a chart reading, or a single reaction. Phrases like "진짜 마음을 읽을 수 있어요", "진짜 이유를 알 수 있어요" overclaim a certainty this app cannot have. It's fine to say the opposite — that a single reaction can't reveal someone's real feelings, and that patterns over time tell you more.`;

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
  if (askMode === 'completion') modeBlocks.push(COMPLETION_BLOCK);
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
If today was already named earlier in this conversation, never cold-open with the announcement again — acknowledge briefly ("아까 말한 <날 이름> 날 흐름대로 —") and move straight to the answer. Two consecutive answers must never begin with the same sentence.

${mode === 'person' ? PERSON_RULES : SELF_RULES}

${SAFETY_RULES}

${PREDICTION_RULES}

${mode === 'person' ? IDENTITY_STATE_BLOCK : IDENTITY_MENTIONS_RULES}

If you name an archetype in a Korean answer, use its Korean name (the KO value) — never mix the English archetype name into Korean prose.

${koreanVoice}

FOLLOW-UP RULE: at most ONE followUp per answer. Never re-ask what the user already told you. Omit followUp entirely when you just gave a complete, ready-to-use output — an exact script, a finished list, or a direct answer with nothing left open. Never let followUp ask about the outcome or reaction to something that hasn't happened yet. Never stack questions. In Korean, no 당신 — e.g. "해보고 어땠는지 알려줘요" / "혹시 지현이 먼저 연락한 적도 있어요?". Skip it entirely on heavy or emotional moments where a question would feel pushy.${modeBlocksText}

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

export type AskViolationType = 'label_set' | 'label_order' | 'strict_script_parts' | 'reintroduction' | 'verdict_opening' | 'script_contract' | 'hidden_truth_framing' | 'completion_parts' | 'completion_contract' | 'date_pillar_mismatch';
export interface AskViolation { type: AskViolationType; detail?: string }
export interface AskValidationCtx {
  askMode: AskMode;
  personIntroduced?: boolean;
  candidates: string[];
  latestUserText: string;
  // BRIEF-105 §2.2.2 — optional so every existing caller/test literal stays valid unchanged.
  // When absent, the date–pillar check (below) is simply skipped for that call.
  dailyPillarLookup?: Map<string, DailyPillarLookupEntry>;
  todayDate?: string;
}

// ── BRIEF-105 §2.2 — date–pillar factual check ────────────────────────────────────────────────
// The model sometimes states a WRONG ganzi/day-name for a date it also names correctly elsewhere
// (BRIEF-104A voice baseline caught a live case: "8월 18일(물 호랑이 날)" when 2026-08-18 is really
// 甲子 / 나무 쥐, not 壬寅 / 물 호랑이). The correct answer is already server-computed in
// `dailyPillars`, so this is checked deterministically instead of trusted to the model's prose.

export interface DailyPillarLookupEntry {
  stemEn: TenStem;
  branchEn: TwelveBranch;
  element: Element;
  friendlyKo: string;
  friendlyEn: string;
  ganziHangul: string;
  ganziHanja: string;
}

/** Builds date -> pillar lookup from the SAME `dailyPillars` array passed to `buildAskSystem` — no
 * new saju calculation, only reads already-exported `STEM_NAMES`/`BRANCH_NAMES`/`friendlyPillarName`
 * (BRIEF-105 §2.2.1 — `src/lib/saju.ts` stays read-only). */
export function buildDailyPillarLookup(dailyPillars: DailyPillar[]): Map<string, DailyPillarLookupEntry> {
  const map = new Map<string, DailyPillarLookupEntry>();
  for (const p of dailyPillars) {
    const stemInfo = STEM_NAMES[p.stem];
    const branchInfo = BRANCH_NAMES[p.branch];
    const pillar: Pillar = { stem: p.stem, branch: p.branch, stemHanja: stemInfo.hanja, branchHanja: branchInfo.hanja };
    const friendly = friendlyPillarName(pillar);
    map.set(p.date, {
      stemEn: p.stem,
      branchEn: p.branch,
      element: stemInfo.element,
      friendlyKo: friendly.ko,
      friendlyEn: friendly.en,
      ganziHangul: `${stemInfo.ko}${branchInfo.ko}`,
      ganziHanja: `${stemInfo.hanja}${branchInfo.hanja}`,
    });
  }
  return map;
}

// `stemEn` = exact-stem match required (ganzi hangul/hanja tokens encode yin/yang, e.g. 갑자 vs
// 을축 are never confusable). `element` = element-only match (friendly-name tokens DON'T encode
// yin/yang — "물 호랑이"/"Water Tiger" is identical text whether the day is 壬寅 (Yang Water) or
// (hypothetically) a Yin Water day; exactly one of the two fields is ever set per token).
interface GanziToken { token: string; branchEn: TwelveBranch; stemEn?: TenStem; element?: Element }

/** Every (stem, branch) pairing's ko/hanja ganzi form (stem-exact) and ko/en friendly form
 * (element-only — see `GanziToken` above) — a superset of the true 60-jiazi cycle (10x12=120
 * pairs, not just the 60 that actually occur in a real calendar), because this is a
 * TEXT-RECOGNITION vocabulary, not a validity check: whatever a sentence claims gets compared
 * against the one CORRECT entry for its date either way (see `checkDatePillarSentence` below).
 * Deduped by token text — two different stems sharing an element (e.g. Yang/Yin Water) would
 * otherwise register the identical friendly-name string twice. Built once at module load. */
const GANZI_VOCABULARY: GanziToken[] = (() => {
  const stems = Object.keys(STEM_NAMES) as TenStem[];
  const branches = Object.keys(BRANCH_NAMES) as TwelveBranch[];
  const seen = new Map<string, GanziToken>();
  const add = (entry: GanziToken) => { if (!seen.has(entry.token)) seen.set(entry.token, entry); };
  for (const stemEn of stems) {
    for (const branchEn of branches) {
      const s = STEM_NAMES[stemEn];
      const b = BRANCH_NAMES[branchEn];
      const pillar: Pillar = { stem: stemEn, branch: branchEn, stemHanja: s.hanja, branchHanja: b.hanja };
      const friendly = friendlyPillarName(pillar);
      add({ token: `${s.ko}${b.ko}`, branchEn, stemEn });
      add({ token: `${s.hanja}${b.hanja}`, branchEn, stemEn });
      add({ token: friendly.ko, branchEn, element: s.element });
      add({ token: friendly.en, branchEn, element: s.element });
    }
  }
  return [...seen.values()];
})();

/** Word-boundary-safe match for one token. Hangul has no reliable `\b` (same reasoning as
 * `normalizeForMatch`/the verdict-probe patterns elsewhere in this file), so 2-syllable ganzi
 * tokens use a not-adjacent-to-another-Hangul-syllable guard instead (blocks e.g. "갑자" matching
 * inside "갑자기"). ASCII friendly names use a normal `\b`. */
function tokenBoundaryRegex(token: string): RegExp {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (/[가-힣]/.test(token)) {
    return new RegExp(`(?<![가-힣])${escaped}(?![가-힣])`);
  }
  return new RegExp(`\\b${escaped}\\b`, 'i');
}

const EN_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

interface DateMention { date: string; index: number }

/** Resolves every date mentioned in ONE sentence to a YYYY-MM-DD key present in `lookup`, WITH its
 * character index (BRIEF-105-FIX §2 needs position for nearest-date attribution when a sentence
 * names 2+ dates). BRIEF-105 §2.2.3's date rules: exact ISO; "M월 D일"/"Month D" WITHOUT a year
 * (resolved against the lookup's 90-day window ONLY when exactly one candidate matches — 0 or 2+
 * matches are left unresolved, never guessed); 오늘/today against `todayDate`. Dates outside the
 * lookup's window are never returned (never judged a mismatch — §2.2.3 "범위 밖은 mismatch로
 * 판정하지 않는다"). Occurrences are NOT deduped — the same date mentioned twice yields two
 * entries, which only sharpens nearest-distance attribution. */
function extractDateMentions(sentence: string, lookup: Map<string, DailyPillarLookupEntry>, todayDate?: string): DateMention[] {
  const found: DateMention[] = [];

  for (const m of sentence.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)) {
    if (lookup.has(m[0])) found.push({ date: m[0], index: m.index });
  }

  const byMonthDay = (month: string, day: string) =>
    [...lookup.keys()].filter(d => d.slice(5, 7) === month && d.slice(8, 10) === day);

  for (const m of sentence.matchAll(/(\d{1,2})월\s*(\d{1,2})일/g)) {
    const candidates = byMonthDay(m[1].padStart(2, '0'), m[2].padStart(2, '0'));
    if (candidates.length === 1) found.push({ date: candidates[0], index: m.index });
  }

  for (const m of sentence.matchAll(/\b([A-Za-z]+)\s+(\d{1,2})\b/g)) {
    const idx = EN_MONTHS.indexOf(m[1].toLowerCase());
    if (idx === -1) continue;
    const candidates = byMonthDay(String(idx + 1).padStart(2, '0'), String(Number(m[2])).padStart(2, '0'));
    if (candidates.length === 1) found.push({ date: candidates[0], index: m.index });
  }

  if (todayDate && lookup.has(todayDate)) {
    const todayMatch = /오늘/.exec(sentence) ?? /\btoday\b/i.exec(sentence);
    if (todayMatch) found.push({ date: todayDate, index: todayMatch.index });
  }

  return found;
}

/** Whether ganzi token `ft` is the correct one for lookup entry `correct` — stem-exact for
 * ganzi hangul/hanja tokens, element-only for friendly-name tokens (see `GanziToken`'s doc). */
function isTokenCorrectForEntry(ft: GanziToken, correct: DailyPillarLookupEntry): boolean {
  if (ft.branchEn !== correct.branchEn) return false;
  return ft.stemEn !== undefined ? ft.stemEn === correct.stemEn : ft.element === correct.element;
}

/** One sentence's date–pillar check (BRIEF-105 §2.2.3/§2.2.4 + BRIEF-105-FIX §2). No date -> skip.
 * No recognized ganzi/friendly-name token -> skip. Both are explicit false-positive guards.
 *
 * BRIEF-105-FIX §2 — a sentence naming 2+ distinct dates no longer blindly cross-checks every
 * day-name against every date (that produced false positives: "8월 14일(쇠 원숭이 날)이나 …8월
 * 18일(물 호랑이 날)…" flagged "쇠 원숭이" as wrong for 08-18 even though the model never claimed
 * that pairing). With 2+ distinct dates: (a) EXEMPTION — a day-name that correctly matches ANY
 * date named in the sentence is never a violation; (b) ATTRIBUTION — a day-name that matches NONE
 * of them is attributed to the character-nearest date mention (ties -> the earlier one in the
 * string) for the violation's `detail`. With exactly 1 distinct date, behavior is unchanged from
 * BRIEF-105: every found token is checked against that one date directly. */
function checkDatePillarSentence(sentence: string, lookup: Map<string, DailyPillarLookupEntry>, todayDate: string | undefined): AskViolation[] {
  const mentions = extractDateMentions(sentence, lookup, todayDate);
  if (mentions.length === 0) return [];

  const uniqueDates = [...new Set(mentions.map(m => m.date))];

  const foundTokens = GANZI_VOCABULARY
    .map(t => {
      const m = tokenBoundaryRegex(t.token).exec(sentence);
      return m ? { token: t, index: m.index } : null;
    })
    .filter((x): x is { token: GanziToken; index: number } => x !== null);
  if (foundTokens.length === 0) return [];

  const violations: AskViolation[] = [];

  if (uniqueDates.length === 1) {
    const date = uniqueDates[0];
    const correct = lookup.get(date);
    if (correct) {
      for (const { token: ft } of foundTokens) {
        if (isTokenCorrectForEntry(ft, correct)) continue;
        violations.push({ type: 'date_pillar_mismatch', detail: `${date}|${ft.token}|${correct.friendlyKo}` });
      }
    }
    return violations;
  }

  for (const { token: ft, index: ftIndex } of foundTokens) {
    const matchesAnyDate = uniqueDates.some(date => {
      const correct = lookup.get(date);
      return correct ? isTokenCorrectForEntry(ft, correct) : false;
    });
    if (matchesAnyDate) continue; // exemption (a) — correctly attached to SOME date in the sentence

    // attribution (b) — nearest date mention by character distance; ties -> earlier in the string.
    const nearest = mentions.reduce((best, m) => {
      const distBest = Math.abs(ftIndex - best.index);
      const distM = Math.abs(ftIndex - m.index);
      if (distM < distBest) return m;
      if (distM === distBest && m.index < best.index) return m;
      return best;
    });
    const correct = lookup.get(nearest.date);
    if (!correct) continue;
    violations.push({ type: 'date_pillar_mismatch', detail: `${nearest.date}|${ft.token}|${correct.friendlyKo}` });
  }
  return violations;
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

  // F2 script contract (BRIEF-100B-FIX §1) — only meaningful once the answer is ALREADY in text
  // shape (labels === null); the parts-shape case is already caught by strict_script_parts above,
  // and gets fixed by downgrading BEFORE this check would ever see the resulting text (final
  // disposition is a one-shot transform, not re-validated — see applyFinalDisposition).
  if (ctx.askMode === 'strict_script' && labels === null && typeof answer.text === 'string') {
    const request = parseScriptRequest(ctx.latestUserText);
    if (request) {
      const lines = splitNonEmptyLines(answer.text);
      if (lines.length !== request.count) violations.push({ type: 'script_contract', detail: 'count' });
      if (hasScriptFormatMarker(lines)) violations.push({ type: 'script_contract', detail: 'format' });

      // Axis A (BRIEF-100B-FIX3 §1.1) — per-line SENTENCE count, independent of the line-COUNT
      // check above (parseScriptRequest recovers {count, unit} but only `count` was ever enforced —
      // "문장 2개" could pass with 2 lines of 2 sentences each = 4 sentences total). One violation
      // total even if multiple lines break it (never accumulated per line).
      const unitViolated = request.unit === 'sentence'
        ? lines.some(l => splitSentences(l).length !== 1)
        : lines.some(l => splitSentences(l).length > 2);
      if (unitViolated) violations.push({ type: 'script_contract', detail: 'unit' });
    }
    if (typeof answer.followUp === 'string' && answer.followUp) {
      violations.push({ type: 'script_contract', detail: 'followup' });
    }
  }

  // Axis C (BRIEF-100B-FIX3 §1.3) — completion contract (no explicit count; see COMPLETION_BLOCK).
  if (ctx.askMode === 'completion') {
    if (labels !== null) {
      violations.push({ type: 'completion_parts' });
    }
    if (typeof answer.text === 'string') {
      const lines = splitNonEmptyLines(answer.text);
      if (hasScriptFormatMarker(lines)) violations.push({ type: 'completion_contract', detail: 'format' });
    }
    if (typeof answer.followUp === 'string' && answer.followUp) {
      violations.push({ type: 'completion_contract', detail: 'followup' });
    }
  }

  // F5 hidden-truth framing (BRIEF-100B-FIX §1) — checked across the whole answer regardless of
  // mode/askMode, since the rule applies to "답변 본문 · followUp · 추천 칩 전부".
  if (collectAnswerText(answer).some(t => findHiddenTruthFraming(t))) {
    violations.push({ type: 'hidden_truth_framing' });
  }

  // BRIEF-105 §2.2 — date–pillar factual check. Only runs when the caller supplied the lookup
  // (ctx.dailyPillarLookup is optional precisely so every pre-existing ctx literal stays valid).
  if (ctx.dailyPillarLookup) {
    for (const t of collectAnswerTextWithTiming(answer)) {
      for (const sentence of splitSentences(t)) {
        violations.push(...checkDatePillarSentence(sentence, ctx.dailyPillarLookup, ctx.todayDate));
      }
    }
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

/** followUp removal — safe and unconditional, never fabricates content (BRIEF-100B-FIX §1 F2/F3). */
function stripFollowUp(answer: Record<string, unknown>): Record<string, unknown> {
  const { followUp: _f, ...rest } = answer;
  void _f;
  return rest;
}

/** Trims EXCESS lines down to the requested count — safe (only removes, never invents). Too FEW
 * lines can't be safely fixed (no content to fabricate), so the caller leaves that case as a soft
 * flag instead of calling this (BRIEF-100B-FIX §1 F2). */
function truncateScriptLines(answer: Record<string, unknown>, count: number): Record<string, unknown> {
  if (typeof answer.text !== 'string') return answer;
  const lines = splitNonEmptyLines(answer.text);
  if (lines.length <= count) return answer;
  return { ...answer, text: lines.slice(0, count).join('\n') };
}

/** Removes ONE claimed-wrong day-name mention from `text`, ONLY when it appears as a bracket or
 * inserted-clause — the exact 3 shapes BRIEF-105 §2.2.6 names: "(<token> 날)", "(<token> day)", and
 * "— '<token>' 날". Never touches a bare in-sentence mention (e.g. "<token>이라 그래요") — cutting
 * that would mutilate the sentence, which the brief explicitly forbids ("문장을 자르는 자동 보정은
 * 괄호·삽입구 형태에만"). */
function stripDayNameParenthetical(text: string, claimedToken: string): { text: string; changed: boolean } {
  const escaped = claimedToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`\\s*\\(${escaped}\\s*날\\)`, 'g'),
    new RegExp(`\\s*\\(${escaped}\\s*day\\)`, 'gi'),
    new RegExp(`\\s*[—-]\\s*'${escaped}'\\s*날`, 'g'),
  ];
  let out = text;
  let changed = false;
  for (const re of patterns) {
    if (re.test(out)) {
      out = out.replace(re, '');
      changed = true;
    }
  }
  return { text: out, changed };
}

/** Applies `stripDayNameParenthetical` for every `date_pillar_mismatch` violation's claimed token,
 * across every user-visible field (BRIEF-105 §2.2.6). Non-bracket mentions are left untouched —
 * `changed` reports whether ANY field was actually edited, so the caller can flag `soft` instead. */
function removeParentheticalDayNames(
  answer: Record<string, unknown>,
  violations: AskViolation[],
): { answer: Record<string, unknown>; changed: boolean } {
  const claimedTokens = violations
    .map(v => (v.detail ?? '').split('|')[1])
    .filter((t): t is string => Boolean(t));
  if (claimedTokens.length === 0) return { answer, changed: false };

  let changed = false;
  const stripAll = (s: string): string => {
    let out = s;
    for (const token of claimedTokens) {
      const r = stripDayNameParenthetical(out, token);
      out = r.text;
      if (r.changed) changed = true;
    }
    return out.replace(/[ \t]{2,}/g, ' ').trim();
  };

  const out: Record<string, unknown> = { ...answer };
  if (typeof out.text === 'string') out.text = stripAll(out.text);
  if (Array.isArray(out.parts)) {
    out.parts = (out.parts as Array<{ label: string; text: string }>).map(p => ({ ...p, text: stripAll(p.text) }));
  }
  if (typeof out.timing === 'string') out.timing = stripAll(out.timing);
  if (typeof out.followUp === 'string') out.followUp = stripAll(out.followUp);

  return { answer: out, changed };
}

/** Final, deterministic disposition for whatever violations remain after the (at most one)
 * correction attempt — never returns null; only call/parse/schema/banned can hard-fail, and
 * those are handled before this is ever called (BRIEF-100B §1's disposition table). `ctx` is
 * needed only to re-derive the requested script count for the excess-line trim (BRIEF-100B-FIX). */
export function applyFinalDisposition(
  answer: Record<string, unknown>,
  violations: AskViolation[],
  ctx: AskValidationCtx,
): { answer: Record<string, unknown>; flags: Array<{ stage: string; action: string }> } {
  let out = answer;
  const flags: Array<{ stage: string; action: string }> = [];
  const hasType = (t: AskViolationType) => violations.some(v => v.type === t);

  if (hasType('strict_script_parts')) {
    out = downgradeToText(out);
    flags.push({ stage: 'script', action: 'downgrade' });
  } else if (hasType('completion_parts')) {
    out = downgradeToText(out);
    flags.push({ stage: 'completion', action: 'downgrade' });
  } else if (hasType('label_set')) {
    out = normalizeLabels(out);
    flags.push({ stage: 'labels', action: 'normalize' });
  }

  const scriptViolations = violations.filter(v => v.type === 'script_contract');
  if (scriptViolations.some(v => v.detail === 'followup')) {
    out = stripFollowUp(out);
    flags.push({ stage: 'script', action: 'strip_followup' });
  }
  if (scriptViolations.some(v => v.detail === 'count')) {
    const request = parseScriptRequest(ctx.latestUserText);
    const lineCount = typeof out.text === 'string' ? splitNonEmptyLines(out.text).length : -1;
    if (request && lineCount > request.count) {
      out = truncateScriptLines(out, request.count);
      flags.push({ stage: 'script', action: 'truncate' });
    } else {
      // Too few lines to fabricate the rest, or the count couldn't be re-derived — leave as-is.
      flags.push({ stage: 'script', action: 'soft' });
    }
  }
  if (scriptViolations.some(v => v.detail === 'format')) {
    // No safe auto-strip that can't risk mangling real content — soft flag only.
    flags.push({ stage: 'script', action: 'soft' });
  }
  // Axis A (BRIEF-100B-FIX3 §1.1) — no safe auto-fix: trimming a sentence would delete part of what
  // the user is about to send. Soft flag only; body is left completely unchanged.
  if (scriptViolations.some(v => v.detail === 'unit')) {
    flags.push({ stage: 'script', action: 'soft' });
  }

  const completionViolations = violations.filter(v => v.type === 'completion_contract');
  if (completionViolations.some(v => v.detail === 'followup')) {
    out = stripFollowUp(out);
    flags.push({ stage: 'completion', action: 'strip_followup' });
  }
  if (completionViolations.some(v => v.detail === 'format')) {
    flags.push({ stage: 'completion', action: 'soft' });
  }

  if (hasType('reintroduction')) flags.push({ stage: 'reintro', action: 'soft' });
  if (hasType('verdict_opening')) flags.push({ stage: 'verdict', action: 'soft' });
  if (hasType('hidden_truth_framing')) flags.push({ stage: 'framing', action: 'soft' });

  // BRIEF-105 §2.2.6 — bracket/inserted-clause day-name removal, then MANDATORY re-verification
  // that the mismatch is actually gone (never trust the strip blindly).
  if (hasType('date_pillar_mismatch')) {
    const dpViolations = violations.filter(v => v.type === 'date_pillar_mismatch');
    const stripped = removeParentheticalDayNames(out, dpViolations);
    out = stripped.answer;
    if (!stripped.changed) {
      flags.push({ stage: 'datepillar', action: 'soft' });
    } else {
      flags.push({ stage: 'datepillar', action: 'strip_dayname' });
      if (ctx.dailyPillarLookup) {
        const stillMismatched = collectAnswerTextWithTiming(out)
          .flatMap(t => splitSentences(t))
          .flatMap(s => checkDatePillarSentence(s, ctx.dailyPillarLookup!, ctx.todayDate));
        if (stillMismatched.length > 0) flags.push({ stage: 'datepillar', action: 'soft' });
      }
    }
  }

  return { answer: out, flags };
}

function stageOf(type: AskViolationType): string {
  switch (type) {
    case 'label_set':
    case 'label_order':
      return 'labels';
    case 'strict_script_parts':
    case 'script_contract':
      return 'script';
    case 'completion_parts':
    case 'completion_contract':
      return 'completion';
    case 'reintroduction':
      return 'reintro';
    case 'verdict_opening':
      return 'verdict';
    case 'hidden_truth_framing':
      return 'framing';
    case 'date_pillar_mismatch':
      return 'datepillar';
  }
}

export function buildCorrectionWarnings(schemaInvalid: boolean, banned: string[], violations: AskViolation[]): string[] {
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
        break; // fixed in place, never reaches here
      case 'date_pillar_mismatch': {
        const [date, claimed, correct] = (v.detail ?? '').split('|');
        warnings.push(`⚠ DATE–PILLAR MISMATCH — You wrote "${claimed}" for ${date}, but ${date} is "${correct}". Use the DAILY PILLARS table verbatim or omit the day name. Regenerate.`);
        break;
      }
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

// ── BRIEF-100B-FIX6 §1/§2.2 — the 10-state table's decisive classification, all in one pass. ────
interface ParseOk { ok: true; value: unknown; repaired: boolean }
export type ParseFailShape = 'object_invalid' | 'plain' | 'fence_plain';
export type ParseFailFirstChar = ReturnType<typeof classifyFirstChar>;
export interface ParseFail {
  ok: false;
  errName: string;
  shape: ParseFailShape;
  firstChar: ParseFailFirstChar;
  brace: boolean;
  fence: boolean;
  repair: 'none' | 'failed';
}
type ParseResult = ParseOk | ParseFail;

/**
 * ① `extractJson(raw)` (unchanged, handles D1/D2/D3 exactly as before).
 * ② On failure, `repairControlCharsInStrings` once, then `extractJson` again (D4 — succeeds here
 *    only when the raw had a literal control char inside a JSON string and nothing else wrong).
 * ③ Still failing: classify D5/D6/D7 by brace/fence presence (never regex-guesses content) so the
 *    caller can decide whether the §2.3 plain-text fallback even applies. No extra LLM call here —
 *    this whole function is a pure string transform (BRIEF-100B-FIX6 §2.2/§4 "추가 호출 신설 금지").
 */
export function tryParse(raw: string): ParseResult {
  let lastErrName = 'Error';
  try {
    return { ok: true, value: extractJson(raw), repaired: false };
  } catch (err) {
    lastErrName = err instanceof Error ? err.name : 'Error';
  }

  const repaired = repairControlCharsInStrings(raw);
  const repairChanged = repaired !== raw;
  if (repairChanged) {
    try {
      return { ok: true, value: extractJson(repaired), repaired: true };
    } catch (err) {
      lastErrName = err instanceof Error ? err.name : 'Error';
    }
  }

  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = fence ? fence[1].trim() : raw.trim();
  const brace = candidate.includes('{');
  const hasFence = fence !== null;
  const shape: ParseFailShape = brace ? 'object_invalid' : (hasFence ? 'fence_plain' : 'plain');

  return {
    ok: false,
    errName: lastErrName,
    shape,
    firstChar: classifyFirstChar(raw),
    brace,
    fence: hasFence,
    repair: repairChanged ? 'failed' : 'none',
  };
}

// ── BRIEF-100B-FIX6 §2.3 — plain-text fallback: narrow, no special treatment. ────────────────────
/**
 * D6/D7 only, and only for the two modes whose contract is already a bare {"text": ...} turn.
 * `T` is fence-stripped/trimmed from the ORIGINAL raw (never the repaired string — see
 * `stripFenceAndTrim`'s doc comment). The candidate is rejected (returns null) unless it clears
 * every check in the brief's "기존 검사 대응표" — the exact same checks a normal answer must pass,
 * no relaxed treatment. Rejection means "do exactly what would have happened without this BRIEF."
 */
export function tryPlainTextFallback(
  parseFail: ParseFail,
  raw: string,
  mode: 'me' | 'person' | 'general',
  ctx: AskValidationCtx,
): Record<string, unknown> | null {
  if (parseFail.shape !== 'plain' && parseFail.shape !== 'fence_plain') return null;
  if (ctx.askMode !== 'strict_script' && ctx.askMode !== 'completion') return null;

  const text = stripFenceAndTrim(raw);
  if (!text) return null;

  const candidate = normalizeAnswer(mode, { text });
  if (!candidate) return null;
  if (findBanned(JSON.stringify(candidate)).length > 0) return null;
  if (validateAskAnswer(candidate, ctx).length > 0) return null;

  return candidate;
}

/** [ask] rid=<rid> stage=<...> action=<...> status=<숫자|-> timeout=<y|n> [rawLen=<n>] [err=<name>]
 * Never logs raw response/conversation content — only lengths and error names (BRIEF-100B §2,
 * fixing the prior privacy defect where response bodies were logged via rawAnswer.slice(0,300)). */
function logAsk(
  rid: string,
  stage: string,
  action: string,
  opts: {
    status?: number; timeout?: boolean; rawLen?: number; errName?: string;
    // BRIEF-100B-FIX6 §2.5 — parse-diagnostic fields, never raw content/PII.
    shape?: string; firstChar?: string; brace?: boolean; fence?: boolean;
    repair?: string; fallback?: string;
  } = {},
): void {
  const status = opts.status !== undefined ? String(opts.status) : '-';
  const timeout = opts.timeout ? 'y' : 'n';
  let line = `[ask] rid=${rid} stage=${stage} action=${action} status=${status} timeout=${timeout}`;
  if (opts.rawLen !== undefined) line += ` rawLen=${opts.rawLen}`;
  if (opts.errName) line += ` err=${opts.errName}`;
  if (opts.shape) line += ` shape=${opts.shape}`;
  if (opts.firstChar) line += ` firstChar=${opts.firstChar}`;
  if (opts.brace !== undefined) line += ` brace=${opts.brace ? 'y' : 'n'}`;
  if (opts.fence !== undefined) line += ` fence=${opts.fence ? 'y' : 'n'}`;
  if (opts.repair) line += ` repair=${opts.repair}`;
  if (opts.fallback) line += ` fallback=${opts.fallback}`;
  console.error(line);
}

function errorResponse(code: 'call' | 'parse' | 'schema' | 'banned', status: number) {
  return Response.json({ error: "Attune couldn't finish that thought — ask again.", code }, { status });
}

/**
 * BRIEF-100B-FIX6 — one parse failure's full handling, used at all 3 `tryParse` failure sites.
 * Tries the §2.3 fallback first; on success returns a ready 200 Response (no more calls needed —
 * this is what keeps §3 ⑭d's "fallback 채택 시 총 1회" true). On rejection/non-applicability, logs
 * the enriched [ask] line (same `action` the call site would have logged anyway — 'retry' or
 * 'fail') and returns null so the caller proceeds with its EXISTING retry/502 logic unchanged.
 */
function handleParseFailure(
  rid: string,
  action: 'retry' | 'fail',
  parseFail: ParseFail,
  raw: string,
  mode: 'me' | 'person' | 'general',
  ctx: AskValidationCtx,
): Response | null {
  const fb = tryPlainTextFallback(parseFail, raw, mode, ctx);
  if (fb) {
    logAsk(rid, 'parse', 'fallback_used', {
      rawLen: raw.length, shape: parseFail.shape, firstChar: parseFail.firstChar,
      brace: parseFail.brace, fence: parseFail.fence, repair: parseFail.repair, fallback: 'used',
    });
    return Response.json({ answer: fb });
  }
  const eligibleForFallback =
    (parseFail.shape === 'plain' || parseFail.shape === 'fence_plain') &&
    (ctx.askMode === 'strict_script' || ctx.askMode === 'completion');
  logAsk(rid, 'parse', action, {
    rawLen: raw.length, errName: parseFail.errName, shape: parseFail.shape, firstChar: parseFail.firstChar,
    brace: parseFail.brace, fence: parseFail.fence, repair: parseFail.repair,
    fallback: eligibleForFallback ? 'rejected' : 'none',
  });
  return null;
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
  const ctx: AskValidationCtx = {
    askMode, personIntroduced, candidates, latestUserText: question,
    dailyPillarLookup: buildDailyPillarLookup(dailyPillars),
    todayDate: today,
  };

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
      const resp = handleParseFailure(rid, 'fail', parseRes, raw, mode, ctx);
      if (resp) return resp;
      return errorResponse('parse', 502);
    }
    const respEarly = handleParseFailure(rid, 'retry', parseRes, raw, mode, ctx);
    if (respEarly) return respEarly;
    usedExtraCall = true;
    const retryCall = await callModel(system, turns, RETRY_CALL_TIMEOUT);
    if (!retryCall.ok) {
      logAsk(rid, 'call', 'fail', retryCall);
      return errorResponse('call', 502);
    }
    raw = retryCall.raw;
    parseRes = tryParse(raw);
    if (!parseRes.ok) {
      const resp2 = handleParseFailure(rid, 'fail', parseRes, raw, mode, ctx);
      if (resp2) return resp2;
      return errorResponse('parse', 502);
    }
  }
  if (parseRes.ok && parseRes.repaired) {
    logAsk(rid, 'parse', 'repaired', { rawLen: raw.length, shape: 'object_repaired', repair: 'ctrl_fixed' });
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
      const disposition = applyFinalDisposition(answer, violations, ctx);
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
      const resp3 = handleParseFailure(rid, 'fail', parseRes, raw, mode, ctx);
      if (resp3) return resp3;
      return errorResponse('parse', 502);
    }
    if (parseRes.repaired) {
      logAsk(rid, 'parse', 'repaired', { rawLen: raw.length, shape: 'object_repaired', repair: 'ctrl_fixed' });
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
      const disposition = applyFinalDisposition(answer, violations, ctx);
      for (const f of disposition.flags) logAsk(rid, f.stage, f.action, {});
      return Response.json({ answer: disposition.answer });
    }
  }

  return Response.json({ answer });
}
