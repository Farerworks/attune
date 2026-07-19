import { describe, it, expect } from 'vitest';
import { getQuickPrompts, PERSON_EN, PERSON_KO, GENERAL_EN, GENERAL_KO } from './askPrompts';

describe('getQuickPrompts', () => {
  it('is deterministic — same date + kind always yields the same result', () => {
    const a = getQuickPrompts('person', false, '2026-07-19');
    const b = getQuickPrompts('person', false, '2026-07-19');
    expect(a).toEqual(b);
  });

  it('returns 4 unique prompts for person and 3 unique prompts for general', () => {
    const person = getQuickPrompts('person', false, '2026-07-19');
    const general = getQuickPrompts('general', false, '2026-07-19');
    expect(person).toHaveLength(4);
    expect(new Set(person).size).toBe(4);
    expect(general).toHaveLength(3);
    expect(new Set(general).size).toBe(3);
  });

  it('uses the Korean pool when korean=true', () => {
    const person = getQuickPrompts('person', true, '2026-07-19');
    const general = getQuickPrompts('general', true, '2026-07-19');
    for (const p of person) {
      expect(PERSON_KO).toContain(p);
      expect(PERSON_EN).not.toContain(p);
    }
    for (const g of general) {
      expect(GENERAL_KO).toContain(g);
      expect(GENERAL_EN).not.toContain(g);
    }
  });

  it('produces varying combinations across different dates', () => {
    const dates = ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05', '2026-07-06', '2026-07-07', '2026-07-08'];
    const results = new Set(dates.map(d => getQuickPrompts('person', false, d).join('|')));
    expect(results.size).toBeGreaterThan(1);
  });

  it('always draws from the correct English pool for person/general', () => {
    for (let day = 1; day <= 15; day++) {
      const dateStr = `2026-09-${String(day).padStart(2, '0')}`;
      const person = getQuickPrompts('person', false, dateStr);
      const general = getQuickPrompts('general', false, dateStr);
      for (const p of person) expect(PERSON_EN).toContain(p);
      for (const g of general) expect(GENERAL_EN).toContain(g);
    }
  });
});
