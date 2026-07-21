// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('PeoplePage', () => {
  it('renders the Settings link in the header (BRIEF-077)', async () => {
    const { default: PeoplePage } = await import('./page');
    render(<PeoplePage />);

    const link = screen.getByLabelText('Settings');
    expect(link.getAttribute('href')).toBe('/settings');
  });
});
