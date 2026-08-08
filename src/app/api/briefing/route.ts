import { z } from 'zod';
import { calculateSaju } from '@/lib/saju';
import { buildBriefingPrompt, parseBriefing, containsBannedPhrases, applyStartersFraming } from '@/lib/briefing';
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

// ── §1: structured failure logging (BRIEF-100E — no PII, 502 return points only) ────────────

/**
 * §1.4 category classification — a fixed-start-anchored pattern match against
 * `err instanceof Error ? err.message : String(err)` (never `String(err)` on an Error object,
 * which would prepend "Error: " and break every anchor below). Only the 3-digit status from
 * pattern 1 is ever extracted from the message; the rest of the message text is never logged.
 */
function classifyBriefingError(err: unknown): { category: string; upstreamStatus: string } {
  const message = err instanceof Error ? err.message : String(err);

  const upstreamMatch = message.match(/^Gemini API error (\d{3}):/);
  if (upstreamMatch) return { category: 'upstream_http', upstreamStatus: upstreamMatch[1] };

  if (/^(LLM call|LLM retry) timed out after \d+ms$/.test(message)) {
    return { category: 'timeout', upstreamStatus: 'na' };
  }

  if (/^Gemini returned no text/.test(message)) {
    return { category: 'empty_response', upstreamStatus: 'na' };
  }

  return { category: 'llm_call_failed', upstreamStatus: 'na' };
}

/** §1.2 — exactly one fixed-format line via console.error, no second (Error/object) argument. */
function logBriefingFailure(rid: string, stage: string, action: string, category: string, upstreamStatus: string): void {
  console.error(`[briefing] rid=${rid} stage=${stage} action=${action} status=502 category=${category} upstreamStatus=${upstreamStatus}`);
}

/** BRIEF-100B-FIX2 §1.3 — observability for a starters removal (not a failure: status stays 200).
 * Same [briefing] log family, but only a count — never the offending question text or any PII. */
function logStartersRemoved(rid: string, count: number): void {
  console.error(`[briefing] rid=${rid} stage=starters action=removed count=${count}`);
}

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
  // §1.1 — one full UUID per request, generated right on entry. Not truncated (unlike [ask]'s
  // 8-char rid) — this is purely a log-correlation id, never shown to the user.
  const rid = crypto.randomUUID();

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
  // §1.3's "current stage" variable — the outer catch below can't otherwise tell whether the
  // failed call was the initial one or the banned-phrase retry, since both land in the same
  // catch block. Control flow and return values are unchanged; this only feeds the log action.
  let callStage: 'initial' | 'banned_retry' = 'initial';
  let briefing;
  try {
    const llm = createLlmProvider();
    const raw = await withTimeout(llm.generateJson(prompt, 4096), LLM_TIMEOUT, 'LLM call');

    let candidate;
    try {
      candidate = parseBriefing(raw);
    } catch (err) {
      logBriefingFailure(rid, 'parse', 'initial', 'parse_failed', 'na');
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

      callStage = 'banned_retry';
      const retryRaw = await withTimeout(llm.generateJson(retryPrompt, 4096), LLM_TIMEOUT, 'LLM retry');

      let retryCandidate;
      try {
        retryCandidate = parseBriefing(retryRaw);
      } catch (err) {
        logBriefingFailure(rid, 'parse', 'banned_retry', 'parse_failed', 'na');
        return Response.json(
          { error: 'Briefing parsing failed on retry', detail: String(err) },
          { status: 502 },
        );
      }

      const retryViolations = containsBannedPhrases(retryCandidate);
      if (retryViolations.length > 0) {
        logBriefingFailure(rid, 'banned', 'after_retry', 'banned_after_retry', 'na');
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
    const { category, upstreamStatus } = classifyBriefingError(err);
    logBriefingFailure(rid, 'call', callStage, category, upstreamStatus);
    return Response.json(
      { error: 'LLM call failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  // ── F5 on starters (BRIEF-100B-FIX2 §1.2/§1.3) — 200 either way, never a retry/502. ─────────
  const { briefing: finalBriefing, removedCount } = applyStartersFraming(briefing);
  if (removedCount > 0) logStartersRemoved(rid, removedCount);

  // ── Response ────────────────────────────────────────────────────────────────
  return Response.json({
    briefing: finalBriefing,
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
