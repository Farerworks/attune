import { describe, it, expect } from 'vitest';
import type { TenStem } from './saju';
import {
  getTenGod, getTenGodGroup, getGroupLabel, getBranchMainStem, relationLens,
  type TenGod, type TenGodGroup,
} from './tenGods';

const ALL_STEMS: TenStem[] = [
  'Yang Wood', 'Yin Wood', 'Yang Fire', 'Yin Fire', 'Yang Earth',
  'Yin Earth', 'Yang Metal', 'Yin Metal', 'Yang Water', 'Yin Water',
];

const ALL_TEN_GODS: TenGod[] = [
  'bigyeon', 'geopjae', 'siksin', 'sanggwan', 'pyeonjae',
  'jeongjae', 'pyeongwan', 'jeonggwan', 'pyeonin', 'jeongin',
];

describe('getTenGod — worked examples from the brief', () => {
  it('same stem = bigyeon', () => {
    expect(getTenGod('Yang Wood', 'Yang Wood')).toBe('bigyeon');
  });
  it('same element, different polarity = geopjae', () => {
    expect(getTenGod('Yang Wood', 'Yin Wood')).toBe('geopjae');
  });
  it('wood generates fire, same polarity = siksin', () => {
    expect(getTenGod('Yang Wood', 'Yang Fire')).toBe('siksin');
  });
  it('water controls fire, different polarity = jeongjae', () => {
    expect(getTenGod('Yin Water', 'Yang Fire')).toBe('jeongjae');
  });
  it('earth controls water (other controls day), different polarity = jeonggwan', () => {
    expect(getTenGod('Yin Water', 'Yang Earth')).toBe('jeonggwan');
  });
  it('wood generates fire, viewed from fire (other generates day), same polarity = pyeonin', () => {
    expect(getTenGod('Yang Fire', 'Yang Wood')).toBe('pyeonin');
  });
});

describe('getTenGod — day-branch main-stem cases', () => {
  it("Yang Wood day + Rat's main stem (Yin Water) = jeongin (갑자=정인)", () => {
    expect(getTenGod('Yang Wood', getBranchMainStem('Rat'))).toBe('jeongin');
  });
  it("Yin Water day + Ox's main stem (Yin Earth) = pyeongwan (계축=편관)", () => {
    expect(getTenGod('Yin Water', getBranchMainStem('Ox'))).toBe('pyeongwan');
  });
  it("Yang Fire day + Rat's main stem (Yin Water) = jeonggwan (병자=정관)", () => {
    expect(getTenGod('Yang Fire', getBranchMainStem('Rat'))).toBe('jeonggwan');
  });
});

describe('getTenGod — exhaustive 10x10 integrity', () => {
  it('always returns a valid TenGod for every day/other stem pair', () => {
    for (const day of ALL_STEMS) {
      for (const other of ALL_STEMS) {
        expect(ALL_TEN_GODS).toContain(getTenGod(day, other));
      }
    }
  });

  it('for every day stem, the 10 other stems distribute as 2 per relation group', () => {
    for (const day of ALL_STEMS) {
      const groupCounts: Record<TenGodGroup, number> = {
        mirror: 0, spark: 0, anchor: 0, compass: 0, root: 0,
      };
      for (const other of ALL_STEMS) {
        const g = getTenGodGroup(getTenGod(day, other));
        groupCounts[g]++;
      }
      expect(groupCounts).toEqual({ mirror: 2, spark: 2, anchor: 2, compass: 2, root: 2 });
    }
  });
});

describe('getTenGodGroup / getGroupLabel — full mapping', () => {
  const cases: Array<[TenGod, TenGodGroup, string]> = [
    ['bigyeon', 'mirror', 'The Mirror'],
    ['geopjae', 'mirror', 'The Mirror'],
    ['siksin', 'spark', 'The Spark'],
    ['sanggwan', 'spark', 'The Spark'],
    ['pyeonjae', 'anchor', 'The Anchor'],
    ['jeongjae', 'anchor', 'The Anchor'],
    ['pyeongwan', 'compass', 'The Compass'],
    ['jeonggwan', 'compass', 'The Compass'],
    ['pyeonin', 'root', 'The Root'],
    ['jeongin', 'root', 'The Root'],
  ];

  it.each(cases)('%s -> group %s -> label %s', (tenGod, group, label) => {
    expect(getTenGodGroup(tenGod)).toBe(group);
    expect(getGroupLabel(group)).toBe(label);
  });
});

describe('relationLens', () => {
  it("water generates wood (different polarity) -> tenGod 'sanggwan', group 'spark', label 'The Spark'", () => {
    // Computed directly (not assumed): Yin Water day, Yang Wood other.
    // Water generates wood (day generates other) with different polarity -> sanggwan, whose GROUP is spark.
    // ("group 'sanggwan'" would be a category-error — sanggwan is a TenGod, not a TenGodGroup.)
    expect(relationLens('Yin Water', 'Yang Wood')).toEqual({
      tenGod: 'sanggwan',
      group: 'spark',
      label: 'The Spark',
    });
  });
});
