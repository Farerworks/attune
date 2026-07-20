import { describe, it, expect } from 'vitest';
import type { TwelveBranch } from './saju';
import { getPairRelations, getSignalKind, comparePillars, type PairRelation } from './branchRelations';

const ALL_BRANCHES: TwelveBranch[] = [
  'Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake',
  'Horse', 'Goat', 'Monkey', 'Rooster', 'Dog', 'Pig',
];

describe('getPairRelations — worked examples from the brief', () => {
  it('자축 Rat-Ox = yukhap only', () => {
    expect(getPairRelations('Rat', 'Ox')).toEqual(['yukhap']);
  });

  it('인해 Tiger-Pig = yukhap + pa (합+파)', () => {
    const r = getPairRelations('Tiger', 'Pig');
    expect(r).toHaveLength(2);
    expect(r).toEqual(expect.arrayContaining(['yukhap', 'pa']));
  });

  it('사신 Snake-Monkey = yukhap + hyeong + pa (3중)', () => {
    const r = getPairRelations('Snake', 'Monkey');
    expect(r).toHaveLength(3);
    expect(r).toEqual(expect.arrayContaining(['yukhap', 'hyeong', 'pa']));
  });

  it('인신 Tiger-Monkey = yukchung + hyeong', () => {
    const r = getPairRelations('Tiger', 'Monkey');
    expect(r).toHaveLength(2);
    expect(r).toEqual(expect.arrayContaining(['yukchung', 'hyeong']));
  });

  it('자오 Rat-Horse = yukchung only', () => {
    expect(getPairRelations('Rat', 'Horse')).toEqual(['yukchung']);
  });

  it('자묘 Rat-Rabbit contains hyeong (상형)', () => {
    expect(getPairRelations('Rat', 'Rabbit')).toEqual(['hyeong']);
  });

  it('진진 Dragon-Dragon = jahyeong', () => {
    expect(getPairRelations('Dragon', 'Dragon')).toEqual(['jahyeong']);
  });

  it('자자 Rat-Rat = [] (자형 4글자 밖이므로 빈 배열)', () => {
    expect(getPairRelations('Rat', 'Rat')).toEqual([]);
  });

  it('묘진 Rabbit-Dragon contains hae', () => {
    expect(getPairRelations('Rabbit', 'Dragon')).toContain('hae');
  });

  it('유술 Rooster-Dog contains hae', () => {
    expect(getPairRelations('Rooster', 'Dog')).toContain('hae');
  });
});

describe('getPairRelations — symmetry', () => {
  it('is order-independent for every 12x12 combination', () => {
    for (const a of ALL_BRANCHES) {
      for (const b of ALL_BRANCHES) {
        expect(getPairRelations(a, b).slice().sort()).toEqual(getPairRelations(b, a).slice().sort());
      }
    }
  });
});

describe('getPairRelations — exhaustive counts', () => {
  function countDistinctPairsWith(relation: PairRelation): number {
    let count = 0;
    for (let i = 0; i < ALL_BRANCHES.length; i++) {
      for (let j = i + 1; j < ALL_BRANCHES.length; j++) {
        if (getPairRelations(ALL_BRANCHES[i], ALL_BRANCHES[j]).includes(relation)) count++;
      }
    }
    return count;
  }

  it('yukhap has exactly 6 pairs', () => {
    expect(countDistinctPairsWith('yukhap')).toBe(6);
  });
  it('yukchung has exactly 6 pairs', () => {
    expect(countDistinctPairsWith('yukchung')).toBe(6);
  });
  it('pa has exactly 6 pairs', () => {
    expect(countDistinctPairsWith('pa')).toBe(6);
  });
  it('hae has exactly 6 pairs', () => {
    expect(countDistinctPairsWith('hae')).toBe(6);
  });
  it('hyeong has exactly 7 pairs (2 triangles of 3 + 1 standalone)', () => {
    expect(countDistinctPairsWith('hyeong')).toBe(7);
  });
  it('jahyeong applies to exactly 4 same-branch pairs', () => {
    const count = ALL_BRANCHES.filter(b => getPairRelations(b, b).includes('jahyeong')).length;
    expect(count).toBe(4);
  });
});

describe('getSignalKind', () => {
  it('yukhap is bond', () => {
    expect(getSignalKind('yukhap')).toBe('bond');
  });
  it('everything else is friction', () => {
    const frictionRelations: PairRelation[] = ['yukchung', 'hyeong', 'jahyeong', 'pa', 'hae'];
    for (const r of frictionRelations) expect(getSignalKind(r)).toBe('friction');
  });
});

describe('comparePillars', () => {
  it("mine=[Rat,Ox] x theirs=[Horse,Goat] -> 5 signals, all friction", () => {
    const result = comparePillars(['Rat', 'Ox'], ['Horse', 'Goat']);
    expect(result).toHaveLength(5);
    expect(result.every(r => r.kind === 'friction')).toBe(true);

    const relationsFor = (a: TwelveBranch, b: TwelveBranch) =>
      result.filter(r => r.a === a && r.b === b).map(r => r.relation).sort();

    expect(relationsFor('Rat', 'Horse')).toEqual(['yukchung']);   // 자오 충
    expect(relationsFor('Ox', 'Goat')).toEqual(['hyeong', 'yukchung']); // 축미 충 + 형
    expect(relationsFor('Rat', 'Goat')).toEqual(['hae']);          // 자미 해
    expect(relationsFor('Ox', 'Horse')).toEqual(['hae']);          // 축오 해
  });

  it('only checks the cross-product, not within mine or within theirs', () => {
    // Rat-Ox itself is yukhap, but since both are in `mine`, it must not appear.
    const result = comparePillars(['Rat', 'Ox'], ['Dragon']);
    expect(result.some(r => r.a === 'Rat' && r.b === 'Ox')).toBe(false);
  });
});
