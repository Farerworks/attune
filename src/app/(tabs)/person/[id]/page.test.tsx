// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Suspense, act } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const mockRouter = { replace: vi.fn(), push: vi.fn(), back: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  mockRouter.replace.mockReset();
  mockRouter.push.mockReset();
  mockRouter.back.mockReset();
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
});
