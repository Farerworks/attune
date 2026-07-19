'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useReadings, getProfile } from '@/lib/store';
import { TabTopBar } from '@/components/TabTopBar';
import { TodayCard } from '@/components/TodayCard';
import type { TodayNote } from '@/lib/today';

export default function HomePage() {
  const [readings] = useReadings();
  const [greeting,   setGreeting]   = useState("Who's on your mind?");
  const [myTodayNote,      setMyTodayNote]      = useState<TodayNote | null>(null);
  const [myTodayEmoji,     setMyTodayEmoji]     = useState<string | undefined>(undefined);
  const [myTodayDateLabel, setMyTodayDateLabel] = useState('');

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

  // My today card — same helper as You tab, so copy matches
  useEffect(() => {
    const profile = getProfile();
    if (!profile) return;
    Promise.all([import('@/lib/saju'), import('@/lib/today')])
      .then(([{ calculateSaju }, { getMyTodayCard }]) => {
        try {
          const c = calculateSaju({ date: profile.date, time: profile.time });
          const korean = typeof navigator !== 'undefined' && navigator.language.startsWith('ko');
          const myToday = getMyTodayCard(c.dayMaster.element, korean);
          setMyTodayNote(myToday.note);
          setMyTodayEmoji(myToday.emoji);
          setMyTodayDateLabel(myToday.dateLabel);
        } catch { /* chart calc failed — card simply won't show */ }
      });
  }, []);

  const hasReadings = readings.length > 0;

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

      {/* Do/Don't, 14-day flow strip, "today's people" — next BRIEF (copy in progress) */}
    </div>
  );
}
