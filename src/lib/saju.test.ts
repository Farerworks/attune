import { describe, it, expect } from 'vitest';
import { calculateSaju, getDailyPillars } from './saju';

// Fixture: verified against lunar-javascript output
// Cross-check these values against a Korean 만세력 site before shipping.
const FIXTURES = [
  {
    date: '1999-03-14',
    year:  { stem: 'Yin Earth',  branch: 'Rabbit',  stemHanja: '己', branchHanja: '卯' },
    month: { stem: 'Yin Fire',   branch: 'Rabbit',  stemHanja: '丁', branchHanja: '卯' },
    day:   { stem: 'Yin Wood',   branch: 'Ox',      stemHanja: '乙', branchHanja: '丑' },
  },
  {
    date: '2000-11-02',
    year:  { stem: 'Yang Metal', branch: 'Dragon',  stemHanja: '庚', branchHanja: '辰' },
    month: { stem: 'Yang Fire',  branch: 'Dog',     stemHanja: '丙', branchHanja: '戌' },
    day:   { stem: 'Yang Wood',  branch: 'Rat',     stemHanja: '甲', branchHanja: '子' },
  },
  {
    date: '1991-05-17',
    year:  { stem: 'Yin Metal',  branch: 'Goat',    stemHanja: '辛', branchHanja: '未' },
    month: { stem: 'Yin Water',  branch: 'Snake',   stemHanja: '癸', branchHanja: '巳' },
    day:   { stem: 'Yin Fire',   branch: 'Pig',     stemHanja: '丁', branchHanja: '亥' },
  },
] as const;

describe('calculateSaju – fixture pillars', () => {
  for (const fx of FIXTURES) {
    it(`computes correct pillars for ${fx.date}`, () => {
      const chart = calculateSaju({ date: fx.date });

      expect(chart.pillars.year.stem).toBe(fx.year.stem);
      expect(chart.pillars.year.branch).toBe(fx.year.branch);
      expect(chart.pillars.year.stemHanja).toBe(fx.year.stemHanja);
      expect(chart.pillars.year.branchHanja).toBe(fx.year.branchHanja);

      expect(chart.pillars.month.stem).toBe(fx.month.stem);
      expect(chart.pillars.month.branch).toBe(fx.month.branch);

      expect(chart.pillars.day.stem).toBe(fx.day.stem);
      expect(chart.pillars.day.branch).toBe(fx.day.branch);
      expect(chart.pillars.day.stemHanja).toBe(fx.day.stemHanja);
      expect(chart.pillars.day.branchHanja).toBe(fx.day.branchHanja);
    });
  }
});

describe('calculateSaju – determinism', () => {
  it('returns identical results for repeated calls with same input', () => {
    const input = { date: '2000-11-02', time: '14:30' };
    expect(calculateSaju(input)).toEqual(calculateSaju(input));
  });
});

describe('calculateSaju – no-time input', () => {
  it('sets hour pillar to null and pillarsKnown to 6', () => {
    const chart = calculateSaju({ date: '2000-11-02' });
    expect(chart.pillars.hour).toBeNull();
    expect(chart.pillarsKnown).toBe(6);
  });

  it('sets hour pillar and pillarsKnown=8 when time is provided', () => {
    const chart = calculateSaju({ date: '2000-11-02', time: '08:20' });
    expect(chart.pillars.hour).not.toBeNull();
    expect(chart.pillarsKnown).toBe(8);
  });
});

describe('calculateSaju – 입춘(Ipchun) solar-term boundary', () => {
  // 2000-02-03 is before 입춘 (year pillar = 己卯 / Yin Earth Rabbit)
  // 2000-02-05 is after  입춘 (year pillar = 庚辰 / Yang Metal Dragon)
  it('2000-02-03 has year pillar 己卯 (Yin Earth/Rabbit) — before 입춘', () => {
    const chart = calculateSaju({ date: '2000-02-03' });
    expect(chart.pillars.year.stemHanja).toBe('己');
    expect(chart.pillars.year.branchHanja).toBe('卯');
    expect(chart.pillars.year.stem).toBe('Yin Earth');
    expect(chart.pillars.year.branch).toBe('Rabbit');
  });

  it('2000-02-05 has year pillar 庚辰 (Yang Metal/Dragon) — after 입춘', () => {
    const chart = calculateSaju({ date: '2000-02-05' });
    expect(chart.pillars.year.stemHanja).toBe('庚');
    expect(chart.pillars.year.branchHanja).toBe('辰');
    expect(chart.pillars.year.stem).toBe('Yang Metal');
    expect(chart.pillars.year.branch).toBe('Dragon');
  });

  it('year pillars differ across 입춘 boundary', () => {
    const before = calculateSaju({ date: '2000-02-03' });
    const after  = calculateSaju({ date: '2000-02-05' });
    expect(before.pillars.year.stemHanja).not.toBe(after.pillars.year.stemHanja);
  });
});

describe('getDailyPillars', () => {
  it('returns exactly the requested number of consecutive days', () => {
    const result = getDailyPillars('2000-11-02', 7);
    expect(result).toHaveLength(7);

    const dates = result.map(r => r.date);
    expect(dates[0]).toBe('2000-11-02');
    expect(dates[6]).toBe('2000-11-08');
    // each subsequent date is one day later
    for (let i = 1; i < result.length; i++) {
      const prev = new Date(dates[i - 1]);
      const curr = new Date(dates[i]);
      expect(curr.getTime() - prev.getTime()).toBe(86400000);
    }
  });

  it('each entry has valid stem, branch, and element', () => {
    const result = getDailyPillars('2000-11-02', 3);
    for (const dp of result) {
      expect(dp.stem).toBeTruthy();
      expect(dp.branch).toBeTruthy();
      expect(['wood', 'fire', 'earth', 'metal', 'water']).toContain(dp.element);
    }
  });
});
