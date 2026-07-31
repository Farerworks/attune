'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { getProfile, getReadings, ELEMENT_COLORS } from '@/lib/store';
import { getQuotaLeft, incrementQuotaUsed, DAILY_QUOTA_MAX, loadMemory, appendMemory } from '@/lib/askQuota';
import type { BriefingData } from '@/lib/store';
import type { TenStem } from '@/lib/saju';
import { GlyphAvatar } from '@/components/ArchetypeGlyph';
import { TabTopBar } from '@/components/TabTopBar';
import { TabHeader } from '@/components/TabHeader';
import { AccountAvatar } from '@/components/AccountAvatar';
import { pickVariant, localDateStr } from '@/lib/today';
import { friendlyError } from '@/lib/errorCopy';
import { getQuickPrompts } from '@/lib/askPrompts';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Chip {
  id: string;          // 'me' | 'general' | readingId
  label: string;
  element?: string;    // for avatar bg/fg
  stem?: string;       // for GlyphAvatar
  initial: string;     // avatar fallback character
  personDate?: string; // person chips only
  personTime?: string;
  briefing?: BriefingData;
}

interface UserMsg {
  id: string;
  role: 'user';
  text: string;
  createdAt?: string;
}

interface AssistantMsg {
  id: string;
  role: 'assistant';
  mode: 'me' | 'person' | 'general';
  text?: string;
  parts?: Array<{ label: string; text: string }>;
  timing?: string;
  followUp?: string;
  createdAt?: string;
}

type Msg = UserMsg | AssistantMsg;
type Threads = Record<string, Msg[]>;

// ── localStorage helpers ──────────────────────────────────────────────────────

const LS_THREADS      = 'attune.ask.threads';
const MAX_THREAD_MSGS = 40;

function loadThreads(): Threads {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LS_THREADS);
    return raw ? (JSON.parse(raw) as Threads) : {};
  } catch { return {}; }
}

function saveThreads(threads: Threads): void {
  if (typeof window === 'undefined') return;
  const capped: Threads = {};
  for (const [k, msgs] of Object.entries(threads)) {
    capped[k] = msgs.length > MAX_THREAD_MSGS ? msgs.slice(-MAX_THREAD_MSGS) : msgs;
  }
  try { localStorage.setItem(LS_THREADS, JSON.stringify(capped)); } catch {}
}

/** Marks an error whose message is already a friendly, user-facing string */
class DisplayError extends Error {}

// ── Exhausted variants ────────────────────────────────────────────────────────

const EXHAUSTED = [
  "That's all for today. Fresh questions tomorrow.",
  "You've used today's questions. Back at midnight.",
  "Done for today. Come back tomorrow.",
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AskPage() {
  const bottomRef = useRef<HTMLDivElement>(null);

  const [initialized, setInitialized] = useState(false);
  const [chips,     setChips]     = useState<Chip[]>([]);
  const [selected,  setSelected]  = useState<string>('me');
  const [threads,   setThreads]   = useState<Threads>({});
  const [left,      setLeft]      = useState(DAILY_QUOTA_MAX);
  const [loading,   setLoading]   = useState(false);
  const [input,     setInput]     = useState('');
  const [myProfile, setMyProfile] = useState<{ date: string; time?: string; name?: string } | null>(null);

  // ── Init ──────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const profile = getProfile();
    setMyProfile(profile);
    if (!profile) { setInitialized(true); return; }

    const readings = getReadings();

    import('@/lib/saju').then(({ calculateSaju }) => {
      const chipList: Chip[] = [];

      // Me chip
      try {
        const myChart = calculateSaju({ date: profile.date, time: profile.time });
        chipList.push({
          id: 'me', label: profile.name?.trim() || 'Me',
          element: myChart.dayMaster.element,
          stem:    myChart.dayMaster.stem,
          initial: 'M',
        });
      } catch {
        chipList.push({ id: 'me', label: 'Me', initial: 'M' });
      }

      // Person chips
      for (const r of readings) {
        chipList.push({
          id:          r.id,
          label:       r.name ?? 'Unknown',
          element:     r.themChart?.dayMaster?.element,
          stem:        r.themChart?.dayMaster?.stem,
          initial:     r.name ? r.name.charAt(0).toUpperCase() : '?',
          personDate:  r.date,
          personTime:  r.time,
          briefing:    r.briefing,
        });
      }

      setChips(chipList);

      // Persistent state
      setThreads(loadThreads());
      setLeft(getQuotaLeft());

      // Auto-select from URL ?person=
      const params   = new URLSearchParams(window.location.search);
      const personId = params.get('person');
      if (personId && readings.some(r => r.id === personId)) {
        setSelected(personId);
      }

      setInitialized(true);
    }).catch(() => setInitialized(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threads, selected, loading]);

  // ── Send handler ──────────────────────────────────────────────────────────────

  async function handleSend(text = input.trim()) {
    if (!text || loading || left <= 0 || !myProfile) return;
    setInput('');

    const prevThread   = threads[selected] ?? [];
    const userMsg: UserMsg = { id: crypto.randomUUID(), role: 'user', text, createdAt: new Date().toISOString() };
    const withUser     = [...prevThread, userMsg];
    const newThreads   = { ...threads, [selected]: withUser };
    setThreads(newThreads);
    saveThreads(newThreads);

    setLoading(true);

    try {
      const mode: 'me' | 'person' | 'general' =
        selected === 'me' ? 'me' :
        selected === 'general' ? 'general' : 'person';

      const chip = chips.find(c => c.id === selected);

      // Serialize history (the thread BEFORE the new question)
      const history = prevThread.slice(-10).map(m => ({
        role: m.role as 'user' | 'assistant',
        text: m.role === 'user'
          ? (m as UserMsg).text
          : ((m as AssistantMsg).parts
              ? (m as AssistantMsg).parts!.map(p => `${p.label}: ${p.text}`).join('\n')
              : ((m as AssistantMsg).text ?? '')),
        at: m.createdAt?.slice(0, 10),
      }));

      const body: Record<string, unknown> = {
        mode,
        me:       { date: myProfile.date, time: myProfile.time, name: myProfile.name },
        history,
        question: text,
        todayLocal: localDateStr(),
      };

      if (mode === 'person' && chip) {
        const themName = chip.label && chip.label !== 'Unknown' ? chip.label : undefined;
        body.them = { date: chip.personDate, time: chip.personTime, ...(themName ? { name: themName } : {}) };
        if (chip.briefing) body.briefing = chip.briefing;
        const mem = loadMemory(selected);
        if (mem.length > 0) body.memory = mem;
      }

      const res  = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json() as {
        answer?: { text?: string; parts?: Array<{ label: string; text: string }>; timing?: string; followUp?: string; memory?: string[] };
        error?: string;
        retryAfterMinutes?: number;
      };

      if (!res.ok) {
        console.error('[ask] request failed:', data.error);
        throw new DisplayError(friendlyError(res.status, data.retryAfterMinutes));
      }

      const newLeft = incrementQuotaUsed();
      setLeft(newLeft);

      if (mode === 'person' && Array.isArray(data.answer?.memory)) {
        appendMemory(selected, data.answer.memory as string[]);
      }

      const assistantMsg: AssistantMsg = {
        id: crypto.randomUUID(),
        role: 'assistant',
        mode,
        createdAt: new Date().toISOString(),
        ...data.answer,
      };

      const final        = [...withUser, assistantMsg];
      const finalThreads = { ...newThreads, [selected]: final };
      setThreads(finalThreads);
      saveThreads(finalThreads);

    } catch (err) {
      const errorMsg: AssistantMsg = {
        id:   crypto.randomUUID(),
        role: 'assistant',
        mode: selected === 'me' ? 'me' : selected === 'general' ? 'general' : 'person',
        text: err instanceof DisplayError ? err.message : friendlyError(null),
      };
      const final        = [...withUser, errorMsg];
      const finalThreads = { ...newThreads, [selected]: final };
      setThreads(finalThreads);
      saveThreads(finalThreads);
    } finally {
      setLoading(false);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────────

  const currentThread  = threads[selected] ?? [];
  const currentChip    = chips.find(c => c.id === selected);
  const chipColor      = currentChip?.element
    ? (ELEMENT_COLORS[currentChip.element.toLowerCase()]?.fg ?? '#948B7C')
    : '#948B7C';
  const hasPersonChips = chips.some(c => c.id !== 'me' && c.id !== 'general');
  const hasAnyThread   = Object.values(threads).some(t => t.length > 0);
  const korean          = typeof navigator !== 'undefined' && navigator.language.startsWith('ko');
  const starterPrompts =
    currentChip && selected !== 'me' && selected !== 'general'
    && Array.isArray(currentChip.briefing?.starters)
    && currentChip.briefing!.starters!.length === 3
      ? currentChip.briefing!.starters!
      : getQuickPrompts(selected === 'general' ? 'general' : 'person', korean);

  // Show date divider if last message is from a previous day (>24h ago)
  const lastMsg = currentThread[currentThread.length - 1];
  const showDateDivider = currentThread.length > 0
    && !!lastMsg?.createdAt
    && (Date.now() - new Date(lastMsg.createdAt).getTime() > 24 * 60 * 60 * 1000);

  // ── Render ────────────────────────────────────────────────────────────────────

  if (!initialized) {
    return (
      <div className="ask-full" style={{ background: 'var(--c-paper)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2.5px solid var(--c-hairline)', borderTopColor: 'var(--c-vermilion)', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (!myProfile) {
    return (
      <div className="ask-full" style={{
        background: 'var(--c-paper)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '40px 24px', textAlign: 'center',
      }}>
        <p style={{
          fontFamily: "var(--font-inter,system-ui)", fontSize: 16,
          color: 'var(--c-muted)', marginBottom: 20, lineHeight: 1.5,
        }}>
          Set up your chart first — it&apos;s half of every answer.
        </p>
        <Link href="/onboarding" style={{
          display: 'inline-block', textDecoration: 'none',
          background: '#C4502E', color: '#fff',
          fontFamily: "var(--font-inter,system-ui)", fontSize: 14, fontWeight: 600,
          padding: '10px 24px', borderRadius: 24,
        }}>
          Get started
        </Link>
      </div>
    );
  }

  return (
    <div className="ask-full" style={{ background: 'var(--c-paper)', display: 'flex', flexDirection: 'column' }}>

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <TabTopBar right={<AccountAvatar />} />
      <TabHeader title="Ask" />

      {/* ── Quota + chip row — moved out of the sticky header (BRIEF-077) ───────── */}
      <div style={{ padding: '12px 20px 0' }}>
        <p style={{
          margin: '0 0 10px', textAlign: 'right',
          fontFamily: "var(--font-space-mono,'Courier New')", fontSize: 11, letterSpacing: '0.08em', color: 'var(--c-muted)',
        }}>
          {left} QUESTIONS LEFT TODAY
        </p>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, scrollbarWidth: 'none', alignItems: 'flex-start' }}>
          <style>{`::-webkit-scrollbar{display:none}`}</style>
          {/* Me + Person chips */}
          {chips.filter(c => c.id !== 'general').map(chip => (
            <div key={chip.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0 }}>
              <ChipButton chip={chip} active={selected === chip.id} onClick={() => setSelected(chip.id)} />
              {!hasAnyThread && chip.id === 'me' && (
                <span style={{ fontFamily: "var(--font-space-mono,'Courier New')", fontSize: 8.5, letterSpacing: '0.1em', color: 'var(--c-muted)', textTransform: 'uppercase' }}>YOU · TIMING · ANYTHING</span>
              )}
            </div>
          ))}
          {/* + Someone chip — only when no saved people */}
          {!hasPersonChips && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0 }}>
              <Link href="/new" style={{
                display: 'flex', alignItems: 'center', padding: '12px 18px',
                borderRadius: 20, border: '1.5px dashed #C9C0AD',
                background: 'transparent', color: 'var(--c-muted)',
                textDecoration: 'none', fontFamily: "var(--font-inter,system-ui)", fontSize: 13,
                whiteSpace: 'nowrap', minHeight: 48, boxSizing: 'border-box',
              }}>
                + Someone
              </Link>
              {!hasAnyThread && (
                <span style={{ fontFamily: "var(--font-space-mono,'Courier New')", fontSize: 8.5, letterSpacing: '0.1em', color: 'var(--c-muted)', textTransform: 'uppercase' }}>ADD A PERSON</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Chat area ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, padding: '20px 20px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {currentThread.length === 0 && !loading && (
          hasAnyThread
            ? <EmptyHint chipId={selected} chipLabel={currentChip?.label} />
            : <FirstVisitContent onSelect={(q) => setInput(q)} />
        )}

        {showDateDivider && currentThread[0]?.createdAt && (
          <DateDivider isoStr={currentThread[0].createdAt} />
        )}

        {currentThread.map(msg => (
          <MessageBubble key={msg.id} msg={msg} chipColor={chipColor} />
        ))}

        {loading && <LoadingBubble />}

        <div ref={bottomRef} />
      </div>

      {/* ── Bottom input area ─────────────────────────────────────────────────── */}
      <div style={{ position: 'sticky', bottom: 0, background: 'var(--c-paper)', borderTop: '1px solid var(--c-hairline)', padding: '12px 20px 10px' }}>
        {left <= 0 ? (
          <div style={{ textAlign: 'center', padding: '12px 0 4px' }}>
            <p style={{
              fontFamily: "var(--font-fraunces,Georgia,serif)",
              fontSize: 17, fontStyle: 'italic',
              color: 'var(--c-ink-body)', margin: 0,
            }}>
              {pickVariant(EXHAUSTED, `exhausted|${localDateStr()}`)}
            </p>
          </div>
        ) : (
          <>
            {/* Quick prompts */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, overflowX: 'auto', scrollbarWidth: 'none' }}>
              {starterPrompts.map(q => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setInput(q)}
                  className="pressable"
                  style={{
                    flexShrink: 0,
                    fontFamily: "var(--font-inter,system-ui)", fontSize: 13,
                    color: 'var(--c-muted)', background: 'var(--c-card)',
                    border: '1px solid var(--c-hairline)', borderRadius: 16,
                    padding: '5px 12px', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  {q}
                </button>
              ))}
            </div>

            {/* Input row */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <textarea
                rows={1}
                placeholder="Ask anything…"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); }
                }}
                style={{
                  flex: 1, resize: 'none', maxHeight: 120,
                  fontFamily: "var(--font-inter,system-ui)", fontSize: 16,
                  color: 'var(--c-ink)', lineHeight: 1.5,
                  background: 'var(--c-card)', border: '1px solid var(--c-hairline)',
                  borderRadius: 24, padding: '10px 16px', outline: 'none',
                  overflowY: 'auto',
                }}
              />
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={loading || !input.trim()}
                aria-label="Send"
                className="pressable"
                style={{
                  flexShrink: 0, width: 50, height: 50, borderRadius: '50%',
                  background: loading || !input.trim() ? 'var(--c-hairline)' : '#C4502E',
                  border: 'none', cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.15s',
                }}
              >
                <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                  <path stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </button>
            </div>
          </>
        )}

        {/* Disclaimer */}
        <p style={{ margin: '8px 0 0', textAlign: 'center', fontFamily: "var(--font-inter,system-ui)", fontSize: 11, color: 'var(--c-muted)' }}>
          Attune is for understanding and self-reflection, not a verdict on anyone.
        </p>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DateDivider({ isoStr }: { isoStr: string }) {
  const label = new Date(isoStr)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    .toUpperCase();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--c-hairline)' }} />
      <span style={{
        fontFamily: "var(--font-space-mono,'Courier New')",
        fontSize: 10, letterSpacing: '0.1em',
        color: 'var(--c-muted)', textTransform: 'uppercase', whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--c-hairline)' }} />
    </div>
  );
}

function ChipButton({ chip, active, onClick }: { chip: Chip; active: boolean; onClick: () => void }) {
  const elC = chip.element ? ELEMENT_COLORS[chip.element.toLowerCase()] : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="pressable"
      style={{
        display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
        padding: '12px 18px 12px 10px', borderRadius: 20, minHeight: 48,
        border: active ? '1px solid rgba(196,80,46,0.35)' : '1px solid var(--c-hairline)',
        background: active ? '#FFF2EE' : 'var(--c-card)',
        cursor: 'pointer',
      }}
    >
      {chip.id !== 'general' && chip.stem && chip.element ? (
        <GlyphAvatar stem={chip.stem as TenStem} element={chip.element} size={26} />
      ) : (
        <div style={{
          width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
          background: active ? '#F7E4DC' : (elC?.bg ?? 'var(--c-surface-alt)'),
          color: active ? '#A83E20' : (elC?.fg ?? 'var(--c-muted)'),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11,
        }}>
          {chip.initial}
        </div>
      )}
      <span style={{
        fontFamily: "var(--font-inter,system-ui)", fontSize: 13,
        color: active ? '#A83E20' : 'var(--c-ink)',
        fontWeight: active ? 500 : 400,
      }}>
        {chip.label}
      </span>
    </button>
  );
}

function FirstVisitContent({ onSelect }: { onSelect: (q: string) => void }) {
  const EXAMPLES = [
    { q: 'How do I ask them out?',       color: '#C4502E', right: true,  rot: '-1deg' },
    { q: 'Why the slow replies?',         color: '#4A76AC', right: false, rot: '1deg' },
    { q: 'How do I raise a hard topic?', color: '#4E8A52', right: true,  rot: '-0.8deg' },
  ];

  return (
    <div style={{ padding: '32px 8px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <h2 style={{
        fontFamily: "var(--font-fraunces,Georgia,serif)",
        fontSize: 36, textAlign: 'center', color: 'var(--c-ink)',
        margin: 0, lineHeight: 1.1, fontWeight: 500,
      }}>
        Go ahead,{' '}
        <em style={{ fontStyle: 'italic', color: '#C4502E' }}>ask</em>.
      </h2>
      <span style={{
        fontFamily: "var(--font-space-mono,'Courier New')",
        fontSize: 10, letterSpacing: '0.1em', color: 'var(--c-muted)',
        textTransform: 'uppercase',
      }}>
        TAP ONE
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
        {EXAMPLES.map(({ q, color, right, rot }) => (
          <div key={q} style={{ display: 'flex', justifyContent: right ? 'flex-end' : 'flex-start' }}>
            <button
              type="button"
              onClick={() => onSelect(q)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--c-card)', border: '1px solid #EAE4D8',
                borderRadius: right ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                padding: '12px 16px', cursor: 'pointer',
                boxShadow: '0 4px 12px -6px rgba(26,24,21,0.12)',
                transform: `rotate(${rot})`,
                fontFamily: "var(--font-inter,system-ui)", fontSize: 14,
                color: 'var(--c-ink)', maxWidth: '80%', textAlign: 'left',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
              {q}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyHint({ chipId, chipLabel }: { chipId: string; chipLabel?: string }) {
  const msg =
    chipId === 'me'      ? 'Ask about yourself.' :
    chipId === 'general' ? 'Ask about you, timing, or anything — no person needed.' :
    `${chipLabel ?? 'Their'}'s chart and briefing are loaded as context.`;

  return (
    <p style={{
      fontFamily: "var(--font-fraunces,Georgia,serif)",
      fontSize: 17, fontStyle: 'italic', color: 'var(--c-muted)',
      textAlign: 'center', padding: '40px 24px', margin: 'auto 0',
    }}>
      {msg}
    </p>
  );
}

function LoadingBubble() {
  return (
    <div style={{ display: 'flex', alignSelf: 'flex-start', maxWidth: '80%' }}>
      <div style={{
        background: 'var(--c-card)', border: '1px solid #EAE4D8',
        borderRadius: '16px 16px 16px 4px', padding: '12px 16px',
        fontFamily: "var(--font-inter,system-ui)", fontSize: 15,
        fontStyle: 'italic', color: 'var(--c-muted)',
      }}>
        Reading the pillars…
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Msg; chipColor: string }) {
  if (msg.role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{
          maxWidth: '80%', background: '#1A1815', color: '#fff',
          borderRadius: '16px 16px 4px 16px',
          padding: '12px 16px',
          fontFamily: "var(--font-inter,system-ui)", fontSize: 15, lineHeight: 1.5,
        }}>
          {msg.text}
        </div>
      </div>
    );
  }

  const m = msg as AssistantMsg;

  return (
    <div style={{ display: 'flex', alignSelf: 'flex-start', maxWidth: '88%' }}>
      <div style={{
        background: 'var(--c-card)', border: '1px solid #EAE4D8',
        borderRadius: '16px 16px 16px 4px',
        padding: '14px 16px',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {Array.isArray(m.parts) ? (
          <>
            {m.parts
              .filter(part => typeof part.label === 'string' && typeof part.text === 'string')
              .map((part, i) => (
                <div key={i}>
                  <div style={{
                    fontFamily: "var(--font-space-mono,'Courier New')",
                    fontSize: 11, letterSpacing: '0.08em',
                    color: '#C4502E', marginBottom: 4,
                  }}>
                    {part.label}
                  </div>
                  <p style={{
                    margin: 0,
                    fontFamily: "var(--font-inter,system-ui)", fontSize: 15,
                    color: 'var(--c-ink)', lineHeight: 1.55,
                  }}>
                    {part.text}
                  </p>
                </div>
              ))}
            {typeof m.timing === 'string' && m.timing && (
              <div style={{
                background: '#FBF3E4', borderRadius: 8, padding: '10px 12px',
                display: 'flex', gap: 8, alignItems: 'flex-start',
              }}>
                <span style={{ fontSize: 13, flexShrink: 0 }}>◷</span>
                <p style={{
                  margin: 0,
                  fontFamily: "var(--font-inter,system-ui)", fontSize: 13,
                  color: 'var(--c-ink)', lineHeight: 1.55,
                }}>
                  {m.timing}
                </p>
              </div>
            )}
          </>
        ) : (
          <p style={{
            margin: 0,
            fontFamily: "var(--font-inter,system-ui)", fontSize: 15,
            color: 'var(--c-ink)', lineHeight: 1.55,
          }}>
            {typeof m.text === 'string' ? m.text : ''}
          </p>
        )}
        {typeof m.followUp === 'string' && m.followUp && (
          <p style={{
            margin: 0,
            fontFamily: 'var(--font-fraunces,Georgia,serif)',
            fontStyle: 'italic', fontSize: 14,
            color: 'var(--c-muted)', lineHeight: 1.5,
          }}>
            {m.followUp}
          </p>
        )}
      </div>
    </div>
  );
}
