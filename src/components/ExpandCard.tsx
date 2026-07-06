'use client';

import { useState, type ReactNode } from 'react';

interface ExpandCardProps {
  icon: ReactNode;
  label?: string;     // small uppercase label above takeaway
  takeaway: string;
  detail: ReactNode;  // text or JSX (can include SpectrumBar)
  tintColor: string;  // hex, e.g. '#4E8A52'
}

function hexRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function ExpandCard({ icon, label, takeaway, detail, tintColor }: ExpandCardProps) {
  const [open, setOpen] = useState(false);

  const baseBg   = hexRgba(tintColor, 0.04);
  const openBg   = hexRgba(tintColor, 0.07);
  const iconColor = hexRgba(tintColor, 0.75);

  return (
    <div style={{
      borderRadius: 12,
      border: '1px solid var(--c-hairline)',
      background: open ? openBg : baseBg,
      overflow: 'hidden',
      transition: 'background 0.15s',
    }}>
      {/* Header row */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          width: '100%',
          padding: '14px 16px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ flexShrink: 0, color: iconColor, display: 'flex', alignItems: 'center' }}>
          {icon}
        </span>

        <span style={{ flex: 1, minWidth: 0 }}>
          {label && (
            <span style={{
              display: 'block',
              fontFamily: "var(--font-space-mono,'Courier New')",
              fontSize: 9,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--c-muted)',
              marginBottom: 3,
            }}>
              {label}
            </span>
          )}
          <span style={{
            display: 'block',
            fontFamily: "var(--font-inter,system-ui)",
            fontSize: 17,
            fontWeight: 600,
            color: 'var(--c-ink)',
            lineHeight: 1.4,
          }}>
            {takeaway}
          </span>
        </span>

        {/* Chevron */}
        <svg
          width={16} height={16} viewBox="0 0 24 24" fill="none"
          style={{
            flexShrink: 0,
            color: 'var(--c-muted)',
            transform: open ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.2s',
          }}
        >
          <path stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
        </svg>
      </button>

      {/* Detail (CSS max-height animation) */}
      <div style={{
        maxHeight: open ? '600px' : '0',
        overflow: 'hidden',
        transition: 'max-height 0.3s cubic-bezier(0.4,0,0.2,1)',
      }}>
        <div style={{ padding: '2px 16px 16px' }}>
          {typeof detail === 'string' ? (
            <p style={{
              margin: 0,
              fontFamily: "var(--font-inter,system-ui)",
              fontSize: 15,
              color: 'var(--c-ink-body)',
              lineHeight: 1.6,
            }}>
              {detail}
            </p>
          ) : detail}
        </div>
      </div>
    </div>
  );
}
