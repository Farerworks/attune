'use client';

import type { CSSProperties, ReactNode } from 'react';
import type { IljuProfile } from '@/lib/iljuProfiles';
import { ELEMENT_COLORS } from '@/lib/store';

const SECTION_LABEL_STYLE = {
  fontFamily: 'var(--font-space-mono)',
  fontSize: 10.5,
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
  color: 'var(--c-muted)',
};

const SECTION_BODY_STYLE: CSSProperties = {
  fontFamily: 'var(--font-inter)',
  fontSize: 14.5,
  lineHeight: 1.6,
  color: 'var(--c-ink-body)',
  margin: 0,
};

function HanjaChip({ hanja, element }: { hanja: string; element: string }) {
  const colors = ELEMENT_COLORS[element] ?? { fg: 'var(--c-muted)', bg: 'var(--c-surface-alt)' };
  return (
    <div style={{
      width: 42, height: 42, borderRadius: 10,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: colors.bg, color: colors.fg,
      fontFamily: 'var(--font-fraunces)', fontSize: 21,
    }}>
      {hanja}
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <p style={{ ...SECTION_LABEL_STYLE, marginBottom: 8 }}>{label}</p>
      {children}
    </div>
  );
}

interface Props {
  profile: IljuProfile;
  stemHanja: string;
  branchHanja: string;
  stemElement: string;
  branchElement: string;
  onClose: () => void;
}

export function IljuSheet({ profile, stemHanja, branchHanja, stemElement, branchElement, onClose }: Props) {
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(8,7,5,0.82)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        animation: 'fade-in 200ms ease backwards',
      }}
    >
      <div style={{
        background: 'var(--c-paper)',
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        maxHeight: '85vh', overflowY: 'auto',
        padding: '24px 20px calc(24px + env(safe-area-inset-bottom, 0px))',
        animation: 'sheet-up var(--dur-slow) var(--ease-sheet) backwards',
      }}>
        {/* Header: hanja chips + name + close */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              <HanjaChip hanja={stemHanja} element={stemElement} />
              <HanjaChip hanja={branchHanja} element={branchElement} />
            </div>
            <h2 style={{ fontFamily: 'var(--font-fraunces)', fontSize: 20, fontWeight: 500, color: 'var(--c-ink)', margin: 0, lineHeight: 1.25 }}>
              {profile.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="pressable"
            style={{
              flexShrink: 0, border: 'none', background: 'none', color: 'var(--c-muted)',
              fontSize: 22, lineHeight: 1, padding: 4, cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>

        {/* Subtitle */}
        <p style={{
          fontFamily: 'var(--font-fraunces)', fontSize: 16, fontStyle: 'italic',
          color: 'var(--c-ink-body)', margin: '0 0 14px', lineHeight: 1.3,
        }}>
          {profile.subtitle}
        </p>

        {/* Essence */}
        <p style={{
          fontFamily: 'var(--font-fraunces)', fontSize: 15, fontStyle: 'italic',
          color: 'var(--c-vermilion)', margin: '0 0 24px', lineHeight: 1.4,
          paddingLeft: 14, borderLeft: '2px solid var(--c-vermilion)',
        }}>
          {profile.essence}
        </p>

        <Section label="CORE">
          <p style={SECTION_BODY_STYLE}>{profile.core}</p>
        </Section>

        <Section label="RELATING">
          <p style={SECTION_BODY_STYLE}>{profile.relating}</p>
        </Section>

        <Section label="GIFTS">
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {profile.gifts.map(gift => (
              <li key={gift} style={{ ...SECTION_BODY_STYLE, display: 'flex', gap: 8 }}>
                <span style={{ color: 'var(--c-vermilion)' }} aria-hidden="true">·</span>
                <span>{gift}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section label="UNDER PRESSURE">
          <p style={SECTION_BODY_STYLE}>{profile.underPressure}</p>
        </Section>

        <Section label="REACHING THEM">
          <p style={SECTION_BODY_STYLE}>{profile.reachingThem}</p>
        </Section>

        {profile.traditionNote && (
          <div style={{ marginTop: 4, paddingTop: 16, borderTop: '1px solid var(--c-hairline)' }}>
            <p style={{
              fontFamily: 'var(--font-inter)', fontSize: 12, fontStyle: 'italic',
              color: 'var(--c-muted)', lineHeight: 1.5, margin: 0,
            }}>
              {profile.traditionNote}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
