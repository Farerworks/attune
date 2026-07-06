interface Window {
  count: number;
  start: number;
}

const store = new Map<string, Window>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const win = store.get(key);

  if (!win || now - win.start >= windowMs) {
    store.set(key, { count: 1, start: now });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (win.count >= limit) {
    return { allowed: false, retryAfterMs: windowMs - (now - win.start) };
  }

  win.count++;
  return { allowed: true, retryAfterMs: 0 };
}

export function _resetStore(): void {
  store.clear();
}
