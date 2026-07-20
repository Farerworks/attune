import { describe, it, expect } from 'vitest';
import { ILJU_PROFILES, getIljuProfile } from './iljuProfiles';
import { calculateSaju } from './saju';

const REQUIRED_STRING_FIELDS = [
  'name', 'subtitle', 'subtitleKo', 'essence', 'essenceKo', 'core', 'coreKo',
  'relating', 'relatingKo', 'underPressure', 'underPressureKo', 'reachingThem', 'reachingThemKo',
] as const;

const EXPECTED_TRADITION_KEYS = ['甲辰', '乙未', '丙戌', '丁丑', '戊辰', '壬戌', '癸丑', '庚辰', '壬辰', '戊戌', '庚戌'];

/** Every day-pillar ganzi in a 60-day window — the day cycle repeats exactly every 60 days. */
function collectValidDayGanzi(): Set<string> {
  const keys = new Set<string>();
  const start = new Date('2000-01-01T00:00:00Z');
  for (let i = 0; i < 60; i++) {
    const d = new Date(start.getTime() + i * 86_400_000);
    const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    const chart = calculateSaju({ date: dateStr });
    keys.add(chart.pillars.day.stemHanja + chart.pillars.day.branchHanja);
  }
  return keys;
}

describe('ILJU_PROFILES keys', () => {
  it('has exactly 60 entries', () => {
    expect(Object.keys(ILJU_PROFILES)).toHaveLength(60);
  });

  it('every key is a valid sexagenary combination per saju.ts (60-day day-pillar cycle)', () => {
    const validKeys = collectValidDayGanzi();
    expect(validKeys.size).toBe(60);
    for (const key of Object.keys(ILJU_PROFILES)) {
      expect(validKeys.has(key)).toBe(true);
    }
  });
});

describe('ILJU_PROFILES field completeness', () => {
  it('every profile has all required non-empty fields, and gifts/giftsKo have length 3', () => {
    const violations: string[] = [];
    for (const [key, profile] of Object.entries(ILJU_PROFILES)) {
      for (const field of REQUIRED_STRING_FIELDS) {
        const value = profile[field];
        if (typeof value !== 'string' || value.length === 0) violations.push(`${key}: ${field} is empty`);
      }
      if (profile.gifts.length !== 3) violations.push(`${key}: gifts length ${profile.gifts.length}`);
      if (profile.giftsKo.length !== 3) violations.push(`${key}: giftsKo length ${profile.giftsKo.length}`);
      for (const g of profile.gifts) if (!g) violations.push(`${key}: empty gifts entry`);
      for (const g of profile.giftsKo) if (!g) violations.push(`${key}: empty giftsKo entry`);
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });
});

describe('traditionNote — exactly the 11 white-tiger/goegang keys', () => {
  it('present only on the expected 11 keys, with matching KO counterpart', () => {
    const actualKeys = Object.entries(ILJU_PROFILES)
      .filter(([, p]) => p.traditionNote !== undefined)
      .map(([k]) => k)
      .sort();
    expect(actualKeys).toEqual([...EXPECTED_TRADITION_KEYS].sort());

    for (const [key, profile] of Object.entries(ILJU_PROFILES)) {
      if (EXPECTED_TRADITION_KEYS.includes(key)) {
        expect(profile.traditionNote, key).toBeTruthy();
        expect(profile.traditionNoteKo, key).toBeTruthy();
      } else {
        expect(profile.traditionNote, key).toBeUndefined();
        expect(profile.traditionNoteKo, key).toBeUndefined();
      }
    }
  });
});

describe('spot checks — verbatim text from ILJU-PROFILES.md', () => {
  it("ILJU_PROFILES['癸丑'].essence matches the source verbatim", () => {
    expect(ILJU_PROFILES['癸丑'].essence).toBe('Quiet on the surface, unbendable underneath.');
  });

  it("ILJU_PROFILES['甲子'].name matches the source verbatim", () => {
    expect(ILJU_PROFILES['甲子'].name).toBe('The First Light of the Rat');
  });

  it("ILJU_PROFILES['癸亥'].subtitle matches the source verbatim", () => {
    expect(ILJU_PROFILES['癸亥'].subtitle).toBe("The drop that remembers it's the ocean.");
  });
});

describe('getIljuProfile', () => {
  it('甲 + 子 -> a valid profile (a real sexagenary pair)', () => {
    const profile = getIljuProfile('甲', '子');
    expect(profile).not.toBeNull();
    expect(profile?.name).toBe('The First Light of the Rat');
  });

  it('甲 + 丑 -> null (양간은 양지하고만 짝을 이루므로 甲丑은 60갑자에 없음)', () => {
    expect(getIljuProfile('甲', '丑')).toBeNull();
  });
});
