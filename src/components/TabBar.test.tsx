// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

let mockPathname = '/people';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

afterEach(() => {
  cleanup();
  mockPathname = '/people';
});

describe('TabBar — People active on the person hub (BRIEF-097)', () => {
  it('People is active on /people itself', async () => {
    mockPathname = '/people';
    const { TabBar } = await import('./TabBar');
    render(<TabBar />);
    expect(screen.getByText('People').closest('a')?.style.color).toBe('var(--c-ink)');
  });

  it('People is still active on a /person/[id] hub URL', async () => {
    mockPathname = '/person/r1';
    const { TabBar } = await import('./TabBar');
    render(<TabBar />);
    expect(screen.getByText('People').closest('a')?.style.color).toBe('var(--c-ink)');
  });

  it('People is not active on an unrelated tab', async () => {
    mockPathname = '/ask';
    const { TabBar } = await import('./TabBar');
    render(<TabBar />);
    expect(screen.getByText('People').closest('a')?.style.color).toBe('var(--c-muted)');
  });
});
