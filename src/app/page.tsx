'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getProfile } from '@/lib/store';

export default function LandingPage() {
  const router = useRouter();

  useEffect(() => {
    if (getProfile()) {
      router.replace('/people');
    }
  }, [router]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100svh',
        padding: '48px 24px 40px',
        background: 'var(--c-paper)',
      }}
    >
      {/* Wordmark */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            fontFamily: 'var(--font-space-mono)',
            fontSize: 13,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--c-ink)',
            fontWeight: 700,
          }}
        >
          ATTUNE
        </span>
        <span
          style={{
            fontFamily: 'var(--font-space-mono)',
            fontSize: 9,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--c-vermilion)',
            background: 'var(--c-vermilion-bg)',
            padding: '2px 6px',
            borderRadius: 4,
          }}
        >
          BETA
        </span>
      </header>

      {/* Hero */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: 32, paddingBottom: 32 }}>
        <h1
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontSize: 34,
            lineHeight: 1.2,
            letterSpacing: '-0.01em',
            color: 'var(--c-ink)',
            marginBottom: 20,
          }}
        >
          Understand them{' '}
          <em style={{ fontStyle: 'italic' }}>before</em>
          {' '}you talk to them.
        </h1>

        <p
          style={{
            fontFamily: 'var(--font-inter)',
            fontSize: 17,
            lineHeight: 1.6,
            color: 'var(--c-ink-body)',
            marginBottom: 28,
          }}
        >
          Every astrology app tells you about yourself. Attune reads the person
          you&apos;re curious about — and coaches you on how to reach them.
        </p>

        <p
          style={{
            fontFamily: 'var(--font-inter)',
            fontSize: 13,
            lineHeight: 1.5,
            color: 'var(--c-muted)',
            marginBottom: 36,
          }}
        >
          Powered by Saju (四柱), a 500-year-old Korean system for reading
          character through birth timing. Not a prediction — a lens.
        </p>

        {/* CTA */}
        <Link
          href="/onboarding"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 52,
            borderRadius: 26,
            background: 'var(--c-ink)',
            color: 'var(--c-paper)',
            fontFamily: 'var(--font-inter)',
            fontSize: 16,
            fontWeight: 600,
            textDecoration: 'none',
            marginBottom: 20,
          }}
        >
          Read someone
        </Link>

        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Link
            href="/saju"
            style={{
              fontFamily: 'var(--font-inter)',
              fontSize: 14,
              color: 'var(--c-muted)',
              textDecoration: 'none',
              borderBottom: '1px solid var(--c-hairline)',
            }}
          >
            What&apos;s behind this? →
          </Link>
        </div>
      </main>

      {/* Footer trust */}
      <footer>
        <p
          style={{
            fontFamily: 'var(--font-space-mono)',
            fontSize: 10,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--c-muted)',
            textAlign: 'center',
          }}
        >
          Private · No account · Free
        </p>
      </footer>
    </div>
  );
}
