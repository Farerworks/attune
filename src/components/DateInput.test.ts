import { describe, it, expect } from 'vitest';
import { isLeapYear, daysInMonth, isValidDate, parseDateValue, formatDateValue } from './DateInput';

describe('isLeapYear', () => {
  it('2024 is a leap year', () => {
    expect(isLeapYear(2024)).toBe(true);
  });
  it('2023 is not a leap year', () => {
    expect(isLeapYear(2023)).toBe(false);
  });
  it('2000 is a leap year (divisible by 400)', () => {
    expect(isLeapYear(2000)).toBe(true);
  });
  it('1900 is not a leap year (divisible by 100 but not 400)', () => {
    expect(isLeapYear(1900)).toBe(false);
  });
});

describe('daysInMonth', () => {
  it('February has 29 days in a leap year', () => {
    expect(daysInMonth(2, 2024)).toBe(29);
  });
  it('February has 28 days in a non-leap year', () => {
    expect(daysInMonth(2, 2023)).toBe(28);
  });
  it('April has 30 days', () => {
    expect(daysInMonth(4, 2023)).toBe(30);
  });
  it('January has 31 days', () => {
    expect(daysInMonth(1, 2023)).toBe(31);
  });
});

describe('isValidDate', () => {
  it('Feb 29 is valid in a leap year', () => {
    expect(isValidDate(2, 29, 2024)).toBe(true);
  });
  it('Feb 29 is invalid in a non-leap year', () => {
    expect(isValidDate(2, 29, 2023)).toBe(false);
  });
  it('month 13 is invalid', () => {
    expect(isValidDate(13, 1, 2000)).toBe(false);
  });
  it('day 0 is invalid', () => {
    expect(isValidDate(1, 0, 2000)).toBe(false);
  });
  it('a normal valid date passes', () => {
    expect(isValidDate(3, 14, 2003)).toBe(true);
  });
  it('a future year is invalid', () => {
    expect(isValidDate(1, 1, 2030, 2026)).toBe(false);
  });
  it('year below 1900 is invalid', () => {
    expect(isValidDate(1, 1, 1899)).toBe(false);
  });
  it('year exactly at refYear is valid', () => {
    expect(isValidDate(1, 1, 2026, 2026)).toBe(true);
  });
});

describe('parseDateValue', () => {
  it('parses a well-formed YYYY-MM-DD string', () => {
    expect(parseDateValue('2003-03-14')).toEqual({ month: '03', day: '14', year: '2003' });
  });
  it('returns empty segments for an empty string', () => {
    expect(parseDateValue('')).toEqual({ month: '', day: '', year: '' });
  });
  it('returns empty segments for a malformed string', () => {
    expect(parseDateValue('not-a-date')).toEqual({ month: '', day: '', year: '' });
  });
});

describe('formatDateValue', () => {
  it('formats complete valid segments into YYYY-MM-DD', () => {
    expect(formatDateValue('03', '14', '2003')).toBe('2003-03-14');
  });
  it('returns empty string for incomplete segments', () => {
    expect(formatDateValue('03', '1', '2003')).toBe('');
    expect(formatDateValue('3', '14', '2003')).toBe('');
    expect(formatDateValue('03', '14', '203')).toBe('');
  });
  it('returns empty string for an invalid date (Feb 30)', () => {
    expect(formatDateValue('02', '30', '2023')).toBe('');
  });
});
