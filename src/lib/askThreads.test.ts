// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { loadAskThreads } from './askThreads';

afterEach(() => {
  localStorage.clear();
});

describe('loadAskThreads', () => {
  it('reads threads from the existing "attune.ask.threads" key, unchanged format', () => {
    const threads = {
      me: [{ id: 'u1', role: 'user', text: 'hi', createdAt: '2026-08-01T00:00:00.000Z' }],
      r1: [{ id: 'u2', role: 'user', text: 'hello', createdAt: '2026-08-02T00:00:00.000Z' }],
    };
    localStorage.setItem('attune.ask.threads', JSON.stringify(threads));

    expect(loadAskThreads()).toEqual(threads);
  });

  it('returns {} when nothing is stored', () => {
    expect(loadAskThreads()).toEqual({});
  });

  it('returns {} on corrupt JSON rather than throwing', () => {
    localStorage.setItem('attune.ask.threads', '{not json');
    expect(loadAskThreads()).toEqual({});
  });
});
