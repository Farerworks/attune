'use client';

import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clearAllData } from '@/lib/store';
import { ChevronIcon } from '@/components/icons/ChevronIcon';
import { TabTopBar } from '@/components/TabTopBar';

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
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          background: 'var(--c-card)',
          borderRadius: '20px 20px 0 0',
          padding: '28px 24px 48px',
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

interface RowProps {
  label: string;
  href?: string;
  danger?: boolean;
  onClick?: () => void;
}

function Row({ label, href, danger, onClick }: RowProps) {
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
      <Link href={href} style={style}>
        <span>{label}</span>
        <ChevronIcon width={18} height={18} style={{ color: 'var(--c-muted)' }} />
      </Link>
    );
  }

  return (
    <button type="button" style={{ ...style, width: '100%', border: 'none' as const, textAlign: 'left' as const }} onClick={onClick}>
      <span>{label}</span>
    </button>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallSheet, setShowInstallSheet] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function handleAddToHome() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      setDeferredPrompt(null);
    } else {
      setShowInstallSheet(true);
    }
  }

  function handleClearData() {
    if (window.confirm('Clear all readings and your birth info? This cannot be undone.')) {
      clearAllData();
      router.push('/');
    }
  }

  return (
    <>
    {showInstallSheet && <InstallSheet onClose={() => setShowInstallSheet(false)} />}
    <div style={{ minHeight: '100%', background: 'var(--c-paper)' }}>
      <TabTopBar />
      {/* Header */}
      <header style={{ padding: '20px 20px 12px' }}>
        <h1 className="t-h2">Settings</h1>
      </header>

      {/* Section rows */}
      <div style={{ marginTop: 8 }}>
        <Row label="What is Saju?" href="/saju" />
        <Row label="Edit birth info" href="/onboarding" />
        <Row label="Add to Home Screen" onClick={handleAddToHome} />
        <Row label="Clear all data" danger onClick={handleClearData} />
      </div>

      {/* About section */}
      <div style={{ padding: '32px 20px' }}>
        <p
          style={{
            fontFamily: 'var(--font-inter)',
            fontSize: 13,
            lineHeight: 1.6,
            color: 'var(--c-muted)',
            marginBottom: 16,
          }}
        >
          Attune uses Four Pillars of Destiny — a classical East Asian character-reading system — to generate probabilistic personality insights about the people in your life.
        </p>
        <p
          style={{
            fontFamily: 'var(--font-inter)',
            fontSize: 13,
            lineHeight: 1.6,
            color: 'var(--c-muted)',
          }}
        >
          All readings are stored locally on your device. Nothing is sent to a server except the birth dates needed to generate a briefing. No account required. Free to use.
        </p>
      </div>
    </div>
    </>
  );
}
