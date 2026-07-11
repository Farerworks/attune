import type { ReactNode } from 'react';
import type { TenStem } from '@/lib/saju';
import { ELEMENT_COLORS } from '@/lib/store';

const GLYPHS: Record<TenStem, ReactNode> = {
  'Yang Wood': (
    <>
      <path d="M5 19h14"/>
      <path d="M12 19V7.5"/>
      <path d="M7.5 12L12 7.5 16.5 12"/>
    </>
  ),
  'Yin Wood': (
    <>
      <path d="M5 19L19 5"/>
      <path d="M8.5 15.5l2.2 2.2"/>
      <path d="M12.8 11.2l2.2 2.2"/>
    </>
  ),
  'Yang Fire': (
    <>
      <circle cx="12" cy="12" r="3.6"/>
      <path d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7"/>
    </>
  ),
  'Yin Fire': (
    <>
      <path d="M12 21c3.1 0 5-2.2 5-5 0-3-2.5-4.3-1.8-7.6-2 1.2-3 2.6-3.4 4.3-1-.8-1.2-2.1-.9-3.6C9 10.8 8 12.9 8 16c0 2.8 1.8 5 4 5z"/>
    </>
  ),
  'Yang Earth': (
    <>
      <path d="M3 19h18"/>
      <path d="M3 19l6-11 4.5 7"/>
      <path d="M11.5 16l3.5-6 6 9"/>
    </>
  ),
  'Yin Earth': (
    <>
      <path d="M12 20V9.5"/>
      <path d="M12 13.5c-1.8 0-4.5-1.2-4.5-4.5 2.8 0 4.5 1.7 4.5 4.5z"/>
      <path d="M12 11.5c1.8 0 4.5-1.2 4.5-4.5-2.8 0-4.5 1.7-4.5 4.5z"/>
      <path d="M7.5 20h9"/>
    </>
  ),
  'Yang Metal': (
    <>
      <path d="M3 12h11"/>
      <path d="M11.5 8.5l3.5 3.5-3.5 3.5"/>
      <circle cx="20" cy="12" r="1.9" fill="currentColor" stroke="none"/>
    </>
  ),
  'Yin Metal': (
    <>
      <path d="M12 3l6 9-6 9-6-9z"/>
      <path d="M6.5 12h11"/>
    </>
  ),
  'Yang Water': (
    <>
      <path d="M3 10c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>
      <path d="M3 15.5c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>
    </>
  ),
  'Yin Water': (
    <>
      <path d="M4 14h16"/>
      <path d="M4 17.5h16"/>
      <ellipse cx="12" cy="9" rx="4.6" ry="1.6"/>
      <circle cx="12" cy="9" r="0.9" fill="currentColor" stroke="none"/>
    </>
  ),
};

interface GlyphProps {
  stem: TenStem;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function ArchetypeGlyph({ stem, size = 24, color = 'currentColor', strokeWidth = 2.1 }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {GLYPHS[stem]}
    </svg>
  );
}

interface AvatarProps {
  stem: TenStem;
  element: string;
  size?: number;
}

export function GlyphAvatar({ stem, element, size = 44 }: AvatarProps) {
  const colors = ELEMENT_COLORS[element.toLowerCase()] ?? { fg: '#948B7C', bg: 'var(--c-surface-alt)' };
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: colors.bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    }}>
      <ArchetypeGlyph stem={stem} color={colors.fg} size={Math.round(size * 0.58)} />
    </div>
  );
}
