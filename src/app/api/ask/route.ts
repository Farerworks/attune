import { z } from 'zod';
import { calculateSaju, getDailyPillars } from '@/lib/saju';
import type { SajuChart, DailyPillar } from '@/lib/saju';
import { getArchetype, getElementRelationship, localeVoiceBlock } from '@/lib/interpretGuide';
import { formatChart } from '@/lib/briefing';
import { createLlmProvider, type ChatTurn } from '@/lib/llm';
import { checkRateLimit } from '@/lib/rateLimit';

export const maxDuration = 60;

const LLM_TIMEOUT = 55_000;
const RATE_LIMIT  = 10;
const RATE_WINDOW = 60 * 60 * 1000;

const BANNED = ['weakness', 'exploit', 'leverage against', 'manipulate', 'vulnerable to', '약점', '조종', '공략'];

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

// ── Prompt builder ─────────────────────────────────────────────────────────────

function buildAskSystem(
  mode: 'me' | 'person' | 'general',
  meChart: SajuChart,
  themChart: SajuChart | null,
  briefing: Record<string, unknown> | undefined,
  dailyPillars: DailyPillar[],
  meName?: string,
  themName?: string,
  memory?: string[],
): string {
  // Chart context
  let chartBlock = '';
  if (mode !== 'general') {
    const myArch = getArchetype(meChart.dayMaster.stem);
    chartBlock = `${formatChart(meChart, `ME${meName ? ` — ${meName}` : ''}`)}

ME ARCHETYPE: ${myArch.name}
  Drive: ${myArch.coreDrive}
  Communication: ${myArch.communication}
  Under stress: ${myArch.stress}`;

    if (mode === 'person' && themChart) {
      const themArch  = getArchetype(themChart.dayMaster.stem);
      const elemAxis  = getElementRelationship(meChart.dayMaster.stem, themChart.dayMaster.stem);
      chartBlock += `

${formatChart(themChart, `THEM${themName ? ` — ${themName}` : ''}`)}

THEM ARCHETYPE: ${themArch.name}
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

  // Output schema per mode
  const outputSpec = mode === 'person'
    ? `Choose the 3 part labels to fit the question (labels in English, UPPERCASE):
- If the user is deciding whether to DO something (should I…, is it a good idea…): LIKELY RECEPTION / WHAT COULD BACKFIRE / HOW TO IMPROVE YOUR ODDS.
- If the user is trying to UNDERSTAND (why is…, what's going on…, how does he feel…): WHAT'S LIKELY GOING ON / WHY (FROM THE CHART) / WHAT YOU CAN DO.

Respond ONLY with valid JSON (no markdown fences, no extra keys). Choose ONE shape:
1) If the latest message is a NEW substantive question (a decision to make, a situation to read, a timing ask):
{
  "parts": [
    { "label": "<chosen label>", "text": "2–3 sentences, specific and actionable. HARD LIMIT: max 3 sentences, max 55 words." },
    { "label": "<chosen label>", "text": "2–3 sentences. HARD LIMIT: max 3 sentences, max 55 words." },
    { "label": "<chosen label>", "text": "2–3 sentences. HARD LIMIT: max 3 sentences, max 55 words." }
  ],
  "timing": "ONLY if the question is about timing. MUST be a single plain-text string — NEVER an object or array. Name 2–3 favorable dates (YYYY-MM-DD, day-of-week, reason) and 1–2 to avoid. Omit this key entirely if not a timing question.",
  "followUp": "OPTIONAL. One short line (12 words max): either a gentle check-back inviting the user to report how it went, or ONE question that would sharpen your next answer. Same language as the answer. Omit this key entirely when it would feel forced.",
  "memory": ["OPTIONAL array of 0–2 short strings — NEW facts learned in THIS exchange worth remembering about the other person or the situation (events, dates, decisions, circumstances). Facts the user stated only — never feelings you inferred, never your own advice, never anything already in RELATIONSHIP NOTES. Same language as the conversation. Omit the key when nothing new."]
}
2) If the latest message is a follow-up, clarification, or short reaction to your previous answer:
{ "text": "Under 100 words. Conversational and direct, same coaching voice. Answer the follow-up specifically — do not restate your previous answer.", "followUp": "OPTIONAL. Same rule as above.", "memory": ["OPTIONAL. Same rule as above."] }`
    : `Respond ONLY with valid JSON (no markdown fences, no extra keys):
{ "text": "Under 120 words. Warm, practical coach tone. Describe tendencies, not predictions.", "followUp": "OPTIONAL. One short line (12 words max): either a gentle check-back inviting the user to report how it went, or ONE question that would sharpen your next answer. Same language as the answer. Omit this key entirely when it would feel forced." }`;

  const persona = mode === 'person'
    ? 'You are Attune, a Four Pillars relationship coach. Your job is to help the user understand the other person and navigate this specific relationship. Read the other person\'s likely feelings, motives, and reactions from their saju chart and the conversation so far, then give the user specific, practical guidance. Always frame your read as understanding and connection — never as a way to control, pressure, or outmaneuver them.'
    : mode === 'me'
    ? 'You are Attune, a Four Pillars self-awareness coach. Help the user understand their own behavioral tendencies through their saju chart. Warm, grounded, concise.'
    : 'You are Attune, a thoughtful life coach who uses Four Pillars of Destiny as one lens. Answer practically and concisely.';

  const PERSON_RULES = `RULES (non-negotiable):
1. Use hedged language — "likely", "tends to", "may", "~할 가능성이 있어요". Never state a reaction as certainty; never "will".
2. No yes/no verdicts. No numerical probabilities or scores.
3. You MAY describe the other person's likely feelings, motives, and reactions — that is the point. Ground every read in their chart or the conversation, and keep it hedged.
4. Forbidden words: weakness, exploit, leverage against, manipulate, vulnerable to. Never frame guidance as controlling or pressuring the other person.
5. Help the user understand the other person AND adjust their own approach. Offer moves the user can make; never tactics to manipulate or corner the other person.
6. No medical, legal, or financial advice.
7. This is an ongoing conversation. Build on earlier turns instead of repeating them, and address what the user just asked.
8. Answer the user's actual question directly and first. Do NOT recite archetype names or chart labels back to the reader; use the chart only as your private reasoning.
9. Refer to the other person by their name when given. LANGUAGE: detect the question's language and write all free text in it, never mixing. In English, address the user as "you" and tie your read of the other person to what the user can do. In Korean, follow the KOREAN VOICE block below (omit 당신; use the other person's name). JSON keys and part labels stay in English.
10. Each part must contain one concrete, specific scene tied to THIS relationship — not a generic personality statement. Text over 3 sentences / 55 words is cut.`;

  const SELF_RULES = `RULES (non-negotiable):
1. Use hedged language — "tends to", "may", "~하는 편이에요". Never certainty; never "will".
2. No yes/no verdicts. No numerical probabilities or scores.
3. Forbidden words: weakness, exploit, leverage against, manipulate, vulnerable to.
4. No medical, legal, or financial advice.
5. This is an ongoing conversation. Build on earlier turns; don't repeat earlier answers.
6. Answer the actual question directly. Do NOT recite archetype names or chart labels back; use them only as private reasoning.
7. LANGUAGE: detect the question's language, write all free text in it (no mixing). In English address the user as "you". In Korean follow the KOREAN VOICE block below (no 당신). JSON keys stay in English.`;

  return `${persona}

${chartBlock ? `SAJU CONTEXT:\n${chartBlock}\n\nRead the WHOLE chart — all pillars and the element balance — not just the day master. Weave at most one or two specific chart details into an answer when they genuinely matter; never recite or dump the chart.\n\n` : ''}DAILY PILLARS — NEXT 14 DAYS (server-computed, do not modify):
${pillarsText}
Use the daily pillars ONLY when the question is about timing or when to take action.

${mode === 'person' ? PERSON_RULES : SELF_RULES}

${localeVoiceBlock()}

FOLLOW-UP RULE: at most ONE followUp per answer. Never re-ask what the user already told you. Never stack questions. In Korean, no 당신 — e.g. "해보고 어땠는지 알려줘요" / "혹시 지현이 먼저 연락한 적도 있어요?". Skip it entirely on heavy or emotional moments where a question would feel pushy.

${outputSpec}`;
}

// ── Chat turns ──────────────────────────────────────────────────────────────────

function buildAskTurns(
  history: Array<{ role: 'user' | 'assistant'; text: string }>,
  question: string,
): ChatTurn[] {
  const turns: ChatTurn[] = history.map(h => ({ role: h.role === 'user' ? 'user' as const : 'model' as const, text: h.text }));
  if (turns.length > 0 && turns[0].role === 'model') turns.shift(); // Gemini는 user로 시작
  turns.push({ role: 'user', text: question });
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
  })).max(10),
  question: z.string().min(1).max(500),
  todayLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  memory: z.array(z.string().max(200)).max(10).optional(),
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

  // Saju calculations (server-side only, never LLM)
  const meChart   = calculateSaju(meInput);
  const themChart = themInput ? calculateSaju(themInput) : null;

  // Daily pillars — client-local today when provided (avoids UTC date drift), else server's today
  const today = parsed.data.todayLocal ?? new Date().toISOString().split('T')[0];
  const dailyPillars = getDailyPillars(today, 14);

  const system = buildAskSystem(
    mode, meChart, themChart,
    briefing as Record<string, unknown> | undefined,
    dailyPillars,
    parsed.data.me.name, themInput?.name,
    mode === 'person' ? parsed.data.memory : undefined,
  );
  const turns = buildAskTurns(history, question);

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
