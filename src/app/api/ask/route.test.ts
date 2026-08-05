import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rateLimit', () => ({
  checkRateLimit: () => ({ allowed: true, retryAfterMs: 0 }),
}));

const mockGenerateJsonChat = vi.fn();
vi.mock('@/lib/llm', () => ({
  createLlmProvider: () => ({
    generateJsonChat: (...args: unknown[]) => mockGenerateJsonChat(...args),
  }),
}));

const { buildAskTurns, buildAskSystem, hasTodayIntroduced, POST } = await import('./route');
const { calculateSaju, getDailyPillars, pillarLabel, friendlyPillarName } = await import('@/lib/saju');

function makeAskRequest(body: unknown): Request {
  return new Request('http://localhost/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

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

describe('buildAskSystem — TIMING & PREDICTION block (BRIEF-083)', () => {
  const meChart = calculateSaju({ date: '1990-06-15', time: '14:30' });
  const themChart = calculateSaju({ date: '1988-03-02', time: '09:00' });

  it('contains the new "TIMING & PREDICTION" structure for all 3 modes', () => {
    for (const mode of ['me', 'person', 'general'] as const) {
      const system = buildAskSystem(mode, meChart, mode === 'person' ? themChart : null, undefined, [], 'Alex', 'Sam');
      expect(system).toContain('TIMING & PREDICTION');
    }
  });

  it('no longer contains the old canned Korean refusal sentence, for all 3 modes', () => {
    for (const mode of ['me', 'person', 'general'] as const) {
      const system = buildAskSystem(mode, meChart, mode === 'person' ? themChart : null, undefined, [], 'Alex', 'Sam');
      expect(system).not.toContain('예/아니오로 답해 주는 질문은 아니에요');
    }
  });
});

describe('buildAskSystem — TODAY identity line (BRIEF-084)', () => {
  const meChart = calculateSaju({ date: '1990-06-15', time: '14:30' });
  const themChart = calculateSaju({ date: '1988-03-02', time: '09:00' });
  const daily = getDailyPillars('2026-07-22', 90); // 2026-07-22 = 丁酉일 (Yin Fire / Rooster)
  const todayDayLabel = pillarLabel(calculateSaju({ date: '2026-07-22' }).pillars.day); // 丁酉(정유)

  it('includes a TODAY line, and the day pillar matches dailyPillars[0], for all 3 modes', () => {
    for (const mode of ['me', 'person', 'general'] as const) {
      const system = buildAskSystem(mode, meChart, mode === 'person' ? themChart : null, undefined, daily, 'Alex', 'Sam');
      expect(system).toContain('TODAY');
      expect(system).toContain(todayDayLabel);
      expect(daily[0].stem).toBe('Yin Fire');
      expect(daily[0].branch).toBe('Rooster');
    }
  });
});

describe('buildAskSystem — TODAY-MENTION RESTRAINT (BRIEF-087)', () => {
  const meChart = calculateSaju({ date: '1990-06-15', time: '14:30' });
  const themChart = calculateSaju({ date: '1988-03-02', time: '09:00' });
  const daily = getDailyPillars('2026-07-22', 90);

  it('includes the TODAY-MENTION RESTRAINT block for all 3 modes', () => {
    for (const mode of ['me', 'person', 'general'] as const) {
      const system = buildAskSystem(mode, meChart, mode === 'person' ? themChart : null, undefined, daily, 'Alex', 'Sam');
      expect(system).toContain('TODAY-MENTION RESTRAINT');
    }
  });
});

describe('buildAskSystem — friendly day name + context-reference restraint (BRIEF-088)', () => {
  const meChart = calculateSaju({ date: '1990-06-15', time: '14:30' });
  const themChart = calculateSaju({ date: '1988-03-02', time: '09:00' });
  const daily = getDailyPillars('2026-07-22', 90); // 2026-07-22 = 丁酉일 -> Yin Fire / Rooster
  const todayPillar = calculateSaju({ date: '2026-07-22' }).pillars.day;
  const friendly = friendlyPillarName(todayPillar); // { en: 'Fire Rooster', ko: '불 닭' }

  it('TODAY line names the day pillar as 丁酉(정유) and the friendly handle as Fire Rooster (불 닭), for all 3 modes', () => {
    for (const mode of ['me', 'person', 'general'] as const) {
      const system = buildAskSystem(mode, meChart, mode === 'person' ? themChart : null, undefined, daily, 'Alex', 'Sam');
      expect(system).toContain('丁酉');
      expect(system).toContain('정유');
      expect(system).toContain(friendly.en); // "Fire Rooster"
      expect(system).toContain(friendly.ko); // "불 닭"
    }
  });

  it('includes the naming rule (use only TODAY names, first/after mention split) and the context-reference restraint', () => {
    for (const mode of ['me', 'person', 'general'] as const) {
      const system = buildAskSystem(mode, meChart, mode === 'person' ? themChart : null, undefined, daily, 'Alex', 'Sam');
      expect(system).toContain('Use ONLY the names given in TODAY');
      expect(system).toContain('FIRST mention of today');
      expect(system).toContain('never cold-open with the announcement again');
      expect(system).toContain('Two consecutive answers must never begin with the same sentence');
    }
  });
});

describe('hasTodayIntroduced (BRIEF-090)', () => {
  const names = ['乙巳', '을사', '나무 뱀', 'Wood Snake'];

  it('assistant message containing the hanja/ko combo -> true', () => {
    const history = [{ role: 'assistant' as const, text: '오늘은 을사일이라 차분한 하루예요.' }];
    expect(hasTodayIntroduced(history, names)).toBe(true);
  });

  it('user message containing the name (not assistant) -> false', () => {
    const history = [{ role: 'user' as const, text: '오늘 을사일이야?' }];
    expect(hasTodayIntroduced(history, names)).toBe(false);
  });

  it('no message contains any name -> false', () => {
    const history = [
      { role: 'user' as const, text: '안녕' },
      { role: 'assistant' as const, text: '반가워요' },
    ];
    expect(hasTodayIntroduced(history, names)).toBe(false);
  });

  it('assistant message containing only the friendly handle ("나무 뱀") -> true', () => {
    const history = [{ role: 'assistant' as const, text: '나무 뱀 기운이 도는 하루네요.' }];
    expect(hasTodayIntroduced(history, names)).toBe(true);
  });
});

describe('buildAskSystem — todayIntroduced branch (BRIEF-090)', () => {
  const meChart = calculateSaju({ date: '1990-06-15', time: '14:30' });
  const themChart = calculateSaju({ date: '1988-03-02', time: '09:00' });
  const daily = getDailyPillars('2026-07-22', 90);

  it('todayIntroduced=true -> "TODAY ALREADY INTRODUCED" present, FIRST-mention block absent (3 modes)', () => {
    for (const mode of ['me', 'person', 'general'] as const) {
      const system = buildAskSystem(mode, meChart, mode === 'person' ? themChart : null, undefined, daily, 'Alex', 'Sam', undefined, true);
      expect(system).toContain('TODAY ALREADY INTRODUCED');
      expect(system).not.toContain('FIRST mention of today');
    }
  });

  it('todayIntroduced=false -> FIRST-mention block present, "TODAY ALREADY INTRODUCED" absent (3 modes)', () => {
    for (const mode of ['me', 'person', 'general'] as const) {
      const system = buildAskSystem(mode, meChart, mode === 'person' ? themChart : null, undefined, daily, 'Alex', 'Sam', undefined, false);
      expect(system).toContain('FIRST mention of today');
      expect(system).not.toContain('TODAY ALREADY INTRODUCED');
    }
  });

  it('todayIntroduced omitted -> defaults to the FIRST-mention block (backward compatible, 3 modes)', () => {
    for (const mode of ['me', 'person', 'general'] as const) {
      const system = buildAskSystem(mode, meChart, mode === 'person' ? themChart : null, undefined, daily, 'Alex', 'Sam');
      expect(system).toContain('FIRST mention of today');
      expect(system).not.toContain('TODAY ALREADY INTRODUCED');
    }
  });
});

describe('buildAskSystem — Korean archetype name injection (BRIEF-090)', () => {
  const meChart = calculateSaju({ date: '1990-06-15', time: '14:30' });
  const themChart = calculateSaju({ date: '1988-03-02', time: '09:00' });
  const daily = getDailyPillars('2026-07-22', 90);

  it('chartBlock includes "(KO: ...)" next to ME ARCHETYPE (me mode)', () => {
    const system = buildAskSystem('me', meChart, null, undefined, daily, 'Alex');
    expect(system).toMatch(/ME ARCHETYPE: .+\(KO: .+\)/);
  });

  it('chartBlock includes "(KO: ...)" next to both ME and THEM ARCHETYPE (person mode)', () => {
    const system = buildAskSystem('person', meChart, themChart, undefined, daily, 'Alex', 'Sam');
    expect(system).toMatch(/ME ARCHETYPE: .+\(KO: .+\)/);
    expect(system).toMatch(/THEM ARCHETYPE: .+\(KO: .+\)/);
  });

  it('includes the Korean-archetype-naming rule', () => {
    const system = buildAskSystem('me', meChart, null, undefined, daily, 'Alex');
    expect(system).toContain('never mix the English archetype name into Korean prose');
  });
});

describe('buildAskSystem — SAFETY block (BRIEF-096)', () => {
  const meChart = calculateSaju({ date: '1990-06-15', time: '14:30' });

  it('includes the SAFETY instruction block, verbatim, for all 3 modes', () => {
    for (const mode of ['me', 'person', 'general'] as const) {
      const themChart = mode === 'person' ? calculateSaju({ date: '1988-03-02', time: '09:00' }) : null;
      const system = buildAskSystem(mode, meChart, themChart, undefined, []);
      expect(system).toContain(
        'SAFETY: You are not a crisis service. If the user mentions self-harm, suicide, or harming anyone, do not give relationship advice in that reply — acknowledge briefly; the app routes to human support. Never explain distress or danger through saju, elements, charts, or compatibility. Never tell someone to immediately break up; offer options, not verdicts.',
      );
    }
  });
});

describe('POST /api/ask — safety gate (BRIEF-096 §3)', () => {
  const baseBody = {
    mode: 'me' as const,
    me: { date: '1990-06-15', time: '14:30' },
    history: [],
  };

  it('trigger + no safetyAck -> no LLM call, returns { safety: category }', async () => {
    mockGenerateJsonChat.mockClear();

    const res = await POST(makeAskRequest({ ...baseBody, question: '나 진짜 죽고 싶어' }));
    const data = await res.json() as { safety?: string; answer?: unknown };

    expect(data.safety).toBe('self');
    expect(data.answer).toBeUndefined();
    expect(mockGenerateJsonChat).not.toHaveBeenCalled();
  });

  it('trigger + safetyAck:true -> gate is skipped, LLM is called normally', async () => {
    mockGenerateJsonChat.mockClear();
    mockGenerateJsonChat.mockResolvedValue(JSON.stringify({ text: 'a normal answer' }));

    const res = await POST(makeAskRequest({ ...baseBody, question: '나 진짜 죽고 싶어', safetyAck: true }));
    const data = await res.json() as { safety?: string; answer?: { text?: string } };

    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(1);
    expect(data.safety).toBeUndefined();
    expect(data.answer?.text).toBe('a normal answer');
  });

  it('no trigger -> proceeds normally regardless of safetyAck', async () => {
    mockGenerateJsonChat.mockClear();
    mockGenerateJsonChat.mockResolvedValue(JSON.stringify({ text: 'fine' }));

    const res = await POST(makeAskRequest({ ...baseBody, question: 'What should I focus on this week?' }));
    const data = await res.json() as { safety?: string; answer?: { text?: string } };

    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(1);
    expect(data.safety).toBeUndefined();
    expect(data.answer?.text).toBe('fine');
  });
});
