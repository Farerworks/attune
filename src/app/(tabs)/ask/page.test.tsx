// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

// jsdom doesn't implement scrollIntoView — the page calls it on new messages.
Element.prototype.scrollIntoView = vi.fn();

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('AskPage', () => {
  it('renders the Settings link in the header (BRIEF-077)', async () => {
    localStorage.setItem('attune.profile', JSON.stringify({
      date: '1990-06-15', time: '14:30', gender: 'other', createdAt: new Date().toISOString(),
    }));

    const { default: AskPage } = await import('./page');
    render(<AskPage />);

    await waitFor(() => {
      expect(screen.getByLabelText('Settings')).toBeTruthy();
    });
    expect(screen.getByLabelText('Settings').getAttribute('href')).toBe('/settings');
  });
});
