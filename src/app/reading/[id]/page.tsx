'use client';

import { use, useEffect, useState, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getReading, ELEMENT_COLORS, type Reading, type PlaybookItem } from '@/lib/store';
import { getQuotaLeft } from '@/lib/askQuota';
import { getArchetype } from '@/lib/interpretGuide';
import type { TenStem } from '@/lib/saju';
import { formatDate } from '@/lib/format';
import { ElementChart } from '@/components/ElementChart';
import { ArchetypeCard } from '@/components/ArchetypeCard';
import { ShareModal } from '@/components/ShareModal';
import { SpectrumBar } from '@/components/SpectrumBar';
import { ExpandCard } from '@/components/ExpandCard';
import { PersonalityIcon } from '@/components/icons/PersonalityIcon';
import { CommunicatesIcon } from '@/components/icons/CommunicatesIcon';
import { DecidesIcon } from '@/components/icons/DecidesIcon';
import { StressIcon } from '@/components/icons/StressIcon';
import { ClickIcon } from '@/components/icons/ClickIcon';
import { ClashIcon } from '@/components/icons/ClashIcon';
import { WatchIcon } from '@/components/icons/WatchIcon';

// ── Helpers ──────────────────────────────────────────────────────────────────

function elementColor(element?: string) {
  const el = element?.toLowerCase();
  return ELEMENT_COLORS[el ?? ''] ?? { fg: '#948B7C', bg: 'var(--c-surface-alt)' };
}

function ItalicLast({ text }: { text: string }) {
  const i = text.lastIndexOf(' ');
  if (i === -1) return <>{text}</>;
  return <>{text.slice(0, i + 1)}<em>{text.slice(i + 1)}</em></>;
}

function ElementAvatar({ name, element, size = 36 }: { name?: string; element?: string; size?: number }) {
  const c = elementColor(element);
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: c.bg, color: c.fg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "var(--font-fraunces,Georgia,serif)",
      fontSize: Math.round(size * 0.45),
      flexShrink: 0,
    }}>
      {name ? name.charAt(0).toUpperCase() : '?'}
    </div>
  );
}

// Scroll-reveal wrapper
function Reveal({ delay = 0, children }: { delay?: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [vis, setVis] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setVis(true); return; }
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVis(true); obs.disconnect(); } },
      { threshold: 0.05, rootMargin: '0px 0px -40px 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} style={{
      opacity: vis ? 1 : 0,
      transform: vis ? 'none' : 'translateY(14px)',
      transition: `opacity 0.45s ${delay}ms ease, transform 0.45s ${delay}ms ease`,
    }}>
      {children}
    </div>
  );
}

const RESONANCE_LABEL: Record<string, string> = {
  'strong-current': 'Strong current',
  'mixed-signals':  'Mixed signals',
  'slow-build':     'Slow build',
};

// ── Playbook row ─────────────────────────────────────────────────────────────

function PlaybookRow({ item, last }: { item: PlaybookItem; last: boolean }) {
  const [open, setOpen] = useState(false);
  const isDo = item.type === 'do';
  return (
    <div style={{ borderBottom: last ? 'none' : '1px solid var(--c-hairline)' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          width: '100%', padding: '15px 0',
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{
          flexShrink: 0, width: 46, height: 20, borderRadius: 4,
          background: isDo ? 'var(--c-wood-bg)' : 'var(--c-vermilion-bg)',
          color: isDo ? 'var(--c-wood)' : 'var(--c-vermilion)',
          fontFamily: "var(--font-space-mono,'Courier New')",
          fontSize: 9, letterSpacing: '0.08em',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {isDo ? 'DO' : "DON'T"}
        </span>
        <span style={{
          flex: 1,
          fontFamily: "var(--font-inter,system-ui)", fontSize: 15,
          fontWeight: 500, color: 'var(--c-ink)', lineHeight: 1.5,
        }}>
          {item.tip}
        </span>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" style={{
          flexShrink: 0, color: 'var(--c-hairline)',
          transform: open ? 'rotate(90deg)' : 'none',
          transition: 'transform 0.2s',
        }}>
          <path stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
        </svg>
      </button>
      <div style={{ maxHeight: open ? '200px' : '0', overflow: 'hidden', transition: 'max-height 0.25s ease' }}>
        <p style={{
          margin: '0 0 14px 58px',
          fontFamily: "var(--font-inter,system-ui)",
          fontSize: 15, color: 'var(--c-muted)', lineHeight: 1.6,
        }}>
          {item.why}
        </p>
      </div>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ num, title, watermark }: { num: string; title: string; watermark?: string }) {
  return (
    <div style={{ position: 'relative', padding: '0 0 12px', marginBottom: 4, overflow: 'visible' }}>
      {watermark && (
        <span aria-hidden style={{
          position: 'absolute', right: -4, top: -20,
          fontFamily: "var(--font-fraunces,Georgia,serif)",
          fontSize: 160, lineHeight: 1,
          color: 'var(--c-ink)', opacity: 0.05,
          userSelect: 'none', pointerEvents: 'none',
        }}>
          {watermark}
        </span>
      )}
      <div style={{ borderBottom: '1px solid var(--c-hairline)', paddingBottom: 10, display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{
          fontFamily: "var(--font-space-mono,'Courier New')",
          fontSize: 12, letterSpacing: '0.08em', color: 'var(--c-muted)',
          flexShrink: 0,
        }}>
          {num}
        </span>
        <span style={{
          fontFamily: "var(--font-fraunces,Georgia,serif)",
          fontSize: 24, color: 'var(--c-ink)', lineHeight: 1.2,
        }}>
          {title}
        </span>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function ReadingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [reading, setReading]  = useState<Reading | null | undefined>(undefined);
  const [askLeft,  setAskLeft]  = useState(5);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => { setReading(getReading(id)); }, [id]);
  useEffect(() => {
    if (typeof window !== 'undefined') setAskLeft(getQuotaLeft());
  }, []);

  if (reading === undefined) return null;

  if (!reading) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center' }}>
        <p style={{ fontFamily: "var(--font-inter,system-ui)", color: 'var(--c-muted)', marginBottom: 20 }}>
          Reading not found.
        </p>
        <Link href="/people" style={{ color: 'var(--c-vermilion)', fontFamily: "var(--font-inter,system-ui)", fontSize: 14 }}>
          ← Back to People
        </Link>
      </div>
    );
  }

  const theirEl        = reading.themChart?.dayMaster?.element?.toLowerCase();
  const myEl           = reading.myChart?.dayMaster?.element?.toLowerCase();
  const theirC         = elementColor(theirEl);
  const myC            = elementColor(myEl);
  const b              = reading.briefing;
  const theirArch      = reading.themChart?.dayMaster;
  const theirArchetype = theirArch?.stem ? getArchetype(theirArch.stem as TenStem) : null;
  const myArchStem     = reading.myChart?.dayMaster?.stem;
  const myArchetype    = myArchStem ? getArchetype(myArchStem as TenStem) : null;
  const canShare       = !!(b?.dynamic && reading.themChart && theirArchetype);

  // Datasets for ElementChart
  const theirDataset = reading.themChart
    ? { elements: reading.themChart.elements, pillarsKnown: reading.themChart.pillarsKnown, color: theirC.fg }
    : null;
  const myDataset = reading.myChart
    ? { elements: reading.myChart.elements, pillarsKnown: reading.myChart.pillarsKnown, color: '#C4502E' }
    : null;
  const chartDatasets = [
    ...(myDataset ? [myDataset] : []),
    ...(theirDataset ? [theirDataset] : []),
  ].filter(Boolean);

  return (
    <>
    {shareOpen && (
      <ShareModal
        reading={reading}
        myArchetype={myArchetype}
        theirArchetype={theirArchetype}
        onClose={() => setShareOpen(false)}
      />
    )}
    <div style={{ minHeight: '100svh', background: 'var(--c-paper)', paddingBottom: 48 }}>
      {/* ── Sticky top bar ──────────────────────────────────────────────────── */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px',
        borderBottom: '1px solid var(--c-hairline)',
        background: 'var(--c-card)',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <button
          type="button" onClick={() => router.back()} aria-label="Back"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--c-ink)', display: 'flex', flexShrink: 0 }}
        >
          <svg width={24} height={24} viewBox="0 0 24 24" fill="none">
            <path stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>

        <ElementAvatar name={reading.name} element={theirEl} size={32} />
        <span style={{
          fontFamily: "var(--font-inter,system-ui)", fontSize: 15, fontWeight: 600,
          color: 'var(--c-ink)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {reading.name ?? 'Unknown'}
        </span>

        <button
          type="button"
          onClick={canShare ? () => setShareOpen(true) : undefined}
          disabled={!canShare}
          style={{
            fontFamily: "var(--font-inter,system-ui)", fontSize: 13, fontWeight: 500,
            color: canShare ? 'var(--c-ink)' : 'var(--c-muted)', background: 'none',
            border: '1px solid var(--c-hairline)', borderRadius: 16,
            padding: '6px 14px', cursor: canShare ? 'pointer' : 'not-allowed', flexShrink: 0,
          }}
        >
          Save our card
        </button>
      </header>

      {/* ── Scrollable body ─────────────────────────────────────────────────── */}
      <div className="stagger" style={{ padding: '32px 20px 0' }}>

        {/* YOUR BRIEFING label */}
        <p style={{
          fontFamily: "var(--font-space-mono,'Courier New')",
          fontSize: 10, letterSpacing: '0.12em', color: 'var(--c-muted)',
          marginBottom: 12,
        }}>
          YOUR BRIEFING
        </p>

        {/* Headline */}
        {b?.headline && (
          <h1 style={{
            fontFamily: "var(--font-fraunces,Georgia,serif)",
            fontSize: 44, lineHeight: 1.15, letterSpacing: '-0.02em',
            color: 'var(--c-ink)', marginBottom: 20,
          }}>
            <ItalicLast text={b.headline} />
          </h1>
        )}

        {/* Archetype card */}
        {theirArchetype && theirArch && reading.themChart ? (
          <div style={{ marginBottom: 20 }}>
            <ArchetypeCard
              name={reading.name}
              date={reading.date}
              archetype={theirArchetype}
              element={theirArch.element}
              elements={reading.themChart.elements}
            />
          </div>
        ) : theirArchetype && theirArch ? (
          <div style={{ marginBottom: 20 }}>
            <p style={{
              fontFamily: "var(--font-space-mono,'Courier New')",
              fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
              color: 'var(--c-muted)', margin: '0 0 4px',
            }}>
              {theirArch.element} · {theirArch.polarity}
            </p>
            <p style={{
              fontFamily: "var(--font-fraunces,Georgia,serif)",
              fontSize: 22, fontStyle: 'italic', margin: 0,
              color: theirC.fg,
            }}>
              {theirArchetype.name}
            </p>
          </div>
        ) : null}

        {/* Meta chip row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 36 }}>
          <MetaChip>{reading.relationship}</MetaChip>
          <MetaChip>Born {formatDate(reading.date)}</MetaChip>
          {reading.themChart?.pillarsKnown === 6 && (
            <MetaChip earth>Based on 6 of 8 pillars</MetaChip>
          )}
        </div>

        {/* ── Section 01: Their profile ────────────────────────────────────── */}
        {b?.theirProfile && (
          <div style={{ marginBottom: 48, animationDelay: '45ms' }}>
            <SectionHeader num="01" title="Their profile" />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Reveal delay={0}>
                <ExpandCard
                  icon={<PersonalityIcon width={18} height={18} />}
                  label="Personality"
                  takeaway={b.theirProfile.personality.takeaway}
                  detail={b.theirProfile.personality.detail}
                  tintColor={theirC.fg}
                />
              </Reveal>

              <Reveal delay={50}>
                <ExpandCard
                  icon={<CommunicatesIcon width={18} height={18} />}
                  label="Communication"
                  takeaway={b.theirProfile.communication.takeaway}
                  detail={
                    <div>
                      <p style={{ margin: '0 0 14px', fontFamily: "var(--font-inter,system-ui)", fontSize: 15, color: 'var(--c-ink-body)', lineHeight: 1.6 }}>
                        {b.theirProfile.communication.detail}
                      </p>
                      {b.spectrums && (
                        <SpectrumBar
                          leftLabel="Indirect"
                          rightLabel="Direct"
                          dots={[{ value: b.spectrums.communication, color: theirC.fg }]}
                        />
                      )}
                    </div>
                  }
                  tintColor={theirC.fg}
                />
              </Reveal>

              <Reveal delay={100}>
                <ExpandCard
                  icon={<DecidesIcon width={18} height={18} />}
                  label="Decisions"
                  takeaway={b.theirProfile.decisions.takeaway}
                  detail={
                    <div>
                      <p style={{ margin: '0 0 14px', fontFamily: "var(--font-inter,system-ui)", fontSize: 15, color: 'var(--c-ink-body)', lineHeight: 1.6 }}>
                        {b.theirProfile.decisions.detail}
                      </p>
                      {b.spectrums && (
                        <>
                          <SpectrumBar
                            leftLabel="Gut feel"
                            rightLabel="Analysis"
                            dots={[{ value: b.spectrums.decisions, color: theirC.fg }]}
                            style={{ marginBottom: 12 }}
                          />
                          <SpectrumBar
                            leftLabel="Deliberate"
                            rightLabel="Fast-moving"
                            dots={[{ value: b.spectrums.pace, color: theirC.fg }]}
                          />
                        </>
                      )}
                    </div>
                  }
                  tintColor={theirC.fg}
                />
              </Reveal>

              <Reveal delay={150}>
                <ExpandCard
                  icon={<StressIcon width={18} height={18} />}
                  label="Stress"
                  takeaway={b.theirProfile.stress.takeaway}
                  detail={
                    <div>
                      <p style={{ margin: '0 0 14px', fontFamily: "var(--font-inter,system-ui)", fontSize: 15, color: 'var(--c-ink-body)', lineHeight: 1.6 }}>
                        {b.theirProfile.stress.detail}
                      </p>
                      {b.spectrums && (
                        <SpectrumBar
                          leftLabel="Withdraws"
                          rightLabel="Confronts"
                          dots={[{ value: b.spectrums.stress, color: theirC.fg }]}
                        />
                      )}
                    </div>
                  }
                  tintColor={theirC.fg}
                />
              </Reveal>
            </div>
          </div>
        )}

        {/* ── Section 02: Your dynamic ─────────────────────────────────────── */}
        {b?.dynamic && (
          <div style={{ marginBottom: 48, animationDelay: '90ms' }}>
            <SectionHeader
              num="02"
              title="Your dynamic"
            />

            {/* ElementChart */}
            {chartDatasets.length > 0 && (
              <Reveal>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 16 }}>
                  <ElementChart
                    datasets={chartDatasets}
                    size={280}
                    showGrid
                  />
                  {/* Legend */}
                  <div style={{ display: 'flex', gap: 20, marginTop: 12 }}>
                    {myDataset && (
                      <LegendDot color={'#C4502E'} label="You" />
                    )}
                    {theirDataset && (
                      <LegendDot color={theirC.fg} label={reading.name ?? 'Them'} />
                    )}
                  </div>
                  {/* Resonance label */}
                  {b.dynamic.resonance && (
                    <p style={{
                      marginTop: 12,
                      fontFamily: "var(--font-fraunces,Georgia,serif)",
                      fontSize: 22, fontStyle: 'italic',
                      color: 'var(--c-ink-body)',
                      textAlign: 'center',
                    }}>
                      {RESONANCE_LABEL[b.dynamic.resonance] ?? b.dynamic.resonance}
                    </p>
                  )}
                </div>
              </Reveal>
            )}

            {/* Comparison SpectrumBars (single dot — their values only) */}
            {b.spectrums && (
              <Reveal>
                <div style={{
                  background: 'var(--c-card)', border: '1px solid var(--c-hairline)',
                  borderRadius: 12, padding: '16px 16px', marginBottom: 12,
                  display: 'flex', flexDirection: 'column', gap: 18,
                }}>
                  <SpectrumBar leftLabel="Indirect" rightLabel="Direct" dots={[
                    { value: b.spectrums.communication, color: theirC.fg },
                    ...(b.mySpectrums ? [{ value: b.mySpectrums.communication, color: '#C4502E' }] : []),
                  ]} />
                  <SpectrumBar leftLabel="Gut feel" rightLabel="Analysis" dots={[
                    { value: b.spectrums.decisions, color: theirC.fg },
                    ...(b.mySpectrums ? [{ value: b.mySpectrums.decisions, color: '#C4502E' }] : []),
                  ]} />
                  <SpectrumBar leftLabel="Deliberate" rightLabel="Fast-moving" dots={[
                    { value: b.spectrums.pace, color: theirC.fg },
                    ...(b.mySpectrums ? [{ value: b.mySpectrums.pace, color: '#C4502E' }] : []),
                  ]} />
                  <SpectrumBar leftLabel="Withdraws" rightLabel="Confronts" dots={[
                    { value: b.spectrums.stress, color: theirC.fg },
                    ...(b.mySpectrums ? [{ value: b.mySpectrums.stress, color: '#C4502E' }] : []),
                  ]} />
                </div>
              </Reveal>
            )}

            {/* Click / Clash / Watch */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Reveal delay={0}>
                <ExpandCard
                  icon={<ClickIcon width={18} height={18} />}
                  label="Click"
                  takeaway={b.dynamic.click.takeaway}
                  detail={b.dynamic.click.detail}
                  tintColor="#4E8A52"
                />
              </Reveal>
              <Reveal delay={50}>
                <ExpandCard
                  icon={<ClashIcon width={18} height={18} />}
                  label="Clash"
                  takeaway={b.dynamic.clash.takeaway}
                  detail={b.dynamic.clash.detail}
                  tintColor="#C4502E"
                />
              </Reveal>
              <Reveal delay={100}>
                <ExpandCard
                  icon={<WatchIcon width={18} height={18} />}
                  label="Watch"
                  takeaway={b.dynamic.watch.takeaway}
                  detail={b.dynamic.watch.detail}
                  tintColor="#4A76AC"
                />
              </Reveal>
            </div>
          </div>
        )}

        {/* ── Section 03: Playbook ─────────────────────────────────────────── */}
        {b?.playbook && b.playbook.length > 0 && (
          <div style={{ marginBottom: 48, animationDelay: '135ms' }}>
            <SectionHeader num="03" title="Playbook" />
            <Reveal>
              <div>
                {b.playbook.map((item, i) => (
                  <PlaybookRow key={i} item={item} last={i === b.playbook.length - 1} />
                ))}
              </div>
            </Reveal>
          </div>
        )}

        {/* ── CTA card ─────────────────────────────────────────────────────── */}
        <Reveal>
          <Link
            href={`/ask?person=${reading.id}`}
            className="pressable"
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              textDecoration: 'none',
              background: 'var(--c-card)',
              border: '1px solid var(--c-hairline)',
              borderRadius: 16, padding: '18px 20px',
              marginBottom: 32,
            }}
          >
            <div>
              <p style={{
                margin: '0 0 5px',
                fontFamily: "var(--font-fraunces,Georgia,serif)", fontSize: 20,
                color: 'var(--c-ink)',
              }}>
                Ask Attune about {reading.name ?? 'them'}
              </p>
              <p style={{
                margin: 0,
                fontFamily: "var(--font-space-mono,'Courier New')", fontSize: 10,
                letterSpacing: '0.08em', color: 'var(--c-muted)',
              }}>
                {askLeft} LEFT TODAY
              </p>
            </div>
            <span style={{ color: '#C4502E', fontSize: 22, lineHeight: 1 }}>→</span>
          </Link>
        </Reveal>

        {/* ── Footer disclaimer ────────────────────────────────────────────── */}
        <p style={{
          fontFamily: "var(--font-inter,system-ui)",
          fontSize: 11, color: 'var(--c-muted)', lineHeight: 1.65,
          textAlign: 'center', paddingBottom: 16,
        }}>
          Attune uses Saju — Four Pillars of Destiny as a personality lens,{' '}
          not a prediction tool. All insights are starting points for conversation.
        </p>
      </div>
    </div>
    </>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function MetaChip({ children, earth }: { children: ReactNode; earth?: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      height: 26, padding: '0 10px', borderRadius: 13,
      fontFamily: "var(--font-inter,system-ui)", fontSize: 12, fontWeight: 500,
      background: earth ? 'var(--c-earth-bg)' : 'var(--c-surface-alt)',
      color: earth ? 'var(--c-earth)' : 'var(--c-muted)',
      border: `1px solid ${earth ? 'var(--c-earth-bg)' : 'var(--c-hairline)'}`,
    }}>
      {children}
    </span>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      <span style={{ fontFamily: "var(--font-inter,system-ui)", fontSize: 11, color: 'var(--c-muted)' }}>
        {label}
      </span>
    </div>
  );
}

