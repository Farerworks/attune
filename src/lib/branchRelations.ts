import type { TwelveBranch } from './saju';

export type PairRelation =
  | 'yukhap'     // 육합 — bond
  | 'yukchung'   // 육충 — friction
  | 'hyeong'     // 형(삼형의 쌍 성분 + 자묘 상형) — friction
  | 'jahyeong'   // 자형(같은 글자, 4종 한정) — friction
  | 'pa'         // 파 — friction (약)
  | 'hae';       // 해 — friction (약)

export type SignalKind = 'bond' | 'friction';

// ── Reference data (v5, 3-source cross-verified — do not edit) ────────────────

const BRANCH_ORDER: TwelveBranch[] = [
  'Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake',
  'Horse', 'Goat', 'Monkey', 'Rooster', 'Dog', 'Pig',
];

const YUKHAP_PAIRS: [TwelveBranch, TwelveBranch][] = [
  ['Rat', 'Ox'], ['Tiger', 'Pig'], ['Rabbit', 'Dog'],
  ['Dragon', 'Rooster'], ['Snake', 'Monkey'], ['Horse', 'Goat'],
];

const YUKCHUNG_PAIRS: [TwelveBranch, TwelveBranch][] = [
  ['Rat', 'Horse'], ['Ox', 'Goat'], ['Tiger', 'Monkey'],
  ['Rabbit', 'Rooster'], ['Dragon', 'Dog'], ['Snake', 'Pig'],
];

// 삼형 인사신 (Tiger-Snake-Monkey) + 삼형 축술미 (Ox-Dog-Goat) + 상형 자묘 (Rat-Rabbit)
const HYEONG_PAIRS: [TwelveBranch, TwelveBranch][] = [
  ['Tiger', 'Snake'], ['Snake', 'Monkey'], ['Tiger', 'Monkey'],
  ['Ox', 'Dog'], ['Dog', 'Goat'], ['Ox', 'Goat'],
  ['Rat', 'Rabbit'],
];

// 자형은 이 4글자에 한해서만 성립 (辰辰·午午·酉酉·亥亥)
const JAHYEONG_BRANCHES: TwelveBranch[] = ['Dragon', 'Horse', 'Rooster', 'Pig'];

const PA_PAIRS: [TwelveBranch, TwelveBranch][] = [
  ['Rat', 'Rooster'], ['Ox', 'Dragon'], ['Tiger', 'Pig'],
  ['Rabbit', 'Horse'], ['Snake', 'Monkey'], ['Dog', 'Goat'],
];

const HAE_PAIRS: [TwelveBranch, TwelveBranch][] = [
  ['Rat', 'Goat'], ['Ox', 'Horse'], ['Tiger', 'Snake'],
  ['Rabbit', 'Dragon'], ['Monkey', 'Pig'], ['Rooster', 'Dog'],
];

function pairKey(a: TwelveBranch, b: TwelveBranch): string {
  const [x, y] = BRANCH_ORDER.indexOf(a) <= BRANCH_ORDER.indexOf(b) ? [a, b] : [b, a];
  return `${x}|${y}`;
}

function buildPairSet(pairs: [TwelveBranch, TwelveBranch][]): Set<string> {
  const set = new Set<string>();
  for (const [a, b] of pairs) set.add(pairKey(a, b));
  return set;
}

const YUKHAP_SET   = buildPairSet(YUKHAP_PAIRS);
const YUKCHUNG_SET = buildPairSet(YUKCHUNG_PAIRS);
const HYEONG_SET   = buildPairSet(HYEONG_PAIRS);
const PA_SET       = buildPairSet(PA_PAIRS);
const HAE_SET      = buildPairSet(HAE_PAIRS);

// ── Public API ───────────────────────────────────────────────────────────────

/** All relations between two branches (order-independent). A pair can carry more than one. */
export function getPairRelations(a: TwelveBranch, b: TwelveBranch): PairRelation[] {
  if (a === b) {
    return JAHYEONG_BRANCHES.includes(a) ? ['jahyeong'] : [];
  }
  const key = pairKey(a, b);
  const relations: PairRelation[] = [];
  if (YUKHAP_SET.has(key))   relations.push('yukhap');
  if (YUKCHUNG_SET.has(key)) relations.push('yukchung');
  if (HYEONG_SET.has(key))   relations.push('hyeong');
  if (PA_SET.has(key))       relations.push('pa');
  if (HAE_SET.has(key))      relations.push('hae');
  return relations;
}

export function getSignalKind(r: PairRelation): SignalKind {
  return r === 'yukhap' ? 'bond' : 'friction';
}

export interface BranchPairSignal {
  a: TwelveBranch;
  b: TwelveBranch;
  relation: PairRelation;
  kind: SignalKind;
}

/** Cross-product only (mine × theirs) — does not check relations within `mine` or within `theirs`. */
export function comparePillars(mine: TwelveBranch[], theirs: TwelveBranch[]): BranchPairSignal[] {
  const results: BranchPairSignal[] = [];
  for (const a of mine) {
    for (const b of theirs) {
      for (const relation of getPairRelations(a, b)) {
        results.push({ a, b, relation, kind: getSignalKind(relation) });
      }
    }
  }
  return results;
}
