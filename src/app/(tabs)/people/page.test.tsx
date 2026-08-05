// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

afterEach(() => {
  cleanup();
  localStorage.clear();
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
