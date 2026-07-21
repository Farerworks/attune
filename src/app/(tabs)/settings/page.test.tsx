// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/lib/sync', () => ({
  getSyncSession: () => Promise.resolve(null),
  pushBackup: vi.fn(),
  pullBackup: vi.fn(),
  deleteBackup: vi.fn(),
  applySnapshot: vi.fn(),
  LS_LAST_BACKUP: 'attune.lastBackup',
}));

afterEach(cleanup);

describe('SettingsPage — version footer', () => {
  it('renders "Attune · dev" when NEXT_PUBLIC_COMMIT_SHA is unset (local dev)', async () => {
    const { default: SettingsPage } = await import('./page');
    render(<SettingsPage />);
    expect(screen.getByText('Attune · dev')).toBeTruthy();
  });
});
