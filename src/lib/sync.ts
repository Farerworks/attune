const SNAPSHOT_KEYS = ['attune.profile', 'attune.readings', 'attune.ask.threads', 'attune.ask.quota', 'attune.ask.memory'] as const;
export const LS_LAST_BACKUP = 'attune.sync.lastBackupAt';

export interface SyncSession { sub?: string; user?: { email?: string | null } }

export async function getSyncSession(): Promise<SyncSession | null> {
  try {
    const r = await fetch('/api/auth/session');
    if (!r.ok) return null;
    const s = (await r.json()) as SyncSession | null;
    return s && s.sub ? s : null;
  } catch { return null; }
}

export function collectSnapshot(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of SNAPSHOT_KEYS) {
    const raw = localStorage.getItem(k);
    if (raw !== null) { try { out[k] = JSON.parse(raw); } catch { /* skip corrupt */ } }
  }
  return out;
}

export function applySnapshot(payload: Record<string, unknown>): void {
  for (const k of SNAPSHOT_KEYS) {
    if (k in payload) { try { localStorage.setItem(k, JSON.stringify(payload[k])); } catch {} }
  }
}

// ── Server round-trips ─────────────────────────────────────────────────────────

export type PushResult =
  | { ok: true; updatedAt: string }
  | { ok: false; status: number };

export async function pushBackup(): Promise<PushResult> {
  try {
    const res = await fetch('/api/sync', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: collectSnapshot() }),
    });
    if (!res.ok) return { ok: false, status: res.status };
    const data = (await res.json().catch(() => ({}))) as { updatedAt?: string };
    const updatedAt = data.updatedAt ?? new Date().toISOString();
    try { localStorage.setItem(LS_LAST_BACKUP, updatedAt); } catch {}
    return { ok: true, updatedAt };
  } catch {
    return { ok: false, status: 0 };
  }
}

export type PullResult =
  | { ok: true; payload: Record<string, unknown>; updatedAt: string }
  | { ok: false; status: number }
  | null;

export async function pullBackup(): Promise<PullResult> {
  try {
    const res = await fetch('/api/sync');
    if (res.status === 404) return null;
    if (!res.ok) return { ok: false, status: res.status };
    const data = (await res.json().catch(() => null)) as { payload?: Record<string, unknown>; updatedAt?: string } | null;
    if (!data || !data.payload || !data.updatedAt) return { ok: false, status: res.status };
    return { ok: true, payload: data.payload, updatedAt: data.updatedAt };
  } catch {
    return { ok: false, status: 0 };
  }
}

export async function deleteBackup(): Promise<void> {
  try {
    await fetch('/api/sync', { method: 'DELETE' });
  } catch { /* ignore — never throws */ }
}
