'use client';

import Link from 'next/link';
import { useReadings, ELEMENT_COLORS } from '@/lib/store';
import { TabTopBar } from '@/components/TabTopBar';
import { getArchetype } from '@/lib/interpretGuide';
import type { TenStem } from '@/lib/saju';
import { formatDate } from '@/lib/format';

function ElementAvatar({ name, element }: { name?: string; element?: string }) {
  const initial = name ? name.charAt(0).toUpperCase() : '?';
  const colors = element ? ELEMENT_COLORS[element.toLowerCase()] : undefined;
  return (
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: '50%',
        background: colors?.bg ?? 'var(--c-surface-alt)',
        color: colors?.fg ?? 'var(--c-muted)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        fontFamily: 'var(--font-fraunces)',
        fontSize: 18,
        fontWeight: 400,
      }}
    >
      {initial}
    </div>
  );
}

export default function PeoplePage() {
  const [readings] = useReadings();

  return (
    <div style={{ minHeight: '100%', background: 'var(--c-paper)' }}>
      <TabTopBar />
      {/* Header */}
      <header
        style={{
          padding: '20px 20px 12px',
          borderBottom: readings.length > 0 ? '1px solid var(--c-hairline)' : 'none',
        }}
      >
        <h1 className="t-h2">Who&apos;s on your mind?</h1>
      </header>

      {readings.length === 0 ? (
        /* Empty state */
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '64px 24px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'var(--c-surface-alt)',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width={24} height={24} viewBox="0 0 24 24" fill="none">
              <circle cx="9" cy="7" r="3.5" stroke="var(--c-muted)" strokeWidth={1.5} />
              <path stroke="var(--c-muted)" strokeWidth={1.5} strokeLinecap="round" d="M3 20v-1a6 6 0 0112 0v1" />
              <circle cx="17.5" cy="7.5" r="2.75" stroke="var(--c-muted)" strokeWidth={1.5} />
              <path stroke="var(--c-muted)" strokeWidth={1.5} strokeLinecap="round" d="M15 13.6A6 6 0 0122 19v1" />
            </svg>
          </div>
          <p
            style={{
              fontFamily: 'var(--font-inter)',
              fontSize: 16,
              color: 'var(--c-muted)',
              marginBottom: 24,
              lineHeight: 1.5,
            }}
          >
            No one yet.
            <br />
            Who are you curious about?
          </p>
          <Link href="/new" className="btn-primary" style={{ paddingLeft: 28, paddingRight: 28 }}>
            Read someone
          </Link>
        </div>
      ) : (
        /* Reading list */
        <ul style={{ listStyle: 'none', margin: 0, padding: '8px 0' }}>
          {readings.map(reading => {
            const element  = reading.themChart?.dayMaster?.element?.toLowerCase();
            const stem     = reading.themChart?.dayMaster?.stem;
            const colors   = element ? ELEMENT_COLORS[element] : undefined;
            const archName = stem ? getArchetype(stem as TenStem).name : null;
            return (
              <li key={reading.id}>
                <Link
                  href={`/reading/${reading.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 14,
                    padding: '16px 20px',
                    textDecoration: 'none',
                    borderBottom: '1px solid var(--c-hairline)',
                    background: 'var(--c-card)',
                  }}
                >
                  {/* Element avatar */}
                  <ElementAvatar name={reading.name} element={element} />

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Name row */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 4,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'var(--font-inter)',
                          fontSize: 17,
                          fontWeight: 600,
                          color: 'var(--c-ink)',
                        }}
                      >
                        {reading.name ?? 'Unknown'}
                      </span>
                      {(archName ?? element) && colors && (
                        <span
                          style={{
                            fontFamily: "var(--font-fraunces,Georgia,serif)",
                            fontSize: 13.5,
                            fontStyle: 'italic',
                            color: colors.fg,
                          }}
                        >
                          {archName ?? element}
                        </span>
                      )}
                      <span
                        style={{
                          fontFamily: 'var(--font-inter)',
                          fontSize: 11,
                          color: 'var(--c-muted)',
                          background: 'var(--c-surface-alt)',
                          border: '1px solid var(--c-hairline)',
                          padding: '1px 8px',
                          borderRadius: 10,
                        }}
                      >
                        {reading.relationship}
                      </span>
                    </div>

                    {/* Headline */}
                    {reading.briefing?.headline && (
                      <p
                        style={{
                          fontFamily: "var(--font-fraunces,Georgia,serif)",
                          fontSize: 18,
                          color: 'var(--c-ink-body)',
                          marginBottom: 8,
                          lineHeight: 1.3,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {reading.briefing.headline}
                      </p>
                    )}

                    {/* Dates */}
                    <div
                      style={{
                        fontFamily: 'var(--font-space-mono)',
                        fontSize: 11,
                        letterSpacing: '0.04em',
                        color: 'var(--c-muted)',
                      }}
                    >
                      READ {formatDate(reading.createdAt)} · BORN {formatDate(reading.date)}
                    </div>
                  </div>

                  {/* Chevron */}
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 4 }}>
                    <path stroke="var(--c-hairline)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
                  </svg>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
