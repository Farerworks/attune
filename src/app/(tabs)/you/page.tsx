'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getProfile, getReadings, ELEMENT_COLORS } from '@/lib/store';
import { formatDate } from '@/lib/format';
import { ElementChart } from '@/components/ElementChart';
import { SpectrumBar } from '@/components/SpectrumBar';
import { TabTopBar } from '@/components/TabTopBar';

interface ChartData {
  stem:     string;
  element:  string;
  polarity: string;
  elements: Record<string, number>;
  pillarsKnown: number;
  hanja: string;
  name: string;
  tagline: string;
  coreDrive: string;
  communication: string;
  stress: string;
}

interface MySpectrums {
  communication: number;
  decisions: number;
  pace: number;
  stress: number;
}

export default function YouPage() {
  const router = useRouter();
  const [chart,       setChart]       = useState<ChartData | null>(null);
  const [profile,     setProfile]     = useState<{ date: string; time?: string; gender?: string } | null>(null);
  const [error,       setError]       = useState<string | null>(null);
  const [mySpectrums, setMySpectrums] = useState<MySpectrums | null>(null);

  useEffect(() => {
    const p = getProfile();
    if (!p) { router.replace('/onboarding'); return; }
    setProfile(p);

    Promise.all([import('@/lib/saju'), import('@/lib/interpretGuide')])
      .then(([{ calculateSaju }, { getArchetype }]) => {
        try {
          const c   = calculateSaju({ date: p.date, time: p.time });
          const arc = getArchetype(c.dayMaster.stem);
          setChart({
            stem:         c.dayMaster.stem,
            element:      c.dayMaster.element,
            polarity:     c.dayMaster.polarity,
            elements:     c.elements as Record<string, number>,
            pillarsKnown: c.pillarsKnown,
            hanja:        arc.hanja,
            name:         arc.name,
            tagline:      arc.tagline,
            coreDrive:    arc.coreDrive,
            communication: arc.communication,
            stress:        arc.stress,
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not calculate chart');
        }

        // Load mySpectrums from most recent reading that has them
        const readings = getReadings();
        for (const r of readings) {
          const ms = r.briefing?.mySpectrums;
          if (ms && typeof ms.communication === 'number') {
            setMySpectrums(ms as MySpectrums);
            break;
          }
        }
      })
      .catch(e => setError(String(e)));
  }, [router]);

  return (
    <div style={{ minHeight: '100%', background: 'var(--c-paper)' }}>
      <TabTopBar />
      {/* Header */}
      <header style={{ padding: '20px 20px 12px', borderBottom: '1px solid var(--c-hairline)' }}>
        <h1 className="t-h2">You</h1>
      </header>

      <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {error ? (
          <div style={{ color: 'var(--c-vermilion)', fontFamily: "var(--font-inter,system-ui)", fontSize: 14 }}>{error}</div>
        ) : !chart ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              border: '2.5px solid var(--c-hairline)',
              borderTopColor: 'var(--c-vermilion)',
              animation: 'spin 0.8s linear infinite',
            }} />
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : (
          <>
            {/* ── Day master card ───────────────────────────────────────────── */}
            <div className="card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                {/* Element avatar */}
                <div style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: ELEMENT_COLORS[chart.element.toLowerCase()]?.bg ?? 'var(--c-surface-alt)',
                  color:      ELEMENT_COLORS[chart.element.toLowerCase()]?.fg ?? 'var(--c-muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: "var(--font-fraunces,Georgia,serif)",
                  fontSize: 26, flexShrink: 0,
                }}>
                  M
                </div>
                <div>
                  <div style={{
                    fontFamily: "var(--font-space-mono,'Courier New')",
                    fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
                    color: ELEMENT_COLORS[chart.element.toLowerCase()]?.fg ?? 'var(--c-muted)',
                  }}>
                    {chart.element} · {chart.polarity}
                  </div>
                  <div style={{
                    fontFamily: "var(--font-fraunces,Georgia,serif)",
                    fontSize: 23, fontStyle: 'italic', color: 'var(--c-ink)', marginTop: 4, lineHeight: 1.2,
                  }}>
                    {chart.name}
                  </div>
                  <div style={{
                    fontFamily: "var(--font-inter,system-ui)",
                    fontSize: 15, fontStyle: 'italic',
                    color: 'var(--c-muted)', marginTop: 2,
                  }}>
                    {chart.tagline}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <ArchRow label="Drive"  text={chart.coreDrive} />
                <ArchRow label="Comm"   text={chart.communication} />
                <ArchRow label="Stress" text={chart.stress} />
              </div>
            </div>

            {/* ── Element chart ─────────────────────────────────────────────── */}
            <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{
                fontFamily: "var(--font-fraunces,Georgia,serif)", fontSize: 20,
                color: 'var(--c-ink)', marginBottom: 16, alignSelf: 'flex-start',
              }}>
                Element Distribution
              </div>
              <ElementChart
                datasets={[{
                  elements:     chart.elements,
                  pillarsKnown: chart.pillarsKnown,
                  color: '#C4502E',
                }]}
                size={280}
                showGrid
              />
            </div>

            {/* ── Spectrum ──────────────────────────────────────────────────── */}
            <div className="card" style={{ padding: '20px' }}>
              <div style={{
                fontFamily: "var(--font-fraunces,Georgia,serif)", fontSize: 20,
                color: 'var(--c-ink)', marginBottom: 14,
              }}>
                Your spectrum
              </div>
              {!mySpectrums && (
                <p style={{
                  margin: '0 0 6px',
                  fontFamily: "var(--font-inter,system-ui)",
                  fontSize: 13, color: 'var(--c-muted)', lineHeight: 1.55, fontStyle: 'italic',
                }}>
                  Read someone to unlock your full profile.
                </p>
              )}
              {[
                { l: 'Indirect',   r: 'Direct',       k: 'communication' as const },
                { l: 'Gut feel',   r: 'Analysis',     k: 'decisions'     as const },
                { l: 'Deliberate', r: 'Fast-moving',  k: 'pace'          as const },
                { l: 'Withdraws',  r: 'Confronts',    k: 'stress'        as const },
              ].map(({ l, r, k }) => (
                <SpectrumBar
                  key={l}
                  leftLabel={l}
                  rightLabel={r}
                  dots={mySpectrums ? [{ value: mySpectrums[k], color: '#C4502E' }] : []}
                  style={{ marginBottom: 14, opacity: mySpectrums ? 1 : 0.3 }}
                />
              ))}
            </div>

            {/* Born meta */}
            {profile && (
              <p className="t-meta" style={{ padding: '0 4px' }}>
                BORN {formatDate(profile.date)}{profile.time ? ` · ${profile.time}` : ''}
                {profile.gender ? ` · ${profile.gender}` : ''}
              </p>
            )}
          </>
        )}

        <Link href="/onboarding" style={{
          fontFamily: "var(--font-inter,system-ui)", fontSize: 14, color: 'var(--c-muted)',
          textDecoration: 'none', borderBottom: '1px solid var(--c-hairline)', display: 'inline-block',
        }}>
          Edit birth info
        </Link>
      </div>
    </div>
  );
}

function ArchRow({ label, text }: { label: string; text: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <span style={{
        fontFamily: "var(--font-space-mono,'Courier New')",
        fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
        color: 'var(--c-muted)', paddingTop: 2, flexShrink: 0, width: 44,
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: "var(--font-inter,system-ui)",
        fontSize: 15, color: 'var(--c-ink-body)', lineHeight: 1.5,
      }}>
        {text}
      </span>
    </div>
  );
}
