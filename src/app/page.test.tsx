// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

// ScrollReveal (used throughout the landing page) reads this on mount; jsdom doesn't implement it.
window.matchMedia = window.matchMedia ?? ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

// Same for IntersectionObserver — jsdom has no real implementation.
class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
  (globalThis as unknown as { IntersectionObserver?: unknown }).IntersectionObserver ?? MockIntersectionObserver;

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('LandingPage — privacy box canonical copy (BRIEF-102B)', () => {
  it('shows the canonical paragraph byte-for-byte (including the space after the bolded sentence)', async () => {
    const { default: LandingPage } = await import('./page');
    const { container } = render(<LandingPage />);

    expect(container.textContent).toContain(
      "Your Attune data is stored on this phone unless you choose backup. Creating a reading sends your birth details and the details you enter about the other person through Attune's server to Google Gemini. No sign-up is needed. Sign in with Google to store an optional backup on Attune's server.",
    );
    expect(container.textContent).not.toContain('Your birth data stays on your phone.');
    expect(container.textContent).not.toContain('Delete everything in one tap.');
  });
});
