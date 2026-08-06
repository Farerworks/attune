'use client';

import { useState, useEffect } from 'react';
import { LS_THREADS_KEY, LS_MEMORY_KEY } from './askQuota';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MyProfile {
  date: string;      // YYYY-MM-DD
  time?: string;     // HH:MM
  gender?: string;
  name?: string;
  createdAt?: string; // ISO
}

export interface DayMaster {
  stem: string;
  element: string;
  polarity: string;
}

export interface ChartSummary {
  dayMaster: DayMaster;
  elements: {
    wood: number;
    fire: number;
    earth: number;
    metal: number;
    water: number;
  };
  pillarsKnown: 6 | 8;
  pillars: {
    year:  { stem: string; stemHanja: string; branch: string; branchHanja: string };
    month: { stem: string; stemHanja: string; branch: string; branchHanja: string };
    day:   { stem: string; stemHanja: string; branch: string; branchHanja: string };
    hour:  { stem: string; stemHanja: string; branch: string; branchHanja: string } | null;
  };
}

export interface PlaybookItem {
  type: 'do' | 'dont';
  tip: string;
  why: string;
}

export interface BriefingData {
  headline: string;
  theirProfile: {
    personality:   { takeaway: string; detail: string };
    communication: { takeaway: string; detail: string };
    decisions:     { takeaway: string; detail: string };
    stress:        { takeaway: string; detail: string };
  };
  spectrums: {
    communication: number;
    decisions: number;
    pace: number;
    stress: number;
  };
  mySpectrums?: {
    communication: number;
    decisions: number;
    pace: number;
    stress: number;
  };
  dynamic: {
    resonance: 'strong-current' | 'mixed-signals' | 'slow-build';
    click: { takeaway: string; detail: string };
    clash: { takeaway: string; detail: string };
    watch: { takeaway: string; detail: string };
  };
  playbook: PlaybookItem[];
  starters?: string[];
}

export interface Reading {
  id: string;
  name?: string;
  date: string;       // YYYY-MM-DD
  time?: string;      // HH:MM
  relationship: string;
  situation: string;
  createdAt: string;  // ISO
  briefing?: BriefingData;
  myChart?: ChartSummary;
  themChart?: ChartSummary;
}

// ── Storage keys ──────────────────────────────────────────────────────────────

const PROFILE_KEY  = 'attune.profile';
const READINGS_KEY = 'attune.readings';

// ── Low-level helpers ─────────────────────────────────────────────────────────

function safeGet<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function safeSet(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota exceeded or private mode — fail silently
  }
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export function getProfile(): MyProfile | null {
  return safeGet<MyProfile | null>(PROFILE_KEY, null);
}

export function setProfile(profile: MyProfile): void {
  safeSet(PROFILE_KEY, profile);
}

export function getReadings(): Reading[] {
  return safeGet<Reading[]>(READINGS_KEY, []);
}

export function addReading(reading: Reading): void {
  const list = getReadings();
  list.unshift(reading); // newest first
  safeSet(READINGS_KEY, list);
}

export function getReading(id: string): Reading | null {
  return getReadings().find(r => r.id === id) ?? null;
}

/** Days since the earliest of profile.createdAt or any reading's createdAt (min 1). Shared by You tab + Home. */
export function getDaysIn(): number {
  const profile = getProfile();
  const readings = getReadings();
  const stamps = [profile?.createdAt, ...readings.map(r => r.createdAt)]
    .filter(Boolean)
    .map(s => new Date(s as string).getTime());
  return stamps.length ? Math.floor((Date.now() - Math.min(...stamps)) / 86400000) + 1 : 1;
}

export function deleteReading(id: string): void {
  safeSet(READINGS_KEY, getReadings().filter(r => r.id !== id));
}

export interface DeletePersonDataResult {
  ok: boolean;
  deletedReadingIds: string[];
  deletedThreads: string[];
  deletedMemories: string[];
  error?: string;
}

/**
 * Deletes every reading in `readingIds` — and that reading's Ask thread + relationship
 * memory — as one atomic group operation (BRIEF-098 §1). Does NOT call `deleteReading()`
 * in a loop (that would re-read/re-write the readings array once per id); reads each of
 * the three storage keys once, filters, writes once, then re-reads to verify the targets
 * are actually gone and nothing else moved. Uses direct localStorage calls (not `safeSet`,
 * which fails silently) — a delete that silently didn't happen is exactly the failure mode
 * the caller needs to know about.
 */
export function deletePersonData(readingIds: string[]): DeletePersonDataResult {
  if (typeof window === 'undefined') {
    return { ok: false, deletedReadingIds: [], deletedThreads: [], deletedMemories: [], error: 'no-window' };
  }

  try {
    const idSet = new Set(readingIds);

    const beforeReadings = getReadings();
    const remainingReadings = beforeReadings.filter(r => !idSet.has(r.id));
    localStorage.setItem(READINGS_KEY, JSON.stringify(remainingReadings));

    const threadsRaw = localStorage.getItem(LS_THREADS_KEY);
    const threads: Record<string, unknown> = threadsRaw ? JSON.parse(threadsRaw) : {};
    const deletedThreads: string[] = [];
    for (const id of readingIds) {
      if (Object.prototype.hasOwnProperty.call(threads, id)) {
        delete threads[id];
        deletedThreads.push(id);
      }
    }
    localStorage.setItem(LS_THREADS_KEY, JSON.stringify(threads));

    const memoryRaw = localStorage.getItem(LS_MEMORY_KEY);
    const memory: Record<string, unknown> = memoryRaw ? JSON.parse(memoryRaw) : {};
    const deletedMemories: string[] = [];
    for (const id of readingIds) {
      if (Object.prototype.hasOwnProperty.call(memory, id)) {
        delete memory[id];
        deletedMemories.push(id);
      }
    }
    localStorage.setItem(LS_MEMORY_KEY, JSON.stringify(memory));

    // Only ids that actually existed count as "deleted" — echoing back the whole input
    // regardless of whether it matched anything would be misleading.
    const deletedReadingIds = beforeReadings.filter(r => idSet.has(r.id)).map(r => r.id);

    // Verify: re-query — targets gone, everyone else's reading count intact.
    const afterReadings = getReadings();
    const stillPresent = readingIds.some(id => afterReadings.some(r => r.id === id));
    const expectedCount = beforeReadings.length - deletedReadingIds.length;
    if (stillPresent || afterReadings.length !== expectedCount) {
      return { ok: false, deletedReadingIds: [], deletedThreads: [], deletedMemories: [], error: 'verification-failed' };
    }

    return { ok: true, deletedReadingIds, deletedThreads, deletedMemories };
  } catch (err) {
    return {
      ok: false, deletedReadingIds: [], deletedThreads: [], deletedMemories: [],
      error: err instanceof Error ? err.message : 'unknown-error',
    };
  }
}

export function clearAllData(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(PROFILE_KEY);
  localStorage.removeItem(READINGS_KEY);
  localStorage.removeItem('attune.ask.threads');
  localStorage.removeItem('attune.ask.quota');
}

// ── React hooks ───────────────────────────────────────────────────────────────

export function useProfile(): [MyProfile | null, (p: MyProfile) => void] {
  const [profile, setState] = useState<MyProfile | null>(null);

  useEffect(() => {
    setState(getProfile());
  }, []);

  const update = (p: MyProfile) => {
    setProfile(p);
    setState(p);
  };

  return [profile, update];
}

export function useReadings(): [Reading[], (r: Reading) => void] {
  const [readings, setState] = useState<Reading[]>([]);

  useEffect(() => {
    setState(getReadings());
  }, []);

  const add = (r: Reading) => {
    addReading(r);
    setState(getReadings());
  };

  return [readings, add];
}

// ── Element color map (used by avatars, element bars, etc.) ──────────────────

export const ELEMENT_COLORS: Record<string, { fg: string; bg: string }> = {
  wood:  { fg: '#4E8A52', bg: '#E4EEE4' },
  fire:  { fg: '#C4502E', bg: '#F7E4DC' },
  earth: { fg: '#A8842C', bg: '#F2EAD3' },
  metal: { fg: '#6E7A80', bg: '#E7EBEC' },
  water: { fg: '#4A76AC', bg: '#E1EAF4' },
};
