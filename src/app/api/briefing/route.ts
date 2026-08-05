import { z } from 'zod';
import { calculateSaju } from '@/lib/saju';
import { buildBriefingPrompt, parseBriefing, containsBannedPhrases } from '@/lib/briefing';
import { createLlmProvider } from '@/lib/llm';
import { checkRateLimit } from '@/lib/rateLimit';

// Tell serverless runtimes to allow up to 60 s for this route
export const maxDuration = 60;

const RATE_LIMIT    = 10;
const RATE_WINDOW   = 60 * 60 * 1000; // 1 hour in ms
const LLM_TIMEOUT   = 55_000;          // 55 s — always responds before any proxy cuts us off

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

// ── Headline length contract (BRIEF-093B) ────────────────────────────────────
// Server-side backstop for the HEADLINE LENGTH prompt instruction (briefing.ts) —
// the reading page's font scale is a defense line, not the fix; this is the fix.

const HEADLINE_LIMIT_KO = 60;
const HEADLINE_LIMIT_EN = 90;

function headlineCharLimit(headline: string): number {
  return /[가-힣]/.test(headline) ? HEADLINE_LIMIT_KO : HEADLINE_LIMIT_EN;
}

function headlineTooLong(headline: string): boolean {
  return [...headline].length > headlineCharLimit(headline);
}

const HEADLINE_RETRY_INSTRUCTION =
  '\n\nYour headline was too long. Rewrite ONLY the headline in one shorter sentence (same language, same meaning, same non-judgmental tone), within the hard limit. Return the full JSON again with only the headline changed.';

const RequestSchema = z.object({
  me: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
    time: z.string().regex(/^\d{2}:\d{2}$/, 'time must be HH:MM').optional(),
  }),
  them: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
    time: z.string().regex(/^\d{2}:\d{2}$/, 'time must be HH:MM').optional(),
    name: z.string().optional(),
  }),
  relationship: z.string().min(1),
  situation:    z.string().min(1),
});

export async function POST(request: Request) {
  // ── Rate limit ──────────────────────────────────────────────────────────────
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  const rl = checkRateLimit(ip, RATE_LIMIT, RATE_WINDOW);
  if (!rl.allowed) {
    return Response.json(
      { error: 'Rate limit exceeded', retryAfterMinutes: Math.ceil(rl.retryAfterMs / 60_000) },
      { status: 429 },
    );
  }

  // ── Input validation ────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid request', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { me: meInput, them: themInput, relationship, situation } = parsed.data;

  // ── Saju calculation ────────────────────────────────────────────────────────
  const meChart   = calculateSaju(meInput);
  const themChart = calculateSaju(themInput);

  const contextualSituation = themInput.name
    ? `${situation} (Their name: ${themInput.name})`
    : situation;

  const prompt = buildBriefingPrompt(meChart, themChart, relationship, contextualSituation);

  // ── LLM call + banned-phrase guard ─────────────────────────────────────────
  let briefing;
  try {
    const llm = createLlmProvider();
    const raw = await withTimeout(llm.generateJson(prompt, 4096), LLM_TIMEOUT, 'LLM call');

    let candidate;
    try {
      candidate = parseBriefing(raw);
    } catch (err) {
      return Response.json(
        { error: 'Briefing parsing failed', detail: String(err) },
        { status: 502 },
      );
    }

    const violations = containsBannedPhrases(candidate);
    if (violations.length > 0) {
      // One retry with the violation cited in the prompt
      const retryPrompt =
        prompt +
        `\n\n⚠ PREVIOUS RESPONSE VIOLATION — The following banned phrases appeared in your last response: ${violations.map(v => `"${v}"`).join(', ')}. Regenerate the entire JSON without using these phrases. Violations will be rejected.`;

      const retryRaw = await withTimeout(llm.generateJson(retryPrompt, 4096), LLM_TIMEOUT, 'LLM retry');

      let retryCandidate;
      try {
        retryCandidate = parseBriefing(retryRaw);
      } catch (err) {
        return Response.json(
          { error: 'Briefing parsing failed on retry', detail: String(err) },
          { status: 502 },
        );
      }

      const retryViolations = containsBannedPhrases(retryCandidate);
      if (retryViolations.length > 0) {
        return Response.json(
          { error: 'Briefing contains banned phrases after retry', detail: retryViolations },
          { status: 502 },
        );
      }

      briefing = retryCandidate;
    } else {
      briefing = candidate;
    }

    // Headline length contract — one compression retry, then pass through as-is (never truncate/ellipsize).
    if (headlineTooLong(briefing.headline)) {
      const lengthRetryPrompt = prompt + HEADLINE_RETRY_INSTRUCTION;
      try {
        const lengthRetryRaw = await withTimeout(llm.generateJson(lengthRetryPrompt, 4096), LLM_TIMEOUT, 'Headline length retry');
        briefing = parseBriefing(lengthRetryRaw);
      } catch {
        // Retry failed (timeout / unparseable) — keep the original briefing; UI's length-adaptive scale absorbs it.
      }
    }
  } catch (err) {
    return Response.json(
      { error: 'LLM call failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  // ── Response ────────────────────────────────────────────────────────────────
  return Response.json({
    briefing,
    charts: {
      me: {
        dayMaster:    meChart.dayMaster,
        elements:     meChart.elements,
        pillarsKnown: meChart.pillarsKnown,
        pillars:      meChart.pillars,
      },
      them: {
        dayMaster:    themChart.dayMaster,
        elements:     themChart.elements,
        pillarsKnown: themChart.pillarsKnown,
        pillars:      themChart.pillars,
      },
    },
  });
}
