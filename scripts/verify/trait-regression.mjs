#!/usr/bin/env node
/**
 * VERIFY-KIT — trait-reattachment regression check (BRIEF-104B §3).
 *
 * Makes NO model calls, touches no `.ts` file (runs under plain `node`, same reasoning as
 * lang-regression.mjs). Re-applies a read-only mirror of `checkTraitReattachment`/
 * `hasTraitCauseMarker`/`hasDayContext`/`splitSentences` (route.ts's trait-reattachment block +
 * src/lib/hiddenTruth.ts's `splitSentences`) to:
 *
 *   §3.1 positive — the 8 recorded `samples/voice-baseline/*.json` files, turns T2–T5 only
 *   (T1 is the first introduction, exempt by design; T6 is script mode) = 32 turns, using each
 *   turn's `finalPass.parsed` (what the user actually saw).
 *
 *   §3.2 negative — `samples/voice-baseline/trait-negatives.json`, 12 hand-written cases (6 of
 *   them deliberate traps) that must ALL come back with zero violations.
 *
 * Both result tables are FIXED by the brief (§3.1's table = 12/32 turns, §3.2 = 0 false positives
 * across all 12) — this script diffs its own output against them and exits non-zero on any
 * mismatch. Neither the 8 source files nor trait-negatives.json are ever modified.
 *
 * Usage:
 *   node scripts/verify/trait-regression.mjs
 *     Runs both checks, prints PASS/FAIL, writes samples/voice-baseline/trait-regression.tsv.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const SAMPLES_DIR = path.join(ROOT, 'samples', 'voice-baseline');

// src/lib/hiddenTruth.ts:16-18, verbatim.
function splitSentences(text) {
  return text.split(/(?<=[.!?。])\s+|\n+/).filter(s => s.trim().length > 0);
}

// route.ts's collectAnswerTextWithTiming, verbatim (route.ts:229-233).
function collectAnswerTextWithTiming(answer) {
  const texts = [];
  if (typeof answer.text === 'string') texts.push(answer.text);
  if (Array.isArray(answer.parts)) {
    for (const p of answer.parts) {
      if (typeof p.text === 'string') texts.push(p.text);
    }
  }
  if (typeof answer.followUp === 'string') texts.push(answer.followUp);
  if (typeof answer.timing === 'string') texts.push(answer.timing);
  return texts;
}

// route.ts's trait-reattachment block, verbatim (BRIEF-104B §1).
const TRAIT_CAUSE_KO = ['성향', '편이거든요', '편이에요', '편이라', '기질', '스타일', '기운을 품'];
const TRAIT_CAUSE_EN_PATTERNS = [
  /\btends?\s+to\b/i,
  /\bhabit of\b/i,
  /\b(?:they|he|she)\s+prefers?\b/i,
  /\btheir\s+\w+\s+nature\b/i,
  /\bas\s+(?:a|an|the)\s+[A-Z][a-z]+\s+[A-Z][a-z]+\b/,
  /\b(?:water|fire|earth|metal|wood)\s+energy\b/i,
];

function hasTraitCauseMarker(sentence) {
  if (TRAIT_CAUSE_KO.some(m => sentence.includes(m))) return true;
  return TRAIT_CAUSE_EN_PATTERNS.some(p => p.test(sentence));
}

const DAY_CONTEXT_KO = ['날', '오늘', '내일', '모레', '이번 주', '다음 주', '요일'];
const DAY_CONTEXT_EN_WORDS = [
  'day', 'today', 'tomorrow', 'weekend',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'rat', 'ox', 'tiger', 'rabbit', 'dragon', 'snake', 'horse', 'goat', 'monkey', 'rooster', 'dog', 'pig',
];
const DAY_CONTEXT_DATE = /\d{4}-\d{2}-\d{2}|\d{1,2}\s*월\s*\d{1,2}\s*일/;

function hasDayContext(sentence) {
  if (DAY_CONTEXT_KO.some(m => sentence.includes(m))) return true;
  if (DAY_CONTEXT_DATE.test(sentence)) return true;
  return DAY_CONTEXT_EN_WORDS.some(w => new RegExp(`\\b${w}\\b`, 'i').test(sentence));
}

function checkTraitReattachment(answer, personIntroduced) {
  if (!personIntroduced) return [];
  const violations = [];
  for (const t of collectAnswerTextWithTiming(answer)) {
    for (const sentence of splitSentences(t)) {
      if (hasDayContext(sentence)) continue;
      if (hasTraitCauseMarker(sentence)) violations.push(sentence.slice(0, 40));
    }
  }
  return violations;
}

// ── §3.1 positive — 8 files × T2-T5 = 32 turns ────────────────────────────────────────────────

const files = readdirSync(SAMPLES_DIR)
  .filter(f => f.startsWith('gemini-') && f.endsWith('.json'))
  .sort();

if (files.length !== 8) {
  console.error(`Expected 8 samples/voice-baseline/*.json files, found ${files.length}.`);
  process.exit(1);
}

// BRIEF-104B §3.1 — fixed reference table (12 of 32 turns).
const EXPECTED_POSITIVE = {
  'gemini-3.5-flash-lite-20260812-EN-run1.json|5': 2,
  'gemini-3.5-flash-lite-20260812-EN-run2.json|2': 1,
  'gemini-3.5-flash-lite-20260812-EN-run2.json|5': 2,
  'gemini-3.5-flash-lite-20260812-KO-run1.json|5': 1,
  'gemini-3.5-flash-lite-20260812-KO-run2.json|2': 1,
  'gemini-3.5-flash-lite-20260812-KO-run2.json|3': 1,
  'gemini-3.5-flash-lite-20260812-KO-run2.json|5': 1,
  'gemini-3.5-flash-lite-20260811-EN-run1.json|3': 1,
  'gemini-3.5-flash-lite-20260811-EN-run1.json|5': 2,
  'gemini-3.5-flash-lite-20260811-EN-run2.json|4': 1,
  'gemini-3.5-flash-lite-20260811-KO-run1.json|5': 1,
  'gemini-3.5-flash-lite-20260811-KO-run2.json|5': 1,
};

const positiveRows = [];
const positiveMismatches = [];
let totalTurns = 0;

for (const file of files) {
  const data = JSON.parse(readFileSync(path.join(SAMPLES_DIR, file), 'utf-8'));
  for (const t of data.turns) {
    if (t.turn < 2 || t.turn > 5) continue;
    const answer = t.finalPass?.parsed;
    if (!answer) continue;
    totalTurns++;

    const details = checkTraitReattachment(answer, true);
    const key = `${file}|${t.turn}`;
    const expected = EXPECTED_POSITIVE[key] ?? 0;
    if (details.length > 0) positiveRows.push({ file, turn: t.turn, count: details.length, detail: details[0] });
    if (details.length !== expected) {
      positiveMismatches.push(`MISMATCH ${key}: expected ${expected}, got ${details.length} ${JSON.stringify(details)}`);
    }
  }
}
for (const key of Object.keys(EXPECTED_POSITIVE)) {
  const [file, turnStr] = key.split('|');
  const found = positiveRows.some(r => r.file === file && String(r.turn) === turnStr);
  if (!found) positiveMismatches.push(`MISSING: ${key} expected ${EXPECTED_POSITIVE[key]}, got 0`);
}

// ── §3.2 negative — trait-negatives.json, 12 cases, must all be 0 ────────────────────────────

const negativesPath = path.join(SAMPLES_DIR, 'trait-negatives.json');
const negatives = JSON.parse(readFileSync(negativesPath, 'utf-8'));
const negativeRows = [];
let negativeFails = 0;

for (const n of negatives) {
  const answer = {};
  if (typeof n.text === 'string') answer.text = n.text;
  if (Array.isArray(n.parts)) answer.parts = n.parts.map(([label, text]) => ({ label, text }));
  if (typeof n.timing === 'string') answer.timing = n.timing;

  const details = checkTraitReattachment(answer, true);
  negativeRows.push({ id: n.id, count: details.length, detail: details[0] ?? '' });
  if (details.length > 0) negativeFails++;
}

// ── report + tsv ───────────────────────────────────────────────────────────────────────────

console.log('=== §3.1 양성 (12/32 기대) ===');
console.log(`${'file'.padEnd(48)}${'turn'.padEnd(6)}${'count'.padEnd(7)}detail`);
for (const r of positiveRows) {
  console.log(`${r.file.padEnd(48)}${String(r.turn).padEnd(6)}${String(r.count).padEnd(7)}${r.detail}`);
}
console.log(`\n합계: ${totalTurns}턴 중 ${positiveRows.length}턴 위반 (기대 12/32).`);

console.log('\n=== §3.2 음성 (오탐 0 기대) ===');
for (const r of negativeRows) {
  console.log(`${r.count === 0 ? 'PASS' : 'FAIL'} ${r.id} -> ${r.count}${r.detail ? ' :: ' + r.detail : ''}`);
}
console.log(`\n오탐: ${negativeFails}/${negativeRows.length}`);

const header = ['section', 'file_or_id', 'turn', 'count', 'detail'];
const tsvLines = [header.join('\t')];
for (const r of positiveRows) tsvLines.push(['positive', r.file, r.turn, r.count, r.detail].join('\t'));
for (const r of negativeRows) tsvLines.push(['negative', r.id, '', r.count, r.detail].join('\t'));
const outPath = path.join(SAMPLES_DIR, 'trait-regression.tsv');
writeFileSync(outPath, tsvLines.join('\n') + '\n', 'utf-8');
console.log(`\nSaved -> ${outPath}`);

const allMismatches = [...positiveMismatches];
if (negativeFails > 0) allMismatches.push(`§3.2 negative false positives: ${negativeFails}/${negativeRows.length}`);

if (allMismatches.length > 0) {
  console.error('\n[FAIL]');
  for (const m of allMismatches) console.error(`  ${m}`);
  process.exit(1);
}
console.log('\n[PASS] §3.1 12/32 완전 일치, §3.2 오탐 0.');
