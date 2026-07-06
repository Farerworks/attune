'use client';

import { use } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getReading, ELEMENT_COLORS, type Reading } from '@/lib/store';

function ElementAvatar({ name, element, size = 36 }: { name?: string; element?: string; size?: number }) {
  const initial = name ? name.charAt(0).toUpperCase() : '?';
  const colors  = element ? ELEMENT_COLORS[element.toLowerCase()] : undefined;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: colors?.bg ?? 'var(--c-surface-alt)',
        color: colors?.fg ?? 'var(--c-muted)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-fraunces)',
        fontSize: Math.round(size * 0.45),
        flexShrink: 0,
      }}
    >
      {initial}
    </div>
  );
}

export default function ReadingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [reading, setReading] = useState<Reading | null | undefined>(undefined);

  useEffect(() => {
    setReading(getReading(id));
  }, [id]);

  if (reading === undefined) return null; // loading

  if (!reading) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center' }}>
        <p style={{ fontFamily: 'var(--font-inter)', color: 'var(--c-muted)', marginBottom: 20 }}>
          Reading not found.
        </p>
        <Link href="/people" style={{ color: 'var(--c-vermilion)', fontFamily: 'var(--font-inter)', fontSize: 14 }}>
          ← Back to People
        </Link>
      </div>
    );
  }

  const element = reading.themChart?.dayMaster?.element?.toLowerCase();

  return (
    <div style={{ minHeight: '100svh', background: 'var(--c-paper)' }}>
      {/* Top bar */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          borderBottom: '1px solid var(--c-hairline)',
          background: 'var(--c-card)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        {/* Back */}
        <button
          type="button"
          onClick={() => router.back()}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 4,
            color: 'var(--c-ink)',
            display: 'flex',
            flexShrink: 0,
          }}
          aria-label="Back"
        >
          <svg width={24} height={24} viewBox="0 0 24 24" fill="none">
            <path stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Avatar + name */}
        <ElementAvatar name={reading.name} element={element} size={32} />
        <span
          style={{
            fontFamily: 'var(--font-inter)',
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--c-ink)',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {reading.name ?? 'Unknown'}
        </span>

        {/* Save button (disabled) */}
        <button
          type="button"
          disabled
          style={{
            fontFamily: 'var(--font-inter)',
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--c-muted)',
            background: 'none',
            border: '1px solid var(--c-hairline)',
            borderRadius: 16,
            padding: '6px 14px',
            cursor: 'not-allowed',
            flexShrink: 0,
          }}
        >
          Save our card
        </button>
      </header>

      {/* Body */}
      <div style={{ padding: '32px 24px' }}>
        {/* Headline */}
        {reading.briefing?.headline && (
          <h1
            style={{
              fontFamily: 'var(--font-fraunces)',
              fontSize: 34,
              lineHeight: 1.2,
              letterSpacing: '-0.01em',
              color: 'var(--c-ink)',
              marginBottom: 32,
            }}
          >
            {reading.briefing.headline}
          </h1>
        )}

        {/* Placeholder notice */}
        <div
          style={{
            padding: '16px 20px',
            borderRadius: 12,
            background: 'var(--c-surface-alt)',
            border: '1px solid var(--c-hairline)',
          }}
        >
          <p
            style={{
              fontFamily: 'var(--font-space-mono)',
              fontSize: 11,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--c-muted)',
            }}
          >
            Full briefing view: next build
          </p>
        </div>

        {/* Relationship + date meta */}
        <div style={{ marginTop: 24 }}>
          <p className="t-meta">
            {reading.relationship} · BORN {reading.date}
          </p>
        </div>
      </div>
    </div>
  );
}
