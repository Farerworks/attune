import { describe, it, expect } from 'vitest';
import { getDailyDoDont, getFlowDays, pickAheadLines, DO_EN, DONT_EN, DO_KO, DONT_KO } from './homeCopy';
import { ME, ME_KO } from './today';

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

  it('exposes each day\'s dayElement (BRIEF-094D)', () => {
    const days = getFlowDays('fire', false, '2026-07-19');
    for (const d of days) {
      expect(['wood', 'fire', 'earth', 'metal', 'water']).toContain(d.dayElement);
    }
  });
});

describe('pickAheadLines (BRIEF-101 §2)', () => {
  const pool = ME.same; // real 3-item pool: index 0/1/2 as written in today.ts
  // 2026-08-06 -> dayIndex%3===1, 2026-08-07 -> ===2 (consecutive), 2026-08-09 -> ===1 (same as 08-06, 3 days apart).
  const D1 = '2026-08-06';
  const D2 = '2026-08-07';
  const D3 = '2026-08-09';

  it('① same input called twice -> identical output (re-render stability)', () => {
    const a = pickAheadLines([D1, D2], [pool, pool], []);
    const b = pickAheadLines([D1, D2], [pool, pool], []);
    expect(a).toEqual(b);
  });

  it('② same relation, 2 consecutive dates -> different variants', () => {
    const [a, b] = pickAheadLines([D1, D2], [pool, pool], []);
    expect(a).not.toBe(b);
    expect(a).toBe(pool[1]);
    expect(b).toBe(pool[2]);
  });

  it('③ a candidate that collides with `avoid` is skipped', () => {
    const [a] = pickAheadLines([D1], [pool], [pool[1]]); // D1's natural pick is pool[1]
    expect(a).not.toBe(pool[1]);
    expect(a).toBe(pool[2]); // next index over
  });

  it('④ same relation, 2 dates whose natural start index collides -> results still differ from each other', () => {
    const [a, b] = pickAheadLines([D1, D3], [pool, pool], []); // both naturally start at index 1
    expect(a).toBe(pool[1]);
    expect(b).not.toBe(a);
    expect(b).toBe(pool[2]);
  });

  it('⑤ worst case — today + both AHEAD days share a relation and a start index; avoid + 2 picks are all 3 pool sentences, mutually distinct', () => {
    const avoid = [pool[1]]; // stands in for today's already-picked line
    const [a, b] = pickAheadLines([D1, D3], [pool, pool], avoid); // both naturally collide with avoid too
    expect(a).not.toBe(avoid[0]);
    expect(b).not.toBe(avoid[0]);
    expect(a).not.toBe(b);
    // With all 3 sentences distinct, this exhausts the whole pool: {avoid[0], a, b} === the full pool.
    expect(new Set([avoid[0], a, b])).toEqual(new Set(pool));
  });

  it('⑥ production premise, locked: every ME/ME_KO relation pool has exactly 3 distinct sentences', () => {
    for (const table of [ME, ME_KO]) {
      for (const rel of Object.keys(table) as Array<keyof typeof table>) {
        const p = table[rel];
        expect(p).toHaveLength(3);
        expect(new Set(p).size).toBe(3);
      }
    }
  });

  it('is a pure function — no Math.random/Date.now/no-arg new Date() involved (repeat calls across "days" stay pinned to the given date)', () => {
    const calls = Array.from({ length: 5 }, () => pickAheadLines([D1], [pool], []));
    for (const c of calls) expect(c).toEqual(calls[0]);
  });
});
