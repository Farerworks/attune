import { describe, it, expect } from 'vitest';
import { detectSinsal, getSinsalLabel, type Sinsal, type SinsalInput } from './sinsal';

describe('cheoneul (천을귀인)', () => {
  it('Yang Wood day + Ox present -> included', () => {
    const input: SinsalInput = { dayStem: 'Yang Wood', yearBranch: 'Ox', monthBranch: 'Snake', dayBranch: 'Dragon' };
    expect(detectSinsal(input)).toContain('cheoneul');
  });
  it('Yang Wood day without Ox/Goat anywhere -> not included', () => {
    const input: SinsalInput = { dayStem: 'Yang Wood', yearBranch: 'Tiger', monthBranch: 'Snake', dayBranch: 'Dragon' };
    expect(detectSinsal(input)).not.toContain('cheoneul');
  });
});

describe('munchang (문창귀인)', () => {
  it('Yang Wood day + Snake anywhere -> included', () => {
    const input: SinsalInput = { dayStem: 'Yang Wood', yearBranch: 'Snake', monthBranch: 'Tiger', dayBranch: 'Dragon' };
    expect(detectSinsal(input)).toContain('munchang');
  });

  it('policy: unknown hour branch is never assumed — Snake only in hour', () => {
    const withHour: SinsalInput = {
      dayStem: 'Yang Wood', yearBranch: 'Ox', monthBranch: 'Tiger', dayBranch: 'Dragon', hourBranch: 'Snake',
    };
    expect(detectSinsal(withHour)).toContain('munchang');

    const withoutHour: SinsalInput = {
      dayStem: 'Yang Wood', yearBranch: 'Ox', monthBranch: 'Tiger', dayBranch: 'Dragon',
    };
    expect(detectSinsal(withoutHour)).not.toContain('munchang');
  });
});

describe('dohwa (도화)', () => {
  it('year Rat (신자진국) + Rooster present -> included (year-branch basis)', () => {
    const input: SinsalInput = { dayStem: 'Yin Water', yearBranch: 'Rat', monthBranch: 'Rooster', dayBranch: 'Pig' };
    expect(detectSinsal(input)).toContain('dohwa');
  });
  it('day Horse (인오술국) + Rabbit present -> included (day-branch basis)', () => {
    const input: SinsalInput = { dayStem: 'Yin Water', yearBranch: 'Pig', monthBranch: 'Rabbit', dayBranch: 'Horse' };
    expect(detectSinsal(input)).toContain('dohwa');
  });
  it('no matching target branch -> not included', () => {
    const input: SinsalInput = { dayStem: 'Yin Water', yearBranch: 'Rat', monthBranch: 'Pig', dayBranch: 'Snake' };
    expect(detectSinsal(input)).not.toContain('dohwa');
  });
});

describe('yeokma (역마)', () => {
  it('year Monkey (신자진국) + Tiger present -> included', () => {
    const input: SinsalInput = { dayStem: 'Yin Water', yearBranch: 'Monkey', monthBranch: 'Tiger', dayBranch: 'Pig' };
    expect(detectSinsal(input)).toContain('yeokma');
  });
  it('day Goat (해묘미국) + Snake present -> included', () => {
    const input: SinsalInput = { dayStem: 'Yin Water', yearBranch: 'Pig', monthBranch: 'Snake', dayBranch: 'Goat' };
    expect(detectSinsal(input)).toContain('yeokma');
  });
});

describe('hwagae (화개)', () => {
  it('year Rat, month Dragon, day Dragon -> included (辰 appears twice)', () => {
    const input: SinsalInput = { dayStem: 'Yin Water', yearBranch: 'Rat', monthBranch: 'Dragon', dayBranch: 'Dragon' };
    expect(detectSinsal(input)).toContain('hwagae');
  });
  it('辰 appears only once -> not included', () => {
    const input: SinsalInput = { dayStem: 'Yin Water', yearBranch: 'Rat', monthBranch: 'Dragon', dayBranch: 'Pig' };
    expect(detectSinsal(input)).not.toContain('hwagae');
  });
});

describe('composite case from the brief', () => {
  it("Yin Water day, year Ox, month Pig, day Ox, hour Dog -> ['yeokma', 'hwagae']", () => {
    const input: SinsalInput = {
      dayStem: 'Yin Water', yearBranch: 'Ox', monthBranch: 'Pig', dayBranch: 'Ox', hourBranch: 'Dog',
    };
    expect(detectSinsal(input)).toEqual(['yeokma', 'hwagae']);
  });
});

describe('return order is always fixed: cheoneul, munchang, dohwa, yeokma, hwagae', () => {
  it('when all five are simultaneously present, they come back in this exact order', () => {
    // Yang Wood day: cheoneul targets Ox/Goat, munchang target Snake.
    // yearBranch=Goat (亥卯未 group: dohwa=Rat, yeokma=Snake, hwagae=Goat itself) —
    //   Goat satisfies cheoneul directly; dayBranch=Goat again gives hwagae its 2nd hit;
    //   monthBranch=Snake covers munchang + yeokma; hourBranch=Rat covers dohwa.
    const input: SinsalInput = {
      dayStem: 'Yang Wood',
      yearBranch: 'Goat',
      monthBranch: 'Snake',
      dayBranch: 'Goat',
      hourBranch: 'Rat',
    };
    expect(detectSinsal(input)).toEqual(['cheoneul', 'munchang', 'dohwa', 'yeokma', 'hwagae']);
  });
});

describe('getSinsalLabel', () => {
  const cases: Array<[Sinsal, string]> = [
    ['cheoneul', 'The Tailwind'],
    ['munchang', 'The Quill'],
    ['dohwa', 'The Spotlight'],
    ['yeokma', 'The Horizon'],
    ['hwagae', 'The Deep Forest'],
  ];

  it.each(cases)('%s -> %s', (sinsal, label) => {
    expect(getSinsalLabel(sinsal)).toBe(label);
  });
});
