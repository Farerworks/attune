// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Suspense, act } from 'react';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import * as storeModule from '@/lib/store';

const mockRouter = { replace: vi.fn(), push: vi.fn(), back: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

const mockGetSyncSession = vi.fn();
const mockPushBackup = vi.fn();
vi.mock('@/lib/sync', () => ({
  getSyncSession: () => mockGetSyncSession(),
  pushBackup: () => mockPushBackup(),
}));

// TabTopBar now renders AccountAvatar on this page (BRIEF-094I §2), which calls
// getSyncSession() itself on mount — give the mock a resolvable default so tests that don't
// care about sync state (most of them) don't crash on `.then()` of undefined.
beforeEach(() => {
  mockGetSyncSession.mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  mockRouter.replace.mockReset();
  mockRouter.push.mockReset();
  mockRouter.back.mockReset();
  mockGetSyncSession.mockReset();
  mockPushBackup.mockReset();
  vi.restoreAllMocks();
  Object.defineProperty(navigator, 'language', { value: 'en-US', configurable: true });
});

// A real ILJU_PROFILES key (甲子 = Yang Wood day, Rat), so getIljuProfile() resolves.
const DAY_PILLAR = { stem: 'Yang Wood', stemHanja: '甲', branch: 'Rat', branchHanja: '子' };

function makeReading(overrides: Record<string, unknown> & { id: string }) {
  return {
    name: 'Sam',
    date: '1988-03-02',
    time: '09:00',
    relationship: 'Friend',
    situation: 'test',
    createdAt: '2026-08-01T00:00:00.000Z',
    themChart: {
      dayMaster: { stem: 'Yang Wood', element: 'wood', polarity: 'Yang' },
      elements: { wood: 1, fire: 1, earth: 1, metal: 1, water: 1 },
      pillarsKnown: 8,
      pillars: {
        year: DAY_PILLAR, month: DAY_PILLAR, day: DAY_PILLAR, hour: null,
      },
    },
    ...overrides,
  };
}

async function renderHub(id: string) {
  const { default: PersonHubPage } = await import('./page');
  let utils!: ReturnType<typeof render>;
  await act(async () => {
    utils = render(<Suspense fallback={null}><PersonHubPage params={Promise.resolve({ id })} /></Suspense>);
    await new Promise(r => setTimeout(r, 50));
  });
  return utils;
}

describe('PersonHubPage (BRIEF-097)', () => {
  it('the name is not serif (Inter/Pretendard, not fraunces)', async () => {
    localStorage.setItem('attune.readings', JSON.stringify([makeReading({ id: 'r1' })]));
    await renderHub('r1');

    const name = await waitFor(() => screen.getByText('Sam'));
    expect(name.tagName).toBe('H1');
    expect(name.style.fontFamily).not.toContain('fraunces');
  });

  it('latest event is a reading -> exactly one serif element on screen (the headline)', async () => {
    localStorage.setItem('attune.readings', JSON.stringify([
      makeReading({ id: 'r1', briefing: { headline: 'A serif-worthy headline' } }),
    ]));
    const { container } = await renderHub('r1');
    await waitFor(() => expect(screen.getByText('A serif-worthy headline')).toBeTruthy());

    const serifEls = Array.from(container.querySelectorAll<HTMLElement>('*'))
      .filter(el => el.style.fontFamily?.includes('fraunces'));
    expect(serifEls).toHaveLength(1);
    expect(serifEls[0].textContent).toBe('A serif-worthy headline');
  });

  it('latest event is an Ask -> zero serif elements on screen', async () => {
    localStorage.setItem('attune.readings', JSON.stringify([
      makeReading({ id: 'r1', briefing: { headline: 'An older reading headline' } }),
    ]));
    localStorage.setItem('attune.ask.threads', JSON.stringify({
      r1: [{ id: 'q1', role: 'user', text: 'a fresh question', createdAt: '2026-08-05T00:00:00.000Z' }],
    }));
    const { container } = await renderHub('r1');
    await waitFor(() => expect(screen.getByText('a fresh question')).toBeTruthy());

    const serifEls = Array.from(container.querySelectorAll<HTMLElement>('*'))
      .filter(el => el.style.fontFamily?.includes('fraunces'));
    expect(serifEls).toHaveLength(0);
  });

  it('only the latest event\'s dot is vermilion — past events are hairline-outlined, not element-colored', async () => {
    localStorage.setItem('attune.readings', JSON.stringify([
      makeReading({ id: 'r-old', createdAt: '2026-07-01T00:00:00.000Z', briefing: { headline: 'old' } }),
      makeReading({ id: 'r-new', createdAt: '2026-08-01T00:00:00.000Z', briefing: { headline: 'new' } }),
    ]));
    const { container } = await renderHub('r-new');
    await waitFor(() => expect(screen.getByText('old')).toBeTruthy());

    const dots = Array.from(container.querySelectorAll<HTMLElement>('span[aria-hidden="true"]'))
      .filter(el => el.style.borderRadius === '50%');
    expect(dots).toHaveLength(2);
    expect(dots[0].style.background).toBe('var(--c-vermilion)');
    expect(dots[1].style.background).toBe('transparent');
    expect(dots[1].style.border).toContain('var(--c-hairline)');
  });

  it('meta line 2\'s chat count (B) reflects non-empty threads, not raw Ask message count', async () => {
    localStorage.setItem('attune.readings', JSON.stringify([
      makeReading({ id: 'r1', createdAt: '2026-07-01T00:00:00.000Z' }),
      makeReading({ id: 'r2', createdAt: '2026-08-01T00:00:00.000Z' }),
    ]));
    localStorage.setItem('attune.ask.threads', JSON.stringify({
      r1: [
        { id: 'a', role: 'user', text: 'one', createdAt: '2026-07-02T00:00:00.000Z' },
        { id: 'b', role: 'assistant', mode: 'person', text: 'reply', createdAt: '2026-07-02T00:01:00.000Z' },
        { id: 'c', role: 'user', text: 'two', createdAt: '2026-07-03T00:00:00.000Z' },
      ],
      // r2 has no thread at all.
    }));
    await renderHub('r2');

    // 2 readings, 1 non-empty thread -> "2 READINGS · 1 CHAT" (en-US default locale).
    await waitFor(() => expect(screen.getByText('2 READINGS · 1 CHAT')).toBeTruthy());
  });

  it('EN pluralization: exactly 1 reading and 0 chats -> "1 READING" (singular, chat count omitted)', async () => {
    localStorage.setItem('attune.readings', JSON.stringify([makeReading({ id: 'r1' })]));
    await renderHub('r1');

    await waitFor(() => expect(screen.getByText('1 READING')).toBeTruthy());
  });

  it('the CTA always points at the person\'s current anchor reading, even when reached via an older reading id', async () => {
    localStorage.setItem('attune.readings', JSON.stringify([
      makeReading({ id: 'r-old', createdAt: '2026-07-01T00:00:00.000Z' }),
      makeReading({ id: 'r-new', createdAt: '2026-08-01T00:00:00.000Z' }),
    ]));
    await renderHub('r-old'); // deep-linked via the OLD reading id

    const cta = await waitFor(() => screen.getByText('Ask about this relationship →'));
    expect(cta.closest('a')?.getAttribute('href')).toBe('/ask?person=r-new');
  });

  // Supersedes 094H §3's own test — that fix (safe-area padding directly on the identity row)
  // is now replaced by an actual ATTUNE wordmark bar (BRIEF-094I §2), same grammar as Home.
  it('§2 (BRIEF-094I): a fixed ATTUNE wordmark bar exists above the identity row (People→hub no longer drops it)', async () => {
    localStorage.setItem('attune.readings', JSON.stringify([makeReading({ id: 'r1' })]));
    await renderHub('r1');

    await waitFor(() => expect(screen.getByText('ATTUNE')).toBeTruthy());
  });

  it('§2 (BRIEF-094I): the ATTUNE bar (not the identity row) carries the safe-area-inset-top clearance', async () => {
    localStorage.setItem('attune.readings', JSON.stringify([makeReading({ id: 'r1' })]));
    await renderHub('r1');

    const wordmark = await waitFor(() => screen.getByText('ATTUNE'));
    let el: HTMLElement | null = wordmark;
    let bar: HTMLElement | null = null;
    while (el) {
      // jsdom's cssstyle garbles a bare `env(x, y)` inside calc() (documented quirk, harmless
      // in real browsers) — checking for the still-present substrings rather than exact string.
      const pt = el.style.paddingTop;
      if (pt && pt.includes('12px') && pt.includes('safe-area-inset-top')) { bar = el; break; }
      el = el.parentElement;
    }
    expect(bar).not.toBeNull();
  });

  it('§2 (BRIEF-094I): the identity row itself no longer carries a calc()/safe-area paddingTop (BRIEF-101 §4: restored to 16px)', async () => {
    localStorage.setItem('attune.readings', JSON.stringify([makeReading({ id: 'r1' })]));
    await renderHub('r1');

    const backButton = await waitFor(() => screen.getByLabelText('Back'));
    const identityRow = backButton.parentElement as HTMLElement;
    expect(identityRow.style.paddingTop).toBe('16px');
    expect(identityRow.style.paddingTop).not.toContain('calc');
    expect(identityRow.style.paddingTop).not.toContain('safe-area');
  });

  it('§4.5 (BRIEF-101, YS 결재): the ATTUNE bar shows a "People" heading, coexisting with the person\'s own name heading', async () => {
    localStorage.setItem('attune.readings', JSON.stringify([makeReading({ id: 'r1' })]));
    await renderHub('r1');

    await waitFor(() => expect(screen.getByRole('heading', { name: 'People' })).toBeTruthy());
    expect(screen.getByRole('heading', { name: 'Sam' })).toBeTruthy();
  });
});

describe('PersonHubPage — 활동 행 어포던스 통일 (BRIEF-110)', () => {
  it('1. 리딩 행: 행 전체가 /reading/<id> 링크다 (날짜·제목·보조 문구가 같은 링크 안에 있음)', async () => {
    localStorage.setItem('attune.readings', JSON.stringify([
      makeReading({ id: 'r1', briefing: { headline: 'A shared headline' } }),
    ]));
    await renderHub('r1');

    const title = await waitFor(() => screen.getByText('A shared headline'));
    const link = title.closest('a');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toBe('/reading/r1');
    expect(link!.textContent).toContain('Open reading');
  });

  it('2. 대화 행: 행 전체가 /ask?person=<id> 링크다 + 내부에 중첩 <a> 없음', async () => {
    localStorage.setItem('attune.readings', JSON.stringify([makeReading({ id: 'r1' })]));
    localStorage.setItem('attune.ask.threads', JSON.stringify({
      r1: [{ id: 'q1', role: 'user', text: 'a fresh question', createdAt: '2026-08-05T00:00:00.000Z' }],
    }));
    await renderHub('r1');

    const askText = await waitFor(() => screen.getByText('a fresh question'));
    const link = askText.closest('a');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toBe('/ask?person=r1');
    expect(link!.querySelectorAll('a')).toHaveLength(0);
  });

  it('3. aria-label(한국어): "리딩 보기"/"대화 이어가기"', async () => {
    Object.defineProperty(navigator, 'language', { value: 'ko-KR', configurable: true });
    localStorage.setItem('attune.readings', JSON.stringify([
      makeReading({ id: 'r1', briefing: { headline: 'A shared headline' } }),
    ]));
    localStorage.setItem('attune.ask.threads', JSON.stringify({
      r1: [{ id: 'q1', role: 'user', text: 'a fresh question', createdAt: '2026-08-05T00:00:00.000Z' }],
    }));
    await renderHub('r1');

    await waitFor(() => expect(screen.getByLabelText('리딩 보기')).toBeTruthy());
    expect(screen.getByLabelText('대화 이어가기')).toBeTruthy();
  });

  it('3b. aria-label(영어): "Open reading"/"Continue the conversation"', async () => {
    localStorage.setItem('attune.readings', JSON.stringify([
      makeReading({ id: 'r1', briefing: { headline: 'A shared headline' } }),
    ]));
    localStorage.setItem('attune.ask.threads', JSON.stringify({
      r1: [{ id: 'q1', role: 'user', text: 'a fresh question', createdAt: '2026-08-05T00:00:00.000Z' }],
    }));
    await renderHub('r1');

    await waitFor(() => expect(screen.getByLabelText('Open reading')).toBeTruthy());
    expect(screen.getByLabelText('Continue the conversation')).toBeTruthy();
  });

  it('4. chevron(›)이 행마다 렌더된다', async () => {
    localStorage.setItem('attune.readings', JSON.stringify([makeReading({ id: 'r1' })]));
    localStorage.setItem('attune.ask.threads', JSON.stringify({
      r1: [{ id: 'q1', role: 'user', text: 'a fresh question', createdAt: '2026-08-05T00:00:00.000Z' }],
    }));
    await renderHub('r1');

    await waitFor(() => expect(screen.getByText('a fresh question')).toBeTruthy());
    expect(screen.getAllByText('›')).toHaveLength(2);
  });

  it('5. 섹션 순서: RECENT ACTIVITY가 A SAJU LENS보다 먼저 등장한다', async () => {
    localStorage.setItem('attune.readings', JSON.stringify([makeReading({ id: 'r1' })]));
    const { container } = await renderHub('r1');
    await waitFor(() => expect(screen.getByText('RECENT ACTIVITY')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('A SAJU LENS')).toBeTruthy());

    const labels = Array.from(container.querySelectorAll('p')).map(p => p.textContent);
    const recentIdx = labels.indexOf('RECENT ACTIVITY');
    const sajuIdx = labels.indexOf('A SAJU LENS');
    expect(recentIdx).toBeGreaterThanOrEqual(0);
    expect(sajuIdx).toBeGreaterThan(recentIdx);
  });
});

describe('PersonHubPage — delete records (BRIEF-098)', () => {
  async function openConfirmSheet() {
    const entry = await waitFor(() => screen.getByText("Delete this person's records"));
    fireEvent.click(entry);
    return waitFor(() => screen.getByText("Delete Sam's records"));
  }

  it('UI: confirm button uses --c-destructive, not vermilion', async () => {
    mockGetSyncSession.mockResolvedValue(null);
    localStorage.setItem('attune.readings', JSON.stringify([makeReading({ id: 'r1' })]));
    await renderHub('r1');

    const confirmBtn = await openConfirmSheet();
    expect(confirmBtn.style.background).toBe('var(--c-destructive)');
    expect(confirmBtn.style.background).not.toBe('var(--c-vermilion)');
  });

  it('UI: EN body text pluralizes — 1 reading (singular) vs. 2 readings (plural)', async () => {
    mockGetSyncSession.mockResolvedValue(null);
    localStorage.setItem('attune.readings', JSON.stringify([makeReading({ id: 'r1' })]));
    await renderHub('r1');
    await openConfirmSheet();
    expect(screen.getByText(/1 reading, conversation history/)).toBeTruthy();
    cleanup();

    mockRouter.replace.mockReset();
    localStorage.clear();
    localStorage.setItem('attune.readings', JSON.stringify([
      makeReading({ id: 'r1', createdAt: '2026-07-01T00:00:00.000Z' }),
      makeReading({ id: 'r2', createdAt: '2026-08-01T00:00:00.000Z' }),
    ]));
    await renderHub('r2');
    await openConfirmSheet();
    expect(screen.getByText(/2 readings, conversation history/)).toBeTruthy();
  });

  it('UI: recomputes the group fresh at confirm time — a reading added after the sheet opened is deleted too', async () => {
    mockGetSyncSession.mockResolvedValue(null);
    localStorage.setItem('attune.readings', JSON.stringify([makeReading({ id: 'r1' })]));
    await renderHub('r1');
    const confirmBtn = await openConfirmSheet();

    // A second reading for the same person appears after the sheet was opened (e.g. another tab).
    localStorage.setItem('attune.readings', JSON.stringify([
      makeReading({ id: 'r1' }), makeReading({ id: 'r2' }),
    ]));

    await act(async () => { fireEvent.click(confirmBtn); await Promise.resolve(); });
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/people'));

    const remaining = JSON.parse(localStorage.getItem('attune.readings')!);
    expect(remaining).toEqual([]);
  });

  it('backup: logged in — pushBackup is called and success navigates to /people', async () => {
    mockGetSyncSession.mockResolvedValue({ sub: 'user-1' });
    mockPushBackup.mockResolvedValue({ ok: true, updatedAt: '2026-08-06T00:00:00.000Z' });
    localStorage.setItem('attune.readings', JSON.stringify([makeReading({ id: 'r1' })]));
    await renderHub('r1');
    const confirmBtn = await openConfirmSheet();

    await act(async () => { fireEvent.click(confirmBtn); await Promise.resolve(); await Promise.resolve(); });
    await waitFor(() => expect(mockPushBackup).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/people'));
  });

  it('backup: push failure redirects with ?backupPending=1 instead of a bare /people', async () => {
    mockGetSyncSession.mockResolvedValue({ sub: 'user-1' });
    mockPushBackup.mockResolvedValue({ ok: false, status: 500 });
    localStorage.setItem('attune.readings', JSON.stringify([makeReading({ id: 'r1' })]));
    await renderHub('r1');
    const confirmBtn = await openConfirmSheet();

    await act(async () => { fireEvent.click(confirmBtn); await Promise.resolve(); await Promise.resolve(); });
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/people?backupPending=1'));
  });

  it('backup: not logged in — pushBackup is never called', async () => {
    mockGetSyncSession.mockResolvedValue(null);
    localStorage.setItem('attune.readings', JSON.stringify([makeReading({ id: 'r1' })]));
    await renderHub('r1');
    const confirmBtn = await openConfirmSheet();

    await act(async () => { fireEvent.click(confirmBtn); await Promise.resolve(); });
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/people'));
    expect(mockPushBackup).not.toHaveBeenCalled();
  });

  it('failure: a local delete failure keeps the sheet open, shows an error, and never navigates', async () => {
    mockGetSyncSession.mockResolvedValue(null);
    localStorage.setItem('attune.readings', JSON.stringify([makeReading({ id: 'r1' })]));
    await renderHub('r1');
    const confirmBtn = await openConfirmSheet();

    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string) {
      if (key === 'attune.readings') throw new Error('quota exceeded');
      return original.apply(this, arguments as unknown as [string, string]);
    };
    try {
      await act(async () => { fireEvent.click(confirmBtn); await Promise.resolve(); });
    } finally {
      Storage.prototype.setItem = original;
    }

    expect((await screen.findByRole('alert')).textContent).toBe("Couldn't delete. Please try again.");
    expect(mockRouter.replace).not.toHaveBeenCalled();
    // still open — the confirm button is still present.
    expect(screen.getByText("Delete Sam's records")).toBeTruthy();
  });

  it('failure: a partial write failure (readings ok, threads throws) also reports ok:false and blocks navigation', async () => {
    mockGetSyncSession.mockResolvedValue(null);
    localStorage.setItem('attune.readings', JSON.stringify([makeReading({ id: 'r1' })]));
    await renderHub('r1');
    const confirmBtn = await openConfirmSheet();

    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'attune.ask.threads') throw new Error('write failed');
      return original.call(this, key, value);
    };
    try {
      await act(async () => { fireEvent.click(confirmBtn); await Promise.resolve(); });
    } finally {
      Storage.prototype.setItem = original;
    }

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('failure: rapid double-tap on confirm only deletes once', async () => {
    mockGetSyncSession.mockResolvedValue(null);
    const spy = vi.spyOn(storeModule, 'deletePersonData');
    localStorage.setItem('attune.readings', JSON.stringify([makeReading({ id: 'r1' })]));
    await renderHub('r1');
    const confirmBtn = await openConfirmSheet();

    await act(async () => {
      fireEvent.click(confirmBtn);
      fireEvent.click(confirmBtn);
      await Promise.resolve();
    });
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/people'));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('failure: confirming when the data is already gone completes safely (no error, navigates on)', async () => {
    mockGetSyncSession.mockResolvedValue(null);
    localStorage.setItem('attune.readings', JSON.stringify([makeReading({ id: 'r1' })]));
    await renderHub('r1');
    const confirmBtn = await openConfirmSheet();

    // Simulate the reading having been removed elsewhere before the confirm click lands.
    localStorage.setItem('attune.readings', JSON.stringify([]));

    await act(async () => { fireEvent.click(confirmBtn); await Promise.resolve(); });
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/people'));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
