// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const mockGetSyncSession = vi.fn(() => Promise.resolve(null) as Promise<unknown>);
const mockDeleteBackup = vi.fn();
const mockPullBackup = vi.fn(() => Promise.resolve(null) as Promise<unknown>);

vi.mock('@/lib/sync', () => ({
  getSyncSession: () => mockGetSyncSession(),
  pushBackup: vi.fn(),
  pullBackup: () => mockPullBackup(),
  deleteBackup: () => mockDeleteBackup(),
  applySnapshot: vi.fn(),
  LS_LAST_BACKUP: 'attune.lastBackup',
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mockGetSyncSession.mockReset().mockReturnValue(Promise.resolve(null));
  mockDeleteBackup.mockReset();
  mockPullBackup.mockReset().mockReturnValue(Promise.resolve(null));
});

describe('SettingsPage — version footer', () => {
  it('renders "Attune · dev" when NEXT_PUBLIC_COMMIT_SHA is unset (local dev)', async () => {
    const { default: SettingsPage } = await import('./page');
    render(<SettingsPage />);
    expect(screen.getByText('Attune · dev')).toBeTruthy();
  });
});

describe('SettingsPage — title in the fixed top bar (BRIEF-094F)', () => {
  it('"Settings" renders exactly once, inside the sticky top bar', async () => {
    const { default: SettingsPage } = await import('./page');
    render(<SettingsPage />);

    const titles = screen.getAllByText('Settings');
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

describe('SettingsPage — Clear all data confirm copy by backup state (BRIEF-089)', () => {
  // BRIEF-102로 버튼 비활성화 — 재활성화 판에서 BRIEF-089의 confirm 문구 검증을 복원할 것.
  it('no backup (signed out): "Clear all data" is disabled and click does not open confirm', async () => {
    mockGetSyncSession.mockReturnValue(Promise.resolve(null));
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    const { default: SettingsPage } = await import('./page');
    render(<SettingsPage />);

    const button = screen.getByText('Clear all data').closest('button');
    expect(button?.disabled).toBe(true);

    fireEvent.click(screen.getByText('Clear all data'));

    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('signed in with backup: "Clear all data" is disabled and click does not open confirm', async () => {
    mockGetSyncSession.mockReturnValue(Promise.resolve({ user: { email: 'a@b.com' } } as never));
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    const { default: SettingsPage } = await import('./page');
    render(<SettingsPage />);

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeTruthy());
    const button = screen.getByText('Clear all data').closest('button');
    expect(button?.disabled).toBe(true);

    fireEvent.click(screen.getByText('Clear all data'));

    expect(confirmSpy).not.toHaveBeenCalled();
  });
});

describe('SettingsPage — About sheet privacy paragraph removed (BRIEF-102)', () => {
  it('opening "About Attune" does not show the false server-storage claim, but the sheet did open', async () => {
    const { default: SettingsPage } = await import('./page');
    render(<SettingsPage />);

    fireEvent.click(screen.getByText('About Attune'));

    expect(screen.queryByText(/Nothing is sent to a server/)).toBeNull();
    expect(screen.getByText('Made by farerworks')).toBeTruthy();
  });
});

describe('SettingsPage — restore failure copy (BRIEF-102)', () => {
  it('failed restore shows "Restore failed — try again.", not the backup-failed copy', async () => {
    mockGetSyncSession.mockReturnValue(Promise.resolve({ user: { email: 'a@b.com' } } as never));
    mockPullBackup.mockReturnValue(Promise.resolve({ ok: false }) as unknown as Promise<unknown>);

    const { default: SettingsPage } = await import('./page');
    render(<SettingsPage />);

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeTruthy());
    fireEvent.click(screen.getByText('Restore from backup'));

    await waitFor(() => expect(screen.getByText('Restore failed — try again.')).toBeTruthy());
    expect(screen.queryByText('Backup failed — try again.')).toBeNull();
  });
});

describe('SettingsPage — backup row canonical copy (BRIEF-102B)', () => {
  it('signed out: shows "Back up your data" + new description, not the old label/description', async () => {
    mockGetSyncSession.mockReturnValue(Promise.resolve(null));

    const { default: SettingsPage } = await import('./page');
    render(<SettingsPage />);

    await waitFor(() => expect(screen.getByText('Back up your data')).toBeTruthy());
    expect(screen.getByText("Sign in with Google to back up your data to Attune's server and restore it on a new phone.")).toBeTruthy();
    expect(screen.queryByText('Back up with Google')).toBeNull();
    expect(screen.queryByText('Keep your readings if you switch phones.')).toBeNull();
  });
});

describe('SettingsPage — backup caption canonical copy (BRIEF-102B)', () => {
  it('shows the new automatic-backup caption, not the old "stays on this phone" copy', async () => {
    const { default: SettingsPage } = await import('./page');
    render(<SettingsPage />);

    expect(screen.getByText("Backup is optional. Signing in with Google starts automatic backup to Attune's server.")).toBeTruthy();
    expect(screen.queryByText(/unless you turn it on/)).toBeNull();
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
