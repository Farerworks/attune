'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getProfile } from '@/lib/store';
import { ELEMENT_COLORS } from '@/lib/store';

interface ChartData {
  stem: string;
  element: string;
  polarity: string;
  elements: Record<string, number>;
}

const ELEMENT_ORDER = ['wood', 'fire', 'earth', 'metal', 'water'] as const;

export default function YouPage() {
  const router = useRouter();
  const [chart, setChart] = useState<ChartData | null>(null);
  const [archetype, setArchetype] = useState<{ hanja: string; coreDrive: string; communication: string; stress: string } | null>(null);
  const [profile, setProfileState] = useState<{ date: string; time?: string; gender?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const p = getProfile();
    if (!p) {
      router.replace('/onboarding');
      return;
    }
    setProfileState(p);

    // Dynamically import to avoid SSR issues with lunar-javascript
    Promise.all([
      import('@/lib/saju'),
      import('@/lib/interpretGuide'),
    ]).then(([{ calculateSaju }, { getArchetype }]) => {
      try {
        const c = calculateSaju({ date: p.date, time: p.time });
        setChart({
          stem:     c.dayMaster.stem,
          element:  c.dayMaster.element,
          polarity: c.dayMaster.polarity,
          elements: c.elements as Record<string, number>,
        });
        setArchetype(getArchetype(c.dayMaster.stem));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not calculate chart');
      }
    }).catch(e => setError(String(e)));
  }, [router]);

  const maxElement = chart
    ? Math.max(...ELEMENT_ORDER.map(el => (chart.elements[el] ?? 0)))
    : 1;

  return (
    <div style={{ minHeight: '100%', background: 'var(--c-paper)' }}>
      {/* Header */}
      <header style={{ padding: '20px 20px 12px', borderBottom: '1px solid var(--c-hairline)' }}>
        <h1 className="t-h2">You</h1>
      </header>

      <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {error ? (
          <div style={{ color: 'var(--c-vermilion)', fontFamily: 'var(--font-inter)', fontSize: 14 }}>{error}</div>
        ) : !chart ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              border: '2.5px solid var(--c-hairline)',
              borderTopColor: 'var(--c-vermilion)',
              animation: 'spin 0.8s linear infinite',
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : (
          <>
            {/* Day master card */}
            <div className="card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                {/* Element avatar */}
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    background: ELEMENT_COLORS[chart.element.toLowerCase()]?.bg ?? 'var(--c-surface-alt)',
                    color: ELEMENT_COLORS[chart.element.toLowerCase()]?.fg ?? 'var(--c-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'var(--font-fraunces)',
                    fontSize: 26,
                    flexShrink: 0,
                  }}
                >
                  {archetype?.hanja}
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-inter)', fontSize: 15, fontWeight: 600, color: 'var(--c-ink)', marginBottom: 2 }}>
                    {chart.stem}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-space-mono)',
                      fontSize: 10,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: ELEMENT_COLORS[chart.element.toLowerCase()]?.fg ?? 'var(--c-muted)',
                    }}
                  >
                    {chart.element} · {chart.polarity}
                  </div>
                </div>
              </div>

              {archetype && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <ArchRow label="Drive" text={archetype.coreDrive} />
                  <ArchRow label="Comm" text={archetype.communication} />
                  <ArchRow label="Stress" text={archetype.stress} />
                </div>
              )}
            </div>

            {/* Element distribution */}
            <div className="card" style={{ padding: '20px' }}>
              <div style={{ fontFamily: 'var(--font-inter)', fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', marginBottom: 16 }}>
                Element Distribution
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {ELEMENT_ORDER.map(el => {
                  const count  = chart.elements[el] ?? 0;
                  const colors = ELEMENT_COLORS[el];
                  const pct    = maxElement > 0 ? (count / maxElement) * 100 : 0;
                  return (
                    <div key={el} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span
                        style={{
                          fontFamily: 'var(--font-space-mono)',
                          fontSize: 9,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          color: colors.fg,
                          width: 40,
                          flexShrink: 0,
                        }}
                      >
                        {el}
                      </span>
                      <div
                        style={{
                          flex: 1,
                          height: 8,
                          borderRadius: 4,
                          background: 'var(--c-hairline)',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${pct}%`,
                            height: '100%',
                            background: colors.fg,
                            borderRadius: 4,
                            minWidth: count > 0 ? 8 : 0,
                          }}
                        />
                      </div>
                      <span
                        style={{
                          fontFamily: 'var(--font-space-mono)',
                          fontSize: 11,
                          color: 'var(--c-muted)',
                          width: 16,
                          textAlign: 'right',
                          flexShrink: 0,
                        }}
                      >
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Born meta */}
            {profile && (
              <div style={{ padding: '4px 0' }}>
                <p className="t-meta">
                  BORN {profile.date}{profile.time ? ` · ${profile.time}` : ''}
                  {profile.gender ? ` · ${profile.gender}` : ''}
                </p>
              </div>
            )}
          </>
        )}

        <Link
          href="/onboarding"
          style={{
            fontFamily: 'var(--font-inter)',
            fontSize: 14,
            color: 'var(--c-muted)',
            textDecoration: 'none',
            borderBottom: '1px solid var(--c-hairline)',
            display: 'inline-block',
          }}
        >
          Edit birth info
        </Link>
      </div>
    </div>
  );
}

function ArchRow({ label, text }: { label: string; text: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <span
        style={{
          fontFamily: 'var(--font-space-mono)',
          fontSize: 9,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--c-muted)',
          paddingTop: 2,
          flexShrink: 0,
          width: 40,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-inter)',
          fontSize: 13,
          color: 'var(--c-ink-body)',
          lineHeight: 1.5,
        }}
      >
        {text}
      </span>
    </div>
  );
}
