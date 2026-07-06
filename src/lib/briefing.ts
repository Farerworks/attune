import { z } from 'zod';
import type { SajuChart } from './saju';

// ── Zod schema ──────────────────────────────────────────────────────────────

const InsightSchema = z.object({
  takeaway: z.string(),
  detail: z.string(),
});

export const BriefingSchema = z.object({
  headline: z.string(),
  theirProfile: z.object({
    personality:   InsightSchema,
    communication: InsightSchema,
    decisions:     InsightSchema,
    stress:        InsightSchema,
  }),
  spectrums: z.object({
    communication: z.number().int().min(0).max(100),
    decisions:     z.number().int().min(0).max(100),
    pace:          z.number().int().min(0).max(100),
    stress:        z.number().int().min(0).max(100),
  }),
  dynamic: z.object({
    resonance: z.enum(['strong-current', 'mixed-signals', 'slow-build']),
    click: InsightSchema,
    clash: InsightSchema,
    watch: InsightSchema,
  }),
  playbook: z.array(
    z.object({
      type: z.enum(['do', 'dont']),
      tip:  z.string(),
      why:  z.string(),
    })
  ).min(3).max(5),
});

export type Briefing = z.infer<typeof BriefingSchema>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatChart(chart: SajuChart, label: string): string {
  const p = chart.pillars;
  const el = chart.elements;

  const hourLine = p.hour
    ? `  Hour  (시주): ${p.hour.stem} (${p.hour.stemHanja}) / ${p.hour.branch} (${p.hour.branchHanja})`
    : `  Hour  (시주): [unknown — birth time not provided]`;

  const counts = Object.entries(el)
    .map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)} ×${v}`)
    .join(', ');

  return `=== ${label} ===
Day Master (일간): ${chart.dayMaster.stem} (${p.day.stemHanja}) — element: ${chart.dayMaster.element}, polarity: ${chart.dayMaster.polarity}
Pillars:
  Year  (년주): ${p.year.stem}  (${p.year.stemHanja}) / ${p.year.branch}  (${p.year.branchHanja})
  Month (월주): ${p.month.stem} (${p.month.stemHanja}) / ${p.month.branch} (${p.month.branchHanja})
  Day   (일주): ${p.day.stem}   (${p.day.stemHanja}) / ${p.day.branch}   (${p.day.branchHanja})
${hourLine}
Element distribution (${chart.pillarsKnown} of 8 pillars known): ${counts}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function buildBriefingPrompt(
  me: SajuChart,
  them: SajuChart,
  relationship: string,
  situation: string,
): string {
  const meChart   = formatChart(me,   'SAJU CHART — ME');
  const themChart = formatChart(them, 'SAJU CHART — THEM');

  const cautionNote =
    them.pillarsKnown === 6
      ? 'Note: their birth time is unknown — 6 of 8 pillars available. Avoid overconfident assertions about their tendencies.'
      : '';

  return `You are an emotionally intelligent relationship analyst. Using Four Pillars of Destiny (사주) data, you produce practical personality insights and interaction advice — written in the tone of a highly perceptive friend, not a mystical oracle.

RELATIONSHIP CONTEXT
Relationship type: ${relationship}
Situation: ${situation}
${cautionNote}

${meChart}

${themChart}

OUTPUT INSTRUCTIONS
Respond with ONLY a valid JSON object matching the schema below. No explanation text, no markdown fences, no extra keys.

{
  "headline": "One punchy sentence (12 words or fewer) addressed to me — e.g. 'Maya tends to pause before committing; give her that space.'",
  "theirProfile": {
    "personality":   { "takeaway": "<8 words or fewer>", "detail": "<2–3 sentences>" },
    "communication": { "takeaway": "<8 words or fewer>", "detail": "<2–3 sentences>" },
    "decisions":     { "takeaway": "<8 words or fewer>", "detail": "<2–3 sentences>" },
    "stress":        { "takeaway": "<8 words or fewer>", "detail": "<2–3 sentences>" }
  },
  "spectrums": {
    "communication": <integer 0–100, 0=Indirect, 100=Direct>,
    "decisions":     <integer 0–100, 0=Gut feel, 100=Analysis>,
    "pace":          <integer 0–100, 0=Deliberate, 100=Fast-moving>,
    "stress":        <integer 0–100, 0=Withdraws, 100=Confronts>
  },
  "dynamic": {
    "resonance": "<exactly one of: strong-current | mixed-signals | slow-build>",
    "click": { "takeaway": "...", "detail": "..." },
    "clash": { "takeaway": "...", "detail": "..." },
    "watch": { "takeaway": "...", "detail": "..." }
  },
  "playbook": [
    { "type": "do",   "tip": "<imperative, 10 words or fewer>", "why": "<1 sentence>" },
    { "type": "dont", "tip": "<imperative, 10 words or fewer>", "why": "<1 sentence>" }
  ]
}

CONTENT RULES (non-negotiable)
1. All insights must derive only from the saju data provided above. Do not invent information.
2. Use "tends to" / "is likely to" / "may". Never use the word "will" as a certainty marker.
3. spectrums are slider coordinates for a UI. Base them on day-master element/polarity and element distribution. If the evidence is weak, stay in the 20–80 range rather than claiming extremes.
4. resonance is a relationship-flow label (not a score). Do not include numbers or percentages in the dynamic section.
5. playbook must have 3 to 5 items total (mix of do and dont).
6. Forbidden words anywhere in the output: "weakness", "exploit", "leverage against", "manipulate", "vulnerable to".
7. All advice adjusts MY behavior — never instructs me to exploit or pressure them. Sensitive traits are expressed as consideration points.
8. No medical, legal, or investment advice.
9. Tone: emotionally intelligent, practical, no mystical framing.`;
}

export function parseBriefing(raw: string): Briefing {
  // Strip markdown code fences if present (Ollama sometimes wraps output)
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const jsonStr = fenceMatch ? fenceMatch[1] : raw.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(
      `LLM response is not valid JSON.\nFirst 300 chars: ${raw.slice(0, 300)}`
    );
  }

  const result = BriefingSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Briefing schema validation failed:\n${JSON.stringify(result.error.issues, null, 2)}`
    );
  }

  return result.data;
}
