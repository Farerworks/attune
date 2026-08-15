'use client';

import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clearAllData } from '@/lib/store';
import { ChevronIcon } from '@/components/icons/ChevronIcon';
import { TabTopBar } from '@/components/TabTopBar';
import { getSyncSession, pushBackup, pullBackup, deleteBackup, applySnapshot, hasReplaceAck, LS_LAST_BACKUP, type SyncSession } from '@/lib/sync';

// beforeinstallprompt is non-standard — define locally
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function InstallSheet({ onClose }: { onClose: () => void }) {
  const isIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(26,24,21,0.48)',
        display: 'flex', alignItems: 'flex-end',
        animation: 'fade-in 200ms ease backwards',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          background: 'var(--c-card)',
          borderRadius: '20px 20px 0 0',
          padding: '28px 24px 48px',
          animation: 'sheet-up var(--dur-slow) var(--ease-sheet) backwards',
        }}
      >
        <p style={{
          fontFamily: 'var(--font-inter)',
          fontSize: 15, lineHeight: 1.6,
          color: 'var(--c-ink)', marginBottom: 24,
        }}>
          {isIOS
            ? 'In Safari: tap the Share button, then "Add to Home Screen".'
            : 'In Chrome: tap the menu (⋮), then "Install app".'}
        </p>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: '100%', height: 48, borderRadius: 999,
            background: 'var(--c-surface-alt)',
            border: '1px solid var(--c-hairline)',
            fontFamily: 'var(--font-inter)', fontSize: 15,
            color: 'var(--c-ink)', cursor: 'pointer',
          }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}

function AboutSheet({ onClose }: { onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(26,24,21,0.48)',
        display: 'flex', alignItems: 'flex-end',
        animation: 'fade-in 200ms ease backwards',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          background: 'var(--c-card)',
          borderRadius: '20px 20px 0 0',
          padding: '28px 24px 48px',
          animation: 'sheet-up var(--dur-slow) var(--ease-sheet) backwards',
        }}
      >
        <p style={{
          fontFamily: 'var(--font-space-mono)',
          fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
          color: 'var(--c-muted)', marginBottom: 20,
        }}>
          ATTUNE · v1.0
        </p>
        <p style={{
          fontFamily: 'var(--font-inter)',
          fontSize: 13, lineHeight: 1.6,
          color: 'var(--c-muted)', marginBottom: 16,
        }}>
          Attune uses Four Pillars of Destiny — a classical East Asian character-reading system — to generate probabilistic personality insights about the people in your life.
        </p>
        <p style={{
          fontFamily: 'var(--font-inter)',
          fontSize: 13, lineHeight: 1.6,
          color: 'var(--c-muted)', marginBottom: 24,
        }}>
          Made by farerworks
        </p>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: '100%', height: 48, borderRadius: 999,
            background: 'var(--c-surface-alt)',
            border: '1px solid var(--c-hairline)',
            fontFamily: 'var(--font-inter)', fontSize: 15,
            color: 'var(--c-ink)', cursor: 'pointer',
          }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}

interface RowProps {
  label: string;
  href?: string;
  danger?: boolean;
  chevron?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}

function Row({ label, href, danger, chevron, onClick, disabled }: RowProps) {
  const style: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    textDecoration: 'none',
    color: danger ? 'var(--c-vermilion)' : 'var(--c-ink)',
    fontFamily: 'var(--font-inter)',
    fontSize: 15,
    background: 'var(--c-card)',
    borderBottom: '1px solid var(--c-hairline)',
    cursor: 'pointer',
  };

  if (href) {
    return (
      <Link href={href} className="pressable" style={style}>
        <span>{label}</span>
        <ChevronIcon width={18} height={18} style={{ color: 'var(--c-muted)' }} />
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={disabled ? undefined : 'pressable'}
      style={{
        ...style,
        width: '100%',
        border: 'none' as const,
        textAlign: 'left' as const,
        ...(disabled ? { opacity: 0.35, cursor: 'default' as const } : {}),
      }}
      disabled={disabled}
      onClick={onClick}
    >
      <span>{label}</span>
      {chevron && <ChevronIcon width={18} height={18} style={{ color: 'var(--c-muted)' }} />}
    </button>
  );
}

function BackupRow({ label, description, onClick }: { label: string; description?: string | null; onClick: () => void }) {
  return (
    <button
      type="button"
      className="pressable"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', padding: '16px 20px',
        background: 'var(--c-card)', border: 'none',
        borderBottom: '1px solid var(--c-hairline)',
        cursor: 'pointer', textAlign: 'left',
      }}
    >
      <span>
        <span style={{ display: 'block', fontFamily: 'var(--font-inter)', fontSize: 15, color: 'var(--c-ink)' }}>
          {label}
        </span>
        {description && (
          <span style={{ display: 'block', fontFamily: 'var(--font-inter)', fontSize: 12, color: 'var(--c-muted)', marginTop: 2 }}>
            {description}
          </span>
        )}
      </span>
      <ChevronIcon width={18} height={18} style={{ color: 'var(--c-muted)', flexShrink: 0 }} />
    </button>
  );
}

const commitSha = (process.env.NEXT_PUBLIC_COMMIT_SHA ?? 'dev').slice(0, 7);

export default function SettingsPage() {
  const router = useRouter();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallSheet, setShowInstallSheet] = useState(false);
  const [showAboutSheet, setShowAboutSheet] = useState(false);
  const [syncSession, setSyncSession] = useState<SyncSession | null>(null);
  const [backupDesc, setBackupDesc] = useState<string | null>(null);
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    getSyncSession().then(setSyncSession);
    try {
      const stored = localStorage.getItem(LS_LAST_BACKUP);
      if (stored) setBackupDesc(`Last backup: ${new Date(stored).toLocaleString()}`);
    } catch {}
  }, []);

  async function handleAddToHome() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      setDeferredPrompt(null);
    } else {
      setShowInstallSheet(true);
    }
  }

  function handleShare() {
    const url = 'https://attune-silk.vercel.app';
    if (navigator.share) {
      navigator.share({ title: 'Attune', text: 'Read anyone.', url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url).catch(() => {});
    }
  }

  async function handleClearData() {
    const message = syncSession
      ? 'Clear all readings and your birth info? This also deletes your Google backup. This cannot be undone.'
      : 'Clear all readings and your birth info? There is no backup — this permanently erases everything on this phone.';
    if (window.confirm(message)) {
      if (syncSession) { await deleteBackup(); }
      clearAllData();
      router.push('/');
    }
  }

  function handleSignIn() {
    window.location.href = '/api/auth/signin?callbackUrl=/settings';
  }

  async function handleBackupNow() {
    // BRIEF-107 §1.2 — the only place explicitReplace is used: a user's own explicit tap here
    // justifies a first PUT with no prior ack, and success records it (sync.ts's pushBackup).
    const res = await pushBackup({ explicitReplace: true });
    if (res.ok) {
      setBackupDesc(`Last backup: ${new Date(res.updatedAt).toLocaleString()}`);
    } else {
      setBackupDesc(res.status === 503 ? "Backup isn't available right now." : 'Backup failed — try again.');
    }
  }

  async function handleRestore() {
    const res = await pullBackup();
    if (res === null) {
      setRestoreMsg('No backup found.');
      return;
    }
    if (!res.ok) {
      setRestoreMsg('Restore failed — try again.');
      return;
    }
    const dateStr = new Date(res.updatedAt).toLocaleDateString();
    if (window.confirm(`Replace the data on this phone with your backup from ${dateStr}?`)) {
      applySnapshot(res.payload);
      window.location.href = '/you';
    }
  }

  return (
    <>
    {showInstallSheet && <InstallSheet onClose={() => setShowInstallSheet(false)} />}
    {showAboutSheet && <AboutSheet onClose={() => setShowAboutSheet(false)} />}
    <div style={{ minHeight: '100%', background: 'var(--c-paper)' }}>
      <TabTopBar title="Settings" />

      {/* Section rows */}
      <div style={{ marginTop: 8 }}>
        <Row label="What is Saju?" href="/saju" />
        <Row label="Edit birth info" href="/onboarding" />
        <Row label="Add to Home Screen" chevron onClick={handleAddToHome} />
        <Row label="Share Attune" onClick={handleShare} />
        <Row label="Send feedback" href="mailto:farerworks@gmail.com?subject=Attune%20feedback" />
        <Row label="About Attune" chevron onClick={() => setShowAboutSheet(true)} />

        {/* Backup section */}
        {syncSession ? (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', background: 'var(--c-card)',
              borderBottom: '1px solid var(--c-hairline)',
            }}>
              <span style={{
                fontFamily: 'var(--font-inter)', fontSize: 15, color: 'var(--c-ink)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {syncSession.user?.email ?? 'Signed in'}
              </span>
              <a
                href="/api/auth/signout?callbackUrl=/settings"
                className="pressable"
                style={{
                  fontFamily: 'var(--font-inter)', fontSize: 13, color: 'var(--c-muted)',
                  border: '1px solid var(--c-hairline)', borderRadius: 999,
                  padding: '4px 12px', textDecoration: 'none', flexShrink: 0, marginLeft: 12,
                }}
              >
                Sign out
              </a>
            </div>
            <BackupRow label="Back up now" description={backupDesc} onClick={() => void handleBackupNow()} />
            <BackupRow label="Restore from backup" description={restoreMsg} onClick={() => void handleRestore()} />
            {syncSession.sub && !hasReplaceAck(syncSession.sub) && (
              <p style={{
                fontFamily: 'var(--font-inter)', fontSize: 12, color: 'var(--c-muted)',
                padding: '10px 20px 0', margin: 0,
              }}>
                {typeof navigator !== 'undefined' && navigator.language.startsWith('ko')
                  ? '자동 백업이 일시 중지됐어요. 지금 백업하면 다시 시작돼요.'
                  : 'Automatic backup is paused. Back up now to resume.'}
              </p>
            )}
          </>
        ) : (
          <BackupRow label="Back up your data" description="Sign in with Google to back up your data to Attune's server and restore it on a new phone." onClick={handleSignIn} />
        )}
        <p style={{
          fontFamily: 'var(--font-inter)', fontSize: 12, color: 'var(--c-muted)',
          padding: '10px 20px 0', margin: 0,
        }}>
          Backup is optional. Signing in with Google starts automatic backup to Attune&apos;s server.
        </p>

        <Row label="Clear all data" danger disabled onClick={() => void handleClearData()} />

        <p style={{
          fontFamily: 'var(--font-space-mono)', fontSize: 10.5, letterSpacing: '0.08em',
          color: 'var(--c-muted)', textAlign: 'center', padding: '24px 20px', margin: 0,
        }}>
          Attune · {commitSha}
        </p>
      </div>
    </div>
    </>
  );
}
