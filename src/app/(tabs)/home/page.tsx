'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useReadings, getProfile, ELEMENT_COLORS } from '@/lib/store';
import type { Reading } from '@/lib/store';
import { TabTopBar } from '@/components/TabTopBar';
import { AccountAvatar } from '@/components/AccountAvatar';
import { ChevronIcon } from '@/components/icons/ChevronIcon';
import { DoIcon } from '@/components/icons/DoIcon';
import { DontIcon } from '@/components/icons/DontIcon';
import { ArchetypeGlyph } from '@/components/ArchetypeGlyph';
import type { DailyDoDont } from '@/lib/homeCopy';
import type { Element, TenStem } from '@/lib/saju';

// Mirrors People page's per-reading language heuristic (isKo) — same rule, own copy.
const isKo = (s?: string) => !!s && /[가-힣]/.test(s);

// Memoized so the two effects below share one `import('@/lib/today')` call
// instead of two concurrent ones for the same specifier.
let todayModulePromise: Promise<typeof import('@/lib/today')> | null = null;
function loadTodayModule() {
  if (!todayModulePromise) todayModulePromise = import('@/lib/today');
  return todayModulePromise;
}

const WEEKDAY_3 = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTH_3 = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** "AUG 5 TUE" — top-of-page eyebrow date, always English 3-letter, regardless of locale. */
function eyebrowDateLabel(d: Date): string {
  return `${MONTH_3[d.getMonth()]} ${d.getDate()} ${WEEKDAY_3[d.getDay()]}`;
}

/** "WED · AUG 6" — AHEAD card date, always English 3-letter, regardless of locale. */
function aheadDateLabel(d: Date): string {
  return `${WEEKDAY_3[d.getDay()]} · ${MONTH_3[d.getMonth()]}`.concat(` ${d.getDate()}`);
}

/** Latest reading per name (readings are already newest-first), in that order. */
function dedupeLatestByName(readings: Reading[]): Reading[] {
  const seen = new Set<string>();
  const out: Reading[] = [];
  for (const r of readings) {
    const key = r.name?.trim() || r.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

const SECTION_LABEL_STYLE = {
  fontFamily: 'var(--font-space-mono)',
  fontSize: 10,
  letterSpacing: '0.14em',
  textTransform: 'uppercase' as const,
  color: 'var(--c-muted)',
};

interface PersonRow {
  id: string;
  name: string;
  relationship: string;
  element: string;
  line: string;
}

interface AheadDay {
  date: string;
  line: string;
  dayElement: Element;
}

interface TodayGlyph {
  stem: TenStem;
  element: Element;
}

export default function HomePage() {
  const [readings] = useReadings();
  const [korean, setKorean] = useState(false);
  const [todaySentence, setTodaySentence] = useState<string | null>(null);
  const [todayGlyph, setTodayGlyph] = useState<TodayGlyph | null>(null);
  const [doDont, setDoDont] = useState<DailyDoDont | null>(null);
  const [aheadDays, setAheadDays] = useState<AheadDay[]>([]);
  const [personRows, setPersonRows] = useState<PersonRow[]>([]);
  const [quickPrompts, setQuickPrompts] = useState<string[]>([]);

  // Today's core sentence + Do/Don't + AHEAD — same profile chart, computed once
  useEffect(() => {
    const profile = getProfile();
    if (!profile) return;
    Promise.all([
      import('@/lib/saju'),
      loadTodayModule(),
      import('@/lib/homeCopy'),
      import('@/lib/askPrompts'),
    ])
      .then(([{ calculateSaju }, { getMyTodayCard, ME, ME_KO }, { getDailyDoDont, getFlowDays, pickAheadLines }, { getQuickPrompts }]) => {
        try {
          const c = calculateSaju({ date: profile.date, time: profile.time });
          const isKorean = typeof navigator !== 'undefined' && navigator.language.startsWith('ko');
          const element = c.dayMaster.element as Element;
          setKorean(isKorean);

          const myToday = getMyTodayCard(element, isKorean);
          setTodaySentence(myToday.note.line);
          setTodayGlyph({ stem: myToday.note.stem, element: myToday.note.todayElement });
          setDoDont(getDailyDoDont(element, isKorean));

          const flow = getFlowDays(element, isKorean);
          const goodAhead = flow.slice(1).filter(d => d.tone === 'good').slice(0, 2);
          const pools = goodAhead.map(d => (isKorean ? ME_KO : ME)[d.rel]);
          const lines = pickAheadLines(goodAhead.map(d => d.date), pools, [myToday.note.line]);
          setAheadDays(goodAhead.map((d, i) => ({ date: d.date, line: lines[i], dayElement: d.dayElement })));

          setQuickPrompts(getQuickPrompts('general', isKorean));
        } catch { /* chart calc failed — sections simply won't show */ }
      });
  }, []);

  // People in today's edition — latest reading per name, up to 3, themChart required
  useEffect(() => {
    if (readings.length === 0) { setPersonRows([]); return; }
    loadTodayModule().then(({ getTodayNote, localDateStr }) => {
      const ds = localDateStr();
      const rows: PersonRow[] = [];
      for (const r of dedupeLatestByName(readings)) {
        const rEl = r.themChart?.dayMaster?.element?.toLowerCase() as Element | undefined;
        if (!rEl) continue;
        rows.push({
          id: r.id,
          name: r.name ?? 'Unknown',
          relationship: r.relationship,
          element: rEl,
          line: getTodayNote(rEl, 'them', ds, r.name).line,
        });
      }
      setPersonRows(rows);
    });
  }, [readings]);

  const shownPeople = personRows.slice(0, 3);
  const hasMorePeople = personRows.length >= 4;
  const today = new Date();

  return (
    <div style={{ minHeight: '100%', background: 'var(--c-paper)' }}>
      <TabTopBar right={<AccountAvatar />} />

      <div style={{ padding: '20px 20px 0' }}>
        {/* Eyebrow — content area's first line */}
        <p style={{ margin: 0, ...SECTION_LABEL_STYLE }}>
          TODAY&apos;S EDITION · {eyebrowDateLabel(today)}
        </p>

        {/* Today's core sentence — the only large element on the screen */}
        {todaySentence && (
          <div style={{ position: 'relative', margin: '28px 0 32px' }}>
            {todayGlyph && (
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute', top: '50%', right: -8, transform: 'translateY(-50%)',
                  opacity: 0.07, pointerEvents: 'none', zIndex: 0,
                  color: ELEMENT_COLORS[todayGlyph.element]?.fg ?? 'var(--c-muted)',
                }}
              >
                <ArchetypeGlyph stem={todayGlyph.stem} size={180} strokeWidth={1.2} color="currentColor" />
              </div>
            )}
            <p style={{
              position: 'relative', zIndex: 1, margin: 0,
              fontFamily: 'var(--font-fraunces)',
              fontSize: isKo(todaySentence) ? 31 : 34,
              lineHeight: 1.22,
              color: 'var(--c-ink)',
              wordBreak: 'keep-all',
              overflowWrap: 'break-word',
            }}>
              {todaySentence}
            </p>
          </div>
        )}

        {/* Do / Don't — single line, no card */}
        {doDont && (
          <p style={{ margin: '0 0 28px', fontFamily: 'var(--font-inter)', fontSize: 13, color: 'var(--c-ink-body)', lineHeight: 1.6 }}>
            <DoIcon width={14} height={14} style={{ display: 'inline-block', color: ELEMENT_COLORS.wood.fg, verticalAlign: -2 }} />
            {' '}
            <span style={{ fontFamily: 'var(--font-space-mono)', fontSize: 10, letterSpacing: '0.1em', color: ELEMENT_COLORS.wood.fg }}>DO</span>
            {' '}{doDont.dos[0]}{' · '}
            <DontIcon width={14} height={14} style={{ display: 'inline-block', color: 'var(--c-vermilion)', verticalAlign: -2 }} />
            {' '}
            <span style={{ fontFamily: 'var(--font-space-mono)', fontSize: 10, letterSpacing: '0.1em', color: 'var(--c-vermilion)' }}>DON&apos;T</span>
            {' '}{doDont.donts[0]}
          </p>
        )}
      </div>

      {/* People in today's edition — or the empty-state ledger CTA row */}
      {personRows.length > 0 ? (
        <div style={{ padding: '0 0 28px' }}>
          <p style={{ ...SECTION_LABEL_STYLE, padding: '0 20px', marginBottom: 10 }}>PEOPLE IN TODAY&apos;S EDITION</p>
          <div>
            {shownPeople.map(person => (
              <Link
                key={person.id}
                href={`/reading/${person.id}`}
                className="pressable"
                style={{
                  display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4,
                  minHeight: 72, padding: '10px 20px',
                  borderBottom: '1px solid var(--c-hairline)',
                  textDecoration: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                    background: ELEMENT_COLORS[person.element]?.fg ?? 'var(--c-muted)',
                  }} />
                  <span style={{ fontFamily: 'var(--font-inter)', fontSize: 16, fontWeight: 600, color: 'var(--c-ink)' }}>
                    {person.name}
                  </span>
                  <span style={{ fontFamily: 'var(--font-inter)', fontSize: 11, color: 'var(--c-muted)' }}>
                    {person.relationship}
                  </span>
                  <ChevronIcon width={16} height={16} style={{ color: 'var(--c-muted)', marginLeft: 'auto', flexShrink: 0 }} />
                </div>
                <p style={{
                  margin: 0, fontFamily: 'var(--font-inter)', fontSize: 14, color: 'var(--c-ink-body)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {person.line}
                </p>
              </Link>
            ))}
            {hasMorePeople && (
              <Link
                href="/people"
                className="pressable"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '14px 20px', fontFamily: 'var(--font-inter)', fontSize: 13, color: 'var(--c-muted)',
                  textDecoration: 'none',
                }}
              >
                {korean ? '모든 사람 보기 ›' : 'See everyone ›'}
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div style={{ padding: '0 0 28px' }}>
          <Link
            href="/new"
            className="pressable"
            style={{
              display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4,
              minHeight: 72, padding: '14px 20px',
              borderTop: '1px solid var(--c-hairline)', borderBottom: '1px solid var(--c-hairline)',
              textDecoration: 'none',
            }}
          >
            <span style={{ fontFamily: 'var(--font-inter)', fontSize: 16, fontWeight: 600, color: 'var(--c-ink)' }}>
              {korean ? '＋ 오늘 떠오른 사람 추가하기' : '＋ Add someone on your mind'}
            </span>
            <span style={{ fontFamily: 'var(--font-inter)', fontSize: 14, color: 'var(--c-ink-body)' }}>
              {korean ? '출생 시간은 몰라도 시작할 수 있어요' : 'You can start without a birth time'}
            </span>
          </Link>
        </div>
      )}

      {/* AHEAD — up to 2 upcoming good-tone days */}
      {aheadDays.length > 0 && (
        <div style={{ padding: '0 20px 28px' }}>
          <p style={{ ...SECTION_LABEL_STYLE, marginBottom: 10 }}>AHEAD</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {aheadDays.map(day => (
              <div key={day.date} className="card" style={{ padding: 16 }}>
                <p style={{
                  margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6,
                  fontFamily: 'var(--font-space-mono)', fontSize: 10,
                  color: ELEMENT_COLORS[day.dayElement]?.fg ?? 'var(--c-muted)',
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                    background: ELEMENT_COLORS[day.dayElement]?.fg ?? 'var(--c-muted)',
                  }} />
                  {aheadDateLabel(new Date(`${day.date}T00:00:00`))}
                </p>
                <p style={{
                  margin: '0 0 10px', fontFamily: 'var(--font-inter)', fontSize: 15, color: 'var(--c-ink)', lineHeight: 1.5,
                  display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  wordBreak: 'keep-all', overflowWrap: 'break-word',
                }}>
                  {day.line}
                </p>
                <p style={{ margin: 0, fontFamily: 'var(--font-inter)', fontSize: 11.5, color: 'var(--c-ink-body)' }}>
                  {korean ? '힌트일 뿐, 정답표가 아니에요' : 'A hint, not an answer key'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ask for the moment */}
      {quickPrompts.length > 0 && (
        <div style={{ padding: '0 20px 32px' }}>
          <p style={{ ...SECTION_LABEL_STYLE, marginBottom: 10 }}>ASK FOR THE MOMENT</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {quickPrompts.slice(0, 4).map(q => (
              <Link
                key={q}
                href={`/ask?prefill=${encodeURIComponent(q)}`}
                className="pressable"
                style={{
                  display: 'flex', alignItems: 'center', minHeight: 44, padding: '0 14px',
                  textDecoration: 'none', fontFamily: 'var(--font-inter)', fontSize: 13, color: 'var(--c-ink)',
                  border: '1px solid var(--c-hairline)', borderRadius: 20,
                }}
              >
                {q}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
