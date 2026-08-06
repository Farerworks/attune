// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const mockRouter = { replace: vi.fn(), push: vi.fn(), back: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  mockRouter.replace.mockReset();
  window.history.replaceState(null, '', '/people');
});

describe('PeoplePage', () => {
  it('renders exactly one Settings link, in the top bar (avatar), not in TabHeader (BRIEF-080)', async () => {
    const { default: PeoplePage } = await import('./page');
    const { container } = render(<PeoplePage />);

    const links = screen.getAllByLabelText('Settings');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('/settings');
    // No standalone <header> (TabHeader) exists on this page since BRIEF-094F folded the
    // "People" title into the fixed top bar itself — so there's nothing for Settings to be inside.
    expect(container.querySelector('header')?.contains(links[0]) ?? false).toBe(false);
  });

  it('"People" renders exactly once, inside the sticky top bar (BRIEF-094F)', async () => {
    const { default: PeoplePage } = await import('./page');
    render(<PeoplePage />);

    const titles = screen.getAllByText('People');
    expect(titles).toHaveLength(1);

    let el: HTMLElement | null = titles[0];
    let stickyAncestor: HTMLElement | null = null;
    while (el) {
      if (getComputedStyle(el).position === 'sticky') { stickyAncestor = el; break; }
      el = el.parentElement;
    }
    expect(stickyAncestor).not.toBeNull();
  });
});

describe('PeoplePage — ledger rows (BRIEF-097)', () => {
  it('two readings for the same person collapse into one row, showing "2 READS", linking to the anchor reading', async () => {
    localStorage.setItem('attune.readings', JSON.stringify([
      { id: 'r-old', name: 'Sam', date: '1988-03-02', relationship: 'Friend', situation: 'x', createdAt: '2026-07-01T00:00:00.000Z' },
      { id: 'r-new', name: 'Sam', date: '1988-03-02', relationship: 'Friend', situation: 'y', createdAt: '2026-08-01T00:00:00.000Z' },
    ]));

    const { default: PeoplePage } = await import('./page');
    render(<PeoplePage />);

    await waitFor(() => expect(screen.getByText('Sam')).toBeTruthy());
    expect(screen.getAllByText('Sam')).toHaveLength(1);
    expect(screen.getByText('2 READS')).toBeTruthy();

    const row = screen.getByText('Sam').closest('a') as HTMLAnchorElement;
    expect(row.getAttribute('href')).toBe('/person/r-new');
  });

  it('does not render a "today" line for any person (getTodayNote removed, BRIEF-097 §2)', async () => {
    localStorage.setItem('attune.readings', JSON.stringify([
      { id: 'r1', name: 'Sam', date: '1988-03-02', relationship: 'Friend', situation: 'x', createdAt: '2026-08-01T00:00:00.000Z',
        themChart: { dayMaster: { element: 'fire', stem: 'Yang Fire', polarity: 'Yang' }, elements: { wood: 1, fire: 1, earth: 1, metal: 1, water: 1 }, pillarsKnown: 8, pillars: {} } },
    ]));

    const { default: PeoplePage } = await import('./page');
    render(<PeoplePage />);

    await waitFor(() => expect(screen.getByText('Sam')).toBeTruthy());
    expect(screen.queryByText('TODAY')).toBeNull();
  });
});

describe('PeoplePage — backupPending status line (BRIEF-098 §2)', () => {
  it('?backupPending=1 shows the quiet status line and strips the param via a single router.replace', async () => {
    window.history.replaceState(null, '', '/people?backupPending=1');
    const { default: PeoplePage } = await import('./page');
    render(<PeoplePage />);

    await waitFor(() => expect(screen.getByText(
      'Deleted on this device. Backup will update automatically when back online.'
    )).toBeTruthy());
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenCalledWith('/people');
  });

  it('without the param, no status line renders', async () => {
    const { default: PeoplePage } = await import('./page');
    render(<PeoplePage />);

    await waitFor(() => expect(screen.getByText('People')).toBeTruthy());
    expect(screen.queryByText(/Backup will update automatically/)).toBeNull();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
