// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/new',
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('NewPage — send disclosure caption (BRIEF-102B)', () => {
  it('always shows the send-disclosure caption, mentioning Google Gemini', async () => {
    const { default: NewPage } = await import('./page');
    render(<NewPage />);

    const caption = screen.getByText(/When you tap Get my briefing/);
    expect(caption).toBeTruthy();
    expect(caption.textContent).toContain('Google Gemini');
  });
});
