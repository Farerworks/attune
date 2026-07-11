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
        overflowX: 'hidden',
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
          Powered by Saju, a 500-year-old Korean system for reading
          character through birth timing. Not a prediction — a lens.
        </p>

        {/* CTA */}
        <Link
          href="/onboarding"
          className="pressable"
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

      {/* ── How it works ─────────────────────────────────────────────────────── */}
      <section style={{ paddingTop: 48, paddingBottom: 8 }}>
        <h2 style={{
          fontFamily: "var(--font-fraunces,Georgia,serif)",
          fontSize: 38, fontWeight: 500, lineHeight: 1.05,
          color: 'var(--c-ink)', marginBottom: 36,
        }}>
          Read{' '}
          <em style={{ fontStyle: 'italic', color: '#C4502E' }}>anyone</em>
          {' '}in three steps.
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>

          {/* Step 1 */}
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', right: -16, top: -8, width: 104, height: 104, borderRadius: '50%', background: 'rgba(78,138,82,0.14)', pointerEvents: 'none', zIndex: 0 }} />
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontFamily: "var(--font-fraunces,Georgia,serif)", fontSize: 54, fontWeight: 600, color: 'rgba(78,138,82,0.4)', lineHeight: 1, flexShrink: 0, paddingTop: 4 }}>1</span>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontFamily: "var(--font-fraunces,Georgia,serif)", fontSize: 21, color: 'var(--c-ink)', marginBottom: 12, fontWeight: 500 }}>Enter a birthday</h3>
                <div style={{ transform: 'rotate(-1.5deg)', transformOrigin: 'top left', background: '#fff', borderRadius: 14, boxShadow: '0 8px 20px -12px rgba(26,24,21,0.2)', padding: '14px 14px' }}>
                  <div style={{ background: '#FAF8F3', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontFamily: "var(--font-inter,system-ui)", fontSize: 14, color: '#1A1815' }}>
                    March 14, 2003
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{ width: 46, height: 46, borderRadius: '50%', background: '#C4502E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ color: '#fff', fontSize: 18, lineHeight: 1 }}>→</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: -16, bottom: -12, width: 88, height: 88, borderRadius: '50%', background: 'rgba(168,132,44,0.14)', pointerEvents: 'none', zIndex: 0 }} />
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontFamily: "var(--font-fraunces,Georgia,serif)", fontSize: 54, fontWeight: 600, color: 'rgba(168,132,44,0.4)', lineHeight: 1, flexShrink: 0, paddingTop: 4 }}>2</span>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontFamily: "var(--font-fraunces,Georgia,serif)", fontSize: 21, color: 'var(--c-ink)', marginBottom: 12, fontWeight: 500 }}>Get the briefing</h3>
                <div style={{ transform: 'rotate(1.2deg)', transformOrigin: 'top left', background: '#fff', borderRadius: 14, boxShadow: '0 8px 20px -12px rgba(26,24,21,0.2)', padding: '14px 14px' }}>
                  <div style={{ fontFamily: "var(--font-space-mono,'Courier New')", fontSize: 9, letterSpacing: '0.1em', color: 'var(--c-muted)', marginBottom: 4 }}>MAYA · MAR 14</div>
                  <div style={{ fontFamily: "var(--font-fraunces,Georgia,serif)", fontSize: 22, fontStyle: 'italic', color: 'var(--c-ink)', marginBottom: 8 }}>The Slow Burn</div>
                  <div style={{ marginBottom: 10 }}>
                    <span style={{ display: 'inline-block', transform: 'rotate(4deg)', background: 'rgba(78,138,82,0.1)', border: '1px solid rgba(78,138,82,0.3)', borderRadius: 4, padding: '2px 8px', fontFamily: "var(--font-space-mono,'Courier New')", fontSize: 9, color: '#4E8A52' }}>WOOD</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ background: '#FAF8F3', borderRadius: 12, padding: '4px 10px', fontFamily: "var(--font-inter,system-ui)", fontSize: 12, color: 'var(--c-ink)' }}>Decides fast</span>
                    <span style={{ background: '#FAF8F3', borderRadius: 12, padding: '4px 10px', fontFamily: "var(--font-inter,system-ui)", fontSize: 12, color: 'var(--c-ink)' }}>Hates small talk</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', right: -20, bottom: -16, width: 96, height: 96, borderRadius: '50%', background: 'rgba(74,118,172,0.14)', pointerEvents: 'none', zIndex: 0 }} />
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontFamily: "var(--font-fraunces,Georgia,serif)", fontSize: 54, fontWeight: 600, color: 'rgba(74,118,172,0.4)', lineHeight: 1, flexShrink: 0, paddingTop: 4 }}>3</span>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontFamily: "var(--font-fraunces,Georgia,serif)", fontSize: 21, color: 'var(--c-ink)', marginBottom: 12, fontWeight: 500 }}>Ask follow-ups</h3>
                <div style={{ transform: 'rotate(-1deg)', transformOrigin: 'top left', background: '#fff', borderRadius: 14, boxShadow: '0 8px 20px -12px rgba(26,24,21,0.2)', padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{ background: '#C4502E', color: '#fff', borderRadius: '16px 16px 4px 16px', padding: '10px 14px', fontFamily: "var(--font-inter,system-ui)", fontSize: 13 }}>
                      When do I ask?
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <div style={{ background: '#FAF8F3', borderRadius: '16px 16px 16px 4px', padding: '10px 14px', fontFamily: "var(--font-inter,system-ui)", fontSize: 13, color: 'var(--c-ink)' }}>
                      Friday. Keep it casual.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* CTA */}
        <Link
          href="/onboarding"
          className="pressable"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '18px', marginTop: 40, marginBottom: 14,
            borderRadius: 999, background: '#C4502E', color: '#fff',
            fontFamily: "var(--font-inter,system-ui)", fontSize: 17, fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Read someone →
        </Link>
        <p style={{ textAlign: 'center', fontFamily: "var(--font-space-mono,'Courier New')", fontSize: 10, letterSpacing: '0.06em', color: 'var(--c-muted)', margin: '0 0 24px' }}>
          POWERED BY SAJU
        </p>
      </section>

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
