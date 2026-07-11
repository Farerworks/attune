import { describe, it, expect } from 'vitest';
import { getTodayNote, localDateStr } from './today';
import { getDailyPillars } from './saju';
import type { Element } from './saju';

// Derived from today.ts — tested in isolation so we don't import the private tables
const NURTURES: Record<Element, Element> = {
  wood: 'fire', fire: 'earth', earth: 'metal', metal: 'water', water: 'wood',
};
const CONTROLS: Record<Element, Element> = {
  wood: 'earth', earth: 'water', water: 'fire', fire: 'metal', metal: 'wood',
};

// Fixed date: element is computed dynamically so tests stay valid regardless of cycle
const TEST_DATE = '2026-07-11';
const todayEl = getDailyPillars(TEST_DATE, 1)[0].element;

// Helpers: find what nurtures / controls todayEl
const nuturesToday = Object.entries(NURTURES).find(([, v]) => v === todayEl)![0] as Element;
const controlsToday = Object.entries(CONTROLS).find(([, v]) => v === todayEl)![0] as Element;

// ── mode 'them' ───────────────────────────────────────────────────────────────

describe('getTodayNote mode=them', () => {
  it('same element → good, "Same wavelength today. Reach out."', () => {
    const n = getTodayNote(todayEl, 'them', TEST_DATE);
    expect(n.tone).toBe('good');
    expect(n.line).toBe('Same wavelength today. Reach out.');
    expect(n.todayElement).toBe(todayEl);
  });

  it('today nurtures person → good, receptive copy', () => {
    const n = getTodayNote(NURTURES[todayEl], 'them', TEST_DATE);
    expect(n.tone).toBe('good');
    expect(n.line).toBe("They're receptive today. Good day to reach out.");
  });

  it('person nurtures today → soft, energy runs low copy', () => {
    const n = getTodayNote(nuturesToday, 'them', TEST_DATE);
    expect(n.tone).toBe('soft');
    expect(n.line).toBe('Their energy runs low today. Be patient.');
  });

  it('today controls person → soft, feels pressed copy', () => {
    const n = getTodayNote(CONTROLS[todayEl], 'them', TEST_DATE);
    expect(n.tone).toBe('soft');
    expect(n.line).toBe('They may feel pressed today. Keep it light.');
  });

  it('person controls today → neutral, steering copy', () => {
    const n = getTodayNote(controlsToday, 'them', TEST_DATE);
    expect(n.tone).toBe('neutral');
    expect(n.line).toBe("They're steering today. Let them lead.");
  });
});

// ── mode 'me' ─────────────────────────────────────────────────────────────────

describe('getTodayNote mode=me', () => {
  it('same element → good, "You\'re in your element today."', () => {
    const n = getTodayNote(todayEl, 'me', TEST_DATE);
    expect(n.tone).toBe('good');
    expect(n.line).toBe("You're in your element today.");
  });

  it('today nurtures me → good, tailwind copy', () => {
    const n = getTodayNote(NURTURES[todayEl], 'me', TEST_DATE);
    expect(n.tone).toBe('good');
    expect(n.line).toBe('Tailwind day. Start the thing.');
  });

  it('I nurture today → soft, guard energy copy', () => {
    const n = getTodayNote(nuturesToday, 'me', TEST_DATE);
    expect(n.tone).toBe('soft');
    expect(n.line).toBe('Giving-out day. Guard your energy.');
  });

  it('today controls me → soft, friction copy', () => {
    const n = getTodayNote(CONTROLS[todayEl], 'me', TEST_DATE);
    expect(n.tone).toBe('soft');
    expect(n.line).toBe('Friction day. Move slower.');
  });

  it('I control today → neutral, set the pace copy', () => {
    const n = getTodayNote(controlsToday, 'me', TEST_DATE);
    expect(n.tone).toBe('neutral');
    expect(n.line).toBe('You set the pace today.');
  });
});

// ── date injection ─────────────────────────────────────────────────────────────

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
