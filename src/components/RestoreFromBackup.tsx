'use client';

import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import { getSyncSession, pullBackup, applySnapshot, markReplaceAck, type PullResult, type SyncSession } from '@/lib/sync';

type ViewState = 'checking' | 'link' | 'banner' | 'none' | 'error' | 'confirm' | 'hidden';

// BRIEF-107 §2.4 — this screen has no model output to key language off of; it uses the same
// browser-language signal already used elsewhere in the static onboarding UI.
function isKo(): boolean {
  return typeof navigator !== 'undefined' && navigator.language.startsWith('ko');
}

// BRIEF-107 §2.1/§2.2 — confirmed copy. Do not edit these strings.
const COPY = {
  en: {
    none: {
      title: 'No backup found',
      body: "We couldn't find a backup for this account. You can continue below to start fresh.",
    },
    error: {
      title: "Couldn't load your backup",
      body: "Check your connection and try again. Your existing backup hasn't been restored.",
      retry: 'Try again',
    },
    confirm: {
      title: 'Start fresh on this device?',
      body: "Your existing Google backup will be replaced with this device's data. This can't be undone.",
      replace: 'Replace backup',
      cancel: 'Cancel',
    },
  },
  ko: {
    none: {
      title: '백업을 찾지 못했어요',
      body: '이 계정에 저장된 백업이 없어요. 아래에서 새로 시작할 수 있어요.',
    },
    error: {
      title: '백업을 불러오지 못했어요',
      body: '연결을 확인한 뒤 다시 시도해 주세요. 기존 백업은 아직 복원되지 않았어요.',
      retry: '다시 시도',
    },
    confirm: {
      title: '이 기기에서 새로 시작할까요?',
      body: 'Google 계정에 저장된 기존 백업이 이 기기의 데이터로 대체됩니다. 되돌릴 수 없어요.',
      replace: '백업 대체',
      cancel: '취소',
    },
  },
};

export function RestoreFromBackup() {
  const [view, setView] = useState<ViewState>('checking');
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const sessionRef = useRef<SyncSession | null>(null);

  // BRIEF-107 §1.3 — shared by the initial check and "Try again" (which re-calls pullBackup only,
  // not getSyncSession — the session from the initial check is still what we act on).
  function applyPullResult(res: PullResult) {
    if (res === null) {
      // §1.3 row 2 — nothing exists on the server for this account; there is nothing a later
      // push could destructively replace, so it's safe to record the ack here.
      const sub = sessionRef.current?.sub;
      if (sub) markReplaceAck(sub);
      setView('none');
      return;
    }
    if (!res.ok) {
      // §1.3 — a failed fetch tells us nothing about whether a real backup still exists on the
      // server, so no ack is recorded here.
      setView('error');
      return;
    }
    setPayload(res.payload);
    setUpdatedAt(res.updatedAt);
    setView('banner');
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await getSyncSession();
      if (cancelled) return;
      sessionRef.current = session;
      if (!session) {
        setView('link');
        return;
      }
      const res = await pullBackup();
      if (cancelled) return;
      applyPullResult(res);
    })();
    return () => { cancelled = true; };
  }, []);

  function handleSignIn() {
    window.location.href = '/api/auth/signin?callbackUrl=/onboarding';
  }

  async function handleRetry() {
    const res = await pullBackup();
    applyPullResult(res);
  }

  function handleRestore() {
    if (restoring || !payload) return;
    setRestoring(true);
    applySnapshot(payload);
    // §1.3 row 1 — ack only AFTER the snapshot is applied, before leaving for /you.
    const sub = sessionRef.current?.sub;
    if (sub) markReplaceAck(sub);
    window.location.href = '/you';
  }

  function handleStartFresh() {
    setView('confirm');
  }

  function handleCancelReplace() {
    setView('banner');
  }

  function handleConfirmReplace() {
    // §1.3 row 3 — the user was shown what will be replaced and chose to replace it.
    const sub = sessionRef.current?.sub;
    if (sub) markReplaceAck(sub);
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

  const cardStyle: CSSProperties = {
    marginTop: 20,
    padding: 20,
    background: 'var(--c-card)',
    border: '1px solid var(--c-hairline)',
    borderRadius: 16,
  };
  const titleStyle: CSSProperties = {
    fontFamily: 'var(--font-inter)', fontSize: 15, fontWeight: 600,
    color: 'var(--c-ink)', marginBottom: 6,
  };
  const bodyStyle: CSSProperties = {
    fontFamily: 'var(--font-inter)', fontSize: 13, color: 'var(--c-muted)',
    marginBottom: 16, lineHeight: 1.5,
  };

  if (view === 'none') {
    const copy = isKo() ? COPY.ko.none : COPY.en.none;
    return (
      <div style={cardStyle}>
        <p style={titleStyle}>{copy.title}</p>
        <p style={{ ...bodyStyle, marginBottom: 0 }}>{copy.body}</p>
      </div>
    );
  }

  if (view === 'error') {
    const copy = isKo() ? COPY.ko.error : COPY.en.error;
    return (
      <div style={cardStyle}>
        <p style={titleStyle}>{copy.title}</p>
        <p style={bodyStyle}>{copy.body}</p>
        <button
          type="button"
          className="btn-primary pressable"
          onClick={() => void handleRetry()}
          style={{ width: '100%' }}
        >
          {copy.retry}
        </button>
      </div>
    );
  }

  if (view === 'confirm') {
    const copy = isKo() ? COPY.ko.confirm : COPY.en.confirm;
    return (
      <div style={cardStyle}>
        <p style={titleStyle}>{copy.title}</p>
        <p style={bodyStyle}>{copy.body}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            className="btn-primary pressable"
            onClick={handleConfirmReplace}
            style={{ flex: 1 }}
          >
            {copy.replace}
          </button>
          <button
            type="button"
            className="pressable"
            onClick={handleCancelReplace}
            style={{
              background: 'none', border: 'none', padding: '8px 4px',
              fontFamily: 'var(--font-inter)', fontSize: 13, color: 'var(--c-muted)',
              cursor: 'pointer',
            }}
          >
            {copy.cancel}
          </button>
        </div>
      </div>
    );
  }

  // view === 'banner'
  const dateStr = updatedAt ? new Date(updatedAt).toLocaleDateString() : '';

  return (
    <div style={cardStyle}>
      <p style={titleStyle}>
        Backup found
      </p>
      <p style={bodyStyle}>
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
