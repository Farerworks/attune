'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useReadings, ELEMENT_COLORS } from '@/lib/store';
import { TabTopBar } from '@/components/TabTopBar';
import { TabHeader } from '@/components/TabHeader';
import { AccountAvatar } from '@/components/AccountAvatar';
import { getArchetype, ARCHETYPE_LOCALE } from '@/lib/interpretGuide';
import type { TenStem, Element } from '@/lib/saju';
import { GlyphAvatar } from '@/components/ArchetypeGlyph';
import { formatDate } from '@/lib/format';
import type { TodayNote } from '@/lib/today';

const isKo = (s?: string) => !!s && /[가-힣]/.test(s);

export default function PeoplePage() {
  const [readings] = useReadings();
  const [todayNotes, setTodayNotes] = useState<Record<string, TodayNote>>({});

  useEffect(() => {
    if (readings.length === 0) return;
    import('@/lib/today').then(({ getTodayNote, localDateStr }) => {
      const ds = localDateStr();
      const notes: Record<string, TodayNote> = {};
      for (const r of readings) {
        const rEl = r.themChart?.dayMaster?.element?.toLowerCase() as Element | undefined;
        if (rEl) notes[r.id] = getTodayNote(rEl, 'them', ds, r.name);
      }
      setTodayNotes(notes);
    });
  }, [readings]);

  return (
    <div style={{ minHeight: '100%', background: 'var(--c-paper)' }}>
      <TabTopBar right={<AccountAvatar />} />

      <TabHeader title="People" />

      {readings.length === 0 ? (
        /* Empty state */
        <div style={{ padding: '0 20px 48px', overflowX: 'hidden' }}>
          {/* 0 SO FAR chip */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px 0 12px' }}>
            <span style={{
              display: 'inline-block',
              transform: 'rotate(2deg)',
              fontFamily: "var(--font-space-mono,'Courier New')",
              fontSize: 9, letterSpacing: '0.12em',
              color: 'var(--c-muted)',
              border: '1px solid var(--c-hairline)',
              padding: '4px 8px', borderRadius: 6,
            }}>
              0 SO FAR
            </span>
          </div>

          {/* Avatar cluster */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24, paddingTop: 16 }}>
            <div style={{
              width: 88, height: 88, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(74,118,172,0.16)',
              border: '1px solid rgba(74,118,172,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: "var(--font-fraunces,Georgia,serif)", fontSize: 34, fontStyle: 'italic',
              color: '#4A76AC', transform: 'rotate(-4deg)', zIndex: 3,
            }}>J</div>
            <div style={{
              width: 88, height: 88, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(168,132,44,0.14)',
              border: '1px solid rgba(168,132,44,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: "var(--font-fraunces,Georgia,serif)", fontSize: 34, fontStyle: 'italic',
              color: '#A8842C', transform: 'rotate(3deg)', marginLeft: -18, zIndex: 2,
            }}>M</div>
            <div style={{
              width: 88, height: 88, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(255,255,255,0.5)',
              border: '1.5px dashed #C9C0AD',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: "var(--font-inter,system-ui)", fontSize: 30, color: '#C9C0AD',
              marginLeft: -18, zIndex: 1,
            }}>+</div>
          </div>

          {/* Headline */}
          <h2 style={{
            fontFamily: "var(--font-fraunces,Georgia,serif)",
            fontSize: 36, fontWeight: 500, color: 'var(--c-ink)',
            lineHeight: 1.1, textAlign: 'center', marginBottom: 10,
          }}>
            Curious about{' '}
            <em style={{ fontStyle: 'italic', color: '#C4502E' }}>someone</em>?
          </h2>
          <p style={{
            textAlign: 'center',
            fontFamily: "var(--font-inter,system-ui)",
            fontSize: 15, color: 'var(--c-muted)', marginBottom: 28, lineHeight: 1.5,
          }}>
            All it takes is a birthday.
          </p>

          {/* Archetype stickers */}
          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 32 }}>
            {[
              { label: 'THE SLOW BURN',   rotate: '-2deg', bg: 'rgba(196,80,46,0.08)',   border: '1px solid rgba(196,80,46,0.25)',   color: '#C4502E' },
              { label: 'THE STILL WATER', rotate: '2deg',  bg: 'rgba(74,118,172,0.08)',  border: '1px solid rgba(74,118,172,0.25)',  color: '#4A76AC' },
              { label: 'THE FINE EDGE',   rotate: '-1deg', bg: 'rgba(110,122,128,0.08)', border: '1px solid rgba(110,122,128,0.25)', color: '#6E7A80' },
            ].map(({ label, rotate, bg, border, color }) => (
              <div key={label} style={{
                display: 'inline-block', transform: `rotate(${rotate})`,
                background: bg, border, color, borderRadius: 6,
                padding: '5px 10px',
                fontFamily: "var(--font-space-mono,'Courier New')",
                fontSize: 9.5, letterSpacing: '0.12em', fontWeight: 700,
              }}>
                {label}
              </div>
            ))}
          </div>

          {/* CTA */}
          <Link href="/new" className="pressable" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: 52, borderRadius: 999,
            background: '#C4502E', color: '#fff',
            fontFamily: "var(--font-inter,system-ui)", fontSize: 17, fontWeight: 600,
            textDecoration: 'none', marginBottom: 12,
          }}>
            Read someone →
          </Link>
          <p style={{
            textAlign: 'center',
            fontFamily: "var(--font-space-mono,'Courier New')",
            fontSize: 10, letterSpacing: '0.1em', color: 'var(--c-muted)', margin: 0,
          }}>
            TAKES 30 SECONDS · NOT A VERDICT
          </p>
        </div>
      ) : (
        <>
          {/* Reading list */}
          <ul className="stagger" style={{ listStyle: 'none', margin: 0, padding: '8px 0' }}>
          {readings.map((reading, i) => {
            const element  = reading.themChart?.dayMaster?.element?.toLowerCase();
            const stem     = reading.themChart?.dayMaster?.stem;
            const colors   = element ? ELEMENT_COLORS[element] : undefined;
            const korean   = isKo(reading.briefing?.headline || reading.situation);
            const L        = stem ? ARCHETYPE_LOCALE[stem] : undefined;
            const archName = stem ? (korean && L ? L.name_ko : getArchetype(stem as TenStem).name) : null;
            const todayNote = todayNotes[reading.id];
            return (
              <li key={reading.id} style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}>
                <Link
                  href={`/reading/${reading.id}`}
                  className="pressable"
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
                  {/* Glyph avatar */}
                  {stem && element ? (
                    <GlyphAvatar stem={stem as TenStem} element={element} size={44} />
                  ) : (
                    <div style={{
                      width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                      background: element ? (ELEMENT_COLORS[element]?.bg ?? 'var(--c-surface-alt)') : 'var(--c-surface-alt)',
                      color: element ? (ELEMENT_COLORS[element]?.fg ?? 'var(--c-muted)') : 'var(--c-muted)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>?</div>
                  )}

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

                    {/* Today line — skipped when themChart data is missing */}
                    {todayNote && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                        <div style={{
                          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                          background: todayNote.tone === 'good'
                            ? '#C4502E'
                            : (ELEMENT_COLORS[todayNote.todayElement]?.fg ?? '#948B7C'),
                        }} />
                        <span style={{
                          fontFamily: "var(--font-space-mono,'Courier New')",
                          fontSize: 9, letterSpacing: '0.12em',
                          color: 'var(--c-muted)', textTransform: 'uppercase', flexShrink: 0,
                        }}>TODAY</span>
                        <span style={{
                          fontFamily: "var(--font-inter,system-ui)",
                          fontSize: 12.5, color: 'var(--c-ink-body)', lineHeight: 1.4,
                        }}>{todayNote.line}</span>
                      </div>
                    )}
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
        </>
      )}
    </div>
  );
}
