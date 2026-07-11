'use client';

import { useState, useRef, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { addReading, getProfile, type BriefingData, type ChartSummary } from '@/lib/store';
import { CastingRitual } from '@/components/CastingRitual';

const RELATIONSHIP_CHIPS = [
  'Crush',
  'First date',
  'Friend',
  'Someone new',
  'Difficult talk',
  'Business meeting',
];

interface ApiResponse {
  briefing: BriefingData;
  charts: { me: ChartSummary; them: ChartSummary };
  error?: string;
}

/** Strip partial / invalid time values — browser sends '' for incomplete entries */
function cleanTime(t: string | undefined): string | undefined {
  if (!t) return undefined;
  return /^\d{2}:\d{2}$/.test(t) ? t : undefined;
}

export default function NewPage() {
  const router = useRouter();
  const [name, setName]               = useState('');
  const [date, setDate]               = useState('');
  const [time, setTime]               = useState('');
  const [relationship, setRelationship] = useState('');
  const [situation, setSituation]     = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);

  // Ritual state
  const [ritualActive, setRitualActive] = useState(false);
  const [ritualName,   setRitualName]   = useState<string | undefined>();
  const [ritualChart,  setRitualChart]  = useState<ChartSummary | null>(null);
  const [ritualReady,  setRitualReady]  = useState(false);
  const readingIdRef = useRef<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!date || !relationship) return;

    const profile = getProfile();
    if (!profile) { router.push('/onboarding'); return; }

    setLoading(true);
    setError(null);

    // ── Calculate their chart client-side for the ritual ──────────────────────
    let chart: ChartSummary | null = null;
    try {
      const { calculateSaju } = await import('@/lib/saju');
      const c = calculateSaju({ date, time: cleanTime(time) });
      chart = {
        dayMaster:    { stem: c.dayMaster.stem, element: c.dayMaster.element, polarity: c.dayMaster.polarity },
        elements:     c.elements,
        pillarsKnown: c.pillarsKnown,
        pillars:      c.pillars,
      };
    } catch { /* ritual continues without chart */ }

    readingIdRef.current = null;
    setRitualChart(chart);
    setRitualName(name || undefined);
    setRitualReady(false);
    setRitualActive(true);

    // ── API call ──────────────────────────────────────────────────────────────
    try {
      const res = await fetch('/api/briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          me:   { date: profile.date, time: cleanTime(profile.time) },
          them: { date, time: cleanTime(time), name: name || undefined },
          relationship,
          situation,
        }),
      });

      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('application/json')) {
        throw new Error('Something went wrong — try again in a moment');
      }

      const data: ApiResponse = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong — try again in a moment');

      const id = crypto.randomUUID();
      addReading({
        id,
        name:         name || undefined,
        date,
        time:         cleanTime(time),
        relationship,
        situation,
        createdAt:    new Date().toISOString(),
        briefing:     data.briefing,
        myChart:      data.charts.me,
        themChart:    data.charts.them,
      });

      readingIdRef.current = id;
      setRitualReady(true);

    } catch (err) {
      setRitualActive(false);
      setRitualReady(false);
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
    }
  }

  function handleRitualDone() {
    const id = readingIdRef.current;
    setRitualActive(false);
    setLoading(false);
    if (id) router.push(`/reading/${id}`);
  }

  return (
    <>
      {/* Casting ritual overlay */}
      <CastingRitual
        active={ritualActive}
        name={ritualName}
        themChart={ritualChart}
        ready={ritualReady}
        onDone={handleRitualDone}
      />

      <div style={{ minHeight: '100svh', background: 'var(--c-paper)', padding: '0 0 40px' }}>
        {/* Header */}
        <header style={{
          display: 'flex',
          alignItems: 'center',
          padding: '16px 20px',
          gap: 12,
          borderBottom: '1px solid var(--c-hairline)',
          background: 'var(--c-paper)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}>
          <button
            type="button"
            onClick={() => router.back()}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--c-ink)', display: 'flex' }}
            aria-label="Back"
          >
            <svg width={24} height={24} viewBox="0 0 24 24" fill="none">
              <path stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <span style={{
            fontFamily: "var(--font-space-mono,'Courier New')",
            fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--c-muted)',
          }}>
            New Reading
          </span>
        </header>

        <form onSubmit={handleSubmit} noValidate style={{ padding: '28px 20px' }}>
          <h1 style={{
            fontFamily: "var(--font-fraunces,Georgia,serif)",
            fontSize: 30, lineHeight: 1.2, letterSpacing: '-0.01em', color: 'var(--c-ink)', marginBottom: 32,
          }}>
            Now, them.
          </h1>

          {/* Name */}
          <div style={{ marginBottom: 20 }}>
            <label htmlFor="name" className="t-label" style={{ display: 'block', marginBottom: 8 }}>
              Name <span style={{ color: 'var(--c-muted)', fontWeight: 400 }}>(optional)</span>
            </label>
            <input
              id="name"
              type="text"
              placeholder="A name or nickname — just for you"
              className="field-input"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          {/* Their DOB */}
          <div style={{ marginBottom: 20 }}>
            <label htmlFor="their-dob" className="t-label" style={{ display: 'block', marginBottom: 8 }}>
              Their date of birth <span style={{ color: 'var(--c-vermilion)' }}>*</span>
            </label>
            <input
              id="their-dob"
              type="date"
              className="field-input"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>

          {/* Their birth time */}
          <div style={{ marginBottom: 28 }}>
            <label htmlFor="their-time" className="t-label" style={{ display: 'block', marginBottom: 8 }}>
              Their birth time <span style={{ color: 'var(--c-muted)', fontWeight: 400 }}>(optional)</span>
            </label>
            <input
              id="their-time"
              type="time"
              className="field-input"
              value={time}
              onChange={e => setTime(e.target.value)}
            />
          </div>

          {/* Relationship chips */}
          <div style={{ marginBottom: 28 }}>
            <label className="t-label" style={{ display: 'block', marginBottom: 10 }}>
              Relationship <span style={{ color: 'var(--c-vermilion)' }}>*</span>
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {RELATIONSHIP_CHIPS.map(chip => (
                <button
                  key={chip}
                  type="button"
                  className={`chip${relationship === chip ? ' active' : ''}`}
                  onClick={() => setRelationship(relationship === chip ? '' : chip)}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {/* Situation */}
          <div style={{ marginBottom: 32 }}>
            <label htmlFor="situation" className="t-label" style={{ display: 'block', marginBottom: 8 }}>
              What&apos;s the situation?
            </label>
            <textarea
              id="situation"
              rows={4}
              placeholder="Give context — the more specific, the sharper the briefing."
              className="field-textarea"
              value={situation}
              onChange={e => setSituation(e.target.value)}
            />
          </div>

          {/* Error */}
          {error && (
            <div style={{
              padding: '12px 16px',
              borderRadius: 10,
              background: 'var(--c-fire-bg)',
              color: 'var(--c-vermilion)',
              fontFamily: "var(--font-inter,system-ui)",
              fontSize: 14,
              marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !date || !relationship}
            className="btn-primary pressable"
            style={{ width: '100%' }}
          >
            Get my briefing
          </button>
        </form>
      </div>
    </>
  );
}
