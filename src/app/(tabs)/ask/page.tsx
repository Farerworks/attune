'use client';

import { useState, useEffect, useRef } from 'react';
import type { ReactNode, CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getProfile, getReadings, ELEMENT_COLORS } from '@/lib/store';
import { getQuotaLeft, incrementQuotaUsed, DAILY_QUOTA_MAX, loadMemory, appendMemory } from '@/lib/askQuota';
import type { BriefingData } from '@/lib/store';
import type { TenStem } from '@/lib/saju';
import { GlyphAvatar } from '@/components/ArchetypeGlyph';
import { TabTopBar } from '@/components/TabTopBar';
import { AccountAvatar } from '@/components/AccountAvatar';
import { pickVariant, localDateStr } from '@/lib/today';
import { friendlyError } from '@/lib/errorCopy';
import { getQuickPrompts } from '@/lib/askPrompts';
import { useKeyboardOpen, useKeyboardInset } from '@/lib/keyboard';
import { loadAskThreads } from '@/lib/askThreads';
import type { AskUserMsg, AskAssistantMsg, AskMessage, AskThreads } from '@/lib/askThreads';
import {
  detectWithContext,
  enterSafetyState,
  routeSafetyAnswer,
  getSafetyContacts,
  SAFETY_COPY_KO,
  SAFETY_COPY_EN,
} from '@/lib/safety';
import type {
  SafetyTriggerCategory,
  SafetyAwaitingAnswerState,
  SafetyChoiceIndex,
  SafetyCountry,
  SafetySituation,
  SafetyContact,
} from '@/lib/safety';

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

// Read adapter extracted to @/lib/askThreads (BRIEF-097 §1) — same storage key/format,
// so `people.ts` can read Ask threads too. Local aliases keep the rest of this file unchanged.
type UserMsg = AskUserMsg;
type AssistantMsg = AskAssistantMsg;
type Msg = AskMessage;
type Threads = AskThreads;

// ── localStorage helpers ──────────────────────────────────────────────────────

const LS_THREADS      = 'attune.ask.threads';
const MAX_THREAD_MSGS = 40;

function loadThreads(): Threads {
  return loadAskThreads();
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

// ── Safety copy — this BRIEF (096 §2) is the source of truth for these, not safety.ts ──

const SAFETY_ACK_KO = '많이 힘들거나 화가 난 상태로 들려요.';
const SAFETY_ACK_EN = 'That sounds really heavy or really frustrating.';
const SAFETY_COUNTRY_TOGGLE_KO = '한국이 아닌가요?';
const SAFETY_COUNTRY_TOGGLE_EN = 'Not in the US?';
// S2's imminence question has 3 buttons; SAFETY-SPEC/BRIEF-096 give the KO labels literally
// but not EN ones — EN below matches the tone of the existing EN "hard to answer" option.
const IMMINENCE_CHOICES_KO: [string, string, string] = ['예', '아니요, 생각만이에요', '답하기 어려워요'];
const IMMINENCE_CHOICES_EN: [string, string, string] = ['Yes', 'No, just thoughts', "It's hard to answer"];

// Reserves the fixed bottom TabBar's own footprint below the safety card (BRIEF-094H §1) —
// without this, a sticky-positioned card taller than the leftover viewport ends up sitting
// flush against the real screen bottom, with the TabBar (higher z-index) painted over its
// last choice.
const SAFETY_PANEL_BOTTOM_PAD = 'calc(var(--tab-bar-height) + env(safe-area-inset-bottom, 0px) + 16px)';

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AskPage() {
  const router = useRouter();
  const keyboardOpen = useKeyboardOpen();
  const { bottomInset, topOffset } = useKeyboardInset();
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectedChipRef = useRef<HTMLDivElement>(null);
  const chipRowRef = useRef<HTMLDivElement>(null);

  const [initialized, setInitialized] = useState(false);
  const [chipFade, setChipFade] = useState({ left: false, right: false });
  const [chips,     setChips]     = useState<Chip[]>([]);
  const [selected,  setSelected]  = useState<string>('me');
  const [threads,   setThreads]   = useState<Threads>({});
  const [left,      setLeft]      = useState(DAILY_QUOTA_MAX);
  const [loading,   setLoading]   = useState(false);
  const [input,     setInput]     = useState('');
  const [myProfile, setMyProfile] = useState<{ date: string; time?: string; name?: string } | null>(null);

  // ── Safety flow state (BRIEF-096) — never written to `threads`/localStorage; component state only. ──
  const [safetyCardState, setSafetyCardState] = useState<SafetyAwaitingAnswerState | 'S2' | 'S3' | null>(null);
  const [safetyTrigger,   setSafetyTrigger]   = useState<SafetyTriggerCategory | null>(null);
  const [pendingText,     setPendingText]     = useState('');
  const [safetyReentryText, setSafetyReentryText] = useState<string | null>(null);
  const [recentUserTexts, setRecentUserTexts] = useState<string[]>([]); // session-only window, for repeat detection only
  const [ackNextSend,     setAckNextSend]     = useState(false); // one-time skip after an S1_NO resend
  const [safetyCountry,   setSafetyCountry]   = useState<SafetyCountry>(
    () => (typeof navigator !== 'undefined' && navigator.language.startsWith('ko')) ? 'KR' : 'US',
  );

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

      // Single pass over the URL (BRIEF-097 §4): ?person= (auto-select, e.g. from the person
      // hub's CTA) and ?prefill= (compose text, e.g. from a Home Ask chip) are both read and
      // applied here, with exactly one router.replace() cleaning up whichever were present —
      // two independent effects each doing their own replace() could race and clobber each other.
      const params   = new URLSearchParams(window.location.search);
      const personId = params.get('person');
      const prefill  = params.get('prefill');

      if (personId && readings.some(r => r.id === personId)) {
        setSelected(personId);
      }
      if (prefill) {
        setInput(prefill);
        textareaRef.current?.focus();
      }
      if (personId || prefill) {
        params.delete('person');
        params.delete('prefill');
        const query = params.toString();
        router.replace(query ? `/ask?${query}` : '/ask');
      }

      setInitialized(true);
    }).catch(() => setInitialized(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threads, selected, loading]);

  // Switching who you're talking to exits any in-progress safety flow (BRIEF-096).
  useEffect(() => {
    setSafetyCardState(null);
    setSafetyTrigger(null);
    setPendingText('');
    setSafetyReentryText(null);
    setAckNextSend(false);
  }, [selected]);

  // Which edge(s) of the chip row currently have more content scrolled out of view —
  // drives the fade overlay(s) (BRIEF-094G v2 §2: conditional on real overflow, edge-aware).
  function updateChipFade() {
    const el = chipRowRef.current;
    if (!el) { setChipFade({ left: false, right: false }); return; }
    const { scrollLeft, scrollWidth, clientWidth } = el;
    if (scrollWidth <= clientWidth + 1) { setChipFade({ left: false, right: false }); return; }
    setChipFade({
      left: scrollLeft > 1,
      right: scrollLeft + clientWidth < scrollWidth - 1,
    });
  }

  // Keep the selected person's tab in view — chips can scroll off-screen once several
  // people exist. Scrolls only the horizontal chip row itself (never the page/scrollIntoView —
  // BRIEF-094G v2 §2), and only when the chip is actually outside the visible range. Also fires
  // once `chips` finishes its async load, so a ?person= deep link scrolls into view too.
  useEffect(() => {
    const container = chipRowRef.current;
    const chipEl = selectedChipRef.current;
    if (container && chipEl) {
      const chipLeft  = chipEl.offsetLeft;
      const chipRight = chipLeft + chipEl.offsetWidth;
      const visibleLeft  = container.scrollLeft;
      const visibleRight = visibleLeft + container.clientWidth;

      let target: number | null = null;
      if (chipLeft < visibleLeft) target = chipLeft;
      else if (chipRight > visibleRight) target = chipRight - container.clientWidth;

      if (target !== null) {
        const reduceMotion = typeof window !== 'undefined'
          && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        container.scrollTo({ left: target, behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    }
    updateChipFade();
  }, [selected, chips]);

  // ── Send handler ──────────────────────────────────────────────────────────────

  async function handleSend(text = input.trim()) {
    if (!text || loading || left <= 0 || !myProfile) return;

    // Safety pre-check (BRIEF-096 §2) — before anything is sent or stored. Skipped exactly once
    // right after an S1_NO resend (`ackNextSend`), so the user's own confirmed-safe resend goes through.
    const safetyWindow = [...recentUserTexts.slice(-3), text];
    setRecentUserTexts(safetyWindow.slice(-4));

    if (!ackNextSend) {
      const { trigger } = detectWithContext(safetyWindow);
      if (trigger) {
        setPendingText(text);
        setSafetyTrigger(trigger);
        setSafetyCardState(enterSafetyState(trigger));
        return; // no fetch, no quota decrement, no thread write
      }
    }
    const sendingWithAck = ackNextSend;
    setAckNextSend(false);
    setSafetyReentryText(null);
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
      const history = prevThread.slice(-20).map(m => ({
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
        ...(sendingWithAck ? { safetyAck: true } : {}),
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
        safety?: SafetyTriggerCategory;
      };

      if (!res.ok) {
        console.error('[ask] request failed:', data.error);
        throw new DisplayError(friendlyError(res.status, data.retryAfterMinutes));
      }

      if (data.safety) {
        // Defense-in-depth (BRIEF-096 §3): the server caught something the client pre-check
        // missed. Un-write the optimistic thread entry — nothing risky stays in stored history —
        // and show the same S1 card the client-side path would have shown.
        setThreads(threads);
        saveThreads(threads);
        setPendingText(text);
        setSafetyTrigger(data.safety);
        setSafetyCardState(enterSafetyState(data.safety));
        setLoading(false);
        return;
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

  // ── Safety flow handlers (BRIEF-096) ────────────────────────────────────────────

  function handleSafetyChoice(choiceIndex: SafetyChoiceIndex) {
    // Only S1_SELF/S1_OTHER/S1_NARROW have this 4-choice flow — S2/S3 use handleImminenceAnswer/onClose.
    if (safetyCardState !== 'S1_SELF' && safetyCardState !== 'S1_OTHER' && safetyCardState !== 'S1_NARROW') return;
    const next = routeSafetyAnswer(safetyCardState, choiceIndex);

    if (next === 'S1_NO') {
      setSafetyReentryText(korean ? SAFETY_COPY_KO.reentry : SAFETY_COPY_EN.reentry);
      setInput(pendingText);
      setAckNextSend(true); // the user's manual resend of this exact text skips re-checking, once
      setSafetyCardState(null);
      setSafetyTrigger(null);
      setPendingText('');
      return;
    }

    if (next === 'S1_SELF' || next === 'S1_OTHER') {
      // S1_NARROW resolved into a specific concern — show that confirmation card next.
      setSafetyTrigger(next === 'S1_SELF' ? 'self' : 'other');
      setSafetyCardState(next);
      return;
    }

    // S2 or S3 (the routing table never actually produces S0/S1_NARROW here, but TS doesn't know that).
    if (next === 'S2' || next === 'S3') setSafetyCardState(next);
  }

  /** S2's own 1-question imminence check — not part of the S1 4-choice state machine. */
  function handleImminenceAnswer(answer: 'yes' | 'no' | 'unsure') {
    if (answer === 'yes') setSafetyCardState('S3');
    // 'no' / 'unsure' -> stay on S2, contacts stay visible (SAFETY-SPEC 5-5: 생각만=S2, 답하기 어려움=S2).
  }

  function closeSafetyFlow() {
    setSafetyCardState(null);
    setSafetyTrigger(null);
    setPendingText('');
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

      {/* ── Fixed top: TabTopBar + title/quota + chip row, one sticky unit ──────
          Unified with the other tabs' ATTUNE-bar → title header rhythm (BRIEF-094E):
          "Ask" now lives in this same fixed block instead of a separate TabHeader
          that scrolled away — same t-h2 typography, just sharing its row with quota. */}
      {/* Keyboard-open panning fix (BRIEF-094C-FIX): iOS shifts the visual viewport down without
          scrolling the layout viewport, so a plain `sticky top:0` gets panned off-screen. */}
      <KeyboardPannedTop active={keyboardOpen && topOffset > 0} topOffset={topOffset}>
        <TabTopBar right={<AccountAvatar />}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <h1 className="t-h2" style={{ margin: 0 }}>Ask</h1>
              <p style={{
                margin: 0,
                fontFamily: "var(--font-space-mono,'Courier New')", fontSize: 11, letterSpacing: '0.08em', color: 'var(--c-ink-body)',
              }}>
                {left} QUESTIONS LEFT TODAY
              </p>
            </div>
            <div style={{ position: 'relative' }}>
              <div
                ref={chipRowRef}
                onScroll={updateChipFade}
                style={{
                  display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 12,
                  scrollbarWidth: 'none', alignItems: 'center',
                }}
              >
                <style>{`::-webkit-scrollbar{display:none}`}</style>
                {/* Me + Person chips — newspaper-section tabs once a conversation exists (BRIEF-094G v2) */}
                {chips.filter(c => c.id !== 'general').map(chip => {
                  const isActive = selected === chip.id;
                  return (
                    <div
                      key={chip.id}
                      ref={isActive ? selectedChipRef : undefined}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0 }}
                    >
                      {/* Always the slim tab size (BRIEF-094I §1) — the large pill was only
                          for first-visit (0 threads), but that made every tester's actual first
                          impression an inconsistent, "뚱뚱" one relative to 094G v2's slim tabs. */}
                      <ChipButton chip={chip} active={isActive} onClick={() => setSelected(chip.id)} size="tab" />
                      {!hasAnyThread && chip.id === 'me' && (
                        <span style={{ fontFamily: "var(--font-space-mono,'Courier New')", fontSize: 8.5, letterSpacing: '0.1em', color: 'var(--c-ink-body)', textTransform: 'uppercase' }}>YOU · TIMING · ANYTHING</span>
                      )}
                    </div>
                  );
                })}
                {/* + Someone — while a conversation exists, always at the row's end regardless of
                    how many people are already saved (BRIEF-094G v2 — v1 hid it once 1+ existed,
                    which lost the add-another-person path). First-visit gating is unchanged. */}
                {(hasAnyThread || !hasPersonChips) && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                    {/* Always the slim text-link style (BRIEF-094I §1) — the dashed pill was
                        only for first-visit, dropped for the same "뚱뚱" reason as the chips. */}
                    <Link href="/new" style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '9px 2px', minHeight: 44,
                      color: 'var(--c-ink-body)', textDecoration: 'none',
                      fontFamily: "var(--font-inter,system-ui)", fontSize: 13, whiteSpace: 'nowrap',
                    }}>
                      + Someone
                    </Link>
                    {!hasAnyThread && (
                      <span style={{ fontFamily: "var(--font-space-mono,'Courier New')", fontSize: 8.5, letterSpacing: '0.1em', color: 'var(--c-ink-body)', textTransform: 'uppercase' }}>ADD A PERSON</span>
                    )}
                  </div>
                )}
              </div>
              {/* Edge fades — only while the row actually overflows, and only on the edge(s)
                  with more content scrolled out of view (BRIEF-094G v2 §2: overlay, not mask —
                  a mask would cut into the chip text itself instead of just fading behind it). */}
              {chipFade.left && (
                <div aria-hidden="true" style={{
                  position: 'absolute', top: 0, left: 0, bottom: 0, width: 20,
                  background: 'linear-gradient(to left, transparent, rgba(250,248,244,0.92))',
                  pointerEvents: 'none',
                }} />
              )}
              {chipFade.right && (
                <div aria-hidden="true" style={{
                  position: 'absolute', top: 0, right: 0, bottom: 0, width: 20,
                  background: 'linear-gradient(to right, transparent, rgba(250,248,244,0.92))',
                  pointerEvents: 'none',
                }} />
              )}
            </div>
          </div>
        </TabTopBar>
      </KeyboardPannedTop>

      {/* ── Scrollable middle: conversation only (BRIEF-094C) ────────────────── */}
      <div style={{ flex: 1, padding: '20px 20px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {currentThread.length === 0 && !loading && (
          hasAnyThread
            ? <EmptyHint chipId={selected} chipLabel={currentChip?.label} />
            : <FirstVisitContent onSelect={(q) => setInput(q)} hasPersonChips={hasPersonChips} />
        )}

        {showDateDivider && currentThread[0]?.createdAt && (
          <DateDivider isoStr={currentThread[0].createdAt} />
        )}

        {currentThread.map(msg => (
          <MessageBubble key={msg.id} msg={msg} chipColor={chipColor} />
        ))}

        {loading && <LoadingBubble />}

        {/* S1_NO re-entry line — shown as an assistant bubble but NEVER added to `threads`
            (BRIEF-096 §2 "낙인 최소화" — safety interactions are never persisted). */}
        {safetyReentryText && (
          <MessageBubble
            msg={{ id: 'safety-reentry', role: 'assistant', mode: 'me', text: safetyReentryText }}
            chipColor={chipColor}
          />
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Bottom input area ─────────────────────────────────────────────────── */}
      {/* Keyboard-open positioning fix (BRIEF-094C-FIX): `bottom: bottomInset` (not 0) puts the
          composer right above the keyboard instead of behind it. bottomInset is 0 when the
          keyboard-open signal came from focus alone (e.g. desktop) — behaves like before. */}
      <div style={{
        position: keyboardOpen ? 'fixed' : 'sticky', bottom: keyboardOpen ? bottomInset : 0,
        ...(keyboardOpen ? { left: 0, right: 0, margin: '0 auto', width: '100%', maxWidth: 480 } : {}),
        background: 'var(--c-paper)', borderTop: '1px solid var(--c-hairline)',
        paddingTop: 12, paddingRight: 20, paddingLeft: 20,
        // No extra safe-area padding while the keyboard is open — there's no home indicator
        // to clear above the keyboard, so it would just double up the bottom gap.
        // Safety cards (S1/S2/S3) sit behind the fixed bottom TabBar unless this sticky
        // composer reserves that height itself (BRIEF-094H §1 — the last choice was hidden).
        paddingBottom: safetyCardState && !keyboardOpen ? SAFETY_PANEL_BOTTOM_PAD : 10,
      }}>
        {safetyCardState ? (
          <SafetyPanel
            state={safetyCardState}
            trigger={safetyTrigger}
            korean={korean}
            country={safetyCountry}
            onCountryToggle={() => setSafetyCountry(c => (c === 'KR' ? 'US' : 'KR'))}
            onChoice={handleSafetyChoice}
            onImminenceAnswer={handleImminenceAnswer}
            onClose={closeSafetyFlow}
          />
        ) : left <= 0 ? (
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
                    color: 'var(--c-ink-body)', background: 'var(--c-card)',
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
                ref={textareaRef}
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
            <p style={{
              margin: '8px 0 0', fontFamily: "var(--font-inter,system-ui)", fontSize: 12,
              color: 'var(--c-muted)', lineHeight: 1.5,
            }}>
              To generate an AI answer, Attune sends your question and relevant context — such as birth details, prior messages, the briefing, and saved relationship notes — through its server to Google Gemini.
            </p>
          </>
        )}

        {/* Disclaimer — hidden during the safety flow (S1-S3 screens stay minimal, BRIEF-096) */}
        {!safetyCardState && (
          <p style={{ margin: '8px 0 0', textAlign: 'center', fontFamily: "var(--font-inter,system-ui)", fontSize: 11, color: 'var(--c-ink-body)' }}>
            Attune is for understanding and self-reflection, not a verdict on anyone.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

/**
 * When the on-screen keyboard pans the visual viewport down without scrolling the layout
 * viewport (iOS), a `position: sticky` child gets pushed above the visible area. While `active`,
 * this switches its child to `position: fixed` and pulls it back down by `topOffset` — and
 * reserves the same height in the flow so the rest of the page doesn't jump up (BRIEF-094C-FIX).
 */
function KeyboardPannedTop({ active, topOffset, children }: { active: boolean; topOffset: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    // Inactive: `ref` is the `display: contents` wrapper, which has no box of its own
    // (offsetHeight 0) — measure its real child (TabTopBar's own div) instead.
    // Active: `ref` is the fixed wrapper itself, which is a real box.
    const measured = active ? ref.current : ref.current?.firstElementChild;
    if (measured instanceof HTMLElement) setHeight(measured.offsetHeight);
  });

  if (!active) {
    // `display: contents` renders no box — TabTopBar's own `position: sticky` div sticks to
    // its real parent (the page's flex container) instead of this wrapper (BRIEF-094C-FIX2:
    // a plain wrapping <div> here gave sticky a zero-height box to stick within, breaking it).
    return <div ref={ref} style={{ display: 'contents' }}>{children}</div>;
  }

  return (
    <>
      <div style={{ height }} />
      <div ref={ref} style={{ position: 'fixed', top: 0, left: 0, right: 0, transform: `translateY(${topOffset}px)` }}>
        {children}
      </div>
    </>
  );
}

/**
 * S1 confirmation card / S2 stop-notice+imminence / S3 emergency screen (BRIEF-096).
 * Replaces the normal composer entirely while a safety flow is in progress — the textarea
 * doesn't render at all, satisfying "카드 표시 중 입력창 비활성". Sans-serif only, no glyphs —
 * S3 in particular must stay minimal (SAFETY-SPEC §2/§8).
 */
function SafetyPanel({
  state, trigger, korean, country, onCountryToggle, onChoice, onImminenceAnswer, onClose,
}: {
  state: SafetyAwaitingAnswerState | 'S2' | 'S3';
  trigger: SafetyTriggerCategory | null;
  korean: boolean;
  country: SafetyCountry;
  onCountryToggle: () => void;
  onChoice: (choiceIndex: SafetyChoiceIndex) => void;
  onImminenceAnswer: (answer: 'yes' | 'no' | 'unsure') => void;
  onClose: () => void;
}) {
  const copy = korean ? SAFETY_COPY_KO : SAFETY_COPY_EN;
  const countryToggleLabel = korean ? SAFETY_COUNTRY_TOGGLE_KO : SAFETY_COUNTRY_TOGGLE_EN;
  const backLabel = korean ? '뒤로' : 'Back';

  if (state === 'S1_SELF' || state === 'S1_OTHER' || state === 'S1_NARROW') {
    const card = state === 'S1_SELF' ? copy.confirmSelf : state === 'S1_OTHER' ? copy.confirmOther : copy.narrowDown;
    return (
      <div style={{ padding: '4px 0 8px' }}>
        <p style={{ margin: '0 0 8px', fontFamily: "var(--font-inter,system-ui)", fontSize: 14, color: 'var(--c-ink-body)' }}>
          {korean ? SAFETY_ACK_KO : SAFETY_ACK_EN}
        </p>
        <p style={{ margin: '0 0 14px', fontFamily: "var(--font-inter,system-ui)", fontSize: 15, fontWeight: 500, color: 'var(--c-ink)', lineHeight: 1.5 }}>
          {card.question}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {card.choices.map((choice, i) => (
            <button
              key={choice}
              type="button"
              onClick={() => onChoice(i as SafetyChoiceIndex)}
              className="pressable"
              style={{
                textAlign: 'left', padding: '12px 14px', borderRadius: 12,
                border: '1px solid var(--c-hairline)', background: 'var(--c-card)',
                fontFamily: "var(--font-inter,system-ui)", fontSize: 14, color: 'var(--c-ink)',
                cursor: 'pointer',
              }}
            >
              {choice}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const situation: SafetySituation = trigger === 'self' ? 'suicide' : 'violence';

  if (state === 'S2') {
    const imminenceQuestion = trigger === 'self' ? copy.imminenceSelf : copy.imminenceOther;
    const buttons = korean ? IMMINENCE_CHOICES_KO : IMMINENCE_CHOICES_EN;
    const contacts = getSafetyContacts(country, situation);
    return (
      <div style={{ padding: '4px 0 8px' }}>
        <p style={{ margin: '0 0 10px', fontFamily: "var(--font-inter,system-ui)", fontSize: 14, color: 'var(--c-ink-body)', lineHeight: 1.5 }}>
          {copy.stopNotice}
        </p>
        <p style={{ margin: '0 0 12px', fontFamily: "var(--font-inter,system-ui)", fontSize: 15, fontWeight: 500, color: 'var(--c-ink)', lineHeight: 1.5 }}>
          {imminenceQuestion}
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => onImminenceAnswer('yes')} className="pressable" style={imminenceButtonStyle(true)}>{buttons[0]}</button>
          <button type="button" onClick={() => onImminenceAnswer('no')} className="pressable" style={imminenceButtonStyle(false)}>{buttons[1]}</button>
          <button type="button" onClick={() => onImminenceAnswer('unsure')} className="pressable" style={imminenceButtonStyle(false)}>{buttons[2]}</button>
        </div>
        <SafetyContactList contacts={contacts} korean={korean} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
          <button type="button" onClick={onClose} className="pressable" style={textLinkStyle}>{backLabel}</button>
          <button type="button" onClick={onCountryToggle} className="pressable" style={textLinkStyle}>{countryToggleLabel}</button>
        </div>
      </div>
    );
  }

  // S3 — minimal, emergency-first.
  const immediate = getSafetyContacts(country, 'immediate');
  const secondary = getSafetyContacts(country, situation);
  return (
    <div style={{ padding: '4px 0 8px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        {immediate.filter(c => c.channel === 'call').map(c => (
          <a
            key={c.value}
            href={`tel:${c.value}`}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '16px', borderRadius: 12, background: '#C4502E', color: '#fff',
              textDecoration: 'none', fontFamily: "var(--font-inter,system-ui)", fontSize: 17, fontWeight: 700,
            }}
          >
            {korean ? `${c.value} 전화하기` : `Call ${c.value}`}
          </a>
        ))}
      </div>
      <SafetyContactList contacts={secondary} korean={korean} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
        <button type="button" onClick={onClose} className="pressable" style={textLinkStyle}>{backLabel}</button>
        <button type="button" onClick={onCountryToggle} className="pressable" style={textLinkStyle}>{countryToggleLabel}</button>
      </div>
    </div>
  );
}

function imminenceButtonStyle(primary: boolean): CSSProperties {
  return {
    padding: '9px 14px', borderRadius: 10,
    border: primary ? 'none' : '1px solid var(--c-hairline)',
    background: primary ? '#C4502E' : 'var(--c-card)',
    color: primary ? '#fff' : 'var(--c-ink)',
    fontFamily: "var(--font-inter,system-ui)", fontSize: 13, fontWeight: primary ? 600 : 400,
    cursor: 'pointer',
  };
}

const textLinkStyle: CSSProperties = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
  fontFamily: "var(--font-inter,system-ui)", fontSize: 12, color: 'var(--c-muted)', textDecoration: 'underline',
};

function SafetyContactList({ contacts, korean }: { contacts: SafetyContact[]; korean: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {contacts.map(c => (
        <SafetyContactRow key={`${c.channel}-${c.value}`} contact={c} korean={korean} />
      ))}
    </div>
  );
}

function SafetyContactRow({ contact, korean }: { contact: SafetyContact; korean: boolean }) {
  const label = korean ? contact.labelKo : contact.labelEn;
  const rowStyle: CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    padding: '10px 12px', borderRadius: 10, border: '1px solid var(--c-hairline)',
    background: 'var(--c-card)', textDecoration: 'none',
  };
  const valueStyle: CSSProperties = { fontFamily: "var(--font-space-mono,'Courier New')", fontSize: 14, color: 'var(--c-ink)' };
  const labelStyle: CSSProperties = { fontFamily: "var(--font-inter,system-ui)", fontSize: 12, color: 'var(--c-muted)' };

  if (contact.channel === 'call') {
    return (
      <a href={`tel:${contact.value}`} style={rowStyle}>
        <span style={valueStyle}>{contact.value}</span>
        <span style={labelStyle}>{label}</span>
      </a>
    );
  }

  if (contact.channel === 'text') {
    const href = contact.textCode ? `sms:${contact.value}?&body=${encodeURIComponent(contact.textCode)}` : `sms:${contact.value}`;
    const displayValue = contact.textCode ? `${contact.textCode} → ${contact.value}` : contact.value;
    return (
      <a href={href} style={rowStyle}>
        <span style={valueStyle}>{displayValue}</span>
        <span style={labelStyle}>{label}</span>
      </a>
    );
  }

  // web
  const href = contact.sourceUrl || `https://${contact.value}`;
  return (
    <a href={href} target="_blank" rel="noreferrer" style={rowStyle}>
      <span style={valueStyle}>{contact.value}</span>
      <span style={labelStyle}>{label}</span>
    </a>
  );
}

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

function ChipButton({ chip, active, onClick, size = 'default' }: { chip: Chip; active: boolean; onClick: () => void; size?: 'default' | 'tab' }) {
  const elC = chip.element ? ELEMENT_COLORS[chip.element.toLowerCase()] : null;

  // Tab style once a conversation exists (BRIEF-094G v2) — newspaper-section tabs, not pills:
  // no box (background/border/radius). Color roles are split: the dot carries identity (element
  // color, always), the underline carries selection state (vermilion, never element color) —
  // an outside review flagged v1 for reusing the element color for both roles.
  if (size === 'tab') {
    const dotColor = elC?.fg ?? 'var(--c-ink-body)';
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className="pressable"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          // Visible content is short (~28-32px); the button's own hit area is padded out to the
          // 44px touch-target minimum instead of relying on the row's height (v1 did the latter —
          // an outside review flagged that as fragile once row layout changes).
          padding: '9px 2px', minHeight: 44,
          background: 'transparent', border: 'none', cursor: 'pointer',
        }}
      >
        <span style={{
          display: 'flex', alignItems: 'center', gap: 6,
          paddingBottom: 3,
          borderBottom: active ? '2px solid var(--c-vermilion)' : '2px solid transparent',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: dotColor, opacity: active ? 1 : 0.55,
          }} />
          <span style={{
            fontFamily: "var(--font-inter,system-ui)", fontSize: 13,
            // muted fails 4.5:1 contrast — ink-body is the non-active color here (BRIEF-094G §1).
            color: active ? 'var(--c-ink)' : 'var(--c-ink-body)',
            fontWeight: active ? 600 : 400,
          }}>
            {chip.label}
          </span>
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="pressable"
      style={{
        display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
        padding: '12px 18px 12px 10px',
        borderRadius: 20,
        minHeight: 48,
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

function FirstVisitContent({ onSelect, hasPersonChips }: { onSelect: (q: string) => void; hasPersonChips: boolean }) {
  const EXAMPLES = hasPersonChips
    ? [
      { q: 'How do I ask them out?',       color: '#C4502E', right: true,  rot: '-1deg' },
      { q: 'Why the slow replies?',         color: '#4A76AC', right: false, rot: '1deg' },
      { q: 'How do I raise a hard topic?', color: '#4E8A52', right: true,  rot: '-0.8deg' },
    ]
    : [
      { q: "What's today like for me?",            color: '#C4502E', right: true,  rot: '-1deg' },
      { q: 'Is this a good stretch to start something?', color: '#4A76AC', right: false, rot: '1deg' },
      { q: 'What should I watch for this week?',   color: '#4E8A52', right: true,  rot: '-0.8deg' },
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
            whiteSpace: 'pre-line',
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
