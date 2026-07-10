// ── Ask quota & thread-storage constants ──────────────────────────────────────

export const DAILY_QUOTA_MAX  = 5;
export const LS_THREADS_KEY   = 'attune.ask.threads';
export const LS_QUOTA_KEY     = 'attune.ask.quota';

export interface QuotaStore {
  date: string; // YYYY-MM-DD
  used: number;
}

// ── Pure helpers (testable without DOM) ───────────────────────────────────────

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Returns remaining questions given stored quota and today's date string */
export function computeQuotaLeft(stored: QuotaStore | null, today: string): number {
  if (!stored || stored.date !== today) return DAILY_QUOTA_MAX;
  return Math.max(0, DAILY_QUOTA_MAX - stored.used);
}

// ── localStorage I/O ──────────────────────────────────────────────────────────

function loadRawQuota(): QuotaStore | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_QUOTA_KEY);
    return raw ? (JSON.parse(raw) as QuotaStore) : null;
  } catch { return null; }
}

function saveRawQuota(q: QuotaStore): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(LS_QUOTA_KEY, JSON.stringify(q)); } catch {}
}

/** Read remaining questions; resets quota if the calendar date has changed */
export function getQuotaLeft(): number {
  const today = todayStr();
  const stored = loadRawQuota();
  if (!stored || stored.date !== today) {
    saveRawQuota({ date: today, used: 0 });
    return DAILY_QUOTA_MAX;
  }
  return Math.max(0, DAILY_QUOTA_MAX - stored.used);
}

/** Increment used count after a successful API call. Returns new remaining count */
export function incrementQuotaUsed(): number {
  const today = todayStr();
  const stored = loadRawQuota();
  const current = (stored && stored.date === today) ? stored : { date: today, used: 0 };
  const next = { date: today, used: current.used + 1 };
  saveRawQuota(next);
  return Math.max(0, DAILY_QUOTA_MAX - next.used);
}

/** Wipe both ask-related keys (used in clearAllData) */
export function clearAskData(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(LS_QUOTA_KEY);
    localStorage.removeItem(LS_THREADS_KEY);
  } catch {}
}
