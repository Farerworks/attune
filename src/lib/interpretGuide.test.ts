import { describe, it, expect } from 'vitest';
import { getArchetype, getElementRelationship, ARCHETYPES } from './interpretGuide';
import type { TenStem } from './saju';

const ALL_STEMS: TenStem[] = [
  'Yang Wood', 'Yin Wood',
  'Yang Fire', 'Yin Fire',
  'Yang Earth', 'Yin Earth',
  'Yang Metal', 'Yin Metal',
  'Yang Water', 'Yin Water',
];

// ── getArchetype ─────────────────────────────────────────────────────────────

describe('getArchetype', () => {
  it('returns an archetype for all 10 TenStem values', () => {
    for (const stem of ALL_STEMS) {
      const a = getArchetype(stem);
      expect(a, `missing archetype for ${stem}`).toBeDefined();
      expect(a.hanja).toBeTruthy();
      expect(a.coreDrive).toBeTruthy();
      expect(a.communication).toBeTruthy();
      expect(a.stress).toBeTruthy();
    }
  });

  it('Yang Wood archetype has correct hanja 甲', () => {
    expect(getArchetype('Yang Wood').hanja).toBe('甲');
  });

  it('Yin Water archetype has correct hanja 癸', () => {
    expect(getArchetype('Yin Water').hanja).toBe('癸');
  });

  it('all 10 hanja are distinct', () => {
    const hanjaSet = new Set(ALL_STEMS.map(s => getArchetype(s).hanja));
    expect(hanjaSet.size).toBe(10);
  });

  it('ARCHETYPES record and getArchetype() return the same object', () => {
    expect(getArchetype('Yang Fire')).toBe(ARCHETYPES['Yang Fire']);
  });
});

// ── getElementRelationship ───────────────────────────────────────────────────

describe('getElementRelationship', () => {
  it('identical day master → contains "mirror" or "Identical"', () => {
    const result = getElementRelationship('Yang Wood', 'Yang Wood');
    expect(result.toLowerCase()).toMatch(/identical|mirror/);
  });

  it('same element different polarity → contains "same element"', () => {
    // Sample scenario: me=Yin Wood, them=Yang Wood
    const result = getElementRelationship('Yin Wood', 'Yang Wood');
    expect(result.toLowerCase()).toContain('same element');
  });

  it('same element different polarity → mentions both day master names', () => {
    const result = getElementRelationship('Yin Wood', 'Yang Wood');
    expect(result).toContain('Yin Wood');
    expect(result).toContain('Yang Wood');
  });

  it('wood nurtures fire — I nurture them → contains "nurtures" and elements', () => {
    const result = getElementRelationship('Yang Wood', 'Yang Fire');
    expect(result.toLowerCase()).toContain('nurtures');
    expect(result.toLowerCase()).toContain('wood');
    expect(result.toLowerCase()).toContain('fire');
  });

  it('fire nurtures earth — they nurture me → contains "nurtures" (their)', () => {
    // me=Yang Earth, them=Yang Fire → fire nurtures earth → their fire nurtures my earth
    const result = getElementRelationship('Yang Earth', 'Yang Fire');
    expect(result.toLowerCase()).toContain('nurtures');
    expect(result).toMatch(/[Tt]heir/);
  });

  it('wood controls earth — I control them → contains "controls" (your)', () => {
    const result = getElementRelationship('Yang Wood', 'Yang Earth');
    expect(result.toLowerCase()).toContain('controls');
    expect(result).toMatch(/[Yy]our/);
  });

  it('metal controls wood — they control me → contains "controls" (their)', () => {
    const result = getElementRelationship('Yang Wood', 'Yang Metal');
    expect(result.toLowerCase()).toContain('controls');
    expect(result).toMatch(/[Tt]heir/);
  });

  it('all 20 ordered element pairs return a non-empty string', () => {
    const elements: TenStem[] = [
      'Yang Wood', 'Yang Fire', 'Yang Earth', 'Yang Metal', 'Yang Water',
    ];
    for (const me of elements) {
      for (const them of elements) {
        if (me === them) continue;
        const result = getElementRelationship(me, them);
        expect(result, `${me} × ${them} returned empty`).toBeTruthy();
        expect(result.length, `${me} × ${them} too short`).toBeGreaterThan(20);
      }
    }
  });
});
