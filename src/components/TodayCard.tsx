import { ELEMENT_COLORS } from '@/lib/store';
import type { TodayNote } from '@/lib/today';

interface TodayCardProps {
  note: TodayNote;
  dateLabel: string;
  emoji?: string;
  animationDelay?: string;
}

export function TodayCard({ note, dateLabel, emoji, animationDelay }: TodayCardProps) {
  return (
    <div className="card" style={{ padding: '16px 18px', animationDelay }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: note.tone === 'good'
            ? '#C4502E'
            : (ELEMENT_COLORS[note.todayElement]?.fg ?? '#948B7C'),
        }} />
        <span style={{
          fontFamily: "var(--font-space-mono,'Courier New')",
          fontSize: 10, letterSpacing: '0.14em',
          color: 'var(--c-muted)', textTransform: 'uppercase',
        }}>
          TODAY · {dateLabel}
        </span>
        {emoji && <span style={{ fontSize: 13 }}>{emoji}</span>}
      </div>
      <p style={{
        margin: 0,
        fontFamily: 'var(--font-fraunces,Georgia,serif)',
        fontSize: 17.5, lineHeight: 1.4, color: 'var(--c-ink)',
      }}>
        {note.line}
      </p>
    </div>
  );
}
