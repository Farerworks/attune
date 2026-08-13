#!/usr/bin/env node
/**
 * VERIFY-KIT — cross-language regression check (BRIEF-106 §6).
 *
 * Makes NO model calls, touches no `.ts` file (so it runs under plain `node`, no `tsx` needed —
 * same reasoning as voice-baseline.mjs's `--metrics` mode). Re-applies a read-only mirror of
 * `checkAnswerLanguage`/`collectAnswerTextWithTiming` (route.ts:1077-1099/:229-233) to the 8
 * already-recorded `samples/voice-baseline/*.json` files — 48 turns × firstPass/finalPass = 96
 * rows — and reports which rows the `response_language_drift`/`foreign_language_leak` detector
 * flags. §0's cross-language audit (max leak ratio 0.202, min drift ratio 1.000) came from a
 * manual read of these same files; this script is the deterministic, re-runnable version of that
 * audit.
 *
 * The 12-row result is FIXED by the brief (§6's table) — this script diffs its own output against
 * that exact table and exits non-zero on any mismatch (a mismatch means the detector diverges from
 * spec, not that the fixture data changed; the 8 source files are never modified by this script).
 *
 * Usage:
 *   node scripts/verify/lang-regression.mjs
 *     Reads samples/voice-baseline/*.json, prints the row table + PASS/FAIL vs. §6, writes
 *     samples/voice-baseline/lang-regression.tsv.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

// route.ts:229-233 — text + parts[].text + followUp + timing, verbatim.
function collectAnswerTextWithTimingMirror(answer) {
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

// route.ts's checkAnswerLanguage, verbatim (BRIEF-106 §3).
function checkAnswerLanguageMirror(answer, ctx) {
  if (!ctx.expectedLang) return [];

  let combined = collectAnswerTextWithTimingMirror(answer).join(' ');
  for (const name of ctx.nameAllowlist ?? []) {
    if (!name) continue;
    combined = combined.split(name).join(' ');
  }

  const ko = (combined.match(/[가-힣]/g) ?? []).length;
  const la = (combined.match(/[A-Za-z]/g) ?? []).length;
  const total = ko + la;
  if (total === 0) return [];

  const off = ctx.expectedLang === 'en' ? ko : la;
  const ratio = off / total;
  const detail = `${ctx.expectedLang}|${ko}|${la}|${ratio.toFixed(3)}`;

  if (ratio >= 0.5) return [{ type: 'response_language_drift', detail }];
  if (off > 0) return [{ type: 'foreign_language_leak', detail }];
  return [];
}

// BRIEF-106 §6 — fixed for this regression, matching the harness's own fixture name
// (scripts/verify/voice-baseline.mjs:920 `THEM_NAME`).
const NAME_ALLOWLIST = ['Riley', '한결', 'Attune', 'Google', 'Gemini'];

const SAMPLES_DIR = path.join(ROOT, 'samples', 'voice-baseline');
const files = readdirSync(SAMPLES_DIR)
  .filter(f => f.startsWith('gemini-') && f.endsWith('.json'))
  .sort();

if (files.length === 0) {
  console.error('No samples/voice-baseline/*.json files found.');
  process.exit(1);
}

function expectedLangFromFilename(name) {
  if (name.includes('-EN-')) return 'en';
  if (name.includes('-KO-')) return 'ko';
  return undefined;
}

let totalRows = 0;
const rows = [];

for (const file of files) {
  const expectedLang = expectedLangFromFilename(file);
  const data = JSON.parse(readFileSync(path.join(SAMPLES_DIR, file), 'utf-8'));

  for (const t of data.turns) {
    for (const pass of ['firstPass', 'finalPass']) {
      const parsed = t[pass]?.parsed;
      if (!parsed) continue; // fallback-only turns have no `.parsed` — nothing to check
      totalRows++;

      const violations = checkAnswerLanguageMirror(parsed, { expectedLang, nameAllowlist: NAME_ALLOWLIST });
      if (violations.length === 0) continue;

      const v = violations[0];
      const [, ko, la, ratio] = (v.detail ?? '').split('|');
      const verdict = v.type === 'response_language_drift' ? 'drift' : 'leak';
      rows.push({ file, turn: t.turn, pass, ko: Number(ko), la: Number(la), ratio: Number(ratio), verdict });
    }
  }
}

// BRIEF-106 §6's expected table, expanded to one row per (file, turn, pass) — this is the fixed
// reference point; if this script's own computation stops matching it, that is the failure.
const EXPECTED = [
  { file: 'gemini-3.5-flash-lite-20260811-EN-run1.json', turn: 3, pass: 'firstPass', ko: 70, la: 410, ratio: 0.146, verdict: 'leak' },
  { file: 'gemini-3.5-flash-lite-20260811-EN-run1.json', turn: 3, pass: 'finalPass', ko: 70, la: 410, ratio: 0.146, verdict: 'leak' },
  { file: 'gemini-3.5-flash-lite-20260811-EN-run2.json', turn: 2, pass: 'firstPass', ko: 22, la: 195, ratio: 0.101, verdict: 'leak' },
  { file: 'gemini-3.5-flash-lite-20260811-EN-run2.json', turn: 2, pass: 'finalPass', ko: 22, la: 195, ratio: 0.101, verdict: 'leak' },
  { file: 'gemini-3.5-flash-lite-20260812-EN-run2.json', turn: 4, pass: 'firstPass', ko: 131, la: 0, ratio: 1.000, verdict: 'drift' },
  { file: 'gemini-3.5-flash-lite-20260812-EN-run2.json', turn: 4, pass: 'finalPass', ko: 131, la: 0, ratio: 1.000, verdict: 'drift' },
  { file: 'gemini-3.5-flash-lite-20260812-EN-run2.json', turn: 5, pass: 'firstPass', ko: 272, la: 0, ratio: 1.000, verdict: 'drift' },
  { file: 'gemini-3.5-flash-lite-20260812-EN-run2.json', turn: 5, pass: 'finalPass', ko: 272, la: 0, ratio: 1.000, verdict: 'drift' },
  { file: 'gemini-3.5-flash-lite-20260812-EN-run2.json', turn: 6, pass: 'firstPass', ko: 45, la: 0, ratio: 1.000, verdict: 'drift' },
  { file: 'gemini-3.5-flash-lite-20260812-EN-run2.json', turn: 6, pass: 'finalPass', ko: 45, la: 0, ratio: 1.000, verdict: 'drift' },
  { file: 'gemini-3.5-flash-lite-20260812-KO-run1.json', turn: 3, pass: 'firstPass', ko: 166, la: 42, ratio: 0.202, verdict: 'leak' },
  { file: 'gemini-3.5-flash-lite-20260812-KO-run1.json', turn: 3, pass: 'finalPass', ko: 174, la: 30, ratio: 0.147, verdict: 'leak' },
];

const keyOf = r => `${r.file}|${r.turn}|${r.pass}`;
const gotByKey = new Map(rows.map(r => [keyOf(r), r]));
const expByKey = new Map(EXPECTED.map(r => [keyOf(r), r]));

const mismatches = [];
for (const exp of EXPECTED) {
  const got = gotByKey.get(keyOf(exp));
  if (!got) { mismatches.push(`MISSING: ${keyOf(exp)} expected ${exp.verdict} (ko=${exp.ko} la=${exp.la} ratio=${exp.ratio})`); continue; }
  if (got.ko !== exp.ko || got.la !== exp.la || Math.abs(got.ratio - exp.ratio) > 0.0005 || got.verdict !== exp.verdict) {
    mismatches.push(`MISMATCH: ${keyOf(exp)} expected ko=${exp.ko}/la=${exp.la}/ratio=${exp.ratio}/${exp.verdict}, got ko=${got.ko}/la=${got.la}/ratio=${got.ratio}/${got.verdict}`);
  }
}
for (const got of rows) {
  if (!expByKey.has(keyOf(got))) mismatches.push(`UNEXPECTED (false positive): ${keyOf(got)} got ${got.verdict} (ko=${got.ko} la=${got.la} ratio=${got.ratio})`);
}

const header = ['file', 'turn', 'pass', 'ko', 'la', 'ratio', 'verdict'];
const tsvLines = [header.join('\t'), ...rows.map(r => header.map(h => r[h]).join('\t'))];
const outPath = path.join(SAMPLES_DIR, 'lang-regression.tsv');
writeFileSync(outPath, tsvLines.join('\n') + '\n', 'utf-8');

console.log(`${'file'.padEnd(46)}${'turn'.padEnd(6)}${'pass'.padEnd(11)}${'ko'.padEnd(5)}${'la'.padEnd(5)}${'ratio'.padEnd(7)}verdict`);
for (const r of rows) {
  console.log(`${r.file.padEnd(46)}${String(r.turn).padEnd(6)}${r.pass.padEnd(11)}${String(r.ko).padEnd(5)}${String(r.la).padEnd(5)}${r.ratio.toFixed(3).padEnd(7)}${r.verdict}`);
}

const driftCount = rows.filter(r => r.verdict === 'drift').length;
const leakCount = rows.filter(r => r.verdict === 'leak').length;
console.log(`\n합계: ${totalRows}행 중 ${rows.length}행 위반(drift ${driftCount} · leak ${leakCount}), 나머지 ${totalRows - rows.length}행 위반 0.`);
console.log(`Saved -> ${outPath}`);

if (mismatches.length > 0) {
  console.error(`\n[FAIL] §6 기대표와 불일치 (오탐 0이 완료 기준):`);
  for (const m of mismatches) console.error(`  ${m}`);
  process.exit(1);
}
console.log('\n[PASS] §6 기대표와 완전 일치, 오탐 0.');
