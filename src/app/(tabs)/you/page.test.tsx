// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const mockRouter = { replace: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('YouPage', () => {
  it('loads the chart but does not render a TodayCard (moved to Home only, BRIEF-077)', async () => {
    localStorage.setItem('attune.profile', JSON.stringify({
      date: '1990-06-15', time: '14:30', gender: 'other', createdAt: new Date().toISOString(),
    }));

    const { default: YouPage } = await import('./page');
    render(<YouPage />);

    // Wait for the async chart calculation to finish and the day-master card to render.
    await waitFor(() => {
      expect(screen.getByText('Element Distribution')).toBeTruthy();
    });

    // TodayCard's distinctive "TODAY · <date>" label must not appear anywhere on the page.
    expect(screen.queryByText(/^TODAY ·/)).toBeNull();
  });

  it('renders exactly one Settings link, in the top bar (avatar), not in TabHeader (BRIEF-080)', async () => {
    localStorage.setItem('attune.profile', JSON.stringify({
      date: '1990-06-15', time: '14:30', gender: 'other', createdAt: new Date().toISOString(),
    }));

    const { default: YouPage } = await import('./page');
    const { container } = render(<YouPage />);

    const links = screen.getAllByLabelText('Settings');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('/settings');
    // No standalone <header> (TabHeader) exists on this page since BRIEF-094F folded the
    // "You" title into the fixed top bar itself — so there's nothing for Settings to be inside.
    expect(container.querySelector('header')?.contains(links[0]) ?? false).toBe(false);
  });

  it('"You" renders exactly once, inside the sticky top bar (BRIEF-094F)', async () => {
    localStorage.setItem('attune.profile', JSON.stringify({
      date: '1990-06-15', time: '14:30', gender: 'other', createdAt: new Date().toISOString(),
    }));

    const { default: YouPage } = await import('./page');
    render(<YouPage />);

    const titles = await waitFor(() => screen.getAllByText('You'));
    expect(titles).toHaveLength(1);

    let el: HTMLElement | null = titles[0];
    let stickyAncestor: HTMLElement | null = null;
    while (el) {
      if (getComputedStyle(el).position === 'sticky') { stickyAncestor = el; break; }
      el = el.parentElement;
    }
    expect(stickyAncestor).not.toBeNull();
  });

  it('stats line: 1 reading -> singular "1 READ" (not "1 READS") (BRIEF-092)', async () => {
    localStorage.setItem('attune.profile', JSON.stringify({
      date: '1990-06-15', time: '14:30', gender: 'other', createdAt: new Date().toISOString(),
    }));
    localStorage.setItem('attune.readings', JSON.stringify([
      { id: 'r1', name: 'Sam', date: '1988-03-02', time: '09:00', createdAt: new Date().toISOString() },
    ]));

    const { default: YouPage } = await import('./page');
    const { container } = render(<YouPage />);

    await waitFor(() => expect(container.textContent).toContain('READ'));
    expect(container.textContent).toContain('1 READ ·');
    expect(container.textContent).not.toContain('1 READS');
  });

  it('stats line: 2 readings -> plural "2 READS" (BRIEF-092)', async () => {
    localStorage.setItem('attune.profile', JSON.stringify({
      date: '1990-06-15', time: '14:30', gender: 'other', createdAt: new Date().toISOString(),
    }));
    localStorage.setItem('attune.readings', JSON.stringify([
      { id: 'r1', name: 'Sam', date: '1988-03-02', time: '09:00', createdAt: new Date().toISOString() },
      { id: 'r2', name: 'Alex', date: '1992-01-01', time: '10:00', createdAt: new Date().toISOString() },
    ]));

    const { default: YouPage } = await import('./page');
    const { container } = render(<YouPage />);

    await waitFor(() => expect(container.textContent).toContain('READ'));
    expect(container.textContent).toContain('2 READS ·');
  });

  it('stats line: 1 day in -> singular "1 DAY IN" (not "1 DAYS IN") (BRIEF-092)', async () => {
    localStorage.setItem('attune.profile', JSON.stringify({
      date: '1990-06-15', time: '14:30', gender: 'other', createdAt: new Date().toISOString(),
    }));

    const { default: YouPage } = await import('./page');
    const { container } = render(<YouPage />);

    await waitFor(() => expect(container.textContent).toContain('DAY'));
    expect(container.textContent).toContain('1 DAY IN');
    expect(container.textContent).not.toContain('1 DAYS IN');
  });

  it('Share button has no emoji and renders ShareIcon (BRIEF-092)', async () => {
    localStorage.setItem('attune.profile', JSON.stringify({
      date: '1990-06-15', time: '14:30', gender: 'other', createdAt: new Date().toISOString(),
    }));

    const { default: YouPage } = await import('./page');
    render(<YouPage />);

    const button = await screen.findByText('Share my card');
    const container2 = button.closest('button') as HTMLElement;
    expect(container2.textContent).not.toContain('↗️');
    expect(container2.querySelector('svg')).toBeTruthy();
  });
});
