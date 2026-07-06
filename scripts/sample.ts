/**
 * Generates a sample briefing using real Gemini API and saves it to
 * samples/briefing-sample.json.
 *
 * Usage:
 *   npx tsx scripts/sample.ts
 *
 * Requires GEMINI_API_KEY in .env.local (or the environment).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

// ── Load .env.local ──────────────────────────────────────────────────────────
try {
  const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8');
  for (const line of envFile.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    if (match) process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
} catch {
  // No .env.local — rely on env vars already being set
}

// ── Check API key ────────────────────────────────────────────────────────────
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error([
    '',
    '  GEMINI_API_KEY is not set.',
    '',
    '  1. Get a free key at https://aistudio.google.com/app/apikey',
    '  2. Add it to .env.local:',
    '       GEMINI_API_KEY=your-key-here',
    '  3. Re-run: npx tsx scripts/sample.ts',
    '',
  ].join('\n'));
  process.exit(0);
}

// ── Import pure library modules (no server-only) ─────────────────────────────
// NOTE: llm.ts has `import 'server-only'` and cannot be imported here.
//       The Gemini fetch below mirrors GeminiProvider directly.
import { calculateSaju } from '../src/lib/saju';
import { buildBriefingPrompt, parseBriefing, containsBannedPhrases } from '../src/lib/briefing';

// ── Gemini call (inline, mirrors GeminiProvider in llm.ts) ──────────────────
const GEMINI_MODEL = 'gemini-2.5-flash';

async function callGemini(prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  const data = await res.json() as {
    candidates: { content: { parts: { text: string }[] } }[];
  };
  return data.candidates[0].content.parts[0].text;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Calculating saju charts…');

  const meChart   = calculateSaju({ date: '1999-03-14', time: '08:20' });
  const themChart = calculateSaju({ date: '2000-11-02' });

  const situation =
    "We're in the same class. I want to ask her out on Friday. (Their name: Mia)";

  const prompt = buildBriefingPrompt(meChart, themChart, 'crush', situation);

  console.log('Calling Gemini…');
  const raw = await callGemini(prompt);

  console.log('Parsing response…');
  const briefing = parseBriefing(raw);

  const violations = containsBannedPhrases(briefing);
  if (violations.length > 0) {
    console.warn('⚠  Banned phrases detected:', violations);
  } else {
    console.log('✓  No banned phrases found.');
  }

  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      model: GEMINI_MODEL,
      me:   { date: '1999-03-14', time: '08:20' },
      them: { date: '2000-11-02', name: 'Mia' },
      relationship: 'crush',
      situation: "We're in the same class. I want to ask her out on Friday.",
      meChart: {
        dayMaster: meChart.dayMaster,
        elements:  meChart.elements,
        pillarsKnown: meChart.pillarsKnown,
      },
      themChart: {
        dayMaster: themChart.dayMaster,
        elements:  themChart.elements,
        pillarsKnown: themChart.pillarsKnown,
      },
    },
    briefing,
  };

  mkdirSync(resolve(process.cwd(), 'samples'), { recursive: true });
  const outPath = resolve(process.cwd(), 'samples/briefing-sample.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\nSaved → ${outPath}`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
