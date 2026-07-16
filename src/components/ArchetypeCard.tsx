'use client';

import { ELEMENT_COLORS } from '@/lib/store';
import type { Archetype } from '@/lib/interpretGuide';
import { ARCHETYPE_LOCALE, DAY_NOTE_LOCALE } from '@/lib/interpretGuide';
import { pickVariant, localDateStr } from '@/lib/today';

const EL_ORDER = ['wood', 'fire', 'earth', 'metal', 'water'];
const ANGLES = EL_ORDER.map((_, i) => -Math.PI / 2 + (2 * Math.PI * i) / 5);

interface Props {
  name?: string;
  date: string;
  archetype: Archetype;
  element: string;
  elements: { wood: number; fire: number; earth: number; metal: number; water: number };
  dayBranch?: string;
  stem?: string;
  korean?: boolean;
}

function fmtMMDD(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function MiniRadar({ elements, color }: { elements: Props['elements']; color: string }) {
  const CX = 52, CY = 52, R = 38, SIZE = 104;
  const vals = EL_ORDER.map(k => (elements as Record<string, number>)[k] ?? 0);
  const normMax = Math.max(...vals, 3);
  const minR = 0.12;

  const pts = EL_ORDER.map((k, i) => {
    const ratio = minR + (1 - minR) * (Math.max(0, (elements as Record<string, number>)[k] ?? 0) / normMax);
    return { x: CX + R * ratio * Math.cos(ANGLES[i]), y: CY + R * ratio * Math.sin(ANGLES[i]) };
  });

  const n = pts.length;
  let blobPath = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    blobPath += ` C ${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6},${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6},${p2.x} ${p2.y}`;
  }
  blobPath += ' Z';

  function pentRing(r: number) {
    return ANGLES.map((a, i) => `${i === 0 ? 'M' : 'L'} ${CX + r * Math.cos(a)} ${CY + r * Math.sin(a)}`).join(' ') + ' Z';
  }

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ width: '55%', height: 'auto', display: 'block' }} aria-hidden>
      {[0.4, 0.7, 1].map(r => (
        <path key={r} d={pentRing(R * r)} fill="none" stroke="var(--c-hairline)" strokeWidth={0.5} />
      ))}
      <path d={blobPath} fill={color} fillOpacity={0.12} stroke={color} strokeWidth={1.5} />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} fill={color} />
      ))}
    </svg>
  );
}

export function ArchetypeCard({ name, date, archetype, element, elements, dayBranch, stem, korean }: Props) {
  const el = element.toLowerCase();
  const colors = ELEMENT_COLORS[el] ?? { fg: '#948B7C', bg: 'var(--c-surface-alt)' };
  const labelText = name ? `${name.toUpperCase()} · ${fmtMMDD(date)}` : fmtMMDD(date);

  const dateStr = localDateStr();
  const L = stem ? ARCHETYPE_LOCALE[stem] : undefined;
  const displayName = (korean && L) ? L.name_ko : archetype.name;
  const displayTagline = (L && stem)
    ? pickVariant(korean ? L.tagline_ko : L.tagline_en, `${dateStr}|tag|${stem}`)
    : archetype.tagline;
  const displayKeywords = (korean && L) ? L.kw_ko : archetype.keywords;

  const dayLocale = dayBranch ? DAY_NOTE_LOCALE[dayBranch] : undefined;
  const dayNoteText = (dayLocale && dayBranch)
    ? pickVariant(korean ? dayLocale.ko : dayLocale.en, `${dateStr}|day|${dayBranch}`)
    : undefined;

  return (
    <div style={{
      width: '100%', aspectRatio: '1',
      borderRadius: 18,
      border: '1px solid var(--c-hairline)',
      background: 'var(--c-card)',
      padding: 24,
      display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between',
      overflow: 'hidden',
    }}>
      {/* Top row: label · element badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          fontFamily: "var(--font-space-mono,'Courier New')",
          fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
          color: 'var(--c-muted)',
        }}>
          {labelText}
        </span>
        <span style={{
          fontFamily: "var(--font-space-mono,'Courier New')",
          fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase',
          background: colors.bg, color: colors.fg,
          padding: '2px 7px', borderRadius: 4,
        }}>
          {el}
        </span>
      </div>

      {/* Center: name + tagline + keywords */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p style={{
          fontFamily: "var(--font-fraunces,Georgia,serif)",
          fontSize: 42, fontStyle: 'italic', fontWeight: 500,
          color: 'var(--c-ink)', margin: 0, lineHeight: 1.1,
        }}>
          {displayName}
        </p>
        <p style={{
          fontFamily: "var(--font-inter,system-ui)",
          fontSize: 14, color: 'var(--c-ink-body)',
          margin: 0, lineHeight: 1.4,
        }}>
          {displayTagline}
        </p>
        {dayLocale && dayNoteText && (
          <p style={{
            fontFamily: "var(--font-inter,system-ui)",
            fontSize: 12.5, color: 'var(--c-muted)', margin: 0,
          }}>
            <span style={{ marginRight: 4 }}>{dayLocale.emoji}</span>{dayNoteText}
          </p>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          {displayKeywords.map(kw => (
            <span key={kw} style={{
              fontFamily: "var(--font-inter,system-ui)",
              fontSize: 11, fontWeight: 500,
              color: 'var(--c-ink-body)',
              background: 'var(--c-surface-alt)',
              border: '1px solid var(--c-hairline)',
              borderRadius: 12, padding: '3px 10px',
            }}>
              {kw}
            </span>
          ))}
        </div>
      </div>

      {/* Bottom row: radar centered + wordmark bottom-right */}
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
        <MiniRadar elements={elements} color={colors.fg} />
        <span style={{
          position: 'absolute', bottom: 0, right: 0,
          fontFamily: "var(--font-space-mono,'Courier New')",
          fontSize: 9, letterSpacing: '0.3em', textTransform: 'uppercase',
          color: 'var(--c-muted)',
        }}>
          ATTUNE
        </span>
      </div>
    </div>
  );
}
