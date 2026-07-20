import { describe, it, expect } from 'vitest';
import {
  LENS_FRAGMENTS, SIGNAL_FRAGMENTS, MIXED_SIGNAL_FRAGMENT, SINSAL_FRAGMENTS, SINSAL_PRIORITY,
  LENS_INSTRUCTION, SIGNALS_INSTRUCTION, SINSAL_INSTRUCTION,
} from './promptFragments';

const INTERNAL_LABELS = [
  'The Mirror', 'The Spark', 'The Anchor', 'The Compass', 'The Root',
  'The Tailwind', 'The Quill', 'The Spotlight', 'The Horizon', 'The Deep Forest',
];

describe('LENS_FRAGMENTS', () => {
  it('has exactly the 5 TenGodGroup keys, each a non-empty string', () => {
    expect(Object.keys(LENS_FRAGMENTS).sort()).toEqual(['anchor', 'compass', 'mirror', 'root', 'spark']);
    for (const value of Object.values(LENS_FRAGMENTS)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });
});

describe('SIGNAL_FRAGMENTS', () => {
  it('has exactly the 6 PairRelation keys, each a non-empty string', () => {
    expect(Object.keys(SIGNAL_FRAGMENTS).sort()).toEqual(
      ['hae', 'hyeong', 'jahyeong', 'pa', 'yukchung', 'yukhap'],
    );
    for (const value of Object.values(SIGNAL_FRAGMENTS)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('pa and hae share identical fragment text (per PROMPT-SPEC)', () => {
    expect(SIGNAL_FRAGMENTS.pa).toBe(SIGNAL_FRAGMENTS.hae);
  });
});

describe('MIXED_SIGNAL_FRAGMENT', () => {
  it('is a non-empty string', () => {
    expect(typeof MIXED_SIGNAL_FRAGMENT).toBe('string');
    expect(MIXED_SIGNAL_FRAGMENT.length).toBeGreaterThan(0);
  });
});

describe('SINSAL_FRAGMENTS', () => {
  it('has exactly the 5 Sinsal keys, each a non-empty string', () => {
    expect(Object.keys(SINSAL_FRAGMENTS).sort()).toEqual(
      ['cheoneul', 'dohwa', 'hwagae', 'munchang', 'yeokma'],
    );
    for (const value of Object.values(SINSAL_FRAGMENTS)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });
});

describe('SINSAL_PRIORITY', () => {
  it('is the fixed order: cheoneul, munchang, dohwa, yeokma, hwagae', () => {
    expect(SINSAL_PRIORITY).toEqual(['cheoneul', 'munchang', 'dohwa', 'yeokma', 'hwagae']);
  });
});

describe('instruction strings', () => {
  it('LENS_INSTRUCTION, SIGNALS_INSTRUCTION, SINSAL_INSTRUCTION are non-empty', () => {
    expect(LENS_INSTRUCTION.length).toBeGreaterThan(0);
    expect(SIGNALS_INSTRUCTION.length).toBeGreaterThan(0);
    expect(SINSAL_INSTRUCTION.length).toBeGreaterThan(0);
  });
});

describe('no internal label leakage at the fragment-source level', () => {
  it('none of the 10 internal label strings appear inside any fragment or instruction text', () => {
    const allTexts = [
      ...Object.values(LENS_FRAGMENTS),
      ...Object.values(SIGNAL_FRAGMENTS),
      MIXED_SIGNAL_FRAGMENT,
      ...Object.values(SINSAL_FRAGMENTS),
      LENS_INSTRUCTION,
      SIGNALS_INSTRUCTION,
      SINSAL_INSTRUCTION,
    ].join(' ');

    for (const label of INTERNAL_LABELS) {
      expect(allTexts).not.toContain(label);
    }
  });
});
