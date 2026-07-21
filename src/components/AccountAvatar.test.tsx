// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { AccountAvatar } from './AccountAvatar';

const sessionMock = vi.fn();
vi.mock('@/lib/sync', () => ({
  getSyncSession: () => sessionMock(),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

describe('AccountAvatar', () => {
  it('always links to /settings with aria-label "Settings"', () => {
    sessionMock.mockResolvedValue(null);
    render(<AccountAvatar />);
    const link = screen.getByLabelText('Settings');
    expect(link.getAttribute('href')).toBe('/settings');
  });

  it('shows a neutral silhouette (no initial) when not signed in', async () => {
    sessionMock.mockResolvedValue(null);
    render(<AccountAvatar />);
    await waitFor(() => expect(sessionMock).toHaveBeenCalled());

    const link = screen.getByLabelText('Settings');
    expect(link.querySelector('svg')).toBeTruthy();
    expect(link.textContent).toBe('');
  });

  it('shows an initial when signed in, preferring the profile name over the session email', async () => {
    localStorage.setItem('attune.profile', JSON.stringify({ date: '1990-01-01', name: 'Jisoo' }));
    sessionMock.mockResolvedValue({ sub: 'abc', user: { email: 'someone@example.com' } });

    render(<AccountAvatar />);
    await waitFor(() => {
      expect(screen.getByText('J')).toBeTruthy();
    });
  });

  it('falls back to the session email initial when no profile name is set', async () => {
    sessionMock.mockResolvedValue({ sub: 'abc', user: { email: 'zed@example.com' } });

    render(<AccountAvatar />);
    await waitFor(() => {
      expect(screen.getByText('Z')).toBeTruthy();
    });
  });
});
