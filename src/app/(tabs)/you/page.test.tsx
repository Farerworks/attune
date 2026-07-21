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
    expect(container.querySelector('header')?.contains(links[0])).toBe(false);
  });
});
