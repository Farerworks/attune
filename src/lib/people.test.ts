import { describe, it, expect } from 'vitest';
import { personKey, groupReadingsByPerson, collectPersonEvents, buildPeople } from './people';
import type { Reading } from './store';
import type { AskThreads } from './askThreads';

function makeReading(overrides: Partial<Reading> & { id: string }): Reading {
  return {
    name: 'Sam',
    date: '1988-03-02',
    relationship: 'Friend',
    situation: 'test situation',
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('groupReadingsByPerson', () => {
  it('same name + different birthDate -> two separate people (동명이인 분리)', () => {
    const readings = [
      makeReading({ id: 'r1', name: 'Sam', date: '1988-03-02' }),
      makeReading({ id: 'r2', name: 'Sam', date: '1990-01-01' }),
    ];
    const people = groupReadingsByPerson(readings);
    expect(people).toHaveLength(2);
  });

  it('same name + same birthDate + 2 readings -> one group (2리딩 1그룹)', () => {
    const readings = [
      makeReading({ id: 'r1', name: 'Sam', date: '1988-03-02', createdAt: '2026-08-01T00:00:00.000Z' }),
      makeReading({ id: 'r2', name: 'Sam', date: '1988-03-02', createdAt: '2026-08-03T00:00:00.000Z' }),
    ];
    const people = groupReadingsByPerson(readings);
    expect(people).toHaveLength(1);
    expect(people[0].readings).toHaveLength(2);
  });

  it('anchorReadingId and relationship come from the most recent reading, regardless of input order', () => {
    const readings = [
      makeReading({ id: 'old', createdAt: '2026-07-01T00:00:00.000Z', relationship: 'Friend' }),
      makeReading({ id: 'new', createdAt: '2026-08-01T00:00:00.000Z', relationship: 'Partner' }),
    ];
    const people = groupReadingsByPerson(readings);
    expect(people[0].anchorReadingId).toBe('new');
    expect(people[0].relationship).toBe('Partner');
  });

  it('startedAt is the earliest reading\'s createdAt', () => {
    const readings = [
      makeReading({ id: 'r1', createdAt: '2026-08-05T00:00:00.000Z' }),
      makeReading({ id: 'r2', createdAt: '2026-07-01T00:00:00.000Z' }),
    ];
    const people = groupReadingsByPerson(readings);
    expect(people[0].startedAt).toBe('2026-07-01T00:00:00.000Z');
  });

  it('carries day-pillar stem/branch hanja through from the newest reading\'s themChart', () => {
    const readings = [makeReading({
      id: 'r1',
      themChart: {
        dayMaster: { stem: 'Yang Fire', element: 'fire', polarity: 'Yang' },
        elements: { wood: 1, fire: 1, earth: 1, metal: 1, water: 1 },
        pillarsKnown: 8,
        pillars: {
          year: { stem: 'a', stemHanja: 'a', branch: 'b', branchHanja: 'b' },
          month: { stem: 'a', stemHanja: 'a', branch: 'b', branchHanja: 'b' },
          day: { stem: 'Yang Fire', stemHanja: '丙', branch: 'Horse', branchHanja: '午' },
          hour: null,
        },
      },
    })];
    const people = groupReadingsByPerson(readings);
    expect(people[0].stemHanja).toBe('丙');
    expect(people[0].branchHanja).toBe('午');
  });
});

describe('collectPersonEvents', () => {
  it('excludes user messages with no createdAt or an unparseable one (무시각 제외)', () => {
    const person = groupReadingsByPerson([makeReading({ id: 'r1' })])[0];
    const threads: AskThreads = {
      r1: [
        { id: 'a', role: 'user', text: 'no timestamp' },
        { id: 'b', role: 'user', text: 'bad timestamp', createdAt: 'not-a-date' },
        { id: 'c', role: 'user', text: 'valid', createdAt: '2026-08-02T00:00:00.000Z' },
      ],
    };
    const events = collectPersonEvents(person, threads);
    const askEvents = events.filter(e => e.type === 'ask');
    expect(askEvents).toHaveLength(1);
    expect(askEvents[0].text).toBe('valid');
  });

  it('descending order, and Ask events are per-reading (not merged across a person\'s readings)', () => {
    const readings = [
      makeReading({ id: 'r1', createdAt: '2026-08-01T00:00:00.000Z' }),
      makeReading({ id: 'r2', createdAt: '2026-08-03T00:00:00.000Z' }),
    ];
    const person = groupReadingsByPerson(readings)[0];
    const threads: AskThreads = {
      r1: [{ id: 'a', role: 'user', text: 'q about r1', createdAt: '2026-08-02T00:00:00.000Z' }],
      r2: [{ id: 'b', role: 'user', text: 'q about r2', createdAt: '2026-08-04T00:00:00.000Z' }],
    };
    const events = collectPersonEvents(person, threads);
    // 4 events total: 2 readings + 2 separate per-reading Ask events (not merged into 1).
    expect(events).toHaveLength(4);
    expect(events.filter(e => e.type === 'ask')).toHaveLength(2);
    // Strictly descending by `at`.
    for (let i = 1; i < events.length; i++) {
      expect(new Date(events[i - 1].at).getTime()).toBeGreaterThanOrEqual(new Date(events[i].at).getTime());
    }
    expect(events[0].text).toBe('q about r2'); // 08-04, the newest
  });

  it('takes only the latest valid user message per reading\'s thread, ignoring assistant messages', () => {
    const person = groupReadingsByPerson([makeReading({ id: 'r1' })])[0];
    const threads: AskThreads = {
      r1: [
        { id: 'a', role: 'user', text: 'first question', createdAt: '2026-08-01T00:00:00.000Z' },
        { id: 'b', role: 'assistant', mode: 'person', text: 'reply', createdAt: '2026-08-01T00:05:00.000Z' },
        { id: 'c', role: 'user', text: 'second question', createdAt: '2026-08-01T00:10:00.000Z' },
      ],
    };
    const events = collectPersonEvents(person, threads);
    const askEvents = events.filter(e => e.type === 'ask');
    expect(askEvents).toHaveLength(1);
    expect(askEvents[0].text).toBe('second question');
  });
});

describe('buildPeople', () => {
  it('latestExcerpt reflects the true latest event — a newer reading beats an older Ask', () => {
    const readings = [
      makeReading({
        id: 'r1', createdAt: '2026-08-05T00:00:00.000Z',
        briefing: { headline: 'newest reading headline' } as Reading['briefing'],
      }),
    ];
    const threads: AskThreads = {
      r1: [{ id: 'a', role: 'user', text: 'an older question', createdAt: '2026-08-01T00:00:00.000Z' }],
    };
    const [view] = buildPeople(readings, threads);
    expect(view.latestExcerpt).toBe('newest reading headline');
  });

  it('latestExcerpt reflects a newer Ask over an older reading', () => {
    const readings = [
      makeReading({
        id: 'r1', createdAt: '2026-08-01T00:00:00.000Z',
        briefing: { headline: 'older reading headline' } as Reading['briefing'],
      }),
    ];
    const threads: AskThreads = {
      r1: [{ id: 'a', role: 'user', text: 'a newer question', createdAt: '2026-08-05T00:00:00.000Z' }],
    };
    const [view] = buildPeople(readings, threads);
    expect(view.latestExcerpt).toBe('a newer question');
  });

  it('sorts by lastActiveAt: a person who read yesterday but just Ask\'d ranks above one who read today with no Ask activity', () => {
    const readings = [
      makeReading({ id: 'a-today', name: 'A', date: '1990-01-01', createdAt: '2026-08-06T09:00:00.000Z' }),
      makeReading({ id: 'b-yesterday', name: 'B', date: '1991-02-02', createdAt: '2026-08-05T09:00:00.000Z' }),
    ];
    const threads: AskThreads = {
      'b-yesterday': [{ id: 'q', role: 'user', text: 'just asked', createdAt: '2026-08-06T10:00:00.000Z' }],
    };
    const people = buildPeople(readings, threads);
    expect(people[0].name).toBe('B');
    expect(people[1].name).toBe('A');
  });
});
