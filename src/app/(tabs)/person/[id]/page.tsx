'use client';

import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getReadings, deletePersonData } from '@/lib/store';
import { loadAskThreads } from '@/lib/askThreads';
import type { AskThreads } from '@/lib/askThreads';
import { buildPeople, personKey } from '@/lib/people';
import type { PersonView } from '@/lib/people';
import { GlyphAvatar } from '@/components/ArchetypeGlyph';
import type { TenStem } from '@/lib/saju';
import { getIljuProfile } from '@/lib/iljuProfiles';
import { IljuSheet } from '@/components/IljuSheet';
import { formatDate } from '@/lib/format';
import { BackIcon } from '@/components/icons/BackIcon';
import { getSyncSession, pushBackup } from '@/lib/sync';
import { TabTopBar } from '@/components/TabTopBar';
import { AccountAvatar } from '@/components/AccountAvatar';

const SECTION_LABEL_STYLE = {
  fontFamily: "var(--font-space-mono,'Courier New')",
  fontSize: 10.5,
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
  color: 'var(--c-muted)',
};

function pluralEn(n: number, singular: string): string {
  return n === 1 ? `1 ${singular}` : `${n} ${singular}S`;
}

function DeleteConfirmSheet({
  name, readingCount, korean, onCancel, onConfirm,
}: {
  name: string;
  readingCount: number;
  korean: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);
  const titleId = 'delete-confirm-title';
  const descId = 'delete-confirm-desc';

  useEffect(() => {
    restoreFocusTo.current = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      restoreFocusTo.current?.focus?.();
    };
  }, []);

  async function handleConfirm() {
    if (busy) return;
    setBusy(true);
    setError(false);
    const result = await onConfirm();
    if (!result.ok) {
      setBusy(false);
      setError(true);
    }
    // on ok:true the caller navigates away and this sheet unmounts — nothing left to reset here.
  }

  const bodyText = korean
    ? `리딩 ${readingCount}개와 대화 기록, 이 관계를 위해 저장된 정보가 삭제돼요. 되돌릴 수 없어요.`
    : `${readingCount === 1 ? '1 reading' : `${readingCount} readings`}, conversation history, and saved information about this relationship will be deleted. This can't be undone.`;

  return (
    <div
      onClick={() => { if (!busy) onCancel(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(26,24,21,0.48)',
        display: 'flex', alignItems: 'flex-end',
        animation: 'fade-in 200ms ease backwards',
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          background: 'var(--c-card)',
          borderRadius: '20px 20px 0 0',
          padding: '28px 24px 48px',
          animation: 'sheet-up var(--dur-slow) var(--ease-sheet) backwards',
        }}
      >
        <h2 id={titleId} style={{
          fontFamily: 'var(--font-inter)', fontSize: 18, fontWeight: 650,
          color: 'var(--c-ink)', margin: '0 0 12px',
        }}>
          {korean ? `${name}의 기록을 삭제할까요?` : `Delete ${name}'s records?`}
        </h2>
        <p id={descId} style={{
          fontFamily: 'var(--font-inter)', fontSize: 14, lineHeight: 1.6,
          color: 'var(--c-ink-body)', margin: '0 0 24px',
        }}>
          {bodyText}
        </p>

        {error && (
          <p role="alert" style={{
            fontFamily: 'var(--font-inter)', fontSize: 13,
            color: 'var(--c-destructive)', margin: '0 0 16px',
          }}>
            {korean ? '삭제하지 못했어요. 잠시 후 다시 시도해주세요.' : "Couldn't delete. Please try again."}
          </p>
        )}

        <button
          type="button"
          onClick={handleConfirm}
          disabled={busy}
          style={{
            width: '100%', height: 48, borderRadius: 999, border: 'none', marginBottom: 12,
            background: busy ? 'var(--c-destructive-disabled)' : 'var(--c-destructive)',
            color: '#fff', fontFamily: 'var(--font-inter)', fontSize: 15, fontWeight: 650,
            cursor: busy ? 'not-allowed' : 'pointer',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {korean ? `${name}의 기록 삭제` : `Delete ${name}'s records`}
        </button>
        <button
          type="button"
          ref={cancelRef}
          onClick={onCancel}
          disabled={busy}
          style={{
            width: '100%', height: 48, borderRadius: 999,
            background: 'var(--c-surface-alt)', border: '1px solid var(--c-hairline)',
            fontFamily: 'var(--font-inter)', fontSize: 15, color: 'var(--c-ink)',
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          {korean ? '취소' : 'Cancel'}
        </button>
      </div>
    </div>
  );
}

export default function PersonHubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [state, setState] = useState<{ person: PersonView; threads: AskThreads } | null | undefined>(undefined);
  const [korean, setKorean] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleteSheetOpen, setDeleteSheetOpen] = useState(false);

  useEffect(() => {
    setKorean(typeof navigator !== 'undefined' && navigator.language.startsWith('ko'));

    // [id] is a reading id used only as a lookup key — could be an older reading, not
    // necessarily the person's current anchor (e.g. an old share link). Either way we
    // reconstruct the full current group for whichever person it belongs to.
    const readings = getReadings();
    const anchorReading = readings.find(r => r.id === id);
    if (!anchorReading) { router.replace('/people'); return; }

    const key = personKey(anchorReading.name, anchorReading.date);
    const threads = loadAskThreads();
    const found = buildPeople(readings, threads).find(p => p.key === key);

    if (!found) { router.replace('/people'); return; }
    setState({ person: found, threads });
  }, [id, router]);

  function goBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.replace('/people');
    }
  }

  // Recomputes the group fresh at the moment of confirmation (BRIEF-098 §3 "확정 시점 그룹
  // 재계산") rather than trusting the group captured when the sheet was opened.
  async function handleDeleteConfirm(): Promise<{ ok: boolean; error?: string }> {
    if (!state) return { ok: false, error: 'no-state' };
    const freshReadings = getReadings();
    const freshThreads = loadAskThreads();
    const freshPerson = buildPeople(freshReadings, freshThreads).find(p => p.key === state.person.key);
    const idsToDelete = freshPerson ? freshPerson.readings.map(r => r.id) : [];

    if (idsToDelete.length > 0) {
      const result = deletePersonData(idsToDelete);
      if (!result.ok) return { ok: false, error: result.error };
    }
    // idsToDelete.length === 0 means the data is already gone (e.g. deleted elsewhere) —
    // nothing left to delete locally, so this still proceeds to the backup step as a no-op.

    const session = await getSyncSession();
    if (!session) {
      router.replace('/people');
      return { ok: true };
    }
    const push = await pushBackup();
    router.replace(push.ok ? '/people' : '/people?backupPending=1');
    return { ok: true };
  }

  if (state === undefined) return null;
  if (state === null) return null; // redirecting to /people

  const { person, threads } = state;
  const chatCount = person.readings.filter(r => (threads[r.id]?.length ?? 0) > 0).length;
  const dayCount = Math.max(1, Math.floor((Date.now() - new Date(person.startedAt).getTime()) / 86400000) + 1);
  const profile = person.stemHanja && person.branchHanja
    ? getIljuProfile(person.stemHanja, person.branchHanja)
    : null;

  const metaLine2 = korean
    ? (chatCount > 0 ? `리딩 ${person.readings.length}개 · 대화 ${chatCount}개` : `리딩 ${person.readings.length}개`)
    : (chatCount > 0 ? `${pluralEn(person.readings.length, 'READING')} · ${pluralEn(chatCount, 'CHAT')}` : pluralEn(person.readings.length, 'READING'));

  return (
    <div style={{ minHeight: '100%', background: 'var(--c-paper)', paddingBottom: 32 }}>
      {sheetOpen && profile && person.stemHanja && person.branchHanja && person.element && (
        <IljuSheet
          profile={profile}
          stemHanja={person.stemHanja}
          branchHanja={person.branchHanja}
          stemElement={person.element}
          branchElement={person.element}
          onClose={() => setSheetOpen(false)}
        />
      )}
      {deleteSheetOpen && (
        <DeleteConfirmSheet
          name={person.name}
          readingCount={person.readings.length}
          korean={korean}
          onCancel={() => setDeleteSheetOpen(false)}
          onConfirm={handleDeleteConfirm}
        />
      )}

      {/* ── ATTUNE wordmark bar (BRIEF-094I §2) ─────────────────────────────────
          People→hub used to drop the ATTUNE bar entirely, breaking the fixed-bar grammar
          every other tab has (094E/094F). title="People" (BRIEF-101 §4.5, YS 결재) makes the
          ATTUNE > People > person hierarchy visible even after drilling into a hub — same
          syntax as the People tab itself, so the title row + its sticky behavior come from
          TabTopBar's existing branch, unmodified. This bar also owns the safe-area clearance
          that used to live on the identity row below (094H §3's own fix — superseded here
          since the bar handles it the same way TabTopBar always has, 091-FIX). */}
      <TabTopBar right={<AccountAvatar />} title="People" />

      {/* ── Identity ─────────────────────────────────────────────────────────── */}
      {/* Scrolls with content (not fixed) — only the ATTUNE bar above stays put, same as
          Home's own identity content below its wordmark bar. */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        // Individual longhands, not the `padding` shorthand — mixing shorthand+longhand in one
        // style object is a known jsdom cssstyle bug that garbles env() (project precedent).
        paddingTop: 16,
        paddingRight: 20, paddingBottom: 0, paddingLeft: 20,
      }}>
        <button
          type="button"
          onClick={goBack}
          aria-label="Back"
          className="pressable"
          style={{
            width: 44, height: 44, flexShrink: 0, marginLeft: -10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', color: 'var(--c-ink)', cursor: 'pointer',
          }}
        >
          <BackIcon width={22} height={22} />
        </button>

        {person.stem && person.element ? (
          <GlyphAvatar stem={person.stem as TenStem} element={person.element} size={52} />
        ) : (
          <div style={{
            width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
            background: 'var(--c-surface-alt)', color: 'var(--c-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>?</div>
        )}

        <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
          <h1 style={{
            fontFamily: 'var(--font-inter)', fontWeight: 650, fontSize: 25,
            color: 'var(--c-ink)', margin: 0, lineHeight: 1.2,
          }}>
            {person.name}
          </h1>
          <p style={{ fontFamily: 'var(--font-inter)', fontSize: 13, color: 'var(--c-ink-body)', margin: '2px 0 0' }}>
            {person.relationship}
          </p>
        </div>
      </div>

      <div style={{ padding: '10px 20px 0', marginLeft: 64 }}>
        {korean ? (
          <>
            <p style={{ fontFamily: 'var(--font-inter)', fontSize: 12, color: 'var(--c-ink-body)', margin: 0, lineHeight: '16px' }}>
              이야기 {dayCount}일째
            </p>
            <p style={{ fontFamily: 'var(--font-inter)', fontSize: 12, color: 'var(--c-ink-body)', margin: 0, lineHeight: '16px' }}>
              {metaLine2}
            </p>
          </>
        ) : (
          <>
            <p style={{ ...SECTION_LABEL_STYLE, margin: 0, lineHeight: '16px' }}>
              DAY {dayCount}
            </p>
            <p style={{ ...SECTION_LABEL_STYLE, margin: 0, lineHeight: '16px' }}>
              {metaLine2}
            </p>
          </>
        )}
      </div>

      {/* ── A SAJU LENS ──────────────────────────────────────────────────────── */}
      {profile && (
        <div style={{ padding: '24px 20px 0' }}>
          <p style={SECTION_LABEL_STYLE}>A SAJU LENS</p>
          <p style={{ fontFamily: 'var(--font-inter)', fontSize: 13, color: 'var(--c-ink-body)', margin: '8px 0 12px', lineHeight: 1.5 }}>
            {korean ? '이 사람을 이해하는 하나의 관점이에요.' : 'One perspective for understanding them.'}
          </p>
          {/* Pretendard throughout — not IljuSheet's own serif treatment. The hub's one
              allowed serif slot (0-1 per screen) belongs to the timeline's latest headline,
              only when it's a reading (BRIEF-097 §3). Content itself is reused verbatim. */}
          <p style={{ fontFamily: 'var(--font-inter)', fontSize: 15, fontWeight: 600, color: 'var(--c-ink)', margin: '0 0 4px' }}>
            {profile.name}
          </p>
          <p style={{ fontFamily: 'var(--font-inter)', fontSize: 13, color: 'var(--c-ink-body)', margin: '0 0 8px', lineHeight: 1.5 }}>
            {korean ? profile.subtitleKo : profile.subtitle}
          </p>
          <p style={{ fontFamily: 'var(--font-inter)', fontSize: 13, color: 'var(--c-ink-body)', margin: '0 0 12px', lineHeight: 1.5 }}>
            {korean ? profile.essenceKo : profile.essence}
          </p>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="pressable"
            style={{
              minHeight: 44, padding: 0, background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-inter)', fontSize: 13, fontWeight: 600, color: 'var(--c-vermilion)',
            }}
          >
            {korean ? '더 보기 →' : 'Read more →'}
          </button>
        </div>
      )}

      {/* ── Record (thread) ─────────────────────────────────────────────────── */}
      <div style={{ padding: '28px 20px 0' }}>
        <p style={{ ...SECTION_LABEL_STYLE, marginBottom: 16 }}>
          RECORD
        </p>
        <div style={{ position: 'relative' }}>
          {/* Connecting line — spans from the first dot to (approximately) the last; a pure-CSS
              approximation since exact per-row heights aren't measured (honest caveat in report). */}
          {person.events.length > 1 && (
            <div aria-hidden="true" style={{
              position: 'absolute', left: 3, top: 6, bottom: 6, width: 1, background: 'var(--c-hairline)',
            }} />
          )}
          {person.events.map((event, i) => {
            const isLatest = i === 0;
            const isReading = event.type === 'reading';
            const typeLabel = korean
              ? (isReading ? '리딩' : '대화')
              : (isReading ? 'READING' : 'ASK');

            return (
              <div key={`${event.readingId}-${event.type}-${event.at}`} style={{
                position: 'relative', paddingLeft: 18,
                marginBottom: i < person.events.length - 1 ? 26 : 0,
              }}>
                <span aria-hidden="true" style={{
                  position: 'absolute', left: 0, top: 6, width: 7, height: 7, borderRadius: '50%',
                  background: isLatest ? 'var(--c-vermilion)' : 'transparent',
                  border: isLatest ? 'none' : '1px solid var(--c-hairline)',
                  boxSizing: 'border-box',
                }} />

                <p style={{
                  margin: 0,
                  fontFamily: korean ? 'var(--font-inter)' : "var(--font-space-mono,'Courier New')",
                  fontSize: korean ? 11.5 : 10.5,
                  letterSpacing: korean ? 'normal' : '0.08em',
                  color: 'var(--c-muted)',
                }}>
                  {formatDate(event.at)} · {typeLabel}
                </p>

                {isReading ? (
                  <Link href={`/reading/${event.readingId}`} style={{ textDecoration: 'none' }}>
                    <p style={isLatest ? {
                      margin: '4px 0 0', fontFamily: 'var(--font-fraunces,Georgia,serif)', fontStyle: 'italic',
                      fontSize: 17, color: 'var(--c-ink)', lineHeight: 1.35,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    } : {
                      margin: '4px 0 0', fontFamily: 'var(--font-inter)', fontSize: 14,
                      color: 'var(--c-ink-body)', lineHeight: 1.45,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {event.text}
                    </p>
                  </Link>
                ) : (
                  <>
                    <p style={{
                      margin: '4px 0 0', fontFamily: 'var(--font-inter)',
                      fontWeight: isLatest ? 600 : 400,
                      fontSize: 14, color: isLatest ? 'var(--c-ink)' : 'var(--c-ink-body)', lineHeight: 1.45,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {event.text}
                    </p>
                    <Link href={`/ask?person=${event.readingId}`} style={{
                      display: 'inline-block', marginTop: 4,
                      fontFamily: 'var(--font-inter)', fontSize: 13, fontWeight: 600,
                      color: 'var(--c-vermilion)', textDecoration: 'none',
                    }}>
                      {korean ? '대화 이어가기 →' : 'Continue the conversation →'}
                    </Link>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Actions ──────────────────────────────────────────────────────────── */}
      <div style={{ padding: '28px 20px 0' }}>
        <Link href={`/ask?person=${person.anchorReadingId}`} className="pressable" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: 48, borderRadius: 999, background: 'var(--c-vermilion)', color: '#fff',
          fontFamily: 'var(--font-inter)', fontSize: 15, fontWeight: 650, textDecoration: 'none',
        }}>
          {korean ? '이 관계에 대해 묻기 →' : 'Ask about this relationship →'}
        </Link>
        <Link href="/new" className="pressable" style={{
          display: 'block', textAlign: 'center', height: 44, lineHeight: '44px',
          fontFamily: 'var(--font-inter)', fontSize: 14, color: 'var(--c-ink-body)', textDecoration: 'none',
        }}>
          {korean ? '새로 읽기' : 'Read again'}
        </Link>
        <button
          type="button"
          onClick={() => setDeleteSheetOpen(true)}
          className="pressable"
          style={{
            display: 'block', width: '100%', minHeight: 44, lineHeight: '44px', textAlign: 'center',
            fontFamily: 'var(--font-inter)', fontSize: 13, color: 'var(--c-ink-body)',
            background: 'none', border: 'none', cursor: 'pointer',
          }}
        >
          {korean ? '이 사람의 기록 삭제' : "Delete this person's records"}
        </button>
      </div>
    </div>
  );
}
