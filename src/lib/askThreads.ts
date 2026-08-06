/**
 * Read adapter for Ask's localStorage thread data — storage key and format are unchanged
 * from what `ask/page.tsx` has always used. This module only reads; writing (`saveThreads`,
 * including the 40-message-per-thread cap) still lives in `ask/page.tsx` (BRIEF-097 §1).
 */

export interface AskUserMsg {
  id: string;
  role: 'user';
  text: string;
  createdAt?: string;
}

export interface AskAssistantMsg {
  id: string;
  role: 'assistant';
  mode: 'me' | 'person' | 'general';
  text?: string;
  parts?: Array<{ label: string; text: string }>;
  timing?: string;
  followUp?: string;
  createdAt?: string;
}

export type AskMessage = AskUserMsg | AskAssistantMsg;

/** Keyed by chip id — `'me'`, `'general'`, or a reading id. */
export type AskThreads = Record<string, AskMessage[]>;

const LS_THREADS = 'attune.ask.threads';

export function loadAskThreads(): AskThreads {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LS_THREADS);
    return raw ? (JSON.parse(raw) as AskThreads) : {};
  } catch {
    return {};
  }
}
