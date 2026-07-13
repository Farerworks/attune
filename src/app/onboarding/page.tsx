'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { getProfile, setProfile } from '@/lib/store';
import { SmartBackLink } from '@/components/InAppNav';

const GENDER_OPTIONS = ['She/Her', 'He/Him', 'They/Them'];

export default function OnboardingPage() {
  const router = useRouter();
  const wasEdit = useRef(false);
  const [name,   setName]     = useState('');
  const [date, setDate]       = useState('');
  const [time, setTime]       = useState('');
  const [gender, setGender]   = useState('');

  useEffect(() => {
    const profile = getProfile();
    if (profile !== null) {
      wasEdit.current = true;
      setName(profile.name ?? '');
      setDate(profile.date);
      setTime(profile.time ?? '');
      setGender(profile.gender ?? '');
    }
  }, []);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!date) return;
    setProfile({
      date, time: time || undefined, gender: gender || undefined, name: name.trim() || undefined,
      createdAt: getProfile()?.createdAt ?? new Date().toISOString(),
    });
    router.push(wasEdit.current ? '/you' : '/reveal');
  }

  return (
    <div
      style={{
        minHeight: '100svh',
        background: 'var(--c-paper)',
        padding: '48px 24px 40px',
      }}
    >
      {/* Back + Wordmark */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40 }}>
        <SmartBackLink />
        <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--c-ink)' }}>
          ATTUNE
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <h1
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontSize: 34,
            lineHeight: 1.2,
            letterSpacing: '-0.01em',
            color: 'var(--c-ink)',
            marginBottom: 8,
          }}
        >
          First, you.
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-inter)',
            fontSize: 15,
            color: 'var(--c-muted)',
            marginBottom: 36,
            lineHeight: 1.5,
          }}
        >
          Your birth info lets Attune calibrate readings to your dynamic with others. One-time setup — saved on this device only.
        </p>

        {/* Name */}
        <div style={{ marginBottom: 20 }}>
          <label
            htmlFor="uname"
            style={{
              display: 'block',
              fontFamily: 'var(--font-inter)',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--c-ink)',
              marginBottom: 8,
              letterSpacing: '0.01em',
            }}
          >
            Your name <span style={{ color: 'var(--c-muted)', fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            id="uname"
            type="text"
            className="field-input"
            placeholder="What should we call you?"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>

        {/* Date of birth */}
        <div style={{ marginBottom: 20 }}>
          <label
            htmlFor="dob"
            style={{
              display: 'block',
              fontFamily: 'var(--font-inter)',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--c-ink)',
              marginBottom: 8,
              letterSpacing: '0.01em',
            }}
          >
            Date of birth <span style={{ color: 'var(--c-vermilion)' }}>*</span>
          </label>
          <input
            id="dob"
            type="date"
            required
            className="field-input"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </div>

        {/* Birth time */}
        <div style={{ marginBottom: 8 }}>
          <label
            htmlFor="btime"
            style={{
              display: 'block',
              fontFamily: 'var(--font-inter)',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--c-ink)',
              marginBottom: 8,
              letterSpacing: '0.01em',
            }}
          >
            Birth time <span style={{ color: 'var(--c-muted)', fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            id="btime"
            type="time"
            className="field-input"
            value={time}
            onChange={e => setTime(e.target.value)}
          />
        </div>
        <p
          style={{
            fontFamily: 'var(--font-inter)',
            fontSize: 12,
            color: 'var(--c-muted)',
            marginBottom: 28,
            lineHeight: 1.4,
          }}
        >
          Don&apos;t know it? No problem — we&apos;ll read 6 of 8 pillars.
        </p>

        {/* Gender chips */}
        <div style={{ marginBottom: 40 }}>
          <label
            style={{
              display: 'block',
              fontFamily: 'var(--font-inter)',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--c-ink)',
              marginBottom: 10,
              letterSpacing: '0.01em',
            }}
          >
            Gender <span style={{ color: 'var(--c-muted)', fontWeight: 400 }}>(optional)</span>
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {GENDER_OPTIONS.map(opt => (
              <button
                key={opt}
                type="button"
                className={`chip${gender === opt ? ' active' : ''}`}
                onClick={() => setGender(gender === opt ? '' : opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={!date}
          className="btn-primary pressable"
          style={{ width: '100%' }}
        >
          Continue →
        </button>
      </form>
    </div>
  );
}
