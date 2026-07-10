import { describe, it, expect } from 'vitest';
import { computeQuotaLeft, DAILY_QUOTA_MAX } from './askQuota';
import type { QuotaStore } from './askQuota';

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
