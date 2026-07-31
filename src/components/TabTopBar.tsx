import type { ReactNode } from 'react';

export function TabTopBar({ right, children }: { right?: ReactNode; children?: ReactNode }) {
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: 'rgba(250,248,244,0.92)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      borderBottom: '1px solid var(--c-hairline)',
      padding: children ? '12px 20px 0' : '12px 20px',
      paddingTop: 'env(safe-area-inset-top, 0px)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: children ? 10 : 0 }}>
        <span style={{
          fontFamily: "var(--font-space-mono,'Courier New')",
          fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--c-ink)',
        }}>
          ATTUNE
        </span>
        {right}
      </div>
      {children}
    </div>
  );
}
