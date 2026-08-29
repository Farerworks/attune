// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { computeQuotaLeft, DAILY_QUOTA_MAX, resetConversations, LS_THREADS_KEY, LS_MEMORY_KEY, LS_QUOTA_KEY } from './askQuota';
import type { QuotaStore } from './askQuota';

afterEach(() => {
  localStorage.clear();
});

describe('computeQuotaLeft', () => {
  it('returns DAILY_QUOTA_MAX when no stored quota', () => {
    expect(computeQuotaLeft(null, '2026-07-11')).toBe(DAILY_QUOTA_MAX);
  });

  it('returns DAILY_QUOTA_MAX when stored date differs (stale quota resets)', () => {
    const stale: QuotaStore = { date: '2026-07-10', used: 3 };
    expect(computeQuotaLeft(stale, '2026-07-11')).toBe(DAILY_QUOTA_MAX);
  });

  it('returns remaining count when date matches and quota partially used', () => {
    const stored: QuotaStore = { date: '2026-07-11', used: 2 };
    expect(computeQuotaLeft(stored, '2026-07-11')).toBe(DAILY_QUOTA_MAX - 2);
  });

  it('returns 0 when all questions used', () => {
    const stored: QuotaStore = { date: '2026-07-11', used: DAILY_QUOTA_MAX };
    expect(computeQuotaLeft(stored, '2026-07-11')).toBe(0);
  });

  it('never returns negative even if used exceeds max', () => {
    const stored: QuotaStore = { date: '2026-07-11', used: 99 };
    expect(computeQuotaLeft(stored, '2026-07-11')).toBe(0);
  });

  it('treats same date as same day regardless of used=0', () => {
    const stored: QuotaStore = { date: '2026-07-11', used: 0 };
    expect(computeQuotaLeft(stored, '2026-07-11')).toBe(DAILY_QUOTA_MAX);
  });
});

// BRIEF-112 §3 — Reset conversations deletes threads+memory only, keeping the daily quota so
// resetting can't be used to bypass the daily question cap.
describe('resetConversations (BRIEF-112 §3)', () => {
  it('deletes threads and memory, but preserves quota, readings, and profile', () => {
    localStorage.setItem(LS_THREADS_KEY, '{"me":[]}');
    localStorage.setItem(LS_MEMORY_KEY, '{"r1":["fact"]}');
    localStorage.setItem(LS_QUOTA_KEY, JSON.stringify({ date: '2026-08-29', used: 5 }));
    localStorage.setItem('attune.readings', '[{"id":"r1"}]');
    localStorage.setItem('attune.profile', '{"date":"1990-01-01"}');

    resetConversations();

    expect(localStorage.getItem(LS_THREADS_KEY)).toBeNull();
    expect(localStorage.getItem(LS_MEMORY_KEY)).toBeNull();
    expect(localStorage.getItem(LS_QUOTA_KEY)).toBe(JSON.stringify({ date: '2026-08-29', used: 5 }));
    expect(localStorage.getItem('attune.readings')).toBe('[{"id":"r1"}]');
    expect(localStorage.getItem('attune.profile')).toBe('{"date":"1990-01-01"}');
  });
});
