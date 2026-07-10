import { z } from 'zod';
import { calculateSaju, getDailyPillars } from '@/lib/saju';
import type { SajuChart, DailyPillar } from '@/lib/saju';
import { getArchetype, getElementRelationship } from '@/lib/interpretGuide';
import { createLlmProvider } from '@/lib/llm';
import { checkRateLimit } from '@/lib/rateLimit';

export const maxDuration = 60;

const LLM_TIMEOUT = 55_000;
const RATE_LIMIT  = 10;
const RATE_WINDOW = 60 * 60 * 1000;

const BANNED = ['weakness', 'exploit', 'leverage against', 'manipulate'];

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

function buildAskPrompt(
  mode: 'me' | 'person' | 'general',
  meChart: SajuChart,
  themChart: SajuChart | null,
  briefing: Record<string, unknown> | undefined,
  dailyPillars: DailyPillar[],
  history: Array<{ role: 'user' | 'assistant'; text: string }>,
  question: string,
): string {
  // Chart context
  let chartBlock = '';
  if (mode !== 'general') {
    const myArch = getArchetype(meChart.dayMaster.stem);
    chartBlock = `ME — ${meChart.dayMaster.stem} (${myArch.hanja}), ${meChart.dayMaster.element} ${meChart.dayMaster.polarity}
  Drive: ${myArch.coreDrive}
  Communication: ${myArch.communication}
  Under stress: ${myArch.stress}`;

    if (mode === 'person' && themChart) {
      const themArch  = getArchetype(themChart.dayMaster.stem);
      const elemAxis  = getElementRelationship(meChart.dayMaster.stem, themChart.dayMaster.stem);
      chartBlock += `\n\nTHEM — ${themChart.dayMaster.stem} (${themArch.hanja}), ${themChart.dayMaster.element} ${themChart.dayMaster.polarity}
  Drive: ${themArch.coreDrive}
  Communication: ${themArch.communication}
  Under stress: ${themArch.stress}

ELEMENT AXIS (ME → THEM): ${elemAxis}`;

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
    }
  }

  // Daily pillars
  const pillarsText = dailyPillars.map(p => {
    const dt  = new Date(p.date + 'T12:00:00');
    const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getDay()];
    return `${p.date} (${dow}): ${p.stem} / ${p.branch} — ${p.element}`;
  }).join('\n');

  // History
  const historyText = history.length > 0
    ? `CONVERSATION HISTORY (use as context):\n${history.map(h => `${h.role === 'user' ? 'USER' : 'ATTUNE'}: ${h.text}`).join('\n')}\n\n`
    : '';

  // Output schema per mode
  const outputSpec = mode === 'person'
    ? `{
  "parts": [
    { "label": "LIKELY RECEPTION", "text": "2–3 sentences, specific and actionable" },
    { "label": "WHAT COULD BACKFIRE", "text": "2–3 sentences" },
    { "label": "HOW TO IMPROVE YOUR ODDS", "text": "2–3 sentences" }
  ],
  "timing": "Include ONLY if the question is about timing or when to act. Name 2–3 favorable dates (YYYY-MM-DD, day-of-week, stem/branch reason) and 1–2 dates to avoid. Omit the key entirely if not a timing question."
}`
    : `{ "text": "Under 120 words. Warm, practical coach tone. Describe tendencies, not predictions." }`;

  const persona = mode === 'person'
    ? 'You are Attune, a Four Pillars relationship coach. Give specific, practical guidance to help the user adapt their OWN behavior. Never judge or assess the other person.'
    : mode === 'me'
    ? 'You are Attune, a Four Pillars self-awareness coach. Help the user understand their own behavioral tendencies through their saju chart. Warm, grounded, concise.'
    : 'You are Attune, a thoughtful life coach who uses Four Pillars of Destiny as one lens. Answer practically and concisely.';

  return `${persona}

${chartBlock ? `SAJU CONTEXT:\n${chartBlock}\n\n` : ''}DAILY PILLARS — NEXT 14 DAYS (server-computed, do not modify):
${pillarsText}
Use the daily pillars ONLY when the question is about timing or when to take action.

${historyText}RULES (non-negotiable):
1. Use "tends to" / "is likely to" / "may" — never "will" as a certainty marker
2. No yes/no verdicts. No numerical probabilities or scores.
3. Describe behavioral tendencies, not predictions of outcomes.
4. Forbidden words: weakness, exploit, leverage against, manipulate
5. All guidance adjusts MY behavior, not theirs.
6. No medical, legal, or financial advice.

Respond ONLY with valid JSON (no markdown fences, no extra keys):
${outputSpec}

QUESTION: ${question}`;
}

// ── Request schema ─────────────────────────────────────────────────────────────

const RequestSchema = z.object({
  mode: z.enum(['me', 'person', 'general']),
  me: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
    time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
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

  // Daily pillars — server's today
  const today = new Date().toISOString().split('T')[0];
  const dailyPillars = getDailyPillars(today, 14);

  const prompt = buildAskPrompt(
    mode, meChart, themChart,
    briefing as Record<string, unknown> | undefined,
    dailyPillars, history, question,
  );

  const llm = createLlmProvider();

  // First attempt
  let rawAnswer: string;
  try {
    rawAnswer = await withTimeout(llm.generateJson(prompt, 1024), LLM_TIMEOUT);
  } catch (err) {
    return Response.json(
      { error: 'LLM call failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  let answer: unknown;
  try { answer = extractJson(rawAnswer); }
  catch {
    return Response.json({ error: 'LLM response was not valid JSON' }, { status: 502 });
  }

  // Banned phrase check
  const violations = findBanned(JSON.stringify(answer));
  if (violations.length > 0) {
    const retryPrompt =
      prompt +
      `\n\n⚠ PREVIOUS RESPONSE VIOLATION — Banned phrases found: ${violations.map(v => `"${v}"`).join(', ')}. Regenerate the entire JSON without these phrases.`;

    let retryRaw: string;
    try {
      retryRaw = await withTimeout(llm.generateJson(retryPrompt, 1024), LLM_TIMEOUT);
    } catch (err) {
      return Response.json(
        { error: 'Retry LLM call failed', detail: err instanceof Error ? err.message : String(err) },
        { status: 502 },
      );
    }

    try { answer = extractJson(retryRaw); }
    catch {
      return Response.json({ error: 'LLM retry response was not valid JSON' }, { status: 502 });
    }

    const retryViolations = findBanned(JSON.stringify(answer));
    if (retryViolations.length > 0) {
      return Response.json(
        { error: 'Response contains banned phrases after retry', detail: retryViolations },
        { status: 502 },
      );
    }
  }

  return Response.json({ answer });
}
