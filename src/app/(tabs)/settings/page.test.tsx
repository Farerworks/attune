// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const mockGetSyncSession = vi.fn(() => Promise.resolve(null) as Promise<unknown>);
const mockDeleteBackup = vi.fn();
const mockPullBackup = vi.fn(() => Promise.resolve(null) as Promise<unknown>);
const mockPushBackup = vi.fn();
const mockApplySnapshot = vi.fn();
const mockMarkReplaceAck = vi.fn();
const mockClearAllData = vi.fn();
const callOrder: string[] = [];
// BRIEF-107 §2.3 — a tiny stateful stand-in for the real localStorage-backed hasReplaceAck, so
// the "resumes after a successful manual backup" test can observe the flag flipping.
let ackedSub: string | null = null;

vi.mock('@/lib/sync', () => ({
  getSyncSession: () => mockGetSyncSession(),
  pushBackup: (opts?: { explicitReplace?: boolean }) => { callOrder.push('pushBackup'); return mockPushBackup(opts); },
  pullBackup: () => mockPullBackup(),
  deleteBackup: () => mockDeleteBackup(),
  applySnapshot: (payload: unknown) => { callOrder.push('applySnapshot'); mockApplySnapshot(payload); },
  markReplaceAck: (sub: string) => { callOrder.push('markReplaceAck'); mockMarkReplaceAck(sub); ackedSub = sub; },
  hasReplaceAck: (sub: string) => ackedSub === sub,
  LS_LAST_BACKUP: 'attune.lastBackup',
}));

// BRIEF-112 §2 — clearAllData is mocked so "Clear all data fails" tests can assert it was never
// called, without depending on store.ts's real localStorage sweep.
vi.mock('@/lib/store', () => ({
  clearAllData: () => mockClearAllData(),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mockGetSyncSession.mockReset().mockReturnValue(Promise.resolve(null));
  mockDeleteBackup.mockReset();
  mockPullBackup.mockReset().mockReturnValue(Promise.resolve(null));
  mockPushBackup.mockReset();
  mockApplySnapshot.mockReset();
  mockMarkReplaceAck.mockReset();
  mockClearAllData.mockReset();
  callOrder.length = 0;
  ackedSub = null;
  localStorage.clear();
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

describe('SettingsPage — Clear all data confirm copy by backup state (BRIEF-089, re-enabled by BRIEF-112)', () => {
  // BRIEF-112 §2 — the row's lock reason (clearAllData didn't wipe attune.ask.memory) is fixed,
  // so `disabled` is gone and BRIEF-089's original confirm-copy assertions are restored.
  it('no backup (signed out): warns that erasure is permanent with no backup', async () => {
    mockGetSyncSession.mockReturnValue(Promise.resolve(null));
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    const { default: SettingsPage } = await import('./page');
    render(<SettingsPage />);

    const button = screen.getByText('Clear all data').closest('button');
    expect(button?.disabled).toBe(false);

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

describe('SettingsPage — Clear all data stops on backup-delete failure (BRIEF-112 §2)', () => {
  it('signed in + deleteBackup fails: localStorage untouched, failure copy shown, clearAllData not called', async () => {
    mockGetSyncSession.mockReturnValue(Promise.resolve({ sub: 'clear-sub', user: { email: 'a@b.com' } } as never));
    mockDeleteBackup.mockReturnValue(Promise.resolve(false));
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const { default: SettingsPage } = await import('./page');
    render(<SettingsPage />);

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeTruthy());
    fireEvent.click(screen.getByText('Clear all data'));

    await waitFor(() => expect(screen.getByText("Couldn't delete your backup — nothing was cleared. Try again.")).toBeTruthy());
    expect(mockClearAllData).not.toHaveBeenCalled();
  });

  it('signed in + deleteBackup succeeds: clearAllData is called', async () => {
    mockGetSyncSession.mockReturnValue(Promise.resolve({ sub: 'clear-sub-2', user: { email: 'a@b.com' } } as never));
    mockDeleteBackup.mockReturnValue(Promise.resolve(true));
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const { default: SettingsPage } = await import('./page');
    render(<SettingsPage />);

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeTruthy());
    fireEvent.click(screen.getByText('Clear all data'));

    await waitFor(() => expect(mockClearAllData).toHaveBeenCalled());
  });
});

describe('SettingsPage — Reset conversations (BRIEF-112 §3)', () => {
  function seedAskData() {
    localStorage.setItem('attune.ask.threads', '{"me":[]}');
    localStorage.setItem('attune.ask.memory', '{"r1":["fact"]}');
    localStorage.setItem('attune.ask.quota', JSON.stringify({ date: '2026-08-29', used: 5 }));
  }

  it('confirm cancelled: nothing changes', async () => {
    seedAskData();
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    const { default: SettingsPage } = await import('./page');
    render(<SettingsPage />);

    fireEvent.click(screen.getByText('Reset conversations'));

    expect(localStorage.getItem('attune.ask.threads')).not.toBeNull();
    expect(mockPushBackup).not.toHaveBeenCalled();
  });

  it('confirmed + signed in: resets threads/memory then pushes a backup', async () => {
    seedAskData();
    mockGetSyncSession.mockReturnValue(Promise.resolve({ sub: 'reset-sub', user: { email: 'a@b.com' } } as never));
    mockPushBackup.mockReturnValue(Promise.resolve({ ok: true, updatedAt: '2026-08-29T00:00:00.000Z' }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const { default: SettingsPage } = await import('./page');
    render(<SettingsPage />);

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeTruthy());
    fireEvent.click(screen.getByText('Reset conversations'));

    await waitFor(() => expect(mockPushBackup).toHaveBeenCalledWith(undefined));
    expect(localStorage.getItem('attune.ask.threads')).toBeNull();
    expect(localStorage.getItem('attune.ask.memory')).toBeNull();
    expect(localStorage.getItem('attune.ask.quota')).not.toBeNull();
    await waitFor(() => expect(screen.getByText('Conversations reset.')).toBeTruthy());
  });

  it('push fails: threads/memory are still cleared locally, and the failure copy is shown', async () => {
    seedAskData();
    mockGetSyncSession.mockReturnValue(Promise.resolve({ sub: 'reset-sub-2', user: { email: 'a@b.com' } } as never));
    mockPushBackup.mockReturnValue(Promise.resolve({ ok: false, status: 500 }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const { default: SettingsPage } = await import('./page');
    render(<SettingsPage />);

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeTruthy());
    fireEvent.click(screen.getByText('Reset conversations'));

    await waitFor(() => expect(localStorage.getItem('attune.ask.threads')).toBeNull());
    expect(localStorage.getItem('attune.ask.memory')).toBeNull();
    await waitFor(() => expect(screen.getByText("Conversations were reset on this phone, but the backup couldn't be updated yet.")).toBeTruthy());
  });

  it('signed out + confirmed: resets locally with no pushBackup call', async () => {
    seedAskData();
    mockGetSyncSession.mockReturnValue(Promise.resolve(null));
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const { default: SettingsPage } = await import('./page');
    render(<SettingsPage />);

    fireEvent.click(screen.getByText('Reset conversations'));

    await waitFor(() => expect(localStorage.getItem('attune.ask.threads')).toBeNull());
    expect(mockPushBackup).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('Conversations reset.')).toBeTruthy());
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

describe('SettingsPage — restore success acks the account (BRIEF-107-FIX §1.3)', () => {
  it('confirmed restore: applySnapshot happens, THEN markReplaceAck is called with the session sub', async () => {
    mockGetSyncSession.mockReturnValue(Promise.resolve({ sub: 'settings-restore-sub', user: { email: 'a@b.com' } } as never));
    mockPullBackup.mockReturnValue(Promise.resolve({
      ok: true, payload: { 'attune.profile': { name: 'x' } }, updatedAt: '2026-08-01T00:00:00.000Z',
    }) as unknown as Promise<unknown>);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const { default: SettingsPage } = await import('./page');
    render(<SettingsPage />);

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeTruthy());
    fireEvent.click(screen.getByText('Restore from backup'));

    await waitFor(() => expect(mockMarkReplaceAck).toHaveBeenCalledWith('settings-restore-sub'));
    expect(mockApplySnapshot).toHaveBeenCalledWith({ 'attune.profile': { name: 'x' } });
    expect(callOrder).toEqual(['applySnapshot', 'markReplaceAck']);
  });

  it('cancelled restore: neither applySnapshot nor markReplaceAck is called', async () => {
    mockGetSyncSession.mockReturnValue(Promise.resolve({ sub: 'settings-restore-sub-2', user: { email: 'a@b.com' } } as never));
    mockPullBackup.mockReturnValue(Promise.resolve({
      ok: true, payload: { 'attune.profile': { name: 'x' } }, updatedAt: '2026-08-01T00:00:00.000Z',
    }) as unknown as Promise<unknown>);
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    const { default: SettingsPage } = await import('./page');
    render(<SettingsPage />);

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeTruthy());
    fireEvent.click(screen.getByText('Restore from backup'));

    await waitFor(() => expect(mockPullBackup).toHaveBeenCalled());
    expect(mockApplySnapshot).not.toHaveBeenCalled();
    expect(mockMarkReplaceAck).not.toHaveBeenCalled();
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

describe('SettingsPage — manual backup uses explicitReplace and resumes auto-backup (BRIEF-107)', () => {
  it('승인 없음 → 수동 백업 클릭 → explicitReplace 경로로 PUT 성공 → 그 sub로 승인 기록 → 일시중지 안내가 사라진다', async () => {
    mockGetSyncSession.mockReturnValue(Promise.resolve({ sub: 'settings-sub', user: { email: 'a@b.com' } } as never));
    mockPushBackup.mockImplementation((opts?: { explicitReplace?: boolean }) => {
      if (opts?.explicitReplace === true) ackedSub = 'settings-sub';
      return Promise.resolve({ ok: true, updatedAt: '2026-08-20T00:00:00.000Z' });
    });

    const { default: SettingsPage } = await import('./page');
    render(<SettingsPage />);

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeTruthy());
    // paused notice shows before any backup has been acked for this account
    expect(screen.getByText('Automatic backup is paused. Back up now to resume.')).toBeTruthy();

    fireEvent.click(screen.getByText('Back up now'));

    await waitFor(() => expect(mockPushBackup).toHaveBeenCalledWith({ explicitReplace: true }));
    await waitFor(() => expect(screen.queryByText('Automatic backup is paused. Back up now to resume.')).toBeNull());
  });
});
