'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useReadings, getProfile, getDaysIn, ELEMENT_COLORS } from '@/lib/store';
import { TabTopBar } from '@/components/TabTopBar';
import { TabHeader } from '@/components/TabHeader';
import { AccountAvatar } from '@/components/AccountAvatar';
import { TodayCard } from '@/components/TodayCard';
import { DoIcon } from '@/components/icons/DoIcon';
import { DontIcon } from '@/components/icons/DontIcon';
import { ChevronIcon } from '@/components/icons/ChevronIcon';
import { GlyphAvatar } from '@/components/ArchetypeGlyph';
import { getArchetype, ARCHETYPE_LOCALE } from '@/lib/interpretGuide';
import { pickVariant, ME, ME_KO, todayDateLabel } from '@/lib/today';
import type { TodayNote } from '@/lib/today';
import type { DailyDoDont, FlowDay } from '@/lib/homeCopy';
import type { Element, TenStem } from '@/lib/saju';

const SECTION_LABEL_STYLE = {
  fontFamily: 'var(--font-space-mono)',
  fontSize: 10.5,
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
  color: 'var(--c-muted)',
};

// Mirrors People page's per-reading language heuristic (isKo) — same rule, own copy.
const isKo = (s?: string) => !!s && /[가-힣]/.test(s);

interface ReachOutPerson {
  id: string;
  createdAt: string;
  displayName: string;
  stem?: TenStem;
  element?: string;
  line: string;
}

export default function HomePage() {
  const [readings] = useReadings();
  const [greeting,   setGreeting]   = useState("Who's on your mind?");
  const [myTodayNote,      setMyTodayNote]      = useState<TodayNote | null>(null);
  const [myTodayEmoji,     setMyTodayEmoji]     = useState<string | undefined>(undefined);
  const [myTodayDateLabel, setMyTodayDateLabel] = useState('');
  const [korean,   setKorean]   = useState(false);
  const [doDont,   setDoDont]   = useState<DailyDoDont | null>(null);
  const [flowDays, setFlowDays] = useState<FlowDay[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [reachOut, setReachOut] = useState<ReachOutPerson[]>([]);
  const [dayCount, setDayCount] = useState<number | null>(null);

  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(
      h < 5 || h >= 18
        ? "Thinking about someone tonight?"
        : h < 11
        ? "Who's on your mind this morning?"
        : "Who's on your mind?"
    );
  }, []);

  // DAY N — hidden without a known start date (profile.createdAt)
  useEffect(() => {
    const profile = getProfile();
    if (!profile?.createdAt) return;
    setDayCount(getDaysIn());
  }, []);

  // My today card + Do/Don't + 14-day flow — same chart, computed once
  useEffect(() => {
    const profile = getProfile();
    if (!profile) return;
    Promise.all([import('@/lib/saju'), import('@/lib/today'), import('@/lib/homeCopy')])
      .then(([{ calculateSaju }, { getMyTodayCard }, { getDailyDoDont, getFlowDays }]) => {
        try {
          const c = calculateSaju({ date: profile.date, time: profile.time });
          const isKorean = typeof navigator !== 'undefined' && navigator.language.startsWith('ko');
          const element = c.dayMaster.element as Element;
          setKorean(isKorean);

          const myToday = getMyTodayCard(element, isKorean);
          setMyTodayNote(myToday.note);
          setMyTodayEmoji(myToday.emoji);
          setMyTodayDateLabel(myToday.dateLabel);

          setDoDont(getDailyDoDont(element, isKorean));
          setFlowDays(getFlowDays(element, isKorean));
        } catch { /* chart calc failed — cards simply won't show */ }
      });
  }, []);

  // Reach-out-today — same THEM-note computation as People, good-tone only, top 2 by recency
  useEffect(() => {
    if (readings.length === 0) { setReachOut([]); return; }
    import('@/lib/today').then(({ getTodayNote, localDateStr }) => {
      const ds = localDateStr();
      const candidates: ReachOutPerson[] = [];
      for (const r of readings) {
        const rEl = r.themChart?.dayMaster?.element?.toLowerCase() as Element | undefined;
        if (!rEl) continue;
        const note = getTodayNote(rEl, 'them', ds, r.name);
        if (note.tone !== 'good') continue;

        const stem = r.themChart?.dayMaster?.stem as TenStem | undefined;
        const nameIsKorean = isKo(r.briefing?.headline || r.situation);
        const L = stem ? ARCHETYPE_LOCALE[stem] : undefined;
        const archName = stem ? (nameIsKorean && L ? L.name_ko : getArchetype(stem).name) : null;

        candidates.push({
          id: r.id,
          createdAt: r.createdAt,
          displayName: r.name ?? archName ?? 'Unknown',
          stem,
          element: rEl,
          line: note.line,
        });
      }
      candidates.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setReachOut(candidates.slice(0, 2));
    });
  }, [readings]);

  const hasReadings = readings.length > 0;
  const selectedDay = flowDays[selectedIdx];
  const selectedLine = selectedDay
    ? pickVariant((korean ? ME_KO : ME)[selectedDay.rel], `${selectedDay.date}|me|${selectedDay.rel}`)
    : null;
  const selectedDateLabel = selectedDay
    ? todayDateLabel(korean, new Date(`${selectedDay.date}T00:00:00`))
    : '';

  return (
    <div style={{ minHeight: '100%', background: 'var(--c-paper)' }}>
      <TabTopBar right={<AccountAvatar />} />

      <TabHeader title={greeting} />

      {dayCount !== null && (
        <p style={{
          margin: 0, padding: '14px 20px 0',
          fontFamily: 'var(--font-space-mono)', fontSize: 9.5, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: 'var(--c-muted)',
        }}>
          DAY {dayCount} WITH ATTUNE
        </p>
      )}

      {myTodayNote && (
        <div style={{ padding: '16px 20px 0' }}>
          <TodayCard note={myTodayNote} dateLabel={myTodayDateLabel} emoji={myTodayEmoji} />
        </div>
      )}

      <div style={{ padding: '20px' }}>
        <Link
          href="/new"
          className="pressable"
          style={hasReadings ? {
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: 52, borderRadius: 999,
            background: 'none', border: '1.5px solid var(--c-ink)', color: 'var(--c-ink)',
            fontFamily: "var(--font-inter,system-ui)", fontSize: 17, fontWeight: 600,
            textDecoration: 'none', marginBottom: 12,
          } : {
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: 52, borderRadius: 999,
            background: '#C4502E', color: '#fff',
            fontFamily: "var(--font-inter,system-ui)", fontSize: 17, fontWeight: 600,
            textDecoration: 'none', marginBottom: 12,
          }}
        >
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

      {/* ── Do / Don't ──────────────────────────────────────────────────────── */}
      {doDont && (
        <div className="card" style={{ padding: '20px', margin: '0 20px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <DoIcon width={14} height={14} style={{ color: ELEMENT_COLORS.wood.fg }} />
            <span style={{
              fontFamily: 'var(--font-space-mono)', fontSize: 10, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: ELEMENT_COLORS.wood.fg,
            }}>
              DO
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {doDont.dos.map((line, i) => (
              <p key={i} style={{ margin: 0, fontFamily: 'var(--font-inter)', fontSize: 14.5, color: 'var(--c-ink)', lineHeight: 1.5 }}>
                {line}
              </p>
            ))}
          </div>

          <div style={{ borderTop: '1px solid var(--c-hairline)', margin: '16px 0' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <DontIcon width={14} height={14} style={{ color: 'var(--c-vermilion)' }} />
            <span style={{
              fontFamily: 'var(--font-space-mono)', fontSize: 10, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: 'var(--c-vermilion)',
            }}>
              DON&apos;T
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {doDont.donts.map((line, i) => (
              <p key={i} style={{ margin: 0, fontFamily: 'var(--font-inter)', fontSize: 14.5, color: 'var(--c-ink)', lineHeight: 1.5 }}>
                {line}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* ── 14-day flow strip ─────────────────────────────────────────────── */}
      {flowDays.length > 0 && (
        <div style={{ padding: '0 20px 24px' }}>
          <p style={{ ...SECTION_LABEL_STYLE, marginBottom: 14 }}>NEXT 14 DAYS</p>

          <style>{`.home-flow-scroll::-webkit-scrollbar { display: none; }`}</style>
          <div
            className="home-flow-scroll"
            style={{
              display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4,
              scrollbarWidth: 'none',
            }}
          >
            {flowDays.map((day, i) => {
              const selected = i === selectedIdx;
              return (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => setSelectedIdx(i)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                    background: 'none', border: 'none', padding: 0, flexShrink: 0, width: 28,
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-space-mono)', fontSize: 9, color: 'var(--c-muted)' }}>
                    {day.weekdayLabel}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-inter)', fontSize: 14,
                    color: selected ? 'var(--c-vermilion)' : 'var(--c-ink)',
                    fontWeight: selected ? 700 : 400,
                  }}>
                    {day.dayNumber}
                  </span>
                  {day.tone === 'soft' ? (
                    <span style={{ width: 6, height: 6, borderRadius: '50%', border: '1px solid var(--c-muted)' }} />
                  ) : (
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: day.tone === 'good' ? 'var(--c-vermilion)' : 'var(--c-muted)',
                    }} />
                  )}
                </button>
              );
            })}
          </div>

          {selectedLine && (
            <div style={{ marginTop: 14 }}>
              <p style={{ margin: 0, fontFamily: 'var(--font-space-mono)', fontSize: 9, color: 'var(--c-muted)' }}>
                {selectedDateLabel}
              </p>
              <p style={{ margin: '4px 0 0', fontFamily: 'var(--font-fraunces)', fontSize: 15, color: 'var(--c-ink-body)' }}>
                {selectedLine}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Reach out today ──────────────────────────────────────────────── */}
      {reachOut.length > 0 && (
        <div style={{ padding: '0 20px 24px' }}>
          <p style={{ ...SECTION_LABEL_STYLE, marginBottom: 14 }}>REACH OUT TODAY</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {reachOut.map(person => (
              <Link
                key={person.id}
                href={`/reading/${person.id}`}
                className="card pressable"
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '16px 20px', textDecoration: 'none',
                }}
              >
                {person.stem && person.element ? (
                  <GlyphAvatar stem={person.stem} element={person.element} size={44} />
                ) : (
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--c-surface-alt)', color: 'var(--c-muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>?</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--font-inter)', fontSize: 15, fontWeight: 600, color: 'var(--c-ink)' }}>
                      {person.displayName}
                    </span>
                    <ChevronIcon width={16} height={16} style={{ color: 'var(--c-muted)', flexShrink: 0 }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--c-vermilion)', flexShrink: 0 }} />
                    <span style={{ fontFamily: 'var(--font-inter)', fontSize: 13, color: 'var(--c-ink-body)', lineHeight: 1.5 }}>
                      {person.line}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* letter — next BRIEF (copy in progress) */}
    </div>
  );
}
