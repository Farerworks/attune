import { z } from 'zod';
import type { SajuChart, TwelveBranch } from './saju';
import { getArchetype, getElementRelationship, COPY_STYLE_RULES, localeVoiceBlock } from './interpretGuide';
import { relationLens } from './tenGods';
import { comparePillars, type SignalKind } from './branchRelations';
import { detectSinsal, type SinsalInput } from './sinsal';
import { getIljuProfile } from './iljuProfiles';
import { findHiddenTruthFraming } from './hiddenTruth';
import {
  LENS_FRAGMENTS, SIGNAL_FRAGMENTS, MIXED_SIGNAL_FRAGMENT, SINSAL_FRAGMENTS, SINSAL_PRIORITY,
  LENS_INSTRUCTION, SIGNALS_INSTRUCTION, SINSAL_INSTRUCTION,
} from './promptFragments';

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
  mySpectrums: z.object({
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
  starters: z.array(z.string().min(1)).length(3).optional(),
});

export type Briefing = z.infer<typeof BriefingSchema>;

// ── Helpers ──────────────────────────────────────────────────────────────────

export function formatChart(chart: SajuChart, label: string): string {
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

// ── Backend insight blocks (BRIEF-070) ──────────────────────────────────────

interface BranchSlot {
  label: string;
  branch: TwelveBranch;
}

function collectBranchSlots(chart: SajuChart): BranchSlot[] {
  const slots: BranchSlot[] = [
    { label: 'Year', branch: chart.pillars.year.branch },
    { label: 'Month', branch: chart.pillars.month.branch },
    { label: 'Day', branch: chart.pillars.day.branch },
  ];
  if (chart.pillars.hour) slots.push({ label: 'Hour', branch: chart.pillars.hour.branch });
  return slots;
}

function labelFor(slots: BranchSlot[], branch: TwelveBranch): string {
  return slots.find(s => s.branch === branch)?.label ?? branch;
}

function buildLensBlock(me: SajuChart, them: SajuChart): string {
  const lens = relationLens(me.dayMaster.stem, them.dayMaster.stem);
  return `=== RELATION LENS (backend insight) ===
${LENS_INSTRUCTION}
${LENS_FRAGMENTS[lens.group]}`;
}

function buildSignalsBlock(me: SajuChart, them: SajuChart): string | null {
  const mySlots = collectBranchSlots(me);
  const theirSlots = collectBranchSlots(them);
  const signals = comparePillars(mySlots.map(s => s.branch), theirSlots.map(s => s.branch));
  if (signals.length === 0) return null;

  const pairEntries = new Map<string, { aLabel: string; bLabel: string; a: TwelveBranch; b: TwelveBranch; kinds: Set<SignalKind> }>();
  for (const sig of signals) {
    const key = `${sig.a}|${sig.b}`;
    let entry = pairEntries.get(key);
    if (!entry) {
      entry = { aLabel: labelFor(mySlots, sig.a), bLabel: labelFor(theirSlots, sig.b), a: sig.a, b: sig.b, kinds: new Set() };
      pairEntries.set(key, entry);
    }
    entry.kinds.add(sig.kind);
  }

  const pairLines = [...pairEntries.values()].map(p => {
    const phrase = p.kinds.has('bond') ? 'natural pull' : 'friction point';
    return `- my ${p.aLabel} (${p.a}) × their ${p.bLabel} (${p.b}): ${phrase}`;
  });

  const relationTypesDetected = new Set(signals.map(s => s.relation));
  const fragmentTexts = new Set<string>();
  for (const relation of relationTypesDetected) fragmentTexts.add(SIGNAL_FRAGMENTS[relation]);

  const hasMixedPair = [...pairEntries.values()].some(p => p.kinds.size > 1);

  const lines = [
    '=== INTERACTION SIGNALS (backend insight) ===',
    SIGNALS_INSTRUCTION,
    ...pairLines,
    ...fragmentTexts,
  ];
  if (hasMixedPair) lines.push(MIXED_SIGNAL_FRAGMENT);

  return lines.join('\n');
}

function buildDayProfileBlock(them: SajuChart): string | null {
  const p = getIljuProfile(them.pillars.day.stemHanja, them.pillars.day.branchHanja);
  if (!p) return null;

  return `=== THEIR DAY PROFILE (backend insight) ===
Sixty-day profile for their exact day pillar — richer than the day master alone. Weave this into 'Their profile' naturally; never quote sections wholesale, never use the field labels below in output.
NAME: ${p.name} — ${p.subtitle}
ESSENCE: ${p.essence}
CORE: ${p.core}
RELATING: ${p.relating}
UNDER PRESSURE: ${p.underPressure}
REACHING THEM: ${p.reachingThem}`;
}

function buildUndercurrentsBlock(them: SajuChart): string | null {
  const sinsalInput: SinsalInput = {
    dayStem: them.pillars.day.stem,
    yearBranch: them.pillars.year.branch,
    monthBranch: them.pillars.month.branch,
    dayBranch: them.pillars.day.branch,
    hourBranch: them.pillars.hour?.branch,
  };
  const detected = detectSinsal(sinsalInput);
  if (detected.length === 0) return null;

  const selected = SINSAL_PRIORITY.filter(s => detected.includes(s)).slice(0, 2);

  const lines = [
    '=== THEIR UNDERCURRENTS (backend insight) ===',
    SINSAL_INSTRUCTION,
    ...selected.map(s => `- ${SINSAL_FRAGMENTS[s]}`),
  ];
  return lines.join('\n');
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

  // ── Pre-computed personality context (inject specific archetypes only) ──────
  const myArch   = getArchetype(me.dayMaster.stem);
  const themArch = getArchetype(them.dayMaster.stem);
  const elemAxis = getElementRelationship(me.dayMaster.stem, them.dayMaster.stem);
  const theirDayProfile = getIljuProfile(them.pillars.day.stemHanja, them.pillars.day.branchHanja);
  const referralSentence = theirDayProfile
    ? `You may refer to them naturally as "${themArch.name}" — or, more specifically, "${theirDayProfile.name}" — once or twice in the report, only if it fits the writing. Never force it, and never use both names in the same report.`
    : `You may refer to them naturally as "${themArch.name}" once or twice in the report — only if it fits the writing. Never force it.`;

  const personalityContext = `\
=== DAY MASTER CONTEXT (pre-computed — use as interpretive foundation) ===

YOUR DAY MASTER: ${me.dayMaster.stem} — ${myArch.name} (${myArch.hanja})
  Core drive:     ${myArch.coreDrive}
  Communication:  ${myArch.communication}
  Under stress:   ${myArch.stress}

THEIR DAY MASTER: ${them.dayMaster.stem} — ${themArch.name} (${themArch.hanja})
  Core drive:     ${themArch.coreDrive}
  Communication:  ${themArch.communication}
  Under stress:   ${themArch.stress}

ELEMENT AXIS: ${elemAxis}

${referralSentence}`;

  const cautionNote =
    them.pillarsKnown === 6
      ? '\nNote: their birth time is unknown — 6 of 8 pillars available. Avoid overconfident assertions.'
      : '';

  const insightBlocks = [
    buildDayProfileBlock(them),
    buildLensBlock(me, them),
    buildSignalsBlock(me, them),
    buildUndercurrentsBlock(them),
  ].filter((b): b is string => b !== null).join('\n\n');

  return `You are an emotionally intelligent relationship analyst. Using Four Pillars of Destiny (사주) data, you produce practical personality insights and interaction advice — written in the tone of a highly perceptive friend, not a mystical oracle.

RELATIONSHIP CONTEXT
Relationship type: ${relationship}
Situation: ${situation}${cautionNote}

${meChart}

${themChart}

${personalityContext}

${insightBlocks}

OUTPUT INSTRUCTIONS
Respond with ONLY a valid JSON object matching the schema below. No explanation text, no markdown fences, no extra keys.

{
  "headline": "8 words or fewer. Specific to THIS person in THIS situation. Gently disarming — makes the reader pause. Tone register: think 'You're not sad, just bored' (do NOT copy that line — write one for this context). Forbidden: stars, fate, universe, destiny, cosmic clichés, generic truisms. Format: '<Name>, before <key event>.' — extract event from situation. If no event, use '<Name>, decoded.'",
  "theirProfile": {
    "personality":   { "takeaway": "<contrast structure: X — but Y>", "detail": "<2–3 sentences with 1 observable scene>" },
    "communication": { "takeaway": "<8 words or fewer>", "detail": "<2–3 sentences with 1 observable scene>" },
    "decisions":     { "takeaway": "<8 words or fewer>", "detail": "<2–3 sentences with 1 observable scene>" },
    "stress":        { "takeaway": "<8 words or fewer>", "detail": "<2–3 sentences with 1 observable scene>" }
  },
  "spectrums": {
    "communication": <integer 0–100, 0=Indirect, 100=Direct — THEIR position>,
    "decisions":     <integer 0–100, 0=Gut feel, 100=Analysis — THEIR position>,
    "pace":          <integer 0–100, 0=Deliberate, 100=Fast-moving — THEIR position>,
    "stress":        <integer 0–100, 0=Withdraws, 100=Confronts — THEIR position>
  },
  "mySpectrums": {
    "communication": <integer 0–100, 0=Indirect, 100=Direct — MY position>,
    "decisions":     <integer 0–100, 0=Gut feel, 100=Analysis — MY position>,
    "pace":          <integer 0–100, 0=Deliberate, 100=Fast-moving — MY position>,
    "stress":        <integer 0–100, 0=Withdraws, 100=Confronts — MY position>
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
  ],
  "starters": [
    "<question 1>",
    "<question 2>",
    "<question 3>"
  ]
}

HEADLINE LENGTH: hard limits — Korean: 60 characters max (aim 28–48). English: 90 characters max (aim 45–75). One sentence. If your draft runs long, compress it yourself before answering.

LANGUAGE
Detect the language of the user's situation text. Write ALL free-text values (headline, every takeaway, every detail, click/clash/watch, playbook tips and whys, starters) entirely in that language. Never mix languages in one sentence. If the situation is in English or empty, write in English. JSON keys stay in English. Do not translate archetype names.

CONTENT RULES
1. All insights must derive only from the saju data above. Do not invent information.
2. Use "tends to" / "is likely to" / "may". Never "will" as a certainty marker.
3. spectrums are THEIR UI slider coordinates; mySpectrums are MY (user's) UI slider coordinates. Both derived from the respective day-master element/polarity and element distribution. Avoid extremes (0–15 or 85–100) unless strongly supported.
4. resonance is a relationship-flow label only. No numbers or percentages in dynamic.
5. playbook must have 3–5 items (mix of do/dont).
6. Forbidden words: "weakness", "exploit", "leverage against", "manipulate", "vulnerable to".
7. All advice adjusts MY behavior only. Sensitive traits are consideration points, not pressure levers.
8. No medical, legal, or investment advice.
9. Tone: emotionally intelligent, practical, zero mystical framing.
10. Every insight must be written as a coupling of YOU and THEM — address the reader as 'you', refer to the other person by name or pronoun. Prefer 'She warms up when you text first' over 'She tends to warm up slowly'. Generic single-person statements are a failure.
11. starters: exactly 3 questions the USER would naturally ask Attune about THIS person in THIS situation — first person, specific (use the name and the situation's key event when given). Each must fit a small tappable chip: Korean 25 characters or fewer, English 8 words or fewer — trim politeness, keep the core ask (e.g. "영진이 선물 좋아할까?", not "영진이가 제 선물에 대해 어떻게 반응할까요?"). One about how they'll likely react, one about what to say or do, one about timing. Questions are addressed to Attune, never to the other person.

${localeVoiceBlock()}

${COPY_STYLE_RULES}`;
}

const BANNED_PHRASES = [
  'weakness', 'exploit', 'leverage against', 'manipulate', '약점', '조종', '공략',
  'The Mirror', 'The Spark', 'The Anchor', 'The Compass', 'The Root',
  'The Tailwind', 'The Quill', 'The Spotlight', 'The Horizon', 'The Deep Forest',
  'punishment',
];

export function containsBannedPhrases(briefing: Briefing): string[] {
  const texts = [
    briefing.headline,
    briefing.theirProfile.personality.takeaway,
    briefing.theirProfile.personality.detail,
    briefing.theirProfile.communication.takeaway,
    briefing.theirProfile.communication.detail,
    briefing.theirProfile.decisions.takeaway,
    briefing.theirProfile.decisions.detail,
    briefing.theirProfile.stress.takeaway,
    briefing.theirProfile.stress.detail,
    briefing.dynamic.click.takeaway,
    briefing.dynamic.click.detail,
    briefing.dynamic.clash.takeaway,
    briefing.dynamic.clash.detail,
    briefing.dynamic.watch.takeaway,
    briefing.dynamic.watch.detail,
    ...briefing.playbook.flatMap(p => [p.tip, p.why]),
    ...(briefing.starters ?? []),
  ];

  const combined = texts.join(' ').toLowerCase();
  return BANNED_PHRASES.filter(phrase => combined.includes(phrase.toLowerCase()));
}

/**
 * F5 applied to `starters` (BRIEF-100B-FIX2 §1.2) — if ANY of the 3 starter questions trips the
 * hidden-truth framing direction check, drop `starters` entirely (never a partial 1-2 item list):
 * the client already falls back to its static prompt pool whenever `starters` isn't exactly 3
 * (src/app/(tabs)/ask/page.tsx, confirmed in §4.5), so removal degrades gracefully — no retry, no
 * 502, no merging into `containsBannedPhrases` (that path retries then 502s, which would fail an
 * entire reading over one chip). Returns only a COUNT for logging — never the offending text.
 */
export function applyStartersFraming(briefing: Briefing): { briefing: Briefing; removedCount: number } {
  if (!briefing.starters) return { briefing, removedCount: 0 };
  const violatingCount = briefing.starters.filter(s => findHiddenTruthFraming(s)).length;
  if (violatingCount === 0) return { briefing, removedCount: 0 };
  const { starters: _starters, ...rest } = briefing;
  void _starters;
  return { briefing: rest, removedCount: violatingCount };
}

export function parseBriefing(raw: string): Briefing {
  // Strip markdown code fences if present (Ollama / Gemini sometimes wraps output)
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = fenceMatch ? fenceMatch[1].trim() : raw.trim();

  // Extract outermost JSON object — strips trailing text after the closing brace
  const start = candidate.indexOf('{');
  const end   = candidate.lastIndexOf('}');
  const jsonStr = start >= 0 && end > start ? candidate.slice(start, end + 1) : candidate;

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
