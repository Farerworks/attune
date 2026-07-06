'use client';

import type { CSSProperties } from 'react';

interface Dot {
  value: number;  // 0–100
  color: string;
}

interface SpectrumBarProps {
  leftLabel: string;
  rightLabel: string;
  dots: Dot[];  // 1 or 2
  style?: CSSProperties;
}

export function SpectrumBar({ leftLabel, rightLabel, dots, style }: SpectrumBarProps) {
  return (
    <div style={style}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
        <span style={{
          fontFamily: "var(--font-space-mono,'Courier New')",
          fontSize: 10,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--c-muted)',
        }}>
          {leftLabel}
        </span>
        <span style={{
          fontFamily: "var(--font-space-mono,'Courier New')",
          fontSize: 10,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--c-muted)',
        }}>
          {rightLabel}
        </span>
      </div>

      <div style={{ position: 'relative', height: 4 }}>
        {/* Track */}
        <div style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 2,
          background: 'var(--c-hairline)',
        }} />

        {/* Dots */}
        {dots.map((dot, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: '50%',
              left: `${Math.max(0, Math.min(100, dot.value))}%`,
              transform: 'translate(-50%, -50%)',
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: dot.color,
              border: '2px solid var(--c-card)',
              zIndex: 1,
            }}
          />
        ))}
      </div>
    </div>
  );
}
