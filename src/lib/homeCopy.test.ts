import { describe, it, expect } from 'vitest';
import { getDailyDoDont, getFlowDays, DO_EN, DONT_EN, DO_KO, DONT_KO } from './homeCopy';

describe('getDailyDoDont', () => {
  it('is deterministic — same date + element always yields the same result', () => {
    const a = getDailyDoDont('wood', false, '2026-07-19');
    const b = getDailyDoDont('wood', false, '2026-07-19');
    expect(a).toEqual(b);
  });

  it('returns two distinct Do sentences', () => {
    const { dos } = getDailyDoDont('fire', false, '2026-07-19');
    expect(dos[0]).not.toBe(dos[1]);
  });

  it('returns two distinct Don\'t sentences', () => {
    const { donts } = getDailyDoDont('earth', false, '2026-07-19');
    expect(donts[0]).not.toBe(donts[1]);
  });

  it('uses the Korean pool when korean=true', () => {
    const { dos, donts } = getDailyDoDont('metal', true, '2026-07-19');
    const allKo = [...Object.values(DO_KO).flat(), ...Object.values(DONT_KO).flat()];
    const allEn = [...Object.values(DO_EN).flat(), ...Object.values(DONT_EN).flat()];
    for (const line of [...dos, ...donts]) {
      expect(allKo).toContain(line);
      expect(allEn).not.toContain(line);
    }
  });

  it('stays distinct across many dates (no crash / always 2 unique per side)', () => {
    for (let day = 1; day <= 28; day++) {
      const dateStr = `2026-08-${String(day).padStart(2, '0')}`;
      const { dos, donts } = getDailyDoDont('water', false, dateStr);
      expect(dos[0]).not.toBe(dos[1]);
      expect(donts[0]).not.toBe(donts[1]);
    }
  });
});

describe('getFlowDays', () => {
  it('returns 14 days starting from the given date', () => {
    const days = getFlowDays('wood', false, '2026-07-19');
    expect(days).toHaveLength(14);
    expect(days[0].date).toBe('2026-07-19');
  });

  it('is deterministic for the same inputs', () => {
    const a = getFlowDays('wood', false, '2026-07-19');
    const b = getFlowDays('wood', false, '2026-07-19');
    expect(a).toEqual(b);
  });

  it('assigns each day a tone of good, soft, or neutral', () => {
    const days = getFlowDays('fire', false, '2026-07-19');
    for (const d of days) {
      expect(['good', 'soft', 'neutral']).toContain(d.tone);
    }
  });
});
