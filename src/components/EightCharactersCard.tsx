'use client';

import { useState } from 'react';
import { ELEMENT_COLORS } from '@/lib/store';
import type { ChartSummary } from '@/lib/store';
import { getIljuProfile } from '@/lib/iljuProfiles';
import { IljuSheet } from './IljuSheet';

const SECTION_LABEL_STYLE = {
  fontFamily: 'var(--font-space-mono)',
  fontSize: 10.5,
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
  color: 'var(--c-muted)',
};

// Heavenly stems — hanja + element
const STEM_INFO: Record<string, { hanja: string; element: string }> = {
  'Yang Wood':  { hanja: '甲', element: 'wood' },
  'Yin Wood':   { hanja: '乙', element: 'wood' },
  'Yang Fire':  { hanja: '丙', element: 'fire' },
  'Yin Fire':   { hanja: '丁', element: 'fire' },
  'Yang Earth': { hanja: '戊', element: 'earth' },
  'Yin Earth':  { hanja: '己', element: 'earth' },
  'Yang Metal': { hanja: '庚', element: 'metal' },
  'Yin Metal':  { hanja: '辛', element: 'metal' },
  'Yang Water': { hanja: '壬', element: 'water' },
  'Yin Water':  { hanja: '癸', element: 'water' },
};

// Earthly branches — hanja + element
const BRANCH_INFO: Record<string, { hanja: string; element: string }> = {
  Rat:     { hanja: '子', element: 'water' },
  Ox:      { hanja: '丑', element: 'earth' },
  Tiger:   { hanja: '寅', element: 'wood' },
  Rabbit:  { hanja: '卯', element: 'wood' },
  Dragon:  { hanja: '辰', element: 'earth' },
  Snake:   { hanja: '巳', element: 'fire' },
  Horse:   { hanja: '午', element: 'fire' },
  Goat:    { hanja: '未', element: 'earth' },
  Monkey:  { hanja: '申', element: 'metal' },
  Rooster: { hanja: '酉', element: 'metal' },
  Dog:     { hanja: '戌', element: 'earth' },
  Pig:     { hanja: '亥', element: 'water' },
};

interface CharacterChipProps {
  label: string;
  hanja?: string;
  element?: string;
  highlight?: boolean;
}

function CharacterChip({ label, hanja, element, highlight }: CharacterChipProps) {
  const colors = element ? ELEMENT_COLORS[element] : undefined;
  return (
    <div style={{
      borderRadius: 10,
      padding: '10px 6px',
      textAlign: 'center',
      background: colors?.bg ?? 'var(--c-surface-alt)',
      color: colors?.fg ?? 'var(--c-muted)',
      border: highlight ? '1.5px solid var(--c-vermilion)' : 'none',
    }}>
      {hanja && (
        <div style={{ fontFamily: 'var(--font-fraunces)', fontSize: 22, lineHeight: 1.15 }}>
          {hanja}
        </div>
      )}
      <div style={{
        fontFamily: 'var(--font-space-mono)', fontSize: 7.5,
        marginTop: hanja ? 4 : 0, textTransform: 'lowercase',
      }}>
        {label.toLowerCase()}
      </div>
    </div>
  );
}

function EmptyChip() {
  return (
    <div style={{
      borderRadius: 10, padding: '10px 6px', textAlign: 'center',
      border: '1px dashed var(--c-hairline)', color: 'var(--c-muted)',
    }}>
      <div style={{ fontFamily: 'var(--font-fraunces)', fontSize: 22, lineHeight: 1.15 }}>—</div>
    </div>
  );
}

interface Props {
  pillars: ChartSummary['pillars'];
  pillarsKnown: 6 | 8;
}

const COLUMNS = [
  { key: 'year', label: 'YEAR' },
  { key: 'month', label: 'MONTH' },
  { key: 'day', label: 'DAY' },
  { key: 'hour', label: 'HOUR' },
] as const;

export function EightCharactersCard({ pillars, pillarsKnown }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const dayPillar = pillars.day;
  const dayStemInfo = STEM_INFO[dayPillar.stem];
  const dayBranchInfo = BRANCH_INFO[dayPillar.branch];
  const dayProfile = dayStemInfo && dayBranchInfo
    ? getIljuProfile(dayStemInfo.hanja, dayBranchInfo.hanja)
    : null;

  return (
    <div className="card" style={{ padding: '18px 16px' }}>
      {sheetOpen && dayProfile && dayStemInfo && dayBranchInfo && (
        <IljuSheet
          profile={dayProfile}
          stemHanja={dayStemInfo.hanja}
          branchHanja={dayBranchInfo.hanja}
          stemElement={dayStemInfo.element}
          branchElement={dayBranchInfo.element}
          onClose={() => setSheetOpen(false)}
        />
      )}
      <p style={{ ...SECTION_LABEL_STYLE, marginBottom: 14 }}>YOUR EIGHT CHARACTERS</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {COLUMNS.map(col => {
          const pillar = pillars[col.key];
          const hourUnknown = col.key === 'hour' && pillarsKnown === 6;
          const isDay = col.key === 'day';
          const dayTappable = isDay && dayProfile !== null;

          return (
            <div
              key={col.key}
              className={dayTappable ? 'pressable' : undefined}
              role={dayTappable ? 'button' : undefined}
              tabIndex={dayTappable ? 0 : undefined}
              onClick={dayTappable ? () => setSheetOpen(true) : undefined}
              onKeyDown={dayTappable ? (e) => { if (e.key === 'Enter' || e.key === ' ') setSheetOpen(true); } : undefined}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                cursor: dayTappable ? 'pointer' : undefined,
              }}
            >
              <span style={{
                fontFamily: 'var(--font-space-mono)', fontSize: 9,
                color: 'var(--c-muted)', textTransform: 'uppercase',
              }}>
                {col.label}{dayTappable && <span style={{ color: 'var(--c-muted)' }}> ›</span>}
              </span>
              {hourUnknown && (
                <span style={{ fontFamily: 'var(--font-space-mono)', fontSize: 7.5, color: 'var(--c-muted)' }}>
                  unknown
                </span>
              )}

              {hourUnknown || !pillar ? (
                <>
                  <EmptyChip />
                  <EmptyChip />
                </>
              ) : (
                <>
                  <div style={{ position: 'relative' }}>
                    <CharacterChip
                      label={pillar.stem}
                      hanja={STEM_INFO[pillar.stem]?.hanja}
                      element={STEM_INFO[pillar.stem]?.element}
                      highlight={col.key === 'day'}
                    />
                    {col.key === 'day' && (
                      <span style={{
                        position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
                        marginTop: 2, fontFamily: 'var(--font-space-mono)', fontSize: 7, color: 'var(--c-vermilion)',
                        whiteSpace: 'nowrap',
                      }}>
                        YOU
                      </span>
                    )}
                  </div>
                  <CharacterChip
                    label={pillar.branch}
                    hanja={BRANCH_INFO[pillar.branch]?.hanja}
                    element={BRANCH_INFO[pillar.branch]?.element}
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
