'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getProfile, getReadings, getDaysIn, ELEMENT_COLORS } from '@/lib/store';
import type { ChartSummary } from '@/lib/store';
import type { TenStem } from '@/lib/saju';
import { GlyphAvatar } from '@/components/ArchetypeGlyph';
import { MyCardModal } from '@/components/MyCardModal';
import { EightCharactersCard } from '@/components/EightCharactersCard';
import { ELEMENT_INSIGHT } from '@/lib/interpretGuide';
import { formatDate } from '@/lib/format';
import { ElementChart } from '@/components/ElementChart';
import { SpectrumBar } from '@/components/SpectrumBar';
import { TabTopBar } from '@/components/TabTopBar';
import { TabHeader } from '@/components/TabHeader';
import { AccountAvatar } from '@/components/AccountAvatar';

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
  dayBranch: string;
  displayName: string;
  displayTagline: string;
  dayNoteEmoji?: string;
  dayNoteText?: string;
  pillars: ChartSummary['pillars'];
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
  const [profile,     setProfile]     = useState<{ date: string; time?: string; gender?: string; createdAt?: string } | null>(null);
  const [error,       setError]       = useState<string | null>(null);
  const [mySpectrums, setMySpectrums] = useState<MySpectrums | null>(null);
  const [reads,       setReads]       = useState(0);
  const [strong,      setStrong]      = useState(0);
  const [daysIn,      setDaysIn]      = useState(1);
  const [showMyCard,  setShowMyCard]  = useState(false);
  const korean = typeof navigator !== 'undefined' && navigator.language.startsWith('ko');

  useEffect(() => {
    const p = getProfile();
    if (!p) { router.replace('/onboarding'); return; }
    setProfile(p);

    Promise.all([import('@/lib/saju'), import('@/lib/interpretGuide'), import('@/lib/today')])
      .then(([{ calculateSaju }, { getArchetype, ARCHETYPE_LOCALE, DAY_NOTE_LOCALE }, { localDateStr, pickVariant }]) => {
        try {
          const c   = calculateSaju({ date: p.date, time: p.time });
          const arc = getArchetype(c.dayMaster.stem);

          const korean = typeof navigator !== 'undefined' && navigator.language.startsWith('ko');
          const dateStr = localDateStr();
          const L = ARCHETYPE_LOCALE[c.dayMaster.stem];
          const displayName = korean && L ? L.name_ko : arc.name;
          const displayTagline = L
            ? pickVariant(korean ? L.tagline_ko : L.tagline_en, `${dateStr}|tag|${c.dayMaster.stem}`)
            : arc.tagline;
          const dayLocale = DAY_NOTE_LOCALE[c.pillars.day.branch];
          const dayNoteText = dayLocale
            ? pickVariant(korean ? dayLocale.ko : dayLocale.en, `${dateStr}|day|${c.pillars.day.branch}`)
            : undefined;

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
            dayBranch:    c.pillars.day.branch,
            displayName,
            displayTagline,
            dayNoteEmoji: dayLocale?.emoji,
            dayNoteText,
            pillars: c.pillars,
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

        // Collection stats
        setReads(readings.length);
        setStrong(readings.filter(r => r.briefing?.dynamic?.resonance === 'strong-current').length);
        setDaysIn(getDaysIn());
      })
      .catch(e => setError(String(e)));
  }, [router]);

  const domEl = chart
    ? (['wood', 'fire', 'earth', 'metal', 'water'] as const).reduce((a, b) =>
        (chart.elements[b] ?? 0) > (chart.elements[a] ?? 0) ? b : a)
    : null;

  return (
    <>
    {showMyCard && chart && (
      <MyCardModal
        archetypeName={chart.name}
        element={chart.element}
        polarity={chart.polarity}
        elements={chart.elements}
        onClose={() => setShowMyCard(false)}
      />
    )}
    <div style={{ minHeight: '100%', background: 'var(--c-paper)' }}>
      <TabTopBar right={<AccountAvatar />} />
      <TabHeader title="You" />

      <div className="stagger" style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

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
                {/* Glyph avatar */}
                <GlyphAvatar stem={chart.stem as TenStem} element={chart.element} size={56} />
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
                    {chart.displayName}
                  </div>
                  <div style={{
                    fontFamily: "var(--font-inter,system-ui)",
                    fontSize: 15, fontStyle: 'italic',
                    color: 'var(--c-muted)', marginTop: 2,
                  }}>
                    {chart.displayTagline}
                  </div>
                  {chart.dayNoteText && (
                    <div style={{
                      fontFamily: "var(--font-inter,system-ui)",
                      fontSize: 12.5, color: 'var(--c-muted)', marginTop: 4,
                    }}>
                      <span style={{ marginRight: 4 }}>{chart.dayNoteEmoji}</span>{chart.dayNoteText}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <ArchRow label="Drive"  text={chart.coreDrive} />
                <ArchRow label="Comm"   text={chart.communication} />
                <ArchRow label="Stress" text={chart.stress} />
              </div>

              {/* Collection stats strip */}
              <div style={{
                marginTop: 16, paddingTop: 12,
                borderTop: '1px solid var(--c-hairline)',
                fontFamily: "var(--font-space-mono,'Courier New')",
                fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase',
                color: 'var(--c-muted)',
              }}>
                {reads} READS · {daysIn} DAYS IN · {strong} STRONG CURRENTS
              </div>
            </div>

            {/* ── Eight characters ─────────────────────────────────────────── */}
            <EightCharactersCard pillars={chart.pillars} pillarsKnown={chart.pillarsKnown as 6 | 8} />

            {/* ── Share my card ────────────────────────────────────────────── */}
            <button
              type="button"
              onClick={() => setShowMyCard(true)}
              style={{
                width: '100%', height: 50, borderRadius: 999,
                background: 'none', border: '1.5px solid var(--c-ink)',
                color: 'var(--c-ink)',
                fontFamily: 'var(--font-inter,system-ui)', fontSize: 15, fontWeight: 600,
                marginBottom: 12, cursor: 'pointer',
              }}
            >
              Share my card ↗️
            </button>

            {/* ── Element insight ──────────────────────────────────────────── */}
            {domEl && ELEMENT_INSIGHT[domEl] && (
              <div className="card" style={{ padding: '16px 18px', animationDelay: '68ms' }}>
                <p style={{
                  margin: 0,
                  fontFamily: "var(--font-inter,system-ui)",
                  fontSize: 14.5, color: 'var(--c-ink-body)', lineHeight: 1.55,
                }}>
                  <strong style={{ color: ELEMENT_COLORS[domEl]?.fg, fontWeight: 700 }}>
                    {ELEMENT_INSIGHT[domEl].split(' ')[0]}
                  </strong>
                  {' '}
                  {ELEMENT_INSIGHT[domEl].split(' ').slice(1).join(' ')}
                </p>
              </div>
            )}

            {/* ── Element chart ─────────────────────────────────────────────── */}
            <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', animationDelay: '90ms' }}>
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
            <div className="card" style={{ padding: '20px', animationDelay: '135ms' }}>
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
              <p className="t-meta" style={{ padding: '0 4px', animationDelay: '180ms' }}>
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
    </>
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
