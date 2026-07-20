import type { TenStem, TwelveBranch } from './saju';

export type Sinsal = 'cheoneul' | 'munchang' | 'dohwa' | 'yeokma' | 'hwagae';

export interface SinsalInput {
  dayStem: TenStem;
  yearBranch: TwelveBranch;
  monthBranch: TwelveBranch;
  dayBranch: TwelveBranch;
  hourBranch?: TwelveBranch; // omit when birth time is unknown
}

// ── Reference data (v5, 3-source cross-verified — do not edit) ────────────────

// ① 천을귀인 — day stem -> 2 target branches (either counts)
const CHEONEUL_TARGETS: Record<TenStem, [TwelveBranch, TwelveBranch]> = {
  'Yang Wood':  ['Ox', 'Goat'],   // 甲
  'Yang Earth': ['Ox', 'Goat'],   // 戊
  'Yang Metal': ['Ox', 'Goat'],   // 庚
  'Yin Wood':   ['Rat', 'Monkey'], // 乙
  'Yin Earth':  ['Rat', 'Monkey'], // 己
  'Yang Fire':  ['Pig', 'Rooster'], // 丙
  'Yin Fire':   ['Pig', 'Rooster'], // 丁
  'Yin Metal':  ['Horse', 'Tiger'], // 辛
  'Yang Water': ['Rabbit', 'Snake'], // 壬
  'Yin Water':  ['Rabbit', 'Snake'], // 癸
};

// ② 문창귀인 — day stem -> 1 target branch
const MUNCHANG_TARGET: Record<TenStem, TwelveBranch> = {
  'Yang Wood': 'Snake',   // 甲->巳
  'Yin Wood': 'Horse',    // 乙->午
  'Yang Fire': 'Monkey',  // 丙->申
  'Yin Fire': 'Rooster',  // 丁->酉
  'Yang Earth': 'Monkey', // 戊->申
  'Yin Earth': 'Rooster', // 己->酉
  'Yang Metal': 'Pig',    // 庚->亥
  'Yin Metal': 'Rat',     // 辛->子
  'Yang Water': 'Tiger',  // 壬->寅
  'Yin Water': 'Rabbit',  // 癸->卯
};

// ③④⑤ 삼합국 — any branch in a group maps to that group's dohwa/yeokma/hwagae target
interface GroupTargets {
  dohwa: TwelveBranch;
  yeokma: TwelveBranch;
  hwagae: TwelveBranch;
}

const SINSHAJIN: GroupTargets = { dohwa: 'Rooster', yeokma: 'Tiger', hwagae: 'Dragon' }; // 申子辰
const INOSUL: GroupTargets    = { dohwa: 'Rabbit', yeokma: 'Monkey', hwagae: 'Dog' };    // 寅午戌
const SAYOOCHUK: GroupTargets = { dohwa: 'Horse', yeokma: 'Pig', hwagae: 'Ox' };          // 巳酉丑
const HAEMYOMI: GroupTargets  = { dohwa: 'Rat', yeokma: 'Snake', hwagae: 'Goat' };        // 亥卯未

const GROUP_TARGETS: Record<TwelveBranch, GroupTargets> = {
  Monkey: SINSHAJIN, Rat: SINSHAJIN, Dragon: SINSHAJIN,
  Tiger: INOSUL,     Horse: INOSUL,  Dog: INOSUL,
  Snake: SAYOOCHUK,  Rooster: SAYOOCHUK, Ox: SAYOOCHUK,
  Pig: HAEMYOMI,     Rabbit: HAEMYOMI,   Goat: HAEMYOMI,
};

const SINSAL_LABELS: Record<Sinsal, string> = {
  cheoneul: 'The Tailwind',
  munchang: 'The Quill',
  dohwa: 'The Spotlight',
  yeokma: 'The Horizon',
  hwagae: 'The Deep Forest',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function collectKnownBranches(input: SinsalInput): TwelveBranch[] {
  const branches: TwelveBranch[] = [input.yearBranch, input.monthBranch, input.dayBranch];
  if (input.hourBranch) branches.push(input.hourBranch);
  return branches;
}

function countOccurrences(branches: TwelveBranch[], target: TwelveBranch): number {
  return branches.filter(b => b === target).length;
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Detects all positive sinsal present, always in fixed order: cheoneul, munchang, dohwa, yeokma, hwagae. */
export function detectSinsal(input: SinsalInput): Sinsal[] {
  const known = collectKnownBranches(input);
  const results: Sinsal[] = [];

  const cheoneulTargets = CHEONEUL_TARGETS[input.dayStem];
  if (cheoneulTargets.some(t => known.includes(t))) results.push('cheoneul');

  const munchangTarget = MUNCHANG_TARGET[input.dayStem];
  if (known.includes(munchangTarget)) results.push('munchang');

  const yearGroup = GROUP_TARGETS[input.yearBranch];
  const dayGroup = GROUP_TARGETS[input.dayBranch];

  if (known.includes(yearGroup.dohwa) || known.includes(dayGroup.dohwa)) results.push('dohwa');
  if (known.includes(yearGroup.yeokma) || known.includes(dayGroup.yeokma)) results.push('yeokma');

  if (
    countOccurrences(known, yearGroup.hwagae) >= 2 ||
    countOccurrences(known, dayGroup.hwagae) >= 2
  ) results.push('hwagae');

  return results;
}

export function getSinsalLabel(s: Sinsal): string {
  return SINSAL_LABELS[s];
}
