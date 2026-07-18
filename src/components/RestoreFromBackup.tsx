'use client';

import { useEffect, useState } from 'react';
import { getSyncSession, pullBackup, applySnapshot } from '@/lib/sync';

type ViewState = 'checking' | 'link' | 'banner' | 'hidden';

export function RestoreFromBackup() {
  const [view, setView] = useState<ViewState>('checking');
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await getSyncSession();
      if (cancelled) return;
      if (!session) {
        setView('link');
        return;
      }
      const res = await pullBackup();
      if (cancelled) return;
      if (res && res.ok) {
        setPayload(res.payload);
        setUpdatedAt(res.updatedAt);
        setView('banner');
      } else {
        setView('hidden');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function handleSignIn() {
    window.location.href = '/api/auth/signin?callbackUrl=/onboarding';
  }

  function handleRestore() {
    if (restoring || !payload) return;
    setRestoring(true);
    applySnapshot(payload);
    window.location.href = '/you';
  }

  function handleStartFresh() {
    setView('hidden');
  }

  if (view === 'checking' || view === 'hidden') return null;

  if (view === 'link') {
    return (
      <button
        type="button"
        onClick={handleSignIn}
        className="pressable"
        style={{
          display: 'block', width: '100%', marginTop: 20,
          background: 'none', border: 'none', padding: 0,
          fontFamily: 'var(--font-inter)', fontSize: 13, color: 'var(--c-muted)',
          textAlign: 'center', cursor: 'pointer',
        }}
      >
        Already have Attune? Restore your backup
      </button>
    );
  }

  const dateStr = updatedAt ? new Date(updatedAt).toLocaleDateString() : '';

  return (
    <div
      style={{
        marginTop: 20,
        padding: 20,
        background: 'var(--c-card)',
        border: '1px solid var(--c-hairline)',
        borderRadius: 16,
      }}
    >
      <p style={{
        fontFamily: 'var(--font-inter)', fontSize: 15, fontWeight: 600,
        color: 'var(--c-ink)', marginBottom: 6,
      }}>
        Backup found
      </p>
      <p style={{
        fontFamily: 'var(--font-inter)', fontSize: 13, color: 'var(--c-muted)',
        marginBottom: 16, lineHeight: 1.5,
      }}>
        We found your backup from {dateStr}.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          type="button"
          className="btn-primary pressable"
          disabled={restoring}
          onClick={handleRestore}
          style={{ flex: 1 }}
        >
          {restoring ? 'Restoring…' : 'Restore'}
        </button>
        <button
          type="button"
          className="pressable"
          disabled={restoring}
          onClick={handleStartFresh}
          style={{
            background: 'none', border: 'none', padding: '8px 4px',
            fontFamily: 'var(--font-inter)', fontSize: 13, color: 'var(--c-muted)',
            cursor: 'pointer',
          }}
        >
          Start fresh
        </button>
      </div>
    </div>
  );
}
