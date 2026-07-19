'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getProfile } from '@/lib/store';
import { ArchetypeCard } from '@/components/ArchetypeCard';
import type { Archetype } from '@/lib/interpretGuide';
import { pickVariant, localDateStr } from '@/lib/today';

const REVEAL = [
  "This is your pattern. Now see how it meets someone else's.",
  "This is how you're built. Now read someone.",
  "Your pattern, on paper. Time to meet someone else's.",
];

interface RevealData {
  date: string;
  archetype: Archetype;
  element: string;
  elements: Record<string, number>;
  revealLine: string;
  dayBranch: string;
  stem: string;
}

export default function RevealPage() {
  const router = useRouter();
  const [data, setData] = useState<RevealData | null>(null);
  const korean = typeof navigator !== 'undefined' && navigator.language.startsWith('ko');

  useEffect(() => {
    const p = getProfile();
    if (!p) { router.replace('/onboarding'); return; }

    Promise.all([import('@/lib/saju'), import('@/lib/interpretGuide')])
      .then(([{ calculateSaju }, { getArchetype }]) => {
        try {
          const c = calculateSaju({ date: p.date, time: p.time });
          setData({
            date: p.date,
            archetype: getArchetype(c.dayMaster.stem),
            element: c.dayMaster.element,
            elements: c.elements as Record<string, number>,
            revealLine: pickVariant(REVEAL, `reveal|${p.date ?? localDateStr()}`),
            dayBranch: c.pillars.day.branch,
            stem: c.dayMaster.stem,
          });
        } catch { /* stay on loading skeleton */ }
      });
  }, [router]);

  return (
    <div style={{
      minHeight: '100svh',
      background: 'var(--c-paper)',
      padding: '48px 24px 40px',
    }}>
      {/* Label */}
      <p style={{
        fontFamily: "var(--font-space-mono,'Courier New')",
        fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
        color: 'var(--c-muted)', margin: '0 0 20px',
      }}>
        YOUR READ
      </p>

      {/* Archetype card */}
      {data ? (
        <ArchetypeCard
          date={data.date}
          archetype={data.archetype}
          element={data.element}
          elements={data.elements as { wood: number; fire: number; earth: number; metal: number; water: number }}
          dayBranch={data.dayBranch}
          stem={data.stem}
          korean={korean}
        />
      ) : (
        <div style={{
          aspectRatio: '1', borderRadius: 18,
          border: '1px solid var(--c-hairline)',
          background: 'var(--c-card)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            border: '2.5px solid var(--c-hairline)',
            borderTopColor: 'var(--c-vermilion)',
            animation: 'spin 0.8s linear infinite',
          }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {/* Body line */}
      <p style={{
        fontFamily: "var(--font-inter,system-ui)",
        fontSize: 15, color: 'var(--c-ink-body)',
        lineHeight: 1.5, margin: '24px 0',
      }}>
        {data?.revealLine ?? REVEAL[0]}
      </p>

      {/* CTA */}
      <Link href="/new" className="pressable" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 52, borderRadius: 999,
        background: 'var(--c-vermilion)', color: '#FFF',
        fontFamily: "var(--font-inter,system-ui)", fontSize: 17, fontWeight: 600,
        textDecoration: 'none', marginBottom: 16,
      }}>
        Read someone →
      </Link>

      {/* Skip link */}
      <p style={{ textAlign: 'center', margin: 0 }}>
        <Link href="/home" style={{
          fontFamily: "var(--font-inter,system-ui)",
          fontSize: 13, color: 'var(--c-muted)',
          textDecoration: 'none',
        }}>
          Later — take me home →
        </Link>
      </p>
    </div>
  );
}
