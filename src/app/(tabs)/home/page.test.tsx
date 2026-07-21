// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('HomePage', () => {
  it('renders exactly one Settings link, in the top bar (avatar), not in TabHeader (BRIEF-080)', async () => {
    const { default: HomePage } = await import('./page');
    const { container } = render(<HomePage />);

    const links = screen.getAllByLabelText('Settings');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('/settings');
    expect(container.querySelector('header')?.contains(links[0])).toBe(false);
  });
});
