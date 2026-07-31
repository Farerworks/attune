// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const mockGetSyncSession = vi.fn(() => Promise.resolve(null) as Promise<unknown>);
const mockDeleteBackup = vi.fn();

vi.mock('@/lib/sync', () => ({
  getSyncSession: () => mockGetSyncSession(),
  pushBackup: vi.fn(),
  pullBackup: vi.fn(),
  deleteBackup: () => mockDeleteBackup(),
  applySnapshot: vi.fn(),
  LS_LAST_BACKUP: 'attune.lastBackup',
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mockGetSyncSession.mockReset().mockReturnValue(Promise.resolve(null));
  mockDeleteBackup.mockReset();
});

describe('SettingsPage — version footer', () => {
  it('renders "Attune · dev" when NEXT_PUBLIC_COMMIT_SHA is unset (local dev)', async () => {
    const { default: SettingsPage } = await import('./page');
    render(<SettingsPage />);
    expect(screen.getByText('Attune · dev')).toBeTruthy();
  });
});

describe('SettingsPage — Clear all data confirm copy by backup state (BRIEF-089)', () => {
  it('no backup (signed out): warns that erasure is permanent with no backup', async () => {
    mockGetSyncSession.mockReturnValue(Promise.resolve(null));
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    const { default: SettingsPage } = await import('./page');
    render(<SettingsPage />);

    fireEvent.click(screen.getByText('Clear all data'));

    expect(confirmSpy).toHaveBeenCalledWith(
      'Clear all readings and your birth info? There is no backup — this permanently erases everything on this phone.',
    );
  });

  it('signed in with backup: warns that the Google backup is also deleted', async () => {
    mockGetSyncSession.mockReturnValue(Promise.resolve({ user: { email: 'a@b.com' } } as never));
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    const { default: SettingsPage } = await import('./page');
    render(<SettingsPage />);

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeTruthy());
    fireEvent.click(screen.getByText('Clear all data'));

    expect(confirmSpy).toHaveBeenCalledWith(
      'Clear all readings and your birth info? This also deletes your Google backup. This cannot be undone.',
    );
  });
});

describe('SettingsPage — chevron consistency (BRIEF-089)', () => {
  it('"Add to Home Screen" (opens the install sheet) has a chevron', async () => {
    const { default: SettingsPage } = await import('./page');
    const { container } = render(<SettingsPage />);

    const row = screen.getByText('Add to Home Screen').closest('button');
    expect(row?.querySelector('svg')).toBeTruthy();
    void container;
  });

  it('"Share Attune" (fires the system share sheet immediately) has no chevron', async () => {
    const { default: SettingsPage } = await import('./page');
    render(<SettingsPage />);

    const row = screen.getByText('Share Attune').closest('button');
    expect(row?.querySelector('svg')).toBeFalsy();
  });
});
