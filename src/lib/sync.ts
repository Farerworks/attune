const SNAPSHOT_KEYS = ['attune.profile', 'attune.readings', 'attune.ask.threads', 'attune.ask.quota', 'attune.ask.memory'] as const;
export const LS_LAST_BACKUP = 'attune.sync.lastBackupAt';

export interface SyncSession { sub?: string; user?: { email?: string | null } }

// ── BRIEF-107 §1 — account-scoped "replace ack" ────────────────────────────────
// The server's PUT /sync is unconditional whole-object overwrite with no merge, history, or
// version check (confirmed by INQUIRY-SYNC-PUT). A device that has never confirmed it's safe to
// replace THIS account's server backup must not be allowed to push. The stored value is the
// approved session's `sub`, not a boolean — approving while signed in as account A must not carry
// over to account B on the same device (§1.0 point ①).
export const LS_REPLACE_ACK = 'attune.sync.replaceAck';

export function markReplaceAck(sub: string): void {
  try { localStorage.setItem(LS_REPLACE_ACK, sub); } catch {}
}

export function hasReplaceAck(sub: string): boolean {
  try { return localStorage.getItem(LS_REPLACE_ACK) === sub; } catch { return false; }
}

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
  | { ok: false; status: number; blocked?: true };

// BRIEF-107 §1.2 — the single write gate. Every PUT to /api/sync (AutoBackup's interval, the
// person-delete flow, and Settings' manual backup) goes through this one function, so gating here
// protects all three call sites — and any future one — without touching them individually.
// `explicitReplace: true` is reserved for Settings' manual "Back up now" button ONLY (§1.2 note) —
// it is the one place a user's own explicit tap justifies a first PUT with no prior ack.
//
// BRIEF-107-FIX §1.1 — fail-closed, not fail-open. The original condition only blocked when a
// session WAS obtained but lacked an ack; a transient `/api/auth/session` fetch failure made
// `session` null, which made the whole guard vacuously false and let the PUT through — right when
// the network is unreliable, exactly the moment this gate exists to protect. Now the gate requires
// an affirmatively confirmed session + ack (or the one explicit-replace exception) to PASS; anything
// else — no session, a failed session lookup, or a session with no ack — is blocked.
export async function pushBackup(opts?: { explicitReplace?: boolean }): Promise<PushResult> {
  const session = await getSyncSession();
  if (opts?.explicitReplace !== true && !(session?.sub && hasReplaceAck(session.sub))) {
    return { ok: false, status: 0, blocked: true };
  }
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
    if (opts?.explicitReplace === true && session?.sub) markReplaceAck(session.sub);
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

export async function deleteBackup(): Promise<boolean> {
  try {
    const res = await fetch('/api/sync', { method: 'DELETE' });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}
