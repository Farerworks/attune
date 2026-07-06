import { z } from 'zod';
import { calculateSaju } from '@/lib/saju';
import { buildBriefingPrompt, parseBriefing, containsBannedPhrases } from '@/lib/briefing';
import { createLlmProvider } from '@/lib/llm';
import { checkRateLimit } from '@/lib/rateLimit';

const RATE_LIMIT   = 10;
const RATE_WINDOW  = 60 * 60 * 1000; // 1 hour in ms

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
    const raw = await llm.generateJson(prompt, 2048);

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

      const retryRaw = await llm.generateJson(retryPrompt, 2048);

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
