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
    expect(screen.getByText('People').closest('a')?.style.color).toBe('var(--c-ink-body)');
  });
});

describe('TabBar — inactive tab color is ink-body, not muted (BRIEF-101 §1)', () => {
  it('an inactive tab (Home, while on /ask) uses ink-body — muted fails the 4.5:1 contrast bar', async () => {
    mockPathname = '/ask';
    const { TabBar } = await import('./TabBar');
    render(<TabBar />);
    expect(screen.getByText('Home').closest('a')?.style.color).toBe('var(--c-ink-body)');
    expect(screen.getByText('Home').closest('a')?.style.color).not.toBe('var(--c-muted)');
  });
});
