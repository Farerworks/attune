import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { buildAskTurns, buildAskSystem } = await import('./route');
const { calculateSaju } = await import('@/lib/saju');

function countMarkers(text: string): number {
  return (text.match(/\[new day — \d{4}-\d{2}-\d{2}\]\n/g) ?? []).length;
}

describe('buildAskTurns — date markers', () => {
  it('same-date history throughout -> zero markers', () => {
    const turns = buildAskTurns(
      [
        { role: 'user', text: 'hi', at: '2026-07-20' },
        { role: 'assistant', text: 'hello', at: '2026-07-20' },
      ],
      'next question',
      '2026-07-20',
    );
    const totalMarkers = turns.reduce((sum, t) => sum + countMarkers(t.text), 0);
    expect(totalMarkers).toBe(0);
  });

  it('a date change partway through history -> exactly one marker, on that turn', () => {
    const turns = buildAskTurns(
      [
        { role: 'user', text: 'hi', at: '2026-07-18' },
        { role: 'assistant', text: 'hello', at: '2026-07-18' },
        { role: 'user', text: 'follow up', at: '2026-07-19' },
        { role: 'assistant', text: 'answer', at: '2026-07-19' },
      ],
      'another question',
      '2026-07-19',
    );
    const totalMarkers = turns.reduce((sum, t) => sum + countMarkers(t.text), 0);
    expect(totalMarkers).toBe(1);

    const markedTurn = turns.find(t => t.text.includes('[new day — 2026-07-19]\n'));
    expect(markedTurn?.text.startsWith('[new day — 2026-07-19]\n')).toBe(true);
    expect(markedTurn?.text.endsWith('follow up')).toBe(true);
  });

  it('last history entry is yesterday, question is today -> marker on the question turn', () => {
    const turns = buildAskTurns(
      [
        { role: 'user', text: 'hi', at: '2026-07-19' },
        { role: 'assistant', text: 'hello', at: '2026-07-19' },
      ],
      'today question',
      '2026-07-20',
    );
    const last = turns[turns.length - 1];
    expect(last.text).toBe('[new day — 2026-07-20]\ntoday question');

    const historyMarkers = turns.slice(0, -1).reduce((sum, t) => sum + countMarkers(t.text), 0);
    expect(historyMarkers).toBe(0);
  });

  it('no `at` field anywhere (old client) -> zero markers, behavior unchanged', () => {
    const turns = buildAskTurns(
      [
        { role: 'user', text: 'hi' },
        { role: 'assistant', text: 'hello' },
      ],
      'question',
      '2026-07-20',
    );
    const totalMarkers = turns.reduce((sum, t) => sum + countMarkers(t.text), 0);
    expect(totalMarkers).toBe(0);
    expect(turns).toEqual([
      { role: 'user', text: 'hi' },
      { role: 'model', text: 'hello' },
      { role: 'user', text: 'question' },
    ]);
  });
});

describe('buildAskSystem — IDENTITY MENTIONS block', () => {
  const meChart = calculateSaju({ date: '1990-06-15', time: '14:30' });
  const themChart = calculateSaju({ date: '1988-03-02', time: '09:00' });

  it('is present for all 3 modes: me, person, general', () => {
    for (const mode of ['me', 'person', 'general'] as const) {
      const system = buildAskSystem(mode, meChart, mode === 'person' ? themChart : null, undefined, [], 'Alex', 'Sam');
      expect(system).toContain('IDENTITY MENTIONS — AVOID THE BROKEN RECORD');
    }
  });
});
