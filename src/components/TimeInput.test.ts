import { describe, it, expect } from 'vitest';
import { parseTimeValue, formatTimeValue, applyHourInstantConfirm, applyMinuteInstantConfirm } from './TimeInput';

describe('applyHourInstantConfirm', () => {
  it('instantly confirms a first digit 2-9 (no valid 12h hour extends it)', () => {
    expect(applyHourInstantConfirm('9')).toBe('09');
    expect(applyHourInstantConfirm('2')).toBe('02');
  });
  it('waits on a first digit of 1 (10, 11, 12 are all valid)', () => {
    expect(applyHourInstantConfirm('1')).toBe('1');
  });
  it('leaves an already-complete 2-digit value alone', () => {
    expect(applyHourInstantConfirm('11')).toBe('11');
  });
});

describe('applyMinuteInstantConfirm', () => {
  it('instantly confirms a first digit 6-9 (06-09, no 60+ minute exists)', () => {
    expect(applyMinuteInstantConfirm('6')).toBe('06');
    expect(applyMinuteInstantConfirm('9')).toBe('09');
  });
  it('waits on first digits 0-5 (00-59 still possible)', () => {
    expect(applyMinuteInstantConfirm('0')).toBe('0');
    expect(applyMinuteInstantConfirm('5')).toBe('5');
  });
});

describe('formatTimeValue (regression — 12h -> 24h conversion)', () => {
  it('converts 9:30 AM to 09:30', () => {
    expect(formatTimeValue('09', '30', 'AM')).toBe('09:30');
  });
  it('converts 9:30 PM to 21:30', () => {
    expect(formatTimeValue('09', '30', 'PM')).toBe('21:30');
  });
  it('returns empty string when ampm is not chosen', () => {
    expect(formatTimeValue('09', '30', '')).toBe('');
  });
});

describe('parseTimeValue', () => {
  it('parses 24h HH:MM back into 12h segments', () => {
    expect(parseTimeValue('21:30')).toEqual({ hour: '9', minute: '30', ampm: 'PM' });
  });
  it('returns empty segments for an empty string', () => {
    expect(parseTimeValue('')).toEqual({ hour: '', minute: '', ampm: '' });
  });
});
