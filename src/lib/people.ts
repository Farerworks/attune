/**
 * Derived "person" grouping over the existing reading list — a temporary identity layer,
 * not a new data model (RELATION-MODEL v1.4 §2). Pure functions only: no localStorage access
 * here — callers pass in `readings`/`threads` already loaded (e.g. via getReadings()/loadAskThreads()).
 */

import type { Reading } from './store';
import type { AskThreads } from './askThreads';

// ── personKey ───────────────────────────────────────────────────────────────

/**
 * Internal grouping key only — never put this in a URL (name+birthdate would leak into
 * browser history/logs). Public links use `anchorReadingId` (an existing, opaque reading id).
 */
export function personKey(name: string | undefined, birthDate: string): string {
  const normalizedName = (name ?? '').trim().toLowerCase();
  return `${normalizedName}|${birthDate}`;
}

// ── groupReadingsByPerson ───────────────────────────────────────────────────

export interface Person {
  key: string;
  /** Most recent reading's id — the opaque, existing id used in URLs (never personKey). */
  anchorReadingId: string;
  name: string;
  birthDate: string;
  /** From the most recent reading — relationships can be re-labeled across readings. */
  relationship: string;
  element?: string;
  stem?: string;
  /** Day-pillar hanja, for reusing getIljuProfile() — already present on themChart, not derived. */
  stemHanja?: string;
  branchHanja?: string;
  /** Newest first. */
  readings: Reading[];
  /** Earliest reading's createdAt. */
  startedAt: string;
}

function readingTime(r: Reading): number {
  const t = new Date(r.createdAt).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function groupReadingsByPerson(readings: Reading[]): Person[] {
  const groups = new Map<string, Reading[]>();
  for (const r of readings) {
    const key = personKey(r.name, r.date);
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }

  const people: Person[] = [];
  for (const [key, list] of groups) {
    const sorted = [...list].sort((a, b) => readingTime(b) - readingTime(a));
    const newest = sorted[0];
    const oldest = sorted[sorted.length - 1];
    const day = newest.themChart?.pillars?.day;
    people.push({
      key,
      anchorReadingId: newest.id,
      name: newest.name ?? 'Unknown',
      birthDate: newest.date,
      relationship: newest.relationship,
      element: newest.themChart?.dayMaster?.element,
      stem: newest.themChart?.dayMaster?.stem,
      stemHanja: day?.stemHanja,
      branchHanja: day?.branchHanja,
      readings: sorted,
      startedAt: oldest.createdAt,
    });
  }
  return people;
}

// ── collectPersonEvents ─────────────────────────────────────────────────────

export type PersonEventType = 'reading' | 'ask';

export interface PersonEvent {
  type: PersonEventType;
  /** ISO timestamp — reading's createdAt, or the triggering Ask message's createdAt. */
  at: string;
  /** Which reading this event belongs to (a thread is keyed by reading id in AskThreads). */
  readingId: string;
  /** Reading: headline (or situation as fallback). Ask: the user's question text. */
  text: string;
}

/**
 * Descending (newest first). Ask events are per-reading, never merged across a person's
 * multiple readings — each reading's own thread contributes at most one Ask event: its
 * latest user message with a valid, parseable createdAt (messages without one — or with an
 * unparseable one — are excluded, not just from ordering but from lastActiveAt entirely,
 * since buildPeople derives lastActiveAt from these events' `at` values).
 */
export function collectPersonEvents(person: Person, threads: AskThreads): PersonEvent[] {
  const events: PersonEvent[] = [];

  for (const r of person.readings) {
    events.push({
      type: 'reading',
      at: r.createdAt,
      readingId: r.id,
      text: r.briefing?.headline ?? r.situation ?? '',
    });
  }

  for (const r of person.readings) {
    const thread = threads[r.id];
    if (!thread || thread.length === 0) continue;

    for (let i = thread.length - 1; i >= 0; i--) {
      const msg = thread[i];
      if (msg.role !== 'user' || !msg.createdAt) continue;
      const t = new Date(msg.createdAt).getTime();
      if (Number.isNaN(t)) continue;

      events.push({ type: 'ask', at: msg.createdAt, readingId: r.id, text: msg.text });
      break; // only this reading's single latest valid question
    }
  }

  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return events;
}

// ── buildPeople ──────────────────────────────────────────────────────────────

export interface PersonView extends Person {
  /** Descending; combines every reading's + every thread's events for this person. */
  events: PersonEvent[];
  /** events[0]'s timestamp, or the most recent reading's createdAt if there are no events. */
  lastActiveAt: string;
  /** events[0]'s text, if any. */
  latestExcerpt?: string;
}

/**
 * Orchestration (still pure — no storage access). This is the single source of truth for
 * sort order, excerpts, and hub metadata — grouping alone can't reflect Ask activity, so
 * People's list and the hub's summary must both read from here, not from groupReadingsByPerson
 * directly (RELATION-MODEL v1.4 §0).
 */
export function buildPeople(readings: Reading[], threads: AskThreads): PersonView[] {
  const people = groupReadingsByPerson(readings);
  const views = people.map((person): PersonView => {
    const events = collectPersonEvents(person, threads);
    const lastActiveAt = events[0]?.at ?? person.readings[0].createdAt;
    return {
      ...person,
      events,
      lastActiveAt,
      latestExcerpt: events[0]?.text,
    };
  });
  return views.sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime());
}
