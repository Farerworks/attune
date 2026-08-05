import type { ReactNode } from 'react';

export function TabTopBar({ title, right, children }: { title?: string; right?: ReactNode; children?: ReactNode }) {
  // Same box gets taller content (title row, or a caller's children) below the ATTUNE row —
  // pixel-identical to before when neither is given (BRIEF-094F).
  const hasBelow = Boolean(title) || Boolean(children);

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: 'rgba(250,248,244,0.92)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      borderBottom: '1px solid var(--c-hairline)',
      padding: hasBelow ? '12px 20px 0' : '12px 20px',
      paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: hasBelow ? 10 : 0 }}>
        <span style={{
          fontFamily: "var(--font-space-mono,'Courier New')",
          fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--c-ink)',
        }}>
          ATTUNE
        </span>
        {right}
      </div>
      {title && <h1 className="t-h2" style={{ margin: '0 0 12px' }}>{title}</h1>}
      {children}
    </div>
  );
}
