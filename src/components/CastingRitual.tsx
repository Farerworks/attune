'use client';

import { useState, useEffect, useRef } from 'react';
import type { ChartSummary } from '@/lib/store';
import { ELEMENT_COLORS } from '@/lib/store';
import { ElementChart } from './ElementChart';

const MIN_MS = 2500;

// Earthly branch → element mapping
const BRANCH_EL: Record<string, string> = {
  Rat: 'water', Ox: 'earth', Tiger: 'wood', Rabbit: 'wood',
  Dragon: 'earth', Snake: 'fire', Horse: 'fire', Goat: 'earth',
  Monkey: 'metal', Rooster: 'metal', Dog: 'earth', Pig: 'water',
};

interface Props {
  active: boolean;
  name?: string;
  themChart: ChartSummary | null;
  ready: boolean;    // true when API response arrived
  onDone: () => void;
}

export function CastingRitual({ active, name, themChart, ready, onDone }: Props) {
  const [show,     setShow]     = useState(false);
  const [dark,     setDark]     = useState(false);
  const [labelOn,  setLabelOn]  = useState(false);
  const [pillarN,  setPillarN]  = useState(0);   // 0-4: how many pillars visible
  const [blobOn,   setBlobOn]   = useState(false);
  const [tagOn,    setTagOn]    = useState(false);

  const timers   = useRef<ReturnType<typeof setTimeout>[]>([]);
  const startTs  = useRef(0);
  const exiting  = useRef(false);
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  function clear() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }

  function after(ms: number, fn: () => void) {
    const t = setTimeout(fn, ms);
    timers.current.push(t);
  }

  function doExit() {
    if (exiting.current) return;
    exiting.current = true;
    const elapsed  = Date.now() - startTs.current;
    const wait     = Math.max(0, MIN_MS - elapsed);
    clear();
    after(wait, () => {
      setDark(false);
      after(520, () => {
        setShow(false);
        onDoneRef.current();
      });
    });
  }

  // Sequence when active flips on
  useEffect(() => {
    if (!active) {
      clear();
      setShow(false); setDark(false); setLabelOn(false);
      setPillarN(0); setBlobOn(false); setTagOn(false);
      exiting.current = false;
      return;
    }
    startTs.current = Date.now();
    exiting.current = false;
    setShow(true);

    after(20,   () => setDark(true));
    after(520,  () => setLabelOn(true));
    after(920,  () => setPillarN(1));
    after(1320, () => setPillarN(2));
    after(1720, () => setPillarN(3));
    after(2120, () => setPillarN(4));
    after(2520, () => setBlobOn(true));
    after(3120, () => setTagOn(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // When API arrives AND tagline is showing → fade out
  useEffect(() => {
    if (ready && tagOn && show) doExit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, tagOn, show]);

  function skip() {
    if (exiting.current || !show) return;
    clear();
    setLabelOn(true); setPillarN(4); setBlobOn(true); setTagOn(true);
    if (ready) doExit();
    // else: wait for the ready effect above
  }

  if (!show) return null;

  const el    = themChart?.dayMaster?.element?.toLowerCase() ?? '';
  const color = ELEMENT_COLORS[el]?.fg ?? '#948B7C';

  const PILLARS = [
    { label: 'YEAR',  p: themChart?.pillars.year,  unknown: false },
    { label: 'MONTH', p: themChart?.pillars.month, unknown: false },
    { label: 'DAY',   p: themChart?.pillars.day,   unknown: false },
    { label: 'HOUR',  p: themChart?.pillars.hour ?? null, unknown: !themChart?.pillars.hour },
  ];

  return (
    <div
      onClick={skip}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: dark ? '#12100D' : 'var(--c-paper)',
        transition: 'background 0.5s ease',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* "CASTING …'S CHART" */}
      <p style={{
        margin: '0 0 36px',
        fontFamily: "var(--font-space-mono,'Courier New')",
        fontSize: 11,
        letterSpacing: '0.14em',
        color: '#948B7C',
        opacity: labelOn ? 1 : 0,
        transform: labelOn ? 'none' : 'translateY(-6px)',
        transition: 'opacity 0.4s, transform 0.4s',
      }}>
        CASTING {name ? name.toUpperCase() + "'S" : 'THEIR'} CHART
      </p>

      {/* Pillars */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 36, alignItems: 'flex-start' }}>
        {PILLARS.map(({ label, p, unknown }, i) => {
          const vis = pillarN > i;
          return (
            <div key={label} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              opacity: vis ? 1 : 0,
              transform: vis ? 'none' : 'translateY(16px)',
              transition: 'opacity 0.4s, transform 0.4s',
            }}>
              <span style={{
                fontFamily: "var(--font-space-mono,'Courier New')",
                fontSize: 9, letterSpacing: '0.1em', color: 'rgba(148,139,124,0.7)',
              }}>
                {label}
              </span>
              <PillarBlock
                stem={p?.stem ?? ''}
                branch={p?.branch ?? ''}
                unknown={unknown}
              />
            </div>
          );
        })}
      </div>

      {/* Element blob */}
      <div style={{
        marginBottom: 28,
        opacity: blobOn ? 1 : 0,
        transform: blobOn ? 'scale(1)' : 'scale(0.5)',
        transition: 'opacity 0.6s, transform 0.6s',
      }}>
        {themChart ? (
          <ElementChart
            datasets={[{
              elements: themChart.elements,
              pillarsKnown: themChart.pillarsKnown,
              color,
            }]}
            size={136}
            showGrid={false}
            darkMode
          />
        ) : (
          <div style={{ width: 136, height: 136 }} />
        )}
      </div>

      {/* Tagline */}
      <p style={{
        margin: 0,
        fontFamily: "var(--font-fraunces,Georgia,serif)",
        fontSize: 20,
        fontStyle: 'italic',
        color: 'rgba(241,237,230,0.9)',
        opacity: tagOn ? 1 : 0,
        transform: tagOn ? 'none' : 'translateY(6px)',
        transition: 'opacity 0.5s, transform 0.5s',
      }}>
        Two energies, one map.
      </p>

      {/* Bottom hint / spinner */}
      <div style={{ position: 'absolute', bottom: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <span style={{
          fontFamily: "var(--font-space-mono,'Courier New')",
          fontSize: 10, letterSpacing: '0.12em',
          color: 'rgba(148,139,124,0.45)',
        }}>
          NOT A VERDICT — A WAY TO UNDERSTAND
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!tagOn && (
            <span style={{
              fontFamily: "var(--font-space-mono,'Courier New')",
              fontSize: 10, letterSpacing: '0.1em',
              color: 'rgba(148,139,124,0.5)',
            }}>
              TAP TO SKIP
            </span>
          )}
          {tagOn && !ready && <Spinner />}
        </div>
      </div>

      <style>{`@keyframes rspin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function PillarBlock({ stem, branch, unknown }: { stem: string; branch: string; unknown: boolean }) {
  const stemEl   = stem.split(' ').pop()?.toLowerCase() ?? 'earth';
  const branchEl = BRANCH_EL[branch] ?? 'earth';
  const topColor    = ELEMENT_COLORS[stemEl]?.fg   ?? 'rgba(148,139,124,0.6)';
  const bottomColor = ELEMENT_COLORS[branchEl]?.fg ?? 'rgba(148,139,124,0.4)';

  return (
    <div style={{
      width: 40, height: 120, borderRadius: 10,
      overflow: 'hidden',
      opacity: unknown ? 0.25 : 1,
      filter: unknown ? 'blur(4px)' : 'none',
      transition: 'opacity 0.3s, filter 0.3s',
    }}>
      <div style={{ height: 60, background: topColor }} />
      <div style={{ height: 60, background: bottomColor }} />
    </div>
  );
}

function Spinner() {
  return (
    <div style={{
      width: 16, height: 16, borderRadius: '50%',
      border: '2px solid rgba(148,139,124,0.2)',
      borderTopColor: '#948B7C',
      animation: 'rspin 0.8s linear infinite',
    }} />
  );
}
