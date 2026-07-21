#!/usr/bin/env node
/**
 * VERIFY-KIT — calendar engine (lunar-javascript) regression check.
 *
 * lunar-javascript is a third-party dependency; a version bump could silently
 * change sexagenary-cycle output (day-boundary handling, 야자시 policy, etc.)
 * without any of our own code changing. This script pins three real,
 * hand-verified expected results (see ENGINE-CHECK.md) and fails loudly if
 * calculateSaju() ever drifts from them.
 *
 * Usage:
 *   npx tsx scripts/verify/engine-check.mjs
 *
 * saju.ts has no 'server-only' dependency, so no import bypass is needed here.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const { calculateSaju } = await import(path.join(ROOT, 'src/lib/saju.ts'));

// ── Fixed expectations (ENGINE-CHECK.md, hand-verified) ──────────────────────
const CASES = [
  {
    label: '1995-06-15 22:30 (before 야자시 cutoff)',
    input: { date: '1995-06-15', time: '22:30' },
    expectDay: '丁丑',
    expectHour: '辛亥',
  },
  {
    label: '1995-06-15 23:30 (야자시 — day pillar stays same day, hour advances)',
    input: { date: '1995-06-15', time: '23:30' },
    expectDay: '丁丑',
    expectHour: '壬子',
  },
  {
    label: '1995-06-16 00:30 (past midnight, next calendar day)',
    input: { date: '1995-06-16', time: '00:30' },
    expectDay: '戊寅',
    expectHour: '壬子',
  },
];

let failures = 0;

for (const c of CASES) {
  const result = calculateSaju(c.input);
  const actualDay  = result.pillars.day.stemHanja + result.pillars.day.branchHanja;
  const actualHour = result.pillars.hour.stemHanja + result.pillars.hour.branchHanja;

  const dayOk  = actualDay === c.expectDay;
  const hourOk = actualHour === c.expectHour;

  if (dayOk && hourOk) {
    console.log(`[PASS] ${c.label} — day ${actualDay}, hour ${actualHour}`);
  } else {
    failures++;
    console.log(`[FAIL] ${c.label}`);
    console.log(`       expected day=${c.expectDay} hour=${c.expectHour}`);
    console.log(`       actual   day=${actualDay} hour=${actualHour}`);
  }
}

console.log('');
if (failures === 0) {
  console.log('ALL PASS');
  process.exit(0);
} else {
  console.log(`${failures} case(s) FAILED — do not silently "fix" the expected values, report the drift`);
  process.exit(1);
}
