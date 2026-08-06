import { z } from 'zod';
import { calculateSaju, getDailyPillars, pillarLabel, friendlyPillarName, STEM_NAMES } from '@/lib/saju';
import type { SajuChart, DailyPillar, Pillar, Element } from '@/lib/saju';
import { getArchetype, getElementRelationship, localeVoiceBlock, ARCHETYPE_LOCALE } from '@/lib/interpretGuide';
import { formatChart } from '@/lib/briefing';
import { createLlmProvider, type ChatTurn } from '@/lib/llm';
import { checkRateLimit } from '@/lib/rateLimit';
import { detectSafetyTrigger } from '@/lib/safety';

export const maxDuration = 60;

const LLM_TIMEOUT = 55_000;
const RATE_LIMIT  = 30;
const RATE_WINDOW = 60 * 60 * 1000;

const BANNED = ['weakness', 'exploit', 'leverage against', 'manipulate', 'vulnerable to', '약점', '조종', '공략', '사주상 충동적인', 'impulsive day in your chart'];

// SAFETY (BRIEF-096 §3 — verbatim, byte-for-byte):
const SAFETY_RULES = `SAFETY: You are not a crisis service. If the user mentions self-harm, suicide, or harming anyone, do not give relationship advice in that reply — acknowledge briefly; the app routes to human support. Never explain distress or danger through saju, elements, charts, or compatibility. Never tell someone to immediately break up; offer options, not verdicts.`;

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
      chartBlock += `

${formatChart(themChart, `THEM${themName ? ` — ${themName}` : ''}`)}

THEM ARCHETYPE: ${themArch.name}${themArchKo ? ` (KO: ${themArchKo})` : ''}
  Drive: ${themArch.coreDrive}
  Communication: ${themArch.communication}
  Under stress: ${themArch.stress}

ELEMENT AXIS (ME → THEM): ${elemAxis}`;
      if (themChart.pillarsKnown === 6) {
        chartBlock += `
Note: their birth time is unknown — 6 of 8 pillars available. Avoid overconfident assertions.`;
      }

      if (briefing) {
        const dyn = briefing.dynamic as Record<string, unknown> | undefined;
        if (dyn) {
          const click = (dyn.click as { takeaway?: string } | undefined)?.takeaway ?? '';
          const clash = (dyn.clash as { takeaway?: string } | undefined)?.takeaway ?? '';
          chartBlock += `\n\nBRIEFING SUMMARY (pre-computed context)
  Resonance: ${String(dyn.resonance ?? '')}
  Click: ${click}
  Clash: ${clash}`;
        }
      }

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
- If the user is deciding whether to DO something (should I…, is it a good idea…): LIKELY RECEPTION / WHAT COULD BACKFIRE / HOW TO IMPROVE YOUR ODDS.
- If the user is trying to UNDERSTAND (why is…, what's going on…, how does he feel…): WHAT'S LIKELY GOING ON / WHY THIS MAY HAVE HAPPENED / WHAT YOU CAN DO.

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

${localeVoiceBlock()}

FOLLOW-UP RULE: at most ONE followUp per answer. Never re-ask what the user already told you. Never stack questions. In Korean, no 당신 — e.g. "해보고 어땠는지 알려줘요" / "혹시 지현이 먼저 연락한 적도 있어요?". Skip it entirely on heavy or emotional moments where a question would feel pushy.

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

  const system = buildAskSystem(
    mode, meChart, themChart,
    briefing as Record<string, unknown> | undefined,
    dailyPillars,
    parsed.data.me.name, themInput?.name,
    mode === 'person' ? parsed.data.memory : undefined,
    todayIntroduced,
    personIntroduced,
  );
  const turns = buildAskTurns(history, question, today);

  const llm = createLlmProvider();

  // First attempt
  let rawAnswer: string;
  try {
    rawAnswer = await withTimeout(llm.generateJsonChat(system, turns, { maxTokens: 4096, thinkingBudget: 1024, temperature: 0.7 }), LLM_TIMEOUT);
  } catch (err) {
    console.error('[ask] LLM call failed:', err instanceof Error ? err.message : err);
    return Response.json({ error: "Attune couldn't finish that thought — ask again." }, { status: 502 });
  }

  let rawParsed: unknown;
  try { rawParsed = extractJson(rawAnswer); }
  catch {
    console.error('[ask] LLM response not parseable:', rawAnswer.slice(0, 300));
    return Response.json({ error: "Attune couldn't finish that thought — ask again." }, { status: 502 });
  }

  let answer = normalizeAnswer(mode, rawParsed);
  const violations = answer ? findBanned(JSON.stringify(answer)) : [];

  // If schema invalid or banned phrases → one retry with combined warnings
  if (!answer || violations.length > 0) {
    const warnings: string[] = [];
    if (!answer) warnings.push('⚠ SCHEMA VIOLATION — Response did not match required JSON shape. Return exactly the specified schema.');
    if (violations.length > 0) warnings.push(`⚠ BANNED PHRASES — Found: ${violations.map(v => `"${v}"`).join(', ')}. Regenerate without these phrases.`);

    const retryTurns: ChatTurn[] = [
      ...turns,
      { role: 'model', text: rawAnswer },
      { role: 'user', text: warnings.join('\n\n') },
    ];

    let retryRaw: string;
    try {
      retryRaw = await withTimeout(llm.generateJsonChat(system, retryTurns, { maxTokens: 4096, thinkingBudget: 1024, temperature: 0.7 }), LLM_TIMEOUT);
    } catch (err) {
      console.error('[ask] Retry LLM call failed:', err instanceof Error ? err.message : err);
      return Response.json({ error: "Attune couldn't finish that thought — ask again." }, { status: 502 });
    }

    let retryParsed: unknown;
    try { retryParsed = extractJson(retryRaw); }
    catch {
      console.error('[ask] Retry LLM response not parseable:', retryRaw.slice(0, 300));
      return Response.json({ error: "Attune couldn't finish that thought — ask again." }, { status: 502 });
    }

    answer = normalizeAnswer(mode, retryParsed);
    if (!answer) {
      console.error('[ask] Retry still schema-invalid');
      return Response.json({ error: "Attune couldn't finish that thought — ask again." }, { status: 502 });
    }

    const retryViolations = findBanned(JSON.stringify(answer));
    if (retryViolations.length > 0) {
      console.error('[ask] Banned phrases after retry:', retryViolations);
      return Response.json({ error: "Attune couldn't finish that thought — ask again." }, { status: 502 });
    }
  }

  return Response.json({ answer });
}
