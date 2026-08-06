// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { deletePersonData, getReadings } from './store';
import type { Reading } from './store';

afterEach(() => {
  localStorage.clear();
});

function reading(id: string, name: string): Reading {
  return {
    id, name, date: '1988-03-02', relationship: 'Friend',
    situation: 'x', createdAt: '2026-08-01T00:00:00.000Z',
  };
}

function seed() {
  localStorage.setItem('attune.profile', JSON.stringify({ date: '1990-01-01', createdAt: '2026-01-01T00:00:00.000Z' }));
  localStorage.setItem('attune.readings', JSON.stringify([
    reading('r1', 'Sam'), reading('r2', 'Sam'), reading('r3', 'Alex'),
  ]));
  localStorage.setItem('attune.ask.threads', JSON.stringify({
    me: [{ id: 'm1', role: 'user', text: 'me thread', createdAt: '2026-08-01T00:00:00.000Z' }],
    general: [{ id: 'g1', role: 'user', text: 'general thread', createdAt: '2026-08-01T00:00:00.000Z' }],
    r1: [{ id: 'a', role: 'user', text: 'about r1', createdAt: '2026-08-01T00:00:00.000Z' }],
    r2: [{ id: 'b', role: 'user', text: 'about r2', createdAt: '2026-08-01T00:00:00.000Z' }],
    r3: [{ id: 'c', role: 'user', text: 'about r3 (Alex)', createdAt: '2026-08-01T00:00:00.000Z' }],
  }));
  localStorage.setItem('attune.ask.memory', JSON.stringify({
    r1: ['fact about r1'],
    r2: ['fact about r2'],
    r3: ['fact about r3 (Alex)'],
  }));
  localStorage.setItem('attune.ask.quota', JSON.stringify({ date: '2026-08-06', used: 3 }));
}

describe('deletePersonData', () => {
  it('deletes all readings for the given ids (both of a 2-reading person)', () => {
    seed();
    const result = deletePersonData(['r1', 'r2']);
    expect(result.ok).toBe(true);
    expect(getReadings().map(r => r.id).sort()).toEqual(['r3']);
  });

  it("preserves another person's reading untouched", () => {
    seed();
    deletePersonData(['r1', 'r2']);
    const alex = getReadings().find(r => r.id === 'r3');
    expect(alex).toBeTruthy();
    expect(alex?.name).toBe('Alex');
  });

  it('removes the matching thread keys, reporting them in deletedThreads', () => {
    seed();
    const result = deletePersonData(['r1', 'r2']);
    expect(result.deletedThreads.sort()).toEqual(['r1', 'r2']);
    const threads = JSON.parse(localStorage.getItem('attune.ask.threads')!);
    expect(threads.r1).toBeUndefined();
    expect(threads.r2).toBeUndefined();
  });

  it('removes the matching memory keys, reporting them in deletedMemories', () => {
    seed();
    const result = deletePersonData(['r1', 'r2']);
    expect(result.deletedMemories.sort()).toEqual(['r1', 'r2']);
    const memory = JSON.parse(localStorage.getItem('attune.ask.memory')!);
    expect(memory.r1).toBeUndefined();
    expect(memory.r2).toBeUndefined();
  });

  it("preserves 'me'/'general' threads, the other person's thread+memory, quota, and profile", () => {
    seed();
    deletePersonData(['r1', 'r2']);

    const threads = JSON.parse(localStorage.getItem('attune.ask.threads')!);
    expect(threads.me).toBeTruthy();
    expect(threads.general).toBeTruthy();
    expect(threads.r3).toBeTruthy();

    const memory = JSON.parse(localStorage.getItem('attune.ask.memory')!);
    expect(memory.r3).toEqual(['fact about r3 (Alex)']);

    expect(JSON.parse(localStorage.getItem('attune.ask.quota')!)).toEqual({ date: '2026-08-06', used: 3 });
    expect(JSON.parse(localStorage.getItem('attune.profile')!).date).toBe('1990-01-01');
  });

  it('a local write failure returns ok:false with an error, and never silently swallows it (no safeSet)', () => {
    seed();
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string) {
      if (key === 'attune.readings') throw new Error('quota exceeded');
      return original.apply(this, arguments as unknown as [string, string]);
    };
    let result;
    try {
      result = deletePersonData(['r1', 'r2']);
    } finally {
      Storage.prototype.setItem = original;
    }
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('completes safely (ok: true, nothing deleted) when given ids that don\'t exist', () => {
    seed();
    const result = deletePersonData(['does-not-exist']);
    expect(result.ok).toBe(true);
    expect(result.deletedReadingIds).toEqual([]);
    expect(getReadings()).toHaveLength(3);
  });

  it('does not call the single-id deleteReading repeatedly — one readings write for the whole group', () => {
    seed();
    let writeCount = 0;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'attune.readings') writeCount++;
      return original.call(this, key, value);
    };
    try {
      deletePersonData(['r1', 'r2']);
    } finally {
      Storage.prototype.setItem = original;
    }
    expect(writeCount).toBe(1);
  });
});
