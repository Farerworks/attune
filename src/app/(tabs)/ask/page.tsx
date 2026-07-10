'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { getProfile, getReadings, ELEMENT_COLORS } from '@/lib/store';
import type { BriefingData } from '@/lib/store';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Chip {
  id: string;          // 'me' | 'general' | readingId
  label: string;
  element?: string;    // for avatar bg/fg
  initial: string;     // avatar character
  personDate?: string; // person chips only
  personTime?: string;
  briefing?: BriefingData;
}

interface UserMsg {
  id: string;
  role: 'user';
  text: string;
}

interface AssistantMsg {
  id: string;
  role: 'assistant';
  mode: 'me' | 'person' | 'general';
  text?: string;
  parts?: Array<{ label: string; text: string }>;
  timing?: string;
}

type Msg = UserMsg | AssistantMsg;
type Threads = Record<string, Msg[]>;

// ── sessionStorage helpers ────────────────────────────────────────────────────

const SS_THREADS    = 'attune.ask.threads';
const SS_LEFT       = 'attune.ask.left';
const INITIAL_QUOTA = 5;

function ssGet<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = sessionStorage.getItem(key);
    return raw !== null ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

function ssSet(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// ── Quick prompts ─────────────────────────────────────────────────────────────

const QUICK_PROMPTS = [
  'How will they react if I say…',
  'Will they say yes to…',
  'When should I bring it up?',
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AskPage() {
  const bottomRef = useRef<HTMLDivElement>(null);

  const [initialized, setInitialized] = useState(false);
  const [chips,     setChips]     = useState<Chip[]>([]);
  const [selected,  setSelected]  = useState<string>('me');
  const [threads,   setThreads]   = useState<Threads>({});
  const [left,      setLeft]      = useState(INITIAL_QUOTA);
  const [loading,   setLoading]   = useState(false);
  const [input,     setInput]     = useState('');
  const [myProfile, setMyProfile] = useState<{ date: string; time?: string } | null>(null);

  // ── Init ──────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const profile = getProfile();
    setMyProfile(profile);
    if (!profile) { setInitialized(true); return; }

    const readings = getReadings();

    Promise.all([
      import('@/lib/saju'),
      import('@/lib/interpretGuide'),
    ]).then(([{ calculateSaju }, { getArchetype }]) => {
      const chipList: Chip[] = [];

      // Me chip — use hanja initial from day master archetype
      try {
        const myChart = calculateSaju({ date: profile.date, time: profile.time });
        const arch    = getArchetype(myChart.dayMaster.stem);
        chipList.push({
          id: 'me', label: 'Me',
          element: myChart.dayMaster.element,
          initial: arch.hanja,
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
          initial:     r.name ? r.name.charAt(0).toUpperCase() : '?',
          personDate:  r.date,
          personTime:  r.time,
          briefing:    r.briefing,
        });
      }

      // General chip
      chipList.push({ id: 'general', label: 'General', initial: '✳' });

      setChips(chipList);

      // Session state
      setThreads(ssGet<Threads>(SS_THREADS, {}));
      setLeft(ssGet<number>(SS_LEFT, INITIAL_QUOTA));

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
    const userMsg: UserMsg = { id: crypto.randomUUID(), role: 'user', text };
    const withUser     = [...prevThread, userMsg];
    const newThreads   = { ...threads, [selected]: withUser };
    setThreads(newThreads);
    ssSet(SS_THREADS, newThreads);

    const newLeft = left - 1;
    setLeft(newLeft);
    ssSet(SS_LEFT, newLeft);

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
      }));

      const body: Record<string, unknown> = {
        mode,
        me:       { date: myProfile.date, time: myProfile.time },
        history,
        question: text,
      };

      if (mode === 'person' && chip) {
        body.them = { date: chip.personDate, time: chip.personTime };
        if (chip.briefing) body.briefing = chip.briefing;
      }

      const res  = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json() as {
        answer?: { text?: string; parts?: Array<{ label: string; text: string }>; timing?: string };
        error?: string;
      };

      if (!res.ok) throw new Error(data.error ?? 'Something went wrong — try again.');

      const assistantMsg: AssistantMsg = {
        id: crypto.randomUUID(),
        role: 'assistant',
        mode,
        ...data.answer,
      };

      const final        = [...withUser, assistantMsg];
      const finalThreads = { ...newThreads, [selected]: final };
      setThreads(finalThreads);
      ssSet(SS_THREADS, finalThreads);

    } catch (err) {
      const errorMsg: AssistantMsg = {
        id:   crypto.randomUUID(),
        role: 'assistant',
        mode: selected === 'me' ? 'me' : selected === 'general' ? 'general' : 'person',
        text: err instanceof Error ? err.message : 'Something went wrong — try again.',
      };
      const final        = [...withUser, errorMsg];
      const finalThreads = { ...newThreads, [selected]: final };
      setThreads(finalThreads);
      ssSet(SS_THREADS, finalThreads);
    } finally {
      setLoading(false);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────────

  const currentThread = threads[selected] ?? [];
  const currentChip   = chips.find(c => c.id === selected);
  const chipColor     = currentChip?.element
    ? (ELEMENT_COLORS[currentChip.element.toLowerCase()]?.fg ?? '#948B7C')
    : '#948B7C';

  // ── Render ────────────────────────────────────────────────────────────────────

  if (!initialized) {
    return (
      <div style={{ minHeight: '100%', background: 'var(--c-paper)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2.5px solid var(--c-hairline)', borderTopColor: 'var(--c-vermilion)', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100%', background: 'var(--c-paper)', display: 'flex', flexDirection: 'column' }}>

      {/* ── Sticky header ─────────────────────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(250,248,244,0.92)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        borderBottom: '1px solid var(--c-hairline)',
        padding: '12px 20px 0',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontFamily: "var(--font-space-mono,'Courier New')", fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--c-ink)' }}>
            ATTUNE
          </span>
          <span style={{ fontFamily: "var(--font-space-mono,'Courier New')", fontSize: 10, letterSpacing: '0.08em', color: 'var(--c-muted)' }}>
            {left} QUESTIONS LEFT
          </span>
        </div>

        {/* Chip row */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, scrollbarWidth: 'none' }}>
          <style>{`::-webkit-scrollbar{display:none}`}</style>
          {chips.map(chip => (
            <ChipButton
              key={chip.id}
              chip={chip}
              active={selected === chip.id}
              onClick={() => setSelected(chip.id)}
            />
          ))}
        </div>
      </header>

      {/* ── Chat area ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, padding: '20px 16px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {currentThread.length === 0 && !loading && (
          <EmptyHint chipId={selected} chipLabel={currentChip?.label} />
        )}

        {currentThread.map(msg => (
          <MessageBubble key={msg.id} msg={msg} chipColor={chipColor} />
        ))}

        {loading && <LoadingBubble />}

        <div ref={bottomRef} />
      </div>

      {/* ── Bottom input area ─────────────────────────────────────────────────── */}
      <div style={{ position: 'sticky', bottom: 0, background: 'var(--c-paper)', borderTop: '1px solid var(--c-hairline)', padding: '12px 16px 10px' }}>
        {left <= 0 ? (
          <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
            <p style={{ fontFamily: "var(--font-inter,system-ui)", fontSize: 14, color: 'var(--c-muted)', marginBottom: 14 }}>
              That&apos;s all for this reading — start a new one to keep asking.
            </p>
            <Link href="/new" style={{
              display: 'inline-block', textDecoration: 'none',
              background: '#C4502E', color: '#fff',
              fontFamily: "var(--font-inter,system-ui)", fontSize: 14, fontWeight: 600,
              padding: '10px 24px', borderRadius: 24,
            }}>
              Read someone
            </Link>
          </div>
        ) : (
          <>
            {/* Quick prompts */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, overflowX: 'auto', scrollbarWidth: 'none' }}>
              {QUICK_PROMPTS.map(q => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setInput(q)}
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
                  fontFamily: "var(--font-inter,system-ui)", fontSize: 15,
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

function ChipButton({ chip, active, onClick }: { chip: Chip; active: boolean; onClick: () => void }) {
  const elC = chip.element ? ELEMENT_COLORS[chip.element.toLowerCase()] : null;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
        padding: '4px 10px 4px 4px', borderRadius: 20,
        border: active ? '1px solid rgba(196,80,46,0.35)' : '1px solid var(--c-hairline)',
        background: active ? '#FFF2EE' : 'var(--c-card)',
        cursor: 'pointer',
      }}
    >
      <div style={{
        width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
        background: active ? '#F7E4DC' : (elC?.bg ?? 'var(--c-surface-alt)'),
        color: active ? '#A83E20' : (elC?.fg ?? 'var(--c-muted)'),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: chip.id === 'general' ? undefined : "var(--font-fraunces,Georgia,serif)",
        fontSize: chip.id === 'general' ? 11 : 10,
      }}>
        {chip.initial}
      </div>
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

function EmptyHint({ chipId, chipLabel }: { chipId: string; chipLabel?: string }) {
  const msg =
    chipId === 'me'      ? 'Ask about yourself.' :
    chipId === 'general' ? 'Ask about anything.' :
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
        fontFamily: "var(--font-inter,system-ui)", fontSize: 14,
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
          fontFamily: "var(--font-inter,system-ui)", fontSize: 14.5, lineHeight: 1.5,
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
        {m.parts ? (
          <>
            {m.parts.map((part, i) => (
              <div key={i}>
                <div style={{
                  fontFamily: "var(--font-space-mono,'Courier New')",
                  fontSize: 10, letterSpacing: '0.08em',
                  color: '#C4502E', marginBottom: 4,
                }}>
                  {part.label}
                </div>
                <p style={{
                  margin: 0,
                  fontFamily: "var(--font-inter,system-ui)", fontSize: 14,
                  color: 'var(--c-ink)', lineHeight: 1.55,
                }}>
                  {part.text}
                </p>
              </div>
            ))}
            {m.timing && (
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
            fontFamily: "var(--font-inter,system-ui)", fontSize: 14,
            color: 'var(--c-ink)', lineHeight: 1.55,
          }}>
            {m.text ?? ''}
          </p>
        )}
      </div>
    </div>
  );
}
