// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('OnboardingPage — "saved on this device" copy (BRIEF-102B)', () => {
  it('shows the trimmed sentence without the trailing "only"', async () => {
    const { default: OnboardingPage } = await import('./page');
    render(<OnboardingPage />);

    expect(screen.getByText(/saved on this device\./)).toBeTruthy();
    expect(screen.queryByText(/saved on this device only\./)).toBeNull();
  });
});
