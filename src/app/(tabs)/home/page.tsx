'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useReadings, getProfile, ELEMENT_COLORS } from '@/lib/store';
import { TabTopBar } from '@/components/TabTopBar';
import { TodayCard } from '@/components/TodayCard';
import { DoIcon } from '@/components/icons/DoIcon';
import { DontIcon } from '@/components/icons/DontIcon';
import { pickVariant, ME, ME_KO, todayDateLabel } from '@/lib/today';
import type { TodayNote } from '@/lib/today';
import type { DailyDoDont, FlowDay } from '@/lib/homeCopy';
import type { Element } from '@/lib/saju';

const SECTION_LABEL_STYLE = {
  fontFamily: 'var(--font-space-mono)',
  fontSize: 10.5,
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
  color: 'var(--c-muted)',
};

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
      <TabTopBar />

      <header style={{ padding: '20px 20px 12px', borderBottom: '1px solid var(--c-hairline)' }}>
        <h1 className="t-h2">{greeting}</h1>
      </header>

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
        <div className="card" style={{ padding: '18px 20px', margin: '0 20px 20px' }}>
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

      {/* "Today's people" + letter — next BRIEF (copy in progress) */}
    </div>
  );
}
