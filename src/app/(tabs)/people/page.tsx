'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useReadings } from '@/lib/store';
import { TabTopBar } from '@/components/TabTopBar';
import { AccountAvatar } from '@/components/AccountAvatar';
import type { TenStem } from '@/lib/saju';
import { GlyphAvatar } from '@/components/ArchetypeGlyph';
import { loadAskThreads } from '@/lib/askThreads';
import type { AskThreads } from '@/lib/askThreads';
import { buildPeople } from '@/lib/people';

// Ledger-row copy (BRIEF-097 §2) has no separate EN string in the spec — this is a judgment
// call, matching the bilingual pattern already used elsewhere (Ask, safety flow).
function relativeTime(iso: string, korean: boolean): string {
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
  if (korean) {
    if (days === 0) return '오늘';
    if (days === 1) return '어제';
    if (days < 7) return `${days}일 전`;
    if (days < 30) return `${Math.floor(days / 7)}주 전`;
    if (days < 365) return `${Math.floor(days / 30)}개월 전`;
    return `${Math.floor(days / 365)}년 전`;
  }
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export default function PeoplePage() {
  const router = useRouter();
  const [readings] = useReadings();
  const [threads, setThreads] = useState<AskThreads>({});
  const [korean, setKorean] = useState(false);
  const [backupPending, setBackupPending] = useState(false);

  useEffect(() => {
    setThreads(loadAskThreads());
    setKorean(typeof navigator !== 'undefined' && navigator.language.startsWith('ko'));

    // Single pass (same pattern as Ask's ?person/?prefill, BRIEF-097 §4): read once, apply,
    // strip via one router.replace() — set after a person-record delete whose backup push
    // failed (BRIEF-098 §2), so the local deletion is real but the server copy is stale.
    const params = new URLSearchParams(window.location.search);
    if (params.get('backupPending') === '1') {
      setBackupPending(true);
      params.delete('backupPending');
      const query = params.toString();
      router.replace(query ? `/people?${query}` : '/people');
    }
  }, [router]);

  const people = useMemo(() => buildPeople(readings, threads), [readings, threads]);

  return (
    <div style={{ minHeight: '100%', background: 'var(--c-paper)' }}>
      <TabTopBar right={<AccountAvatar />} title="People" />

      {backupPending && (
        <p aria-live="polite" style={{
          margin: 0, padding: '12px 20px',
          fontFamily: 'var(--font-inter)', fontSize: 13, lineHeight: 1.5,
          color: 'var(--c-ink-body)', background: 'var(--c-surface-alt)',
          borderBottom: '1px solid var(--c-hairline)',
        }}>
          {korean
            ? '지워졌어요. 백업 반영은 연결되면 자동으로 다시 시도돼요.'
            : 'Deleted on this device. Backup will update automatically when back online.'}
        </p>
      )}

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
          {/* Ledger: one row per person, buildPeople's lastActiveAt descending (BRIEF-097 §2) */}
          <ul className="stagger" style={{ listStyle: 'none', margin: 0, padding: '8px 0' }}>
          {people.map((person, i) => (
            <li key={person.key} style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}>
              <Link
                href={`/person/${person.anchorReadingId}`}
                className="pressable"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 13,
                  padding: '14px 20px',
                  textDecoration: 'none',
                  borderBottom: '1px solid var(--c-hairline)',
                  background: 'var(--c-card)',
                }}
              >
                {person.stem && person.element ? (
                  <GlyphAvatar stem={person.stem as TenStem} element={person.element} size={44} />
                ) : (
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--c-surface-alt)', color: 'var(--c-muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>?</div>
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Row 1: name (ellipsis) + N ACTIVITIES (BRIEF-110B — readings+asks combined) */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{
                      fontFamily: 'var(--font-inter)', fontSize: 17, fontWeight: 650,
                      color: 'var(--c-ink)', overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap', minWidth: 0,
                    }}>
                      {person.name}
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-space-mono)', fontSize: 10.5,
                      color: 'var(--c-muted)', flexShrink: 0, marginLeft: 'auto',
                    }}>
                      {person.events.length} {person.events.length === 1 ? 'ACTIVITY' : 'ACTIVITIES'}
                    </span>
                  </div>

                  {/* Row 2: relationship · relative time — no pill/badge box */}
                  <p style={{
                    margin: '2px 0 0', fontFamily: 'var(--font-inter)', fontSize: 13,
                    color: 'var(--c-ink-body)',
                  }}>
                    {korean
                      ? `${person.relationship} · 최근 이야기 ${relativeTime(person.lastActiveAt, true)}`
                      : `${person.relationship} · Last talked ${relativeTime(person.lastActiveAt, false)}`}
                  </p>

                  {/* Row 3: latest excerpt — always present (a person only exists once a reading does) */}
                  <p style={{
                    margin: '4px 0 0', fontFamily: 'var(--font-inter)', fontSize: 14, lineHeight: 1.45,
                    color: 'var(--c-ink-body)', overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {person.latestExcerpt}
                  </p>
                </div>

                <span aria-hidden="true" style={{
                  color: 'var(--c-muted)', fontSize: 20, lineHeight: 1, flexShrink: 0,
                  alignSelf: 'center',
                }}>
                  ›
                </span>
              </Link>
            </li>
          ))}
          </ul>
        </>
      )}
    </div>
  );
}
