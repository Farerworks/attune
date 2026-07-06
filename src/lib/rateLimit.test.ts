import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkRateLimit, _resetStore } from './rateLimit';

describe('checkRateLimit', () => {
  beforeEach(() => {
    _resetStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows the first 10 calls within the window', () => {
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit('ip-a', 10, 3_600_000).allowed).toBe(true);
    }
  });

  it('rejects the 11th call and returns retryAfterMs > 0', () => {
    for (let i = 0; i < 10; i++) checkRateLimit('ip-a', 10, 3_600_000);
    const result = checkRateLimit('ip-a', 10, 3_600_000);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('resets after the window expires', () => {
    for (let i = 0; i < 10; i++) checkRateLimit('ip-a', 10, 3_600_000);
    vi.advanceTimersByTime(3_600_001);
    expect(checkRateLimit('ip-a', 10, 3_600_000).allowed).toBe(true);
  });

  it('tracks different IPs independently', () => {
    for (let i = 0; i < 10; i++) checkRateLimit('ip-a', 10, 3_600_000);
    expect(checkRateLimit('ip-b', 10, 3_600_000).allowed).toBe(true);
  });
});
