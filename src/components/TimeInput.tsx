'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { SegmentInput, SEGMENT_PLACEHOLDER_STYLE } from './DateInput';

type Ampm = 'AM' | 'PM' | '';

// ── Pure helpers ─────────────────────────────────────────────────────────────

export function parseTimeValue(value: string): { hour: string; minute: string; ampm: Ampm } {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return { hour: '', minute: '', ampm: '' };
  const h24 = parseInt(m[1], 10);
  const minute = m[2];
  if (h24 < 0 || h24 > 23) return { hour: '', minute: '', ampm: '' };
  const ampm: Ampm = h24 >= 12 ? 'PM' : 'AM';
  let hour12 = h24 % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour: String(hour12), minute, ampm };
}

export function formatTimeValue(hour: string, minute: string, ampm: Ampm): string {
  if (hour.length === 0 || minute.length !== 2 || ampm === '') return '';
  const hNum = parseInt(hour, 10);
  const mNum = parseInt(minute, 10);
  if (!Number.isInteger(hNum) || hNum < 1 || hNum > 12) return '';
  if (!Number.isInteger(mNum) || mNum < 0 || mNum > 59) return '';
  let h24 = hNum % 12;
  if (ampm === 'PM') h24 += 12;
  return `${String(h24).padStart(2, '0')}:${minute}`;
}

/** A lone first digit 2-9 can never extend to a valid 1-12 hour, so advance immediately. */
function hourComplete(digits: string): boolean {
  if (digits.length === 2) return true;
  if (digits.length === 1) return digits >= '2' && digits <= '9';
  return false;
}

// ── TimeInput ─────────────────────────────────────────────────────────────────

interface TimeInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
}

type TimeSeg = 'hour' | 'minute';

export function TimeInput({ id, value, onChange }: TimeInputProps) {
  const init = parseTimeValue(value);
  const [hour,   setHour]   = useState(init.hour);
  const [minute, setMinute] = useState(init.minute);
  const [ampm,   setAmpm]   = useState<Ampm>(init.ampm);
  const [focused, setFocused] = useState<TimeSeg | null>(null);

  const hourRef   = useRef<HTMLInputElement>(null);
  const minuteRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value !== formatTimeValue(hour, minute, ampm)) {
      const p = parseTimeValue(value);
      setHour(p.hour);
      setMinute(p.minute);
      setAmpm(p.ampm);
    }
  }, [value, hour, minute, ampm]);

  function handleHourChange(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 2);
    setHour(digits);
    if (hourComplete(digits)) minuteRef.current?.focus();
    onChange(formatTimeValue(digits, minute, ampm));
  }

  function handleMinuteChange(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 2);
    setMinute(digits);
    onChange(formatTimeValue(hour, digits, ampm));
  }

  function handleMinuteKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && minute === '') hourRef.current?.focus();
  }

  function handleAmpm(next: Ampm) {
    setAmpm(next);
    onChange(formatTimeValue(hour, minute, next));
  }

  const hourNum = hour.length > 0 ? parseInt(hour, 10) : NaN;
  const hourInvalid = hour.length > 0 && hourComplete(hour) && (hourNum < 1 || hourNum > 12);
  const minuteNum = minute.length === 2 ? parseInt(minute, 10) : NaN;
  const minuteInvalid = minute.length === 2 && (minuteNum < 0 || minuteNum > 59);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'var(--c-card)',
        border: `1px solid ${focused ? 'var(--c-vermilion)' : 'var(--c-hairline)'}`,
        borderRadius: 14, height: 52, padding: '0 16px',
      }}>
        <style>{SEGMENT_PLACEHOLDER_STYLE}</style>
        <SegmentInput
          id={id}
          value={hour} placeholder="HH" maxLength={2} invalid={hourInvalid}
          ariaLabel="Hour" inputRef={hourRef}
          onValueChange={handleHourChange}
          onFocus={() => setFocused('hour')}
          onBlur={() => setFocused(f => (f === 'hour' ? null : f))}
          onKeyDown={() => {}}
        />
        <span style={{ color: 'var(--c-muted)', fontFamily: 'var(--font-inter)' }}>:</span>
        <SegmentInput
          value={minute} placeholder="MM" maxLength={2} invalid={minuteInvalid}
          ariaLabel="Minute" inputRef={minuteRef}
          onValueChange={handleMinuteChange}
          onFocus={() => setFocused('minute')}
          onBlur={() => setFocused(f => (f === 'minute' ? null : f))}
          onKeyDown={handleMinuteKeyDown}
        />
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          className={`chip${ampm === 'AM' ? ' active' : ''}`}
          onClick={() => handleAmpm('AM')}
        >
          AM
        </button>
        <button
          type="button"
          className={`chip${ampm === 'PM' ? ' active' : ''}`}
          onClick={() => handleAmpm('PM')}
        >
          PM
        </button>
      </div>
    </div>
  );
}
