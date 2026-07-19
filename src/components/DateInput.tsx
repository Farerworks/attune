'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';

// ── Pure validation helpers (unit-tested) ───────────────────────────────────────

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(month: number, year: number): number {
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days[month - 1] ?? 31;
}

export function isValidDate(
  month: number,
  day: number,
  year: number,
  refYear: number = new Date().getFullYear(),
): boolean {
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  if (!Number.isInteger(year) || year < 1900 || year > refYear) return false;
  if (!Number.isInteger(day) || day < 1 || day > daysInMonth(month, year)) return false;
  return true;
}

export function parseDateValue(value: string): { month: string; day: string; year: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return { month: '', day: '', year: '' };
  return { year: m[1], month: m[2], day: m[3] };
}

export function formatDateValue(month: string, day: string, year: string): string {
  if (month.length !== 2 || day.length !== 2 || year.length !== 4) return '';
  const mNum = parseInt(month, 10);
  const dNum = parseInt(day, 10);
  const yNum = parseInt(year, 10);
  if (!isValidDate(mNum, dNum, yNum)) return '';
  return `${year}-${month}-${day}`;
}

// ── Single-digit normalization ──────────────────────────────────────────────
// A lone digit that can never be followed by a second digit and stay valid
// (e.g. month "5" -> no valid 5X month) is padded + confirmed immediately.
// Anything else just waits — normalized on blur instead (see padSegment).

/** Generic blur-time fallback: "2" -> "02". Leaves complete/empty values alone. */
export function padSegment(value: string): string {
  return value.length === 1 ? `0${value}` : value;
}

export function applyMonthInstantConfirm(digits: string): string {
  return digits.length === 1 && digits >= '2' && digits <= '9' ? `0${digits}` : digits;
}

export function applyDayInstantConfirm(digits: string): string {
  return digits.length === 1 && digits >= '4' && digits <= '9' ? `0${digits}` : digits;
}

// ── Shared segment input (reused by TimeInput) ──────────────────────────────────

export interface SegmentInputProps {
  id?: string;
  value: string;
  placeholder: string;
  maxLength: number;
  invalid: boolean;
  wide?: boolean;
  ariaLabel: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onValueChange: (v: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
}

export function SegmentInput({
  id, value, placeholder, maxLength, invalid, wide, ariaLabel,
  inputRef, onValueChange, onFocus, onBlur, onKeyDown,
}: SegmentInputProps) {
  return (
    <input
      id={id}
      ref={inputRef}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      aria-label={ariaLabel}
      placeholder={placeholder}
      maxLength={maxLength}
      value={value}
      onChange={e => onValueChange(e.target.value)}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      className="attune-seg"
      style={{
        width: wide ? '4.4ch' : '2.4ch',
        border: 'none',
        outline: 'none',
        background: 'transparent',
        textAlign: 'center',
        fontFamily: 'var(--font-inter)',
        fontSize: 16,
        color: invalid ? 'var(--c-vermilion)' : 'var(--c-ink)',
        padding: 0,
      }}
    />
  );
}

export const SEGMENT_PLACEHOLDER_STYLE = `
  .attune-seg::placeholder {
    font-family: var(--font-space-mono);
    color: var(--c-muted);
    text-transform: uppercase;
  }
`;

// ── DateInput ─────────────────────────────────────────────────────────────────

interface DateInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
}

type DateSeg = 'month' | 'day' | 'year';

export function DateInput({ id, value, onChange }: DateInputProps) {
  const init = parseDateValue(value);
  const [month, setMonth] = useState(init.month);
  const [day,   setDay]   = useState(init.day);
  const [year,  setYear]  = useState(init.year);
  const [focused, setFocused] = useState<DateSeg | null>(null);

  const monthRef = useRef<HTMLInputElement>(null);
  const dayRef   = useRef<HTMLInputElement>(null);
  const yearRef  = useRef<HTMLInputElement>(null);

  // Only resync from an externally-changed value (e.g. edit-mode prefill) —
  // skips when value === our own just-committed segments, so in-progress
  // typing (which round-trips through onChange) is never clobbered.
  useEffect(() => {
    if (value !== formatDateValue(month, day, year)) {
      const p = parseDateValue(value);
      setMonth(p.month);
      setDay(p.day);
      setYear(p.year);
    }
  }, [value, month, day, year]);

  function handleChange(seg: DateSeg, raw: string) {
    const maxLen = seg === 'year' ? 4 : 2;
    let digits = raw.replace(/\D/g, '').slice(0, maxLen);
    if (seg === 'month') digits = applyMonthInstantConfirm(digits);
    if (seg === 'day')   digits = applyDayInstantConfirm(digits);

    let m = month, d = day, y = year;
    if (seg === 'month') { m = digits; setMonth(digits); if (digits.length === maxLen) dayRef.current?.focus(); }
    if (seg === 'day')   { d = digits; setDay(digits);   if (digits.length === maxLen) yearRef.current?.focus(); }
    if (seg === 'year')  { y = digits; setYear(digits); }
    onChange(formatDateValue(m, d, y));
  }

  function handleKeyDown(seg: DateSeg, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Backspace') return;
    if (seg === 'day' && day === '') monthRef.current?.focus();
    if (seg === 'year' && year === '') dayRef.current?.focus();
  }

  function handleBlur(seg: DateSeg) {
    setFocused(f => (f === seg ? null : f));
    if (seg === 'year') return; // year stays unpadded — 4 digits or nothing

    // Read the live DOM value, not the closure's state — a blur triggered
    // synchronously by our own auto-advance focus() call (e.g. after typing
    // month's 2nd digit) fires before React re-renders, so the `month`/`day`
    // state variables in this closure would still be one keystroke stale.
    const liveMonth = monthRef.current?.value ?? month;
    const liveDay   = dayRef.current?.value ?? day;
    const liveYear  = yearRef.current?.value ?? year;

    if (seg === 'month' && liveMonth.length === 1) {
      const padded = padSegment(liveMonth);
      setMonth(padded);
      onChange(formatDateValue(padded, liveDay, liveYear));
    }
    if (seg === 'day' && liveDay.length === 1) {
      const padded = padSegment(liveDay);
      setDay(padded);
      onChange(formatDateValue(liveMonth, padded, liveYear));
    }
  }

  const monthNum = month.length === 2 ? parseInt(month, 10) : NaN;
  const yearNum  = year.length === 4 ? parseInt(year, 10) : NaN;
  const dayNum   = day.length === 2 ? parseInt(day, 10) : NaN;

  const monthInvalid = month.length === 2 && (monthNum < 1 || monthNum > 12);
  const yearInvalid  = year.length === 4 && (yearNum < 1900 || yearNum > new Date().getFullYear());
  const dayMax       = daysInMonth(!monthInvalid && month.length === 2 ? monthNum : 1, !yearInvalid && year.length === 4 ? yearNum : 2000);
  const dayInvalid   = day.length === 2 && (dayNum < 1 || dayNum > dayMax);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      background: 'var(--c-card)',
      border: `1px solid ${focused ? 'var(--c-vermilion)' : 'var(--c-hairline)'}`,
      borderRadius: 14, height: 52, padding: '0 16px',
    }}>
      <style>{SEGMENT_PLACEHOLDER_STYLE}</style>
      <SegmentInput
        id={id}
        value={month} placeholder="MM" maxLength={2} invalid={monthInvalid}
        ariaLabel="Month" inputRef={monthRef}
        onValueChange={v => handleChange('month', v)}
        onFocus={() => setFocused('month')}
        onBlur={() => handleBlur('month')}
        onKeyDown={e => handleKeyDown('month', e)}
      />
      <span style={{ color: 'var(--c-muted)', fontFamily: 'var(--font-inter)' }}>/</span>
      <SegmentInput
        value={day} placeholder="DD" maxLength={2} invalid={dayInvalid}
        ariaLabel="Day" inputRef={dayRef}
        onValueChange={v => handleChange('day', v)}
        onFocus={() => setFocused('day')}
        onBlur={() => handleBlur('day')}
        onKeyDown={e => handleKeyDown('day', e)}
      />
      <span style={{ color: 'var(--c-muted)', fontFamily: 'var(--font-inter)' }}>/</span>
      <SegmentInput
        value={year} placeholder="YYYY" maxLength={4} invalid={yearInvalid} wide
        ariaLabel="Year" inputRef={yearRef}
        onValueChange={v => handleChange('year', v)}
        onFocus={() => setFocused('year')}
        onBlur={() => handleBlur('year')}
        onKeyDown={e => handleKeyDown('year', e)}
      />
    </div>
  );
}
