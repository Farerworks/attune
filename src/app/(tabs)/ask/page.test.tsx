// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';

// jsdom doesn't implement scrollIntoView — the page calls it on new messages.
Element.prototype.scrollIntoView = vi.fn();

const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  mockReplace.mockReset();
  window.history.pushState({}, '', '/ask');
  Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true });
  Object.defineProperty(navigator, 'language', { value: 'en-US', configurable: true });
});

describe('AskPage', () => {
  it('renders exactly one Settings link, in the top bar (avatar), not in TabHeader (BRIEF-080)', async () => {
    localStorage.setItem('attune.profile', JSON.stringify({
      date: '1990-06-15', time: '14:30', gender: 'other', createdAt: new Date().toISOString(),
    }));

    const { default: AskPage } = await import('./page');
    const { container } = render(<AskPage />);

    await waitFor(() => {
      expect(screen.getAllByLabelText('Settings')).toHaveLength(1);
    });
    const link = screen.getByLabelText('Settings');
    expect(link.getAttribute('href')).toBe('/settings');
    // No standalone <header> (TabHeader) exists on this page since BRIEF-094E folded the
    // "Ask" title into the fixed top bar itself — so there's nothing for Settings to be inside.
    expect(container.querySelector('header')?.contains(link) ?? false).toBe(false);
  });

  it('includes an "at" date field (from createdAt) in each serialized history entry (BRIEF-078)', async () => {
    localStorage.setItem('attune.profile', JSON.stringify({
      date: '1990-06-15', time: '14:30', gender: 'other', createdAt: new Date().toISOString(),
    }));
    localStorage.setItem('attune.ask.threads', JSON.stringify({
      me: [
        { id: 'u1', role: 'user', text: 'hi', createdAt: '2026-07-19T10:00:00.000Z' },
        { id: 'a1', role: 'assistant', mode: 'me', text: 'hello', createdAt: '2026-07-19T10:00:05.000Z' },
      ],
    }));

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ answer: { text: 'mocked reply' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { default: AskPage } = await import('./page');
    render(<AskPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Ask anything…')).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText('Ask anything…'), { target: { value: 'a follow-up question' } });
    fireEvent.click(screen.getByLabelText('Send'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/ask', expect.anything()));

    const askCall = fetchMock.mock.calls.find(([url]) => url === '/api/ask') as [string, RequestInit];
    const body = JSON.parse(askCall[1].body as string);

    expect(body.history).toEqual([
      { role: 'user', text: 'hi', at: '2026-07-19' },
      { role: 'assistant', text: 'hello', at: '2026-07-19' },
    ]);
  });

  it('composer textarea has fontSize 16 — prevents iOS Safari auto-zoom on focus (BRIEF-091)', async () => {
    localStorage.setItem('attune.profile', JSON.stringify({
      date: '1990-06-15', time: '14:30', gender: 'other', createdAt: new Date().toISOString(),
    }));

    const { default: AskPage } = await import('./page');
    render(<AskPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Ask anything…')).toBeTruthy();
    });

    const textarea = screen.getByPlaceholderText('Ask anything…') as HTMLTextAreaElement;
    expect(textarea.style.fontSize).toBe('16px');
  });

  it('first-visit examples: 0 saved people -> self/general examples, no person-oriented ones (BRIEF-089)', async () => {
    localStorage.setItem('attune.profile', JSON.stringify({
      date: '1990-06-15', time: '14:30', gender: 'other', createdAt: new Date().toISOString(),
    }));

    const { default: AskPage } = await import('./page');
    render(<AskPage />);

    await waitFor(() => {
      expect(screen.getByText("What's today like for me?")).toBeTruthy();
    });
    expect(screen.getByText('Is this a good stretch to start something?')).toBeTruthy();
    expect(screen.getByText('What should I watch for this week?')).toBeTruthy();
    expect(screen.queryByText('How do I ask them out?')).toBeNull();
    expect(screen.queryByText('Why the slow replies?')).toBeNull();
    expect(screen.queryByText('How do I raise a hard topic?')).toBeNull();
  });

  it('first-visit examples: 1+ saved people -> the original person-oriented examples (BRIEF-089)', async () => {
    localStorage.setItem('attune.profile', JSON.stringify({
      date: '1990-06-15', time: '14:30', gender: 'other', createdAt: new Date().toISOString(),
    }));
    localStorage.setItem('attune.readings', JSON.stringify([
      { id: 'r1', name: 'Sam', date: '1988-03-02', time: '09:00', createdAt: new Date().toISOString() },
    ]));

    const { default: AskPage } = await import('./page');
    render(<AskPage />);

    await waitFor(() => {
      expect(screen.getByText('How do I ask them out?')).toBeTruthy();
    });
    expect(screen.getByText('Why the slow replies?')).toBeTruthy();
    expect(screen.getByText('How do I raise a hard topic?')).toBeTruthy();
    expect(screen.queryByText("What's today like for me?")).toBeNull();
  });

  it('?prefill=... fills the composer with the phrase and does not auto-send (BRIEF-094B)', async () => {
    localStorage.setItem('attune.profile', JSON.stringify({
      date: '1990-06-15', time: '14:30', gender: 'other', createdAt: new Date().toISOString(),
    }));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ answer: { text: 'x' } }) });
    vi.stubGlobal('fetch', fetchMock);

    window.history.pushState({}, '', `/ask?prefill=${encodeURIComponent('Is today good for a big ask?')}`);

    const { default: AskPage } = await import('./page');
    render(<AskPage />);

    await waitFor(() => {
      const textarea = screen.getByPlaceholderText('Ask anything…') as HTMLTextAreaElement;
      expect(textarea.value).toBe('Is today good for a big ask?');
    });

    expect(fetchMock.mock.calls.some(([url]) => url === '/api/ask')).toBe(false);
  });

  it('?prefill=... strips the param from the URL after consuming it (BRIEF-094B)', async () => {
    localStorage.setItem('attune.profile', JSON.stringify({
      date: '1990-06-15', time: '14:30', gender: 'other', createdAt: new Date().toISOString(),
    }));
    window.history.pushState({}, '', `/ask?prefill=${encodeURIComponent('Is today good for a big ask?')}`);

    const { default: AskPage } = await import('./page');
    render(<AskPage />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/ask'));
  });

  it('the person-selection/quota region sits inside a sticky-positioned ancestor (BRIEF-094C)', async () => {
    localStorage.setItem('attune.profile', JSON.stringify({
      date: '1990-06-15', time: '14:30', gender: 'other', createdAt: new Date().toISOString(),
    }));

    const { default: AskPage } = await import('./page');
    render(<AskPage />);

    const quotaEl = await waitFor(() => screen.getByText(/QUESTIONS LEFT TODAY/));
    let el: HTMLElement | null = quotaEl;
    let stickyAncestor: HTMLElement | null = null;
    while (el) {
      if (getComputedStyle(el).position === 'sticky') { stickyAncestor = el; break; }
      el = el.parentElement;
    }
    expect(stickyAncestor).not.toBeNull();
  });

  it('keyboard closed: the sticky top bar sits directly in the page flex flow (no boxed wrapper to break sticky) (BRIEF-094C-FIX2)', async () => {
    localStorage.setItem('attune.profile', JSON.stringify({
      date: '1990-06-15', time: '14:30', gender: 'other', createdAt: new Date().toISOString(),
    }));

    const { default: AskPage } = await import('./page');
    render(<AskPage />);

    const quotaEl = await waitFor(() => screen.getByText(/QUESTIONS LEFT TODAY/));
    let stickyEl: HTMLElement | null = quotaEl;
    while (stickyEl && getComputedStyle(stickyEl).position !== 'sticky') {
      stickyEl = stickyEl.parentElement;
    }
    expect(stickyEl).not.toBeNull();

    // A boxed intermediate wrapper (any height, even 0-margin) gives `sticky` nothing to
    // stick within — its parent must either be the page's own flex container (`.ask-full`)
    // or a `display: contents` pass-through with no box of its own.
    const parent = stickyEl!.parentElement;
    expect(parent).not.toBeNull();
    const isRootFlexContainer = parent!.classList.contains('ask-full');
    const isPassThrough = getComputedStyle(parent!).display === 'contents';
    expect(isRootFlexContainer || isPassThrough).toBe(true);
  });

  it('the composer sits inside a sticky (closed) or fixed (keyboard open) positioned ancestor (BRIEF-094C)', async () => {
    localStorage.setItem('attune.profile', JSON.stringify({
      date: '1990-06-15', time: '14:30', gender: 'other', createdAt: new Date().toISOString(),
    }));

    const { default: AskPage } = await import('./page');
    render(<AskPage />);

    const textarea = await waitFor(() => screen.getByPlaceholderText('Ask anything…'));
    let el: HTMLElement | null = textarea;
    let fixedOrSticky: HTMLElement | null = null;
    while (el) {
      const pos = getComputedStyle(el).position;
      if (pos === 'sticky' || pos === 'fixed') { fixedOrSticky = el; break; }
      el = el.parentElement;
    }
    expect(fixedOrSticky).not.toBeNull();
  });

  it('keyboard open: composer bottom follows bottomInset instead of sitting behind the keyboard (BRIEF-094C-FIX)', async () => {
    localStorage.setItem('attune.profile', JSON.stringify({
      date: '1990-06-15', time: '14:30', gender: 'other', createdAt: new Date().toISOString(),
    }));

    class FakeVisualViewport extends EventTarget {
      height: number;
      offsetTop: number;
      constructor(height: number, offsetTop: number) {
        super();
        this.height = height;
        this.offsetTop = offsetTop;
      }
      shrink(height: number, offsetTop: number) {
        this.height = height;
        this.offsetTop = offsetTop;
        this.dispatchEvent(new Event('resize'));
      }
    }
    const fakeViewport = new FakeVisualViewport(800, 0);
    Object.defineProperty(window, 'visualViewport', { value: fakeViewport, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });

    const { default: AskPage } = await import('./page');
    render(<AskPage />);

    const textarea = await waitFor(() => screen.getByPlaceholderText('Ask anything…'));

    // Simulate the on-screen keyboard opening: iOS shrinks + pans the visual viewport.
    act(() => { fakeViewport.shrink(460, 40); });

    let el: HTMLElement | null = textarea;
    let fixedAncestor: HTMLElement | null = null;
    while (el) {
      if (getComputedStyle(el).position === 'fixed') { fixedAncestor = el; break; }
      el = el.parentElement;
    }
    expect(fixedAncestor).not.toBeNull();
    // bottomInset = innerHeight(800) - vv.height(460) - vv.offsetTop(40) = 300
    expect(fixedAncestor!.style.bottom).toBe('300px');
  });

  it('with a long thread, the quota/chip row and composer are not inside the scrolling message container (BRIEF-094C)', async () => {
    localStorage.setItem('attune.profile', JSON.stringify({
      date: '1990-06-15', time: '14:30', gender: 'other', createdAt: new Date().toISOString(),
    }));
    const messages = Array.from({ length: 20 }, (_, i) => ({
      id: `u${i}`, role: 'user', text: `Message number ${i}`, createdAt: new Date().toISOString(),
    }));
    localStorage.setItem('attune.ask.threads', JSON.stringify({ me: messages }));

    const { default: AskPage } = await import('./page');
    const { container } = render(<AskPage />);

    await waitFor(() => expect(screen.getByText('Message number 0')).toBeTruthy());

    const messageEl = screen.getByText('Message number 0');
    const scrollContainer = Array.from(container.querySelectorAll<HTMLElement>('div'))
      .find(d => d.contains(messageEl) && d.getAttribute('style')?.includes('flex: 1'));
    expect(scrollContainer).toBeTruthy();

    const quotaEl = screen.getByText(/QUESTIONS LEFT TODAY/);
    const textarea = screen.getByPlaceholderText('Ask anything…');
    expect(scrollContainer!.contains(quotaEl)).toBe(false);
    expect(scrollContainer!.contains(textarea)).toBe(false);
  });

  it('"Ask" renders exactly once, inside the fixed/sticky top block (BRIEF-094E)', async () => {
    localStorage.setItem('attune.profile', JSON.stringify({
      date: '1990-06-15', time: '14:30', gender: 'other', createdAt: new Date().toISOString(),
    }));

    const { default: AskPage } = await import('./page');
    render(<AskPage />);

    const titles = await waitFor(() => screen.getAllByText('Ask'));
    expect(titles).toHaveLength(1);

    let el: HTMLElement | null = titles[0];
    let fixedOrSticky: HTMLElement | null = null;
    while (el) {
      const pos = getComputedStyle(el).position;
      if (pos === 'sticky' || pos === 'fixed') { fixedOrSticky = el; break; }
      el = el.parentElement;
    }
    expect(fixedOrSticky).not.toBeNull();
  });

  it('the quota text sits in the same row container as the "Ask" title (BRIEF-094E)', async () => {
    localStorage.setItem('attune.profile', JSON.stringify({
      date: '1990-06-15', time: '14:30', gender: 'other', createdAt: new Date().toISOString(),
    }));

    const { default: AskPage } = await import('./page');
    render(<AskPage />);

    const title = await waitFor(() => screen.getByText('Ask'));
    const quotaEl = screen.getByText(/QUESTIONS LEFT TODAY/);
    expect(title.parentElement).not.toBeNull();
    expect(title.parentElement!.contains(quotaEl)).toBe(true);
  });

  it('empty first visit keeps full-size chips (minHeight 48) — unchanged by BRIEF-094G', async () => {
    localStorage.setItem('attune.profile', JSON.stringify({
      date: '1990-06-15', time: '14:30', gender: 'other', createdAt: new Date().toISOString(),
    }));
    const { default: AskPageEmpty } = await import('./page');
    render(<AskPageEmpty />);

    await waitFor(() => expect(screen.getByText('YOU · TIMING · ANYTHING')).toBeTruthy());
    const meChipEmpty = screen.getByText('Me').closest('button') as HTMLElement;
    expect(meChipEmpty.style.minHeight).toBe('48px');
  });

  it('with a conversation, person chips render as tabs: no background/border, and the selected one is underlined (BRIEF-094G)', async () => {
    localStorage.setItem('attune.profile', JSON.stringify({
      date: '1990-06-15', time: '14:30', gender: 'other', createdAt: new Date().toISOString(),
    }));
    localStorage.setItem('attune.readings', JSON.stringify([
      { id: 'r1', name: 'Sam', date: '1988-03-02', time: '09:00', createdAt: new Date().toISOString(),
        themChart: { dayMaster: { element: 'fire', stem: 'Yang Fire', polarity: 'Yang' } } },
    ]));
    localStorage.setItem('attune.ask.threads', JSON.stringify({
      me: [{ id: 'u1', role: 'user', text: 'hi', createdAt: new Date().toISOString() }],
    }));
    const { default: AskPage } = await import('./page');
    render(<AskPage />);

    // Selected by default: "Me". (jsdom's cssstyle serializer drops explicit `border-*: none`
    // longhands from the style text entirely, so background/radius/underline are what's
    // reliably testable here — the "no box" look itself is confirmed in the render screenshots.)
    const meChip = await waitFor(() => screen.getByText('Me').closest('button') as HTMLElement);
    expect(meChip.style.background).toBe('transparent');
    expect(meChip.style.borderRadius).toBe('0');
    expect(meChip.style.borderBottom).toContain('2px solid');
    expect(meChip.style.borderBottom).not.toContain('transparent');

    // Unselected: Sam — no underline, and the name is ink-body, never muted (contrast requirement).
    const samChip = screen.getByText('Sam').closest('button') as HTMLElement;
    expect(samChip.style.borderBottom).toContain('transparent');
    const samLabel = screen.getByText('Sam');
    expect(samLabel.style.color).toBe('var(--c-ink-body)');
    expect(samLabel.style.color).not.toBe('var(--c-muted)');
  });

  it('changing the selected person scrolls that tab into view (BRIEF-094G)', async () => {
    localStorage.setItem('attune.profile', JSON.stringify({
      date: '1990-06-15', time: '14:30', gender: 'other', createdAt: new Date().toISOString(),
    }));
    localStorage.setItem('attune.readings', JSON.stringify([
      { id: 'r1', name: 'Sam', date: '1988-03-02', time: '09:00', createdAt: new Date().toISOString() },
    ]));
    localStorage.setItem('attune.ask.threads', JSON.stringify({
      me: [{ id: 'u1', role: 'user', text: 'hi', createdAt: new Date().toISOString() }],
    }));
    const { default: AskPage } = await import('./page');
    render(<AskPage />);

    const samChip = await waitFor(() => screen.getByText('Sam').closest('button') as HTMLElement);
    (Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mockClear();
    fireEvent.click(samChip);

    await waitFor(() => {
      const calls = (Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.some(([opts]) => opts?.inline === 'nearest')).toBe(true);
    });
  });
});

describe('AskPage — safety flow (BRIEF-096)', () => {
  function seedProfile() {
    localStorage.setItem('attune.profile', JSON.stringify({
      date: '1990-06-15', time: '14:30', gender: 'other', createdAt: new Date().toISOString(),
    }));
  }

  async function sendText(text: string) {
    const textarea = await waitFor(() => screen.getByPlaceholderText('Ask anything…')) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: text } });
    fireEvent.click(screen.getByLabelText('Send'));
  }

  it('a triggering message shows the S1 card instead of sending — no fetch, quota unchanged', async () => {
    Object.defineProperty(navigator, 'language', { value: 'ko-KR', configurable: true });
    seedProfile();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { default: AskPage } = await import('./page');
    render(<AskPage />);

    const quotaBefore = await waitFor(() => screen.getByText(/QUESTIONS LEFT TODAY/).textContent);

    await sendText('나 진짜 죽고 싶어');

    // S1 confirmation card: the fixed acknowledgment line + 4 choice buttons, textarea gone.
    await waitFor(() => expect(screen.getByText('많이 힘들거나 화가 난 상태로 들려요.')).toBeTruthy());
    expect(screen.getByText('아니요, 힘들다는 표현이었어요')).toBeTruthy();
    expect(screen.getByText('답하기 어려워요')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Ask anything…')).toBeNull();

    // fetch may still be called for unrelated things (e.g. NextAuth's own session check) —
    // what matters is that /api/ask specifically was never hit.
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/ask')).toBe(false);
    expect(screen.getByText(/QUESTIONS LEFT TODAY/).textContent).toBe(quotaBefore);
  });

  it('"It\'s hard to answer" routes to S2 with contacts — 988 (US default), 109 after switching to KR', async () => {
    // Default (non-Korean) locale -> default country is US per BRIEF-096 §2 ("국가 v1").
    seedProfile();
    vi.stubGlobal('fetch', vi.fn());

    const { default: AskPage } = await import('./page');
    render(<AskPage />);

    await sendText('I just want to die');
    await waitFor(() => screen.getByText("It's hard to answer"));
    fireEvent.click(screen.getByText("It's hard to answer"));

    // S2: stop notice + imminence question + contacts for the default country (en-US -> US).
    // '988' appears twice (call row + text row), so check at least one match rather than a unique one.
    await waitFor(() => expect(screen.getByText(/beyond what Attune can help with/)).toBeTruthy());
    expect(screen.getAllByText('988').length).toBeGreaterThan(0);

    // Switch country -> KR contacts appear.
    fireEvent.click(screen.getByText('Not in the US?'));
    await waitFor(() => expect(screen.getByText('109')).toBeTruthy());
  });

  it('S1_NO shows the re-entry line and restores the input — does not auto-send', async () => {
    Object.defineProperty(navigator, 'language', { value: 'ko-KR', configurable: true });
    seedProfile();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { default: AskPage } = await import('./page');
    render(<AskPage />);

    await sendText('나 진짜 죽고 싶어');
    await waitFor(() => screen.getByText('아니요, 힘들다는 표현이었어요'));
    fireEvent.click(screen.getByText('아니요, 힘들다는 표현이었어요'));

    // Re-entry line shown as a bubble; composer is back; original text is restored, not sent.
    await waitFor(() => expect(screen.getByText(/알려줘서 고마워요/)).toBeTruthy());
    const textarea = await waitFor(() => screen.getByPlaceholderText('Ask anything…')) as HTMLTextAreaElement;
    expect(textarea.value).toBe('나 진짜 죽고 싶어');
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/ask')).toBe(false);
  });

  it('S3 (Korean, "위험할 수 있어요") shows 112 and 119 as tel: links', async () => {
    Object.defineProperty(navigator, 'language', { value: 'ko-KR', configurable: true });
    seedProfile();
    vi.stubGlobal('fetch', vi.fn());

    const { default: AskPage } = await import('./page');
    render(<AskPage />);

    await sendText('나 진짜 죽고 싶어');
    await waitFor(() => screen.getByText('지금 위험할 수 있어요'));
    fireEvent.click(screen.getByText('지금 위험할 수 있어요'));

    const link112 = await waitFor(() => screen.getByText('112 전화하기'));
    const link119 = screen.getByText('119 전화하기');
    expect(link112.closest('a')?.getAttribute('href')).toBe('tel:112');
    expect(link119.closest('a')?.getAttribute('href')).toBe('tel:119');
  });

  it('none of the safety flow (card, S2, S3, choices) is ever written to the thread/localStorage', async () => {
    Object.defineProperty(navigator, 'language', { value: 'ko-KR', configurable: true });
    seedProfile();
    vi.stubGlobal('fetch', vi.fn());

    const { default: AskPage } = await import('./page');
    render(<AskPage />);

    await sendText('나 진짜 죽고 싶어');
    await waitFor(() => screen.getByText('지금 위험할 수 있어요'));
    fireEvent.click(screen.getByText('지금 위험할 수 있어요'));
    await waitFor(() => expect(screen.getAllByRole('link').length).toBeGreaterThan(0));

    const stored = localStorage.getItem('attune.ask.threads');
    expect(stored === null || !stored.includes('죽고 싶')).toBe(true);
  });
});
