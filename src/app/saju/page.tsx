import Link from 'next/link';
import { SmartBackLink, ConditionalTabBar } from '@/components/InAppNav';

export const metadata = { title: 'What is Saju — Attune' };

export default function SajuPage() {
  return (
    <div
      style={{
        minHeight: '100svh',
        background: 'var(--c-paper)',
        padding: '0 0 calc(var(--tab-bar-height) + env(safe-area-inset-bottom, 0px) + 24px)',
      }}
    >
      {/* Nav */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '16px 20px',
          gap: 8,
        }}
      >
        <SmartBackLink />
        <span
          style={{
            fontFamily: 'var(--font-space-mono)',
            fontSize: 11,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--c-muted)',
          }}
        >
          What is Saju
        </span>
      </header>

      <div style={{ padding: '8px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Card 1 — Four Pillars diagram */}
        <div className="card" style={{ padding: '24px 20px' }}>
          <svg
            viewBox="0 0 320 100"
            width="100%"
            style={{ display: 'block', marginBottom: 16 }}
            aria-hidden="true"
          >
            {/* YEAR pillar */}
            <rect x="8" y="20" width="60" height="60" rx="8" fill="#E4EEE4" />
            <text x="38" y="45" textAnchor="middle" fontSize="10" fill="#4E8A52" fontFamily="system-ui" fontWeight="600">YEAR</text>
            <text x="38" y="68" textAnchor="middle" fontSize="22" fill="#4E8A52" fontFamily="serif">甲</text>

            {/* MONTH pillar */}
            <rect x="86" y="20" width="60" height="60" rx="8" fill="#F2EAD3" />
            <text x="116" y="45" textAnchor="middle" fontSize="10" fill="#A8842C" fontFamily="system-ui" fontWeight="600">MONTH</text>
            <text x="116" y="68" textAnchor="middle" fontSize="22" fill="#A8842C" fontFamily="serif">丁</text>

            {/* DAY pillar — highlighted */}
            <rect x="164" y="10" width="68" height="80" rx="10" fill="#C4502E" />
            <text x="198" y="38" textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.85)" fontFamily="system-ui" fontWeight="600">DAY</text>
            <text x="198" y="66" textAnchor="middle" fontSize="26" fill="#FFFFFF" fontFamily="serif">壬</text>
            <text x="198" y="82" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.7)" fontFamily="system-ui">YOU</text>

            {/* HOUR pillar — dashed/optional */}
            <rect x="250" y="20" width="60" height="60" rx="8" fill="none" stroke="#E4DED3" strokeWidth="1.5" strokeDasharray="4 3" />
            <text x="280" y="45" textAnchor="middle" fontSize="10" fill="#948B7C" fontFamily="system-ui" fontWeight="600">HOUR</text>
            <text x="280" y="63" textAnchor="middle" fontSize="10" fill="#948B7C" fontFamily="system-ui">OPTIONAL</text>
          </svg>
          <h2 className="t-h2" style={{ marginBottom: 8 }}>Your birth moment, written as eight characters.</h2>
          <p className="t-body" style={{ fontSize: 14 }}>
            Year, Month, Day, and Hour — each converted to a pair of ancient characters. Together they map the energetic signature of the moment you were born.
          </p>
        </div>

        {/* Card 2 — Five elements ring */}
        <div className="card" style={{ padding: '24px 20px' }}>
          <svg
            viewBox="0 0 260 200"
            width="100%"
            style={{ display: 'block', marginBottom: 16 }}
            aria-hidden="true"
          >
            {/* Center ring connecting arrows */}
            <circle cx="130" cy="100" r="55" fill="none" stroke="#E4DED3" strokeWidth="1" />

            {/* Wood — top */}
            <circle cx="130" cy="36" r="24" fill="#E4EEE4" />
            <text x="130" y="31" textAnchor="middle" fontSize="9" fill="#4E8A52" fontFamily="system-ui" fontWeight="600">WOOD</text>
            <text x="130" y="47" textAnchor="middle" fontSize="17" fill="#4E8A52" fontFamily="serif">木</text>

            {/* Fire — upper right */}
            <circle cx="204" cy="72" r="24" fill="#F7E4DC" />
            <text x="204" y="67" textAnchor="middle" fontSize="9" fill="#C4502E" fontFamily="system-ui" fontWeight="600">FIRE</text>
            <text x="204" y="83" textAnchor="middle" fontSize="17" fill="#C4502E" fontFamily="serif">火</text>

            {/* Earth — lower right */}
            <circle cx="180" cy="148" r="24" fill="#F2EAD3" />
            <text x="180" y="143" textAnchor="middle" fontSize="9" fill="#A8842C" fontFamily="system-ui" fontWeight="600">EARTH</text>
            <text x="180" y="159" textAnchor="middle" fontSize="17" fill="#A8842C" fontFamily="serif">土</text>

            {/* Metal — lower left */}
            <circle cx="80" cy="148" r="24" fill="#E7EBEC" />
            <text x="80" y="143" textAnchor="middle" fontSize="9" fill="#6E7A80" fontFamily="system-ui" fontWeight="600">METAL</text>
            <text x="80" y="159" textAnchor="middle" fontSize="17" fill="#6E7A80" fontFamily="serif">金</text>

            {/* Water — upper left */}
            <circle cx="56" cy="72" r="24" fill="#E1EAF4" />
            <text x="56" y="67" textAnchor="middle" fontSize="9" fill="#4A76AC" fontFamily="system-ui" fontWeight="600">WATER</text>
            <text x="56" y="83" textAnchor="middle" fontSize="17" fill="#4A76AC" fontFamily="serif">水</text>

            {/* Generating cycle arrows (상생) */}
            <path d="M148 50 L190 62" stroke="#C4502E" strokeWidth="1.5" fill="none" markerEnd="url(#arr)" opacity="0.6" />
            <path d="M212 92 L196 132" stroke="#A8842C" strokeWidth="1.5" fill="none" markerEnd="url(#arr)" opacity="0.6" />
            <path d="M156 156 L104 156" stroke="#6E7A80" strokeWidth="1.5" fill="none" markerEnd="url(#arr)" opacity="0.6" />
            <path d="M68 132 L52 92" stroke="#4A76AC" strokeWidth="1.5" fill="none" markerEnd="url(#arr)" opacity="0.6" />
            <path d="M70 52 L112 40" stroke="#4E8A52" strokeWidth="1.5" fill="none" markerEnd="url(#arr)" opacity="0.6" />

            <defs>
              <marker id="arr" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#948B7C" />
              </marker>
            </defs>
          </svg>
          <h2 className="t-h2" style={{ marginBottom: 8 }}>Five energies, always in motion.</h2>
          <p className="t-body" style={{ fontSize: 14 }}>
            Wood, Fire, Earth, Metal, Water. Each person carries a mix. The balance — and how it flows — shapes how they think, communicate, and respond under pressure.
          </p>
        </div>

        {/* Card 3 — Day stem highlight */}
        <div className="card" style={{ padding: '24px 20px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              marginBottom: 16,
              padding: '20px 16px',
              background: 'var(--c-vermilion-bg)',
              borderRadius: 12,
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 10,
                background: 'var(--c-vermilion)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.7)', fontFamily: 'var(--font-space-mono)', letterSpacing: '0.05em' }}>DAY</span>
              <span style={{ fontSize: 28, color: '#fff', fontFamily: 'serif', lineHeight: 1 }}>壬</span>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-inter)', fontSize: 13, fontWeight: 600, color: 'var(--c-vermilion)', marginBottom: 2 }}>Your Day Stem</div>
              <div style={{ fontFamily: 'var(--font-inter)', fontSize: 14, color: 'var(--c-ink-body)' }}>Yang Water · 壬</div>
            </div>
          </div>
          <h2 className="t-h2" style={{ marginBottom: 8 }}>The Day stem is you.</h2>
          <p className="t-body" style={{ fontSize: 14 }}>
            Of all eight characters, the Day pillar&apos;s heavenly stem is the one that most closely represents who you are at your core — your personality, your default mode, your instincts under pressure.
          </p>
        </div>

        {/* Card 4 — About the system */}
        <div className="card" style={{ padding: '24px 20px' }}>
          <p className="t-body" style={{ marginBottom: 20 }}>
            A 500-year-old Korean map of temperament. Not a verdict, not the future — a lens.
          </p>
          <p className="t-body" style={{ fontSize: 14, marginBottom: 28 }}>
            Attune uses saju as a structured framework for personality inference — not fortune-telling. The outputs are probabilistic character portraits, not certainties. Use them to approach people more thoughtfully.
          </p>
          <Link
            href="/onboarding"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: 48,
              borderRadius: 24,
              background: 'var(--c-ink)',
              color: 'var(--c-paper)',
              fontFamily: 'var(--font-inter)',
              fontSize: 15,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Read someone
          </Link>
        </div>

      </div>

      <ConditionalTabBar />
    </div>
  );
}
