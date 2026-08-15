// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockGetSyncSession = vi.fn();
const mockPullBackup = vi.fn();
const mockApplySnapshot = vi.fn();
const mockMarkReplaceAck = vi.fn();
const callOrder: string[] = [];

vi.mock('@/lib/sync', () => ({
  getSyncSession: () => mockGetSyncSession(),
  pullBackup: () => mockPullBackup(),
  applySnapshot: (payload: unknown) => { callOrder.push('applySnapshot'); mockApplySnapshot(payload); },
  markReplaceAck: (sub: string) => { callOrder.push('markReplaceAck'); mockMarkReplaceAck(sub); },
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mockGetSyncSession.mockReset();
  mockPullBackup.mockReset();
  mockApplySnapshot.mockReset();
  mockMarkReplaceAck.mockReset();
  callOrder.length = 0;
});

describe('RestoreFromBackup — BRIEF-107 §2', () => {
  it('pullBackup() → null(404) → "none" 뷰가 뜨고 그 sub로 승인이 기록된다', async () => {
    mockGetSyncSession.mockResolvedValue({ sub: 'sub-none', user: { email: 'a@b.com' } });
    mockPullBackup.mockResolvedValue(null);

    const { RestoreFromBackup } = await import('./RestoreFromBackup');
    render(<RestoreFromBackup />);

    await waitFor(() => expect(screen.getByText('No backup found')).toBeTruthy());
    expect(mockMarkReplaceAck).toHaveBeenCalledWith('sub-none');
    expect(screen.queryByText('Try again')).toBeNull();
  });

  it('pullBackup() → {ok:false} → "error" 뷰가 뜨고 승인은 기록되지 않는다', async () => {
    mockGetSyncSession.mockResolvedValue({ sub: 'sub-err' });
    mockPullBackup.mockResolvedValue({ ok: false, status: 500 });

    const { RestoreFromBackup } = await import('./RestoreFromBackup');
    render(<RestoreFromBackup />);

    await waitFor(() => expect(screen.getByText("Couldn't load your backup")).toBeTruthy());
    expect(screen.getByText("Your existing backup hasn't been restored.", { exact: false })).toBeTruthy();
    expect(mockMarkReplaceAck).not.toHaveBeenCalled();
  });

  it('"error" 뷰의 Try again은 pullBackup을 다시 부르고 UI가 사라지지 않는다', async () => {
    mockGetSyncSession.mockResolvedValue({ sub: 'sub-retry' });
    mockPullBackup.mockResolvedValueOnce({ ok: false, status: 500 });

    const { RestoreFromBackup } = await import('./RestoreFromBackup');
    render(<RestoreFromBackup />);

    await waitFor(() => expect(screen.getByText("Couldn't load your backup")).toBeTruthy());

    mockPullBackup.mockResolvedValueOnce({ ok: false, status: 500 });
    fireEvent.click(screen.getByText('Try again'));

    // still visible throughout — never falls back to null/hidden
    expect(screen.getByText("Couldn't load your backup")).toBeTruthy();
    await waitFor(() => expect(mockPullBackup).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Couldn't load your backup")).toBeTruthy();
  });

  it('Start fresh → 확인창 → Cancel → 배너로 복귀, 승인 기록 없음', async () => {
    mockGetSyncSession.mockResolvedValue({ sub: 'sub-cancel' });
    mockPullBackup.mockResolvedValue({ ok: true, payload: { 'attune.profile': {} }, updatedAt: '2026-08-01T00:00:00.000Z' });

    const { RestoreFromBackup } = await import('./RestoreFromBackup');
    render(<RestoreFromBackup />);

    await waitFor(() => expect(screen.getByText('Backup found')).toBeTruthy());
    fireEvent.click(screen.getByText('Start fresh'));

    await waitFor(() => expect(screen.getByText('Start fresh on this device?')).toBeTruthy());
    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => expect(screen.getByText('Backup found')).toBeTruthy());
    expect(mockMarkReplaceAck).not.toHaveBeenCalled();
  });

  it('Start fresh → 확인창 → Replace backup → 그 sub로 승인이 기록된다', async () => {
    mockGetSyncSession.mockResolvedValue({ sub: 'sub-replace' });
    mockPullBackup.mockResolvedValue({ ok: true, payload: { 'attune.profile': {} }, updatedAt: '2026-08-01T00:00:00.000Z' });

    const { RestoreFromBackup } = await import('./RestoreFromBackup');
    render(<RestoreFromBackup />);

    await waitFor(() => expect(screen.getByText('Backup found')).toBeTruthy());
    fireEvent.click(screen.getByText('Start fresh'));
    await waitFor(() => expect(screen.getByText('Replace backup')).toBeTruthy());
    fireEvent.click(screen.getByText('Replace backup'));

    expect(mockMarkReplaceAck).toHaveBeenCalledWith('sub-replace');
  });

  it('복원 성공: applySnapshot이 끝난 뒤에 승인이 기록된다 (순서 검증)', async () => {
    mockGetSyncSession.mockResolvedValue({ sub: 'sub-order' });
    mockPullBackup.mockResolvedValue({ ok: true, payload: { 'attune.profile': { a: 1 } }, updatedAt: '2026-08-01T00:00:00.000Z' });

    const { RestoreFromBackup } = await import('./RestoreFromBackup');
    render(<RestoreFromBackup />);

    await waitFor(() => expect(screen.getByText('Backup found')).toBeTruthy());
    fireEvent.click(screen.getByText('Restore'));

    await waitFor(() => expect(mockMarkReplaceAck).toHaveBeenCalledWith('sub-order'));
    expect(mockApplySnapshot).toHaveBeenCalledWith({ 'attune.profile': { a: 1 } });
    expect(callOrder).toEqual(['applySnapshot', 'markReplaceAck']);
  });
});
