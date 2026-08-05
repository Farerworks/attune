// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

// ── Deterministic mocks for BRIEF-094's dynamically-imported lib calls ────────
// Home consumes these read-only; this file never asserts on their internals —
// only on how the page renders whatever they return.

vi.mock('@/lib/saju', () => ({
  calculateSaju: () => ({ dayMaster: { element: 'wood', stem: 'Yang Wood', polarity: 'Yang' } }),
}));

const mockGetFlowDays = vi.fn();
vi.mock('@/lib/homeCopy', () => ({
  getDailyDoDont: () => ({ dos: ['Do first pick.', 'Do second pick.'], donts: ['Dont first pick.', 'Dont second pick.'] }),
  getFlowDays: () => mockGetFlowDays(),
}));

vi.mock('@/lib/today', () => ({
  getMyTodayCard: () => ({
    note: { line: 'Test today core sentence.', tone: 'good', todayElement: 'wood', branch: 'x', stem: 'Yang Wood' },
    dateLabel: 'AUG 5',
  }),
  pickVariant: (pool: string[]) => pool[0],
  ME: {
    same: ['Ahead line — same A.', 'Ahead line — same B.'], today_nurtures: ['Ahead line — nurtures.'],
    person_nurtures: ['x'], today_controls: ['x'], person_controls: ['x'],
  },
  ME_KO: {
    same: ['한글 어헤드 — same.'], today_nurtures: ['한글 어헤드 — nurtures.'],
    person_nurtures: ['x'], today_controls: ['x'], person_controls: ['x'],
  },
  getTodayNote: (_el: string, _mode: string, date?: string, name?: string) => ({
    tone: 'good', line: `${name ?? 'them'} today-note for ${date}`, todayElement: 'wood', branch: 'x',
  }),
  localDateStr: () => '2026-08-05',
}));

vi.mock('@/lib/askPrompts', () => ({
  getQuickPrompts: () => ['Quick prompt one', 'Quick prompt two', 'Quick prompt three'],
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  mockGetFlowDays.mockReset();
  Object.defineProperty(navigator, 'language', { value: 'en-US', configurable: true });
});

function seedProfile() {
  localStorage.setItem('attune.profile', JSON.stringify({
    date: '1990-06-15', time: '14:30', gender: 'other', createdAt: new Date().toISOString(),
  }));
}

function makeReading(id: string, name: string, element = 'fire') {
  return {
    id, name, date: '1988-03-02', time: '09:00',
    relationship: 'Friend', situation: 'test', createdAt: new Date().toISOString(),
    themChart: { dayMaster: { element, stem: 'Yang Fire', polarity: 'Yang' }, elements: { wood: 1, fire: 1, earth: 1, metal: 1, water: 1 }, pillarsKnown: 8, pillars: {} },
  };
}

const FLOW_NO_GOOD = Array.from({ length: 14 }, (_, i) => ({
  date: `2026-08-${String(5 + i).padStart(2, '0')}`, weekdayLabel: 'X', dayNumber: 5 + i,
  tone: 'soft' as const, rel: 'today_controls' as const, dayElement: 'metal' as const,
}));

// Both good days share `rel: 'same'` on purpose — exercises the variation-conflict guard
// (mocked pickVariant always returns pool[0], so without the guard both cards would collide).
const FLOW_TWO_GOOD = FLOW_NO_GOOD.map((d, i) => (
  i === 1 ? { ...d, tone: 'good' as const, rel: 'same' as const, dayElement: 'fire' as const }
    : i === 3 ? { ...d, tone: 'good' as const, rel: 'same' as const, dayElement: 'water' as const }
    : d
));

describe('HomePage', () => {
  it('renders exactly one Settings link, in the top bar (avatar) — Home has no TabHeader as of BRIEF-094', async () => {
    const { default: HomePage } = await import('./page');
    const { container } = render(<HomePage />);

    const links = screen.getAllByLabelText('Settings');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('/settings');
    expect(container.querySelector('header')).toBeNull();
  });

  it('removed elements are gone: no "Thinking about someone", "DAY … WITH ATTUNE", "NEXT 14 DAYS", or "Read someone" (BRIEF-094)', async () => {
    seedProfile();
    localStorage.setItem('attune.readings', JSON.stringify([makeReading('r1', 'Sam')]));
    mockGetFlowDays.mockReturnValue(FLOW_NO_GOOD);

    const { default: HomePage } = await import('./page');
    const { container } = render(<HomePage />);

    await waitFor(() => expect(screen.getByText('Test today core sentence.')).toBeTruthy());

    expect(screen.queryByText(/Thinking about someone/)).toBeNull();
    expect(container.textContent).not.toMatch(/DAY \d+.*WITH ATTUNE/);
    expect(screen.queryByText(/NEXT 14 DAYS/)).toBeNull();
    expect(screen.queryByText(/Read someone/)).toBeNull();
  });

  it("today's core sentence renders exactly once (no duplicate ending, BRIEF-094)", async () => {
    seedProfile();
    mockGetFlowDays.mockReturnValue(FLOW_NO_GOOD);

    const { default: HomePage } = await import('./page');
    render(<HomePage />);

    await waitFor(() => expect(screen.getAllByText('Test today core sentence.')).toHaveLength(1));
  });

  it('Do/Don\'t: renders only the first do and first dont item, not the second (BRIEF-094)', async () => {
    seedProfile();
    mockGetFlowDays.mockReturnValue(FLOW_NO_GOOD);

    const { default: HomePage } = await import('./page');
    render(<HomePage />);

    await waitFor(() => expect(screen.getByText(/Do first pick\./)).toBeTruthy());
    expect(screen.getByText(/Dont first pick\./)).toBeTruthy();
    expect(screen.queryByText(/Do second pick\./)).toBeNull();
    expect(screen.queryByText(/Dont second pick\./)).toBeNull();
  });

  it('people rows: 4 seeded readings -> exactly 3 rows shown + a "see everyone" link (BRIEF-094)', async () => {
    seedProfile();
    localStorage.setItem('attune.readings', JSON.stringify([
      makeReading('r1', 'Alex'), makeReading('r2', 'Bailey'), makeReading('r3', 'Casey'), makeReading('r4', 'Dana'),
    ]));
    mockGetFlowDays.mockReturnValue(FLOW_NO_GOOD);

    const { default: HomePage } = await import('./page');
    render(<HomePage />);

    await waitFor(() => expect(screen.getAllByRole('link', { name: /Alex|Bailey|Casey|Dana/ })).toHaveLength(3));
    expect(screen.getByText('See everyone ›')).toBeTruthy();
  });

  it('people rows: each shown row has the name + a today note line, and no streak/day-count string (BRIEF-094)', async () => {
    seedProfile();
    localStorage.setItem('attune.readings', JSON.stringify([
      makeReading('r1', 'Alex'), makeReading('r2', 'Bailey'), makeReading('r3', 'Casey'),
    ]));
    mockGetFlowDays.mockReturnValue(FLOW_NO_GOOD);

    const { default: HomePage } = await import('./page');
    const { container } = render(<HomePage />);

    await waitFor(() => expect(screen.getByText('Alex')).toBeTruthy());
    expect(screen.getByText('Bailey')).toBeTruthy();
    expect(screen.getByText('Casey')).toBeTruthy();
    expect(screen.getByText(/Alex today-note for/)).toBeTruthy();
    expect(container.textContent).not.toMatch(/일째/);
    expect(container.textContent).not.toMatch(/DAY \d+/);
  });

  it('AHEAD: 2 good-tone days -> 2 cards, EN disclaimer is an exact match, no stray text (BRIEF-094-FIX)', async () => {
    Object.defineProperty(navigator, 'language', { value: 'en-US', configurable: true });
    seedProfile();
    mockGetFlowDays.mockReturnValue(FLOW_TWO_GOOD);

    const { default: HomePage } = await import('./page');
    render(<HomePage />);

    await waitFor(() => expect(screen.getByText('AHEAD')).toBeTruthy());
    const nodes = screen.getAllByText('A hint, not an answer key');
    expect(nodes).toHaveLength(2);
    for (const n of nodes) expect(n.textContent).toBe('A hint, not an answer key');
  });

  it('AHEAD: Korean disclaimer is an exact match — "힌트일 뿐, 정답표가 아니에요", no stray prefix like "화면" (BRIEF-094-FIX)', async () => {
    Object.defineProperty(navigator, 'language', { value: 'ko-KR', configurable: true });
    seedProfile();
    mockGetFlowDays.mockReturnValue(FLOW_TWO_GOOD);

    const { default: HomePage } = await import('./page');
    render(<HomePage />);

    await waitFor(() => expect(screen.getByText('AHEAD')).toBeTruthy());
    const nodes = screen.getAllByText('힌트일 뿐, 정답표가 아니에요');
    expect(nodes).toHaveLength(2);
    for (const n of nodes) expect(n.textContent).toBe('힌트일 뿐, 정답표가 아니에요');
  });

  it('AHEAD: 0 good-tone days -> the AHEAD label is absent entirely (BRIEF-094)', async () => {
    seedProfile();
    mockGetFlowDays.mockReturnValue(FLOW_NO_GOOD);

    const { default: HomePage } = await import('./page');
    render(<HomePage />);

    await waitFor(() => expect(screen.getByText('Test today core sentence.')).toBeTruthy());
    expect(screen.queryByText('AHEAD')).toBeNull();
  });

  it('empty state: 0 readings -> the ledger CTA row strings are present (BRIEF-094)', async () => {
    const { default: HomePage } = await import('./page');
    render(<HomePage />);

    await waitFor(() => expect(screen.getByText('＋ Add someone on your mind')).toBeTruthy());
    expect(screen.getByText('You can start without a birth time')).toBeTruthy();
  });

  it("today's core sentence has word-break: keep-all (BRIEF-094B)", async () => {
    seedProfile();
    mockGetFlowDays.mockReturnValue(FLOW_NO_GOOD);

    const { default: HomePage } = await import('./page');
    render(<HomePage />);

    const el = await waitFor(() => screen.getByText('Test today core sentence.'));
    expect(el.style.wordBreak).toBe('keep-all');
  });

  it('AHEAD card body has word-break: keep-all (BRIEF-094B)', async () => {
    seedProfile();
    mockGetFlowDays.mockReturnValue(FLOW_TWO_GOOD);

    const { default: HomePage } = await import('./page');
    render(<HomePage />);

    const els = await waitFor(() => screen.getAllByText(/Ahead line — same/));
    expect(els[0].style.wordBreak).toBe('keep-all');
  });

  it('Ask chips link to /ask with a URL-encoded prefill param (BRIEF-094B)', async () => {
    seedProfile();
    mockGetFlowDays.mockReturnValue(FLOW_NO_GOOD);

    const { default: HomePage } = await import('./page');
    render(<HomePage />);

    const link = await waitFor(() => screen.getByText('Quick prompt one').closest('a'));
    expect(link?.getAttribute('href')).toBe(`/ask?prefill=${encodeURIComponent('Quick prompt one')}`);
  });

  it("today's glyph watermark renders as a decorative (aria-hidden) svg (BRIEF-094D)", async () => {
    seedProfile();
    mockGetFlowDays.mockReturnValue(FLOW_NO_GOOD);

    const { default: HomePage } = await import('./page');
    const { container } = render(<HomePage />);

    await waitFor(() => expect(screen.getByText('Test today core sentence.')).toBeTruthy());

    // The Settings icon svg is also aria-hidden, so scope to a DIV wrapper specifically.
    const hiddenWrapper = container.querySelector('div[aria-hidden="true"]');
    expect(hiddenWrapper).toBeTruthy();
    expect(hiddenWrapper?.querySelector('svg')).toBeTruthy();
  });

  it('AHEAD: two same-rel days never render the identical line (variation-conflict guard, BRIEF-094D)', async () => {
    seedProfile();
    mockGetFlowDays.mockReturnValue(FLOW_TWO_GOOD);

    const { default: HomePage } = await import('./page');
    render(<HomePage />);

    await waitFor(() => expect(screen.getByText('AHEAD')).toBeTruthy());
    const cardA = screen.getByText('Ahead line — same A.');
    const cardB = screen.getByText('Ahead line — same B.');
    expect(cardA).toBeTruthy();
    expect(cardB).toBeTruthy();
    expect(cardA.textContent).not.toBe(cardB.textContent);
  });

  it("Do/Don't line renders both the DO and DON'T icons (BRIEF-094D)", async () => {
    seedProfile();
    mockGetFlowDays.mockReturnValue(FLOW_NO_GOOD);

    const { default: HomePage } = await import('./page');
    render(<HomePage />);

    const doLabel = await waitFor(() => screen.getByText('DO'));
    const doDontLine = doLabel.closest('p');
    expect(doDontLine?.querySelectorAll('svg').length).toBe(2);
  });
});
