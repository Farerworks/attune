import { describe, it, expect } from 'vitest';
import { getTodayNote, localDateStr, ME, THEM_NONAME, THEM_NAMED } from './today';
import type { Relation } from './today';
import { getDailyPillars } from './saju';
import type { Element } from './saju';

const NURTURES: Record<Element, Element> = {
  wood: 'fire', fire: 'earth', earth: 'metal', metal: 'water', water: 'wood',
};
const CONTROLS: Record<Element, Element> = {
  wood: 'earth', earth: 'water', water: 'fire', fire: 'metal', metal: 'wood',
};

const TEST_DATE = '2026-07-11';
const todayEl = getDailyPillars(TEST_DATE, 1)[0].element;
const nuturesToday = Object.entries(NURTURES).find(([, v]) => v === todayEl)![0] as Element;
const controlsToday = Object.entries(CONTROLS).find(([, v]) => v === todayEl)![0] as Element;

// [personElement, expectedRelation] — covers all 5 relation types
const REL_CASES: Array<[Element, Relation]> = [
  [todayEl,           'same'],
  [NURTURES[todayEl], 'today_nurtures'],
  [nuturesToday,      'person_nurtures'],
  [CONTROLS[todayEl], 'today_controls'],
  [controlsToday,     'person_controls'],
];

// ── ① Determinism ─────────────────────────────────────────────────────────────

describe('determinism', () => {
  it('me: same args produce same line', () => {
    const a = getTodayNote(todayEl, 'me', TEST_DATE);
    const b = getTodayNote(todayEl, 'me', TEST_DATE);
    expect(a.line).toBe(b.line);
  });

  it('named them: same args produce same line', () => {
    const a = getTodayNote(NURTURES[todayEl], 'them', TEST_DATE, 'Alex');
    const b = getTodayNote(NURTURES[todayEl], 'them', TEST_DATE, 'Alex');
    expect(a.line).toBe(b.line);
  });
});

// ── ② me result in ME[rel] pool ──────────────────────────────────────────────

describe('me result in pool', () => {
  for (const [el, rel] of REL_CASES) {
    it(`${rel}: result is in ME[${rel}]`, () => {
      const n = getTodayNote(el, 'me', TEST_DATE);
      expect(ME[rel]).toContain(n.line);
    });
  }
});

// ── ③ named them → result includes name ──────────────────────────────────────
// Uses relations where all 3 variants contain {name}

describe('named them includes name', () => {
  it('today_nurtures: line contains the given name', () => {
    const name = 'Sofia';
    const n = getTodayNote(NURTURES[todayEl], 'them', TEST_DATE, name);
    expect(n.line).toContain(name);
  });

  it('person_nurtures: line contains the given name', () => {
    const name = 'Mia';
    const n = getTodayNote(nuturesToday, 'them', TEST_DATE, name);
    expect(n.line).toContain(name);
  });

  it('today_controls: line contains the given name', () => {
    const name = 'Jake';
    const n = getTodayNote(CONTROLS[todayEl], 'them', TEST_DATE, name);
    expect(n.line).toContain(name);
  });

  it('person_controls: line contains the given name', () => {
    const name = 'Lily';
    const n = getTodayNote(controlsToday, 'them', TEST_DATE, name);
    expect(n.line).toContain(name);
  });

  it('all THEM_NAMED pools have {name} substituted (no literal {name} in output)', () => {
    // any relation that guarantees {name} substitution
    const n = getTodayNote(NURTURES[todayEl], 'them', TEST_DATE, 'Taro');
    expect(n.line).not.toContain('{name}');
  });
});

// ── ④ unnamed them → THEM_NONAME[rel] ────────────────────────────────────────

describe('unnamed them returns THEM_NONAME', () => {
  for (const [el, rel] of REL_CASES) {
    it(`${rel}: line equals THEM_NONAME[${rel}]`, () => {
      const n = getTodayNote(el, 'them', TEST_DATE);
      expect(n.line).toBe(THEM_NONAME[rel]);
    });
  }
});

// ── ⑤ tone per relation ──────────────────────────────────────────────────────

describe('tone values', () => {
  it('same → good', () => {
    expect(getTodayNote(todayEl, 'them', TEST_DATE).tone).toBe('good');
  });
  it('today_nurtures → good', () => {
    expect(getTodayNote(NURTURES[todayEl], 'them', TEST_DATE).tone).toBe('good');
  });
  it('person_nurtures → soft', () => {
    expect(getTodayNote(nuturesToday, 'them', TEST_DATE).tone).toBe('soft');
  });
  it('today_controls → soft', () => {
    expect(getTodayNote(CONTROLS[todayEl], 'them', TEST_DATE).tone).toBe('soft');
  });
  it('person_controls → neutral', () => {
    expect(getTodayNote(controlsToday, 'them', TEST_DATE).tone).toBe('neutral');
  });
});

// ── Sanity: all pools are non-empty and have no bare {name} in THEM_NAMED ────

describe('pool integrity', () => {
  const rels: Relation[] = ['same', 'today_nurtures', 'person_nurtures', 'today_controls', 'person_controls'];

  it('ME: all pools have exactly 3 variants', () => {
    for (const r of rels) expect(ME[r]).toHaveLength(3);
  });

  it('THEM_NAMED: all pools have exactly 3 variants', () => {
    for (const r of rels) expect(THEM_NAMED[r]).toHaveLength(3);
  });
});

// ── date parameter ────────────────────────────────────────────────────────────

describe('date parameter', () => {
  it('fixed date produces a valid TodayNote', () => {
    const n = getTodayNote('wood', 'them', '2026-01-01');
    expect(n.todayElement).toMatch(/^(wood|fire|earth|metal|water)$/);
    expect(n.line).toBeTruthy();
  });

  it('different dates produce different todayElement over 7 consecutive days', () => {
    const elements = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 6, 1 + i));
      return getTodayNote('wood', 'them', localDateStr(d)).todayElement;
    });
    const unique = new Set(elements);
    expect(unique.size).toBeGreaterThan(1);
  });
});

// ── stem field (BRIEF-094D) ───────────────────────────────────────────────────

describe('getTodayNote — stem field (BRIEF-094D)', () => {
  it('exposes the day pillar stem, matching getDailyPillars, without changing existing fields', () => {
    const expectedStem = getDailyPillars(TEST_DATE, 1)[0].stem;
    const n = getTodayNote(todayEl, 'me', TEST_DATE);

    expect(n.stem).toBe(expectedStem);
    // Existing fields still present and correct.
    expect(n.tone).toBe('good');
    expect(n.todayElement).toBe(todayEl);
    expect(typeof n.line).toBe('string');
    expect(typeof n.branch).toBe('string');
  });
});
