'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getProfile } from '@/lib/store';
import { ScrollReveal } from '@/components/ScrollReveal';

const SECTION_LABEL_STYLE = {
  fontFamily: 'var(--font-space-mono)',
  fontSize: 10.5,
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
  color: 'var(--c-muted)',
  marginBottom: 18,
};

const CTA_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--c-vermilion)',
  color: 'var(--c-card)',
  fontFamily: 'var(--font-inter)',
  fontWeight: 600,
  fontSize: 15,
  padding: '14px 30px',
  borderRadius: 28,
  textDecoration: 'none',
};

const CTA_SUBLABEL_STYLE = {
  display: 'block',
  fontFamily: 'var(--font-space-mono)',
  fontSize: 10,
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  color: 'var(--c-muted)',
  marginTop: 10,
};

const HOW_STEPS = [
  {
    title: 'Reveal your archetype',
    body: 'Enter your birth date. Meet the one of ten energies you were born into — and what it says about how you move.',
  },
  {
    title: 'Read someone',
    body: 'Add a person on your mind. See where you click, where you clash, and the playbook for this exact relationship.',
  },
  {
    title: 'Ask before you act',
    body: '"Will they say yes?" "When should I bring it up?" A coach that knows both charts — and remembers your story.',
  },
];

const WHY_CARDS = [
  {
    title: 'Today, tuned to you',
    body: 'Each day carries its own energy. One line every morning on how it meets yours.',
  },
  {
    title: 'A coach with memory',
    body: 'Tell it once. It remembers the presentation, the fight, the gift — and answers in context.',
  },
  {
    title: 'Cards worth sharing',
    body: 'Your dynamic as a poster — two charts, one picture. Made for the group chat.',
  },
];

export default function LandingPage() {
  const router = useRouter();

  useEffect(() => {
    if (getProfile()) {
      router.replace('/home');
    }
  }, [router]);

  return (
    <div style={{ minHeight: '100svh', background: 'var(--c-paper)' }}>
      <div style={{ maxWidth: 420, margin: '0 auto', padding: '0 22px' }}>

        {/* ① nav */}
        <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontFamily: 'var(--font-space-mono)', fontWeight: 700, fontSize: 14,
              letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--c-ink)',
            }}>
              ATTUNE
            </span>
            <span style={{
              fontFamily: 'var(--font-space-mono)', fontSize: 9, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--c-vermilion)', background: 'var(--c-vermilion-bg)',
              padding: '2px 6px', borderRadius: 4,
            }}>
              BETA
            </span>
          </div>
          <Link href="/onboarding" style={{
            fontFamily: 'var(--font-inter)', fontSize: 13, fontWeight: 600,
            color: 'var(--c-vermilion)', textDecoration: 'none',
          }}>
            Open app →
          </Link>
        </nav>

        {/* ② hero */}
        <section style={{ padding: '44px 0 10px' }}>
          <p style={{
            fontFamily: 'var(--font-space-mono)', fontSize: 10.5, letterSpacing: '0.18em',
            textTransform: 'uppercase', color: 'var(--c-muted)', marginBottom: 16,
          }}>
            Powered by Saju — 500 years of pattern-reading
          </p>
          <h1 style={{
            fontFamily: 'var(--font-fraunces)', fontWeight: 500, fontSize: 40,
            lineHeight: 1.12, letterSpacing: '-0.01em', color: 'var(--c-ink)', margin: 0,
          }}>
            Understand anyone, <em style={{ fontStyle: 'italic', color: 'var(--c-vermilion)' }}>before</em> the conversation.
          </h1>
          <p style={{
            fontFamily: 'var(--font-inter)', fontSize: 15.5, lineHeight: 1.6,
            color: 'var(--c-ink-body)', margin: '18px 0 26px',
          }}>
            Attune reads two birth charts and tells you how they&apos;ll likely react, what could backfire, and when to bring it up. No sign-up. Takes 30 seconds.
          </p>
          <p style={{
            fontFamily: 'var(--font-inter)', fontSize: 14, lineHeight: 1.5,
            color: 'var(--c-muted)', margin: '0 0 26px',
          }}>
            The math is exact. The reading is human.
          </p>
          <Link href="/onboarding" className="pressable" style={CTA_STYLE}>
            Get your reading
          </Link>
          <p style={CTA_SUBLABEL_STYLE}>free · no sign-up · yours to delete</p>
        </section>

        {/* ③ phone mockup card — static decorative, no real data */}
        <ScrollReveal>
          <div className="mockup-float" style={{
            width: 260, margin: '38px auto 8px', borderRadius: 28, padding: '26px 20px 22px',
            background: 'radial-gradient(130% 90% at 50% 0, #17130E, #100E0B)',
            boxShadow: '0 24px 60px rgba(26,24,21,.25)',
          }}>
            <p style={{
              fontFamily: 'var(--font-space-mono)', fontSize: 8, letterSpacing: '0.16em',
              textTransform: 'uppercase', color: '#9A8F7C', margin: 0,
            }}>
              your read
            </p>
            <p style={{
              fontFamily: 'var(--font-fraunces)', fontSize: 24, color: '#F5F1E8', margin: 0, marginTop: 8,
            }}>
              The Still Water
            </p>
            <p style={{
              fontFamily: 'var(--font-fraunces)', fontStyle: 'italic', fontSize: 13,
              color: '#CFC5B4', margin: 0, marginTop: 6,
            }}>
              Reads the room before entering it.
            </p>
            <div style={{ marginTop: 16, borderTop: '1px solid rgba(245,241,232,.1)', paddingTop: 12 }}>
              <p style={{
                fontFamily: 'var(--font-space-mono)', fontSize: 8, letterSpacing: '0.14em',
                color: '#D96A45', margin: 0,
              }}>
                TODAY
              </p>
              <p style={{
                fontFamily: 'var(--font-inter)', fontSize: 11, color: '#B7AE9E',
                lineHeight: 1.5, margin: 0, marginTop: 4,
              }}>
                Tailwind day — support finds you if you let it.
              </p>
            </div>
          </div>
        </ScrollReveal>

        {/* ④ How it works */}
        <ScrollReveal>
          <section style={{ padding: '40px 0 6px' }}>
            <p style={SECTION_LABEL_STYLE}>How it works</p>
            {HOW_STEPS.map((step, i) => (
              <div key={step.title} style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
                <span style={{
                  fontFamily: 'var(--font-fraunces)', fontStyle: 'italic', fontSize: 22,
                  color: 'var(--c-vermilion)', width: 26, flexShrink: 0,
                }}>
                  {i + 1}
                </span>
                <div>
                  <h3 style={{
                    fontFamily: 'var(--font-fraunces)', fontWeight: 500, fontSize: 18,
                    color: 'var(--c-ink)', margin: '0 0 6px',
                  }}>
                    {step.title}
                  </h3>
                  <p style={{
                    fontFamily: 'var(--font-inter)', fontSize: 13.5, lineHeight: 1.55,
                    color: 'var(--c-ink-body)', margin: 0,
                  }}>
                    {step.body}
                  </p>
                </div>
              </div>
            ))}
          </section>
        </ScrollReveal>

        {/* ⑤ Why people open it every day */}
        <section style={{ padding: '40px 0 6px' }}>
          <p style={SECTION_LABEL_STYLE}>Why people open it every day</p>
          {WHY_CARDS.map((card, i) => (
            <ScrollReveal key={card.title} delay={i * 60}>
              <div style={{
                background: 'var(--c-card)', border: '1px solid var(--c-hairline)',
                borderRadius: 16, padding: 18, marginBottom: 12,
              }}>
                <h3 style={{
                  fontFamily: 'var(--font-fraunces)', fontWeight: 500, fontSize: 17,
                  color: 'var(--c-ink)', margin: '0 0 6px',
                }}>
                  {card.title}
                </h3>
                <p style={{
                  fontFamily: 'var(--font-inter)', fontSize: 13, lineHeight: 1.55,
                  color: 'var(--c-ink-body)', margin: 0,
                }}>
                  {card.body}
                </p>
              </div>
            </ScrollReveal>
          ))}
          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <Link href="/saju" style={{
              fontFamily: 'var(--font-inter)', fontSize: 14, color: 'var(--c-muted)',
              textDecoration: 'none', borderBottom: '1px solid var(--c-hairline)', paddingBottom: 2,
            }}>
              What is Saju? →
            </Link>
          </div>
        </section>

        {/* ⑥ Privacy box */}
        <ScrollReveal>
          <div style={{
            margin: '36px 0 0', padding: 18, border: '1px dashed var(--c-hairline)',
            borderRadius: 14, textAlign: 'center',
          }}>
            <p style={{
              fontFamily: 'var(--font-inter)', fontSize: 12.5, color: 'var(--c-ink-body)',
              lineHeight: 1.6, margin: 0,
            }}>
              <strong style={{ color: 'var(--c-ink)' }}>Your birth data stays on your phone.</strong> No sign-up needed. Back it up with Google only if you choose to. Delete everything in one tap.
            </p>
          </div>
        </ScrollReveal>

        {/* ⑦ Bottom CTA */}
        <ScrollReveal>
          <div style={{ margin: '36px 0 8px', textAlign: 'center' }}>
            <Link href="/onboarding" className="pressable" style={CTA_STYLE}>
              Get your reading
            </Link>
            <p style={CTA_SUBLABEL_STYLE}>attune-silk.vercel.app</p>
          </div>
        </ScrollReveal>

        {/* ⑧ footer */}
        <footer style={{ padding: '34px 0 40px', textAlign: 'center' }}>
          <p style={{
            fontFamily: 'var(--font-space-mono)', fontSize: 9.5, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--c-muted)', lineHeight: 2, margin: 0,
          }}>
            ATTUNE · POWERED BY SAJU<br />
            NOT A VERDICT ON ANYONE
          </p>
        </footer>

      </div>
    </div>
  );
}
