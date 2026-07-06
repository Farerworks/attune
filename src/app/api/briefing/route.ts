import { z } from 'zod';
import { calculateSaju } from '@/lib/saju';
import { buildBriefingPrompt, parseBriefing } from '@/lib/briefing';
import { createLlmProvider } from '@/lib/llm';

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
      { status: 400 }
    );
  }

  const { me: meInput, them: themInput, relationship, situation } = parsed.data;

  const meChart   = calculateSaju(meInput);
  const themChart = calculateSaju(themInput);

  // Weave the name into the situation string so the prompt can use it for the headline.
  const contextualSituation = themInput.name
    ? `${situation} (Their name: ${themInput.name})`
    : situation;

  const prompt = buildBriefingPrompt(meChart, themChart, relationship, contextualSituation);

  let briefing;
  try {
    const llm = createLlmProvider();
    const raw = await llm.generateJson(prompt, 2048);
    briefing = parseBriefing(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: 'Briefing generation failed', detail: message }, { status: 502 });
  }

  return Response.json({
    briefing,
    charts: {
      me: {
        dayMaster:     meChart.dayMaster,
        elements:      meChart.elements,
        pillarsKnown:  meChart.pillarsKnown,
        pillars:       meChart.pillars,
      },
      them: {
        dayMaster:     themChart.dayMaster,
        elements:      themChart.elements,
        pillarsKnown:  themChart.pillarsKnown,
        pillars:       themChart.pillars,
      },
    },
  });
}
