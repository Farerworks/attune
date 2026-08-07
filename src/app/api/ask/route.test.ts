import { describe, it, expect, vi } from 'vitest';
import type { TenStem, SajuChart } from '@/lib/saju';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rateLimit', () => ({
  checkRateLimit: () => ({ allowed: true, retryAfterMs: 0 }),
}));

const mockGenerateJsonChat = vi.fn();
const mockCreateLlmProvider = vi.fn(() => ({
  generateJsonChat: (...args: unknown[]) => mockGenerateJsonChat(...args),
}));
vi.mock('@/lib/llm', () => ({
  createLlmProvider: () => mockCreateLlmProvider(),
}));

const {
  buildAskTurns, buildAskSystem, hasTodayIntroduced, themNameCandidates, hasPersonIntroduced, POST,
  detectAskMode, detectContinuationHint, STRICT_SCRIPT_PATTERNS, VERDICT_PROBE_PATTERNS, CONTINUATION_HINT_PATTERNS,
  validateAskAnswer, UNDERSTAND_LABELS, DECIDE_LABELS,
} = await import('./route');
const { calculateSaju, getDailyPillars, pillarLabel, friendlyPillarName, STEM_NAMES } = await import('@/lib/saju');
const { ARCHETYPES, ARCHETYPE_LOCALE } = await import('@/lib/interpretGuide');

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

/** A minimal, valid SajuChart with an explicit day master — themNameCandidates only reads
 * `dayMaster`, so the other pillars just need to be well-typed, not calendar-accurate. */
function chartForStem(stem: TenStem): SajuChart {
  const { hanja, element } = STEM_NAMES[stem];
  const polarity = stem.startsWith('Yang') ? ('Yang' as const) : ('Yin' as const);
  const pillar = { stem, branch: 'Rat' as const, stemHanja: hanja, branchHanja: '子' };
  return {
    pillars: { year: pillar, month: pillar, day: pillar, hour: null },
    dayMaster: { stem, element, polarity },
    elements: { wood: 0, fire: 0, earth: 0, metal: 0, water: 0, [element]: 1 },
    pillarsKnown: 8,
  };
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

describe('buildAskSystem — IDENTITY MENTIONS block (me/general only — BRIEF-100 §3/§4 replaces it for person)', () => {
  const meChart = calculateSaju({ date: '1990-06-15', time: '14:30' });
  const themChart = calculateSaju({ date: '1988-03-02', time: '09:00' });

  it('is present for me and general modes', () => {
    for (const mode of ['me', 'general'] as const) {
      const system = buildAskSystem(mode, meChart, null, undefined, [], 'Alex', 'Sam');
      expect(system).toContain('IDENTITY MENTIONS — AVOID THE BROKEN RECORD');
    }
  });

  it('is absent for person mode — replaced by the IDENTITY state block', () => {
    const system = buildAskSystem('person', meChart, themChart, undefined, [], 'Alex', 'Sam');
    expect(system).not.toContain('IDENTITY MENTIONS — AVOID THE BROKEN RECORD');
    expect(system).toMatch(/IDENTITY — (NOT YET INTRODUCED|ALREADY INTRODUCED)/);
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

// ══════════════════════════════════════════════════════════════════════════
// BRIEF-100 v2 — Ask 연속 상담 품질 패치
// ══════════════════════════════════════════════════════════════════════════

describe('buildAskSystem — WHY label (BRIEF-100 §1)', () => {
  const meChart = calculateSaju({ date: '1990-06-15', time: '14:30' });
  const themChart = calculateSaju({ date: '1988-03-02', time: '09:00' });

  it('person outputSpec has the new WHY THIS MAY HAVE HAPPENED label, not the old WHY (FROM THE CHART)', () => {
    const system = buildAskSystem('person', meChart, themChart, undefined, []);
    expect(system).toContain('WHY THIS MAY HAVE HAPPENED');
    expect(system).not.toContain('WHY (FROM THE CHART)');
  });

  it('the other two understand-branch labels are unchanged', () => {
    const system = buildAskSystem('person', meChart, themChart, undefined, []);
    expect(system).toContain("WHAT'S LIKELY GOING ON");
    expect(system).toContain('WHAT YOU CAN DO');
  });

  it('the decide-branch labels are unchanged', () => {
    const system = buildAskSystem('person', meChart, themChart, undefined, []);
    expect(system).toContain('LIKELY RECEPTION');
    expect(system).toContain('WHAT COULD BACKFIRE');
    expect(system).toContain('HOW TO IMPROVE YOUR ODDS');
  });
});

describe('buildAskSystem — persona + PERSON_RULES 3/8/11 replaced (BRIEF-100 §3)', () => {
  const meChart = calculateSaju({ date: '1990-06-15', time: '14:30' });
  const themChart = calculateSaju({ date: '1988-03-02', time: '09:00' });

  it('person persona leads with facts/what-happened, chart as a supporting lens only', () => {
    const system = buildAskSystem('person', meChart, themChart, undefined, []);
    expect(system).toContain('Start from what the user has told you and what has actually happened between them');
    expect(system).toContain("use the chart as a supporting lens for personalization the facts alone can't give");
  });

  it('rule 3 grounds reads in what the user told you / what happened, chart only per BASIS PRIORITY', () => {
    const system = buildAskSystem('person', meChart, themChart, undefined, []);
    expect(system).toContain('Ground every read first in what the user told you and what has happened in this conversation');
  });

  it('rule 8 defers naming to the IDENTITY state block instead of a blanket ban', () => {
    const system = buildAskSystem('person', meChart, themChart, undefined, []);
    expect(system).toContain('governed by the IDENTITY state block');
  });

  it('rule 11 forbids re-explaining a trait even in new wording (stronger than the old "rephrase" allowance)', () => {
    const system = buildAskSystem('person', meChart, themChart, undefined, []);
    expect(system).toContain('Do not re-explain a chart-based trait you already explained — not even in new wording');
  });

  it('me mode persona and SELF_RULES are byte-unchanged (out of scope for this BRIEF)', () => {
    const system = buildAskSystem('me', meChart, null, undefined, []);
    expect(system).toContain('You are Attune, a Four Pillars self-awareness coach');
    expect(system).toContain('Do NOT recite archetype names or chart labels back');
  });
});

describe('buildAskSystem — BASIS PRIORITY + tone rules (BRIEF-100 §5/§6, person-only)', () => {
  const meChart = calculateSaju({ date: '1990-06-15', time: '14:30' });
  const themChart = calculateSaju({ date: '1988-03-02', time: '09:00' });

  it('person mode includes BASIS PRIORITY and all 3 tone blocks', () => {
    const system = buildAskSystem('person', meChart, themChart, undefined, []);
    expect(system).toContain('BASIS PRIORITY');
    expect(system).toContain('BALANCE: Explain both sides.');
    expect(system).toContain('NO CHARACTER VERDICTS');
    expect(system).toContain('SCRIPTS: Suggested lines');
  });

  it('me mode does not include BASIS PRIORITY or the tone blocks (person-only addition)', () => {
    const system = buildAskSystem('me', meChart, null, undefined, []);
    expect(system).not.toContain('BASIS PRIORITY');
    expect(system).not.toContain('NO CHARACTER VERDICTS');
    expect(system).not.toContain('SCRIPTS: Suggested lines');
  });
});

describe('buildAskSystem — IDENTITY state block, mutually exclusive (BRIEF-100 §4)', () => {
  const meChart = calculateSaju({ date: '1990-06-15', time: '14:30' });
  const themChart = calculateSaju({ date: '1988-03-02', time: '09:00' });

  it('personIntroduced=false -> NOT YET INTRODUCED present, ALREADY INTRODUCED absent', () => {
    const system = buildAskSystem('person', meChart, themChart, undefined, [], 'Alex', 'Sam', undefined, undefined, false);
    expect(system).toContain('IDENTITY — NOT YET INTRODUCED');
    expect(system).not.toContain('IDENTITY — ALREADY INTRODUCED');
  });

  it('personIntroduced=true -> ALREADY INTRODUCED present, NOT YET INTRODUCED absent', () => {
    const system = buildAskSystem('person', meChart, themChart, undefined, [], 'Alex', 'Sam', undefined, undefined, true);
    expect(system).toContain('IDENTITY — ALREADY INTRODUCED');
    expect(system).not.toContain('IDENTITY — NOT YET INTRODUCED');
  });

  it('personIntroduced omitted -> defaults to NOT YET INTRODUCED (positional backward compatibility)', () => {
    const system = buildAskSystem('person', meChart, themChart, undefined, [], 'Alex', 'Sam');
    expect(system).toContain('IDENTITY — NOT YET INTRODUCED');
    expect(system).not.toContain('IDENTITY — ALREADY INTRODUCED');
  });
});

describe('themNameCandidates — table-driven, all 10 day stems (BRIEF-100 §8/§12)', () => {
  const ELEMENT_HANJA: Record<string, string> = { wood: '木', fire: '火', earth: '土', metal: '金', water: '水' };
  const ELEMENT_KO_SINO: Record<string, string> = { wood: '목', fire: '화', earth: '토', metal: '금', water: '수' };
  const POLARITY_KO: Record<string, string> = { Yang: '양', Yin: '음' };

  const STEMS = Object.keys(STEM_NAMES) as TenStem[];

  it.each(STEMS)('%s: hanja pair + 독음 + 2 KO forms + EN stem + archetype EN/KO — and no bare 1-hanja/bare-element candidate', (stem) => {
    const candidates = themNameCandidates(chartForStem(stem));

    const { hanja, ko, element } = STEM_NAMES[stem];
    const elementHanja = ELEMENT_HANJA[element];
    const elementKo = ELEMENT_KO_SINO[element];
    const polarityKo = POLARITY_KO[stem.startsWith('Yang') ? 'Yang' : 'Yin'];
    const archetype = ARCHETYPES[stem];
    const archetypeKo = ARCHETYPE_LOCALE[stem].name_ko;

    expect(candidates).toContain(`${hanja}${elementHanja}`);
    expect(candidates).toContain(`${ko}${elementKo}`);
    expect(candidates).toContain(`${polarityKo} ${elementKo}`);
    expect(candidates).toContain(`${polarityKo}${elementKo}`);
    expect(candidates).toContain(stem);
    expect(candidates).toContain(archetype.name);
    expect(candidates).toContain(archetypeKo);

    // False-positive guard: no bare single-hanja, bare element hanja/reading, or "기운" phrasing.
    expect(candidates).not.toContain(hanja);
    expect(candidates).not.toContain(elementHanja);
    expect(candidates).not.toContain(elementKo);
    expect(candidates.some(c => c.includes('기운'))).toBe(false);
  });
});

describe('hasPersonIntroduced (BRIEF-100 §8)', () => {
  const candidates = themNameCandidates(chartForStem('Yang Wood')); // 甲木 / 갑목 / 양 목 / The First Light / 첫 새벽

  it('detects the hanja pair in an assistant message', () => {
    const history = [{ role: 'assistant' as const, text: '민수는 甲木 성향이라 직진형이에요.' }];
    expect(hasPersonIntroduced(history, candidates)).toBe(true);
  });

  it('detects the Korean archetype name', () => {
    const history = [{ role: 'assistant' as const, text: '첫 새벽 기질답게 먼저 움직이는 편이에요.' }];
    expect(hasPersonIntroduced(history, candidates)).toBe(true);
  });

  it('detects the EN stem', () => {
    const history = [{ role: 'assistant' as const, text: 'As a Yang Wood type, they tend to move first.' }];
    expect(hasPersonIntroduced(history, candidates)).toBe(true);
  });

  it('no candidate present -> false', () => {
    const history = [{ role: 'assistant' as const, text: '오늘 만난 얘기 들려주세요.' }];
    expect(hasPersonIntroduced(history, candidates)).toBe(false);
  });

  it('a user message containing a candidate does not count — assistant-only', () => {
    const history = [{ role: 'user' as const, text: '민수 甲木 맞아?' }];
    expect(hasPersonIntroduced(history, candidates)).toBe(false);
  });

  it('matching is case/whitespace-insensitive (NFKC + lowercase + collapsed spaces)', () => {
    const history = [{ role: 'assistant' as const, text: "They're  a   YANG   WOOD   type." }];
    expect(hasPersonIntroduced(history, candidates)).toBe(true);
  });
});

describe('POST /api/ask — history window up to 20 (BRIEF-100 §2 P0-1)', () => {
  const baseBody = { mode: 'me' as const, me: { date: '1990-06-15', time: '14:30' } };
  function historyOf(n: number) {
    return Array.from({ length: n }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      text: `msg ${i}`,
    }));
  }

  it('history of exactly 20 -> accepted (no 400, LLM called)', async () => {
    mockGenerateJsonChat.mockClear();
    mockGenerateJsonChat.mockResolvedValue(JSON.stringify({ text: 'ok' }));
    const res = await POST(makeAskRequest({ ...baseBody, history: historyOf(20), question: 'hi' }));
    expect(res.status).not.toBe(400);
    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(1);
  });

  it('history of 21 -> rejected with 400 Invalid request, no LLM call', async () => {
    mockGenerateJsonChat.mockClear();
    const res = await POST(makeAskRequest({ ...baseBody, history: historyOf(21), question: 'hi' }));
    const data = await res.json() as { error?: string };
    expect(res.status).toBe(400);
    expect(data.error).toBe('Invalid request');
    expect(mockGenerateJsonChat).not.toHaveBeenCalled();
  });
});

describe('POST /api/ask — IDENTITY state wiring (BRIEF-100 §9 P0-5)', () => {
  const themInput = { date: '1988-03-02', time: '09:00', name: 'Sam' };
  const [hanjaPairCandidate] = themNameCandidates(calculateSaju(themInput));
  const baseBody = {
    mode: 'person' as const,
    me: { date: '1990-06-15', time: '14:30' },
    them: themInput,
  };

  it('no prior mention of Sam\'s identity -> system prompt has NOT YET INTRODUCED, not ALREADY INTRODUCED', async () => {
    mockGenerateJsonChat.mockClear();
    mockGenerateJsonChat.mockResolvedValue(JSON.stringify({ text: 'ok' }));

    await POST(makeAskRequest({ ...baseBody, history: [], question: 'How does Sam feel about this?' }));

    const [system] = mockGenerateJsonChat.mock.calls[0] as [string];
    expect(system).toContain('IDENTITY — NOT YET INTRODUCED');
    expect(system).not.toContain('IDENTITY — ALREADY INTRODUCED');
  });

  it('assistant already named Sam\'s identity earlier -> system prompt has ALREADY INTRODUCED, not NOT YET INTRODUCED', async () => {
    mockGenerateJsonChat.mockClear();
    mockGenerateJsonChat.mockResolvedValue(JSON.stringify({ text: 'ok' }));

    const history = [
      { role: 'user' as const, text: 'Sam은 어떤 사람이야?' },
      { role: 'assistant' as const, text: `Sam은 ${hanjaPairCandidate}라 직진형이에요.` },
    ];
    await POST(makeAskRequest({ ...baseBody, history, question: '더 얘기해줘' }));

    const [system] = mockGenerateJsonChat.mock.calls[0] as [string];
    expect(system).toContain('IDENTITY — ALREADY INTRODUCED');
    expect(system).not.toContain('IDENTITY — NOT YET INTRODUCED');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// BRIEF-100B v3 — Ask 응답 검증·회복 파이프라인
// ══════════════════════════════════════════════════════════════════════════

describe('detectAskMode (BRIEF-100B §3)', () => {
  it.each([
    '문장 두 개 써줘', '문장 3개 만들어줘', '3문장 써줘', '두문장만 뽑아줘',
    '멘트 두 개 줘', 'write me 3 lines', 'give 2 sentences', 'draft 3 messages', 'exactly 2 lines please',
  ])('strict_script positive: %s', (text) => {
    expect(detectAskMode(text)).toBe('strict_script');
  });

  it.each([
    '뭐라고 답할까?', '보낼 문장 써줘', '선물 두 개 중 뭐가 나아', '어떻게 말하지?', '조언 좀 해줘',
  ])('strict_script negative (no explicit count near 문장/멘트) -> null: %s', (text) => {
    expect(detectAskMode(text)).not.toBe('strict_script');
  });

  it.each([
    '쟤 원래 그런 성격이야?', '원래 그래?', '항상 그래', '원래 회피형이야?',
    'is he always like that', 'just how he is',
  ])('verdict_probe positive: %s', (text) => {
    expect(detectAskMode(text)).toBe('verdict_probe');
  });

  it.each([
    '성격이 어때?', '오늘 뭐해?',
  ])('verdict_probe negative -> null: %s', (text) => {
    expect(detectAskMode(text)).toBeNull();
  });

  it('strict_script is checked before verdict_probe (no realistic overlap, but priority is deterministic)', () => {
    for (const p of STRICT_SCRIPT_PATTERNS) expect(p).toBeInstanceOf(RegExp);
    for (const p of VERDICT_PROBE_PATTERNS) expect(p).toBeInstanceOf(RegExp);
  });
});

describe('detectContinuationHint (BRIEF-100B §3)', () => {
  it.each([
    '그래서 내가 이렇게 말했어', '그러자 지현이가 화를 냈어', '아니, 사실은 내가 먼저 그랬어',
  ])('positive: %s', (text) => {
    expect(detectContinuationHint(text)).toBe(true);
  });

  it('negative on an unrelated fresh question', () => {
    expect(detectContinuationHint('오늘 소개팅 어때?')).toBe(false);
  });

  it('CONTINUATION_HINT_PATTERNS is exported for direct comparison', () => {
    expect(CONTINUATION_HINT_PATTERNS.length).toBeGreaterThanOrEqual(3);
  });
});

describe('validateAskAnswer (BRIEF-100B §6/§7)', () => {
  const baseCtx: { askMode: 'strict_script' | 'verdict_probe' | null; personIntroduced: boolean; candidates: string[]; latestUserText: string } =
    { askMode: null, personIntroduced: false, candidates: [], latestUserText: '' };

  it('a normal UNDERSTAND-set answer, in order -> no violations', () => {
    const answer = { parts: UNDERSTAND_LABELS.map(label => ({ label, text: 'x' })) };
    expect(validateAskAnswer(answer, baseCtx)).toEqual([]);
  });

  it('a normal DECIDE-set answer, in order -> no violations', () => {
    const answer = { parts: DECIDE_LABELS.map(label => ({ label, text: 'x' })) };
    expect(validateAskAnswer(answer, baseCtx)).toEqual([]);
  });

  it('mixed labels (2 UNDERSTAND + 1 DECIDE) -> label_set violation', () => {
    const answer = { parts: [
      { label: UNDERSTAND_LABELS[0], text: 'x' },
      { label: UNDERSTAND_LABELS[1], text: 'x' },
      { label: DECIDE_LABELS[0], text: 'x' },
    ] };
    const violations = validateAskAnswer(answer, baseCtx);
    expect(violations.some(v => v.type === 'label_set')).toBe(true);
  });

  it('correct set, wrong order -> label_order violation (route fixes this in place — see pipeline tests)', () => {
    const shuffled = [UNDERSTAND_LABELS[2], UNDERSTAND_LABELS[0], UNDERSTAND_LABELS[1]];
    const answer = { parts: shuffled.map(label => ({ label, text: 'x' })) };
    const violations = validateAskAnswer(answer, baseCtx);
    expect(violations).toEqual([{ type: 'label_order' }]);
  });

  it('strict_script askMode but the answer has parts -> strict_script_parts violation', () => {
    const answer = { parts: UNDERSTAND_LABELS.map(label => ({ label, text: 'x' })) };
    const violations = validateAskAnswer(answer, { ...baseCtx, askMode: 'strict_script' });
    expect(violations.some(v => v.type === 'strict_script_parts')).toBe(true);
  });

  it('strict_script askMode with a plain {text} answer -> no strict_script_parts violation', () => {
    const answer = { text: 'here are your lines' };
    const violations = validateAskAnswer(answer, { ...baseCtx, askMode: 'strict_script' });
    expect(violations.some(v => v.type === 'strict_script_parts')).toBe(false);
  });

  it('ALREADY + candidate present in the answer -> reintroduction violation', () => {
    const answer = { text: '민수는 첫 새벽이라 그래요' };
    const violations = validateAskAnswer(answer, { ...baseCtx, personIntroduced: true, candidates: ['첫 새벽'] });
    expect(violations.some(v => v.type === 'reintroduction')).toBe(true);
  });

  it('ALREADY + candidate appears ONLY in the user\'s latest message -> exempt, no violation', () => {
    const answer = { text: '네, 그런 편이에요' };
    const violations = validateAskAnswer(answer, {
      ...baseCtx, personIntroduced: true, candidates: ['첫 새벽'], latestUserText: '첫 새벽이라 그런 거야?',
    });
    expect(violations.some(v => v.type === 'reintroduction')).toBe(false);
  });

  it('NOT-YET (personIntroduced: false) -> reintroduction never checked, even if the candidate is present', () => {
    const answer = { text: '민수는 첫 새벽이라 그래요' };
    const violations = validateAskAnswer(answer, { ...baseCtx, personIntroduced: false, candidates: ['첫 새벽'] });
    expect(violations.some(v => v.type === 'reintroduction')).toBe(false);
  });

  it('verdict_probe + answer opening with "네," -> verdict_opening violation', () => {
    const answer = { text: '네, 맞아요. 항상 그래요.' };
    const violations = validateAskAnswer(answer, { ...baseCtx, askMode: 'verdict_probe' });
    expect(violations.some(v => v.type === 'verdict_opening')).toBe(true);
  });

  it('verdict_probe + a hedged, non-affirming opening -> no verdict_opening violation', () => {
    const answer = { text: '한두 번으로는 단정하기 어려워요. 이런 상황일 수도 있고, 저런 상황일 수도 있어요.' };
    const violations = validateAskAnswer(answer, { ...baseCtx, askMode: 'verdict_probe' });
    expect(violations.some(v => v.type === 'verdict_opening')).toBe(false);
  });
});

describe('buildAskSystem — §4 state blocks (added only when detected)', () => {
  const meChart = calculateSaju({ date: '1990-06-15', time: '14:30' });
  const themChart = calculateSaju({ date: '1988-03-02', time: '09:00' });

  it('askMode="strict_script" -> the SCRIPT REQUEST block is present', () => {
    const system = buildAskSystem('person', meChart, themChart, undefined, [], 'Alex', 'Sam', undefined, false, false, 'strict_script', false);
    expect(system).toContain('SCRIPT REQUEST');
    expect(system).not.toContain('CHARACTER QUESTION');
  });

  it('askMode="verdict_probe" -> the CHARACTER QUESTION block is present', () => {
    const system = buildAskSystem('person', meChart, themChart, undefined, [], 'Alex', 'Sam', undefined, false, false, 'verdict_probe', false);
    expect(system).toContain('CHARACTER QUESTION');
    expect(system).not.toContain('SCRIPT REQUEST');
  });

  it('continuationHint=true -> the CONTINUATION HINT block is present', () => {
    const system = buildAskSystem('person', meChart, themChart, undefined, [], 'Alex', 'Sam', undefined, false, false, null, true);
    expect(system).toContain('CONTINUATION HINT');
  });

  it('askMode=null, continuationHint=false -> none of the 3 blocks are present', () => {
    const system = buildAskSystem('person', meChart, themChart, undefined, [], 'Alex', 'Sam', undefined, false, false, null, false);
    expect(system).not.toContain('SCRIPT REQUEST');
    expect(system).not.toContain('CHARACTER QUESTION');
    expect(system).not.toContain('CONTINUATION HINT');
  });

  it('state blocks are detected for me and general modes too (BRIEF-100B §1: "모든 person/me/general" 요청)', () => {
    for (const mode of ['me', 'general'] as const) {
      const system = buildAskSystem(mode, meChart, null, undefined, [], 'Alex', undefined, undefined, false, undefined, 'strict_script', false);
      expect(system).toContain('SCRIPT REQUEST');
    }
  });
});

describe('buildAskSystem — §5 ALREADY-state reintroduction-bait projection', () => {
  // Different day masters for ME/THEM on purpose, so ME's own chart material can never
  // coincidentally match a THEM candidate (isolates the exception-table row 1 case).
  const meChart = calculateSaju({ date: '1990-06-15', time: '14:30' });   // Yin Metal
  const themChart = calculateSaju({ date: '1988-03-02', time: '09:00' }); // some other stem
  const candidates = themNameCandidates(themChart);

  function themPartOnly(system: string): string {
    const start = system.indexOf('=== THEM');
    const end = system.indexOf('DAILY PILLARS —');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return system.slice(start, end);
  }

  it('① ALREADY: none of the candidate strings appear in the THEM part of the assembled prompt', () => {
    const system = buildAskSystem('person', meChart, themChart, undefined, [], 'Alex', 'Sam', undefined, false, true);
    const scope = themPartOnly(system);
    for (const c of candidates) expect(scope).not.toContain(c);
  });

  it('② NOT-YET: the THEM part keeps naming the archetype as before (no withholding)', () => {
    const system = buildAskSystem('person', meChart, themChart, undefined, [], 'Alex', 'Sam', undefined, false, false);
    const scope = themPartOnly(system);
    const themArch = ARCHETYPES[themChart.dayMaster.stem];
    expect(scope).toContain(`THEM ARCHETYPE: ${themArch.name}`);
  });

  it('③ me/general system prompts are byte-identical to their pre-BRIEF-100B assembly (personIntroduced is person-only, so this never triggers there)', () => {
    const daily = getDailyPillars('2026-08-06', 90);
    const meSystemNoNewParams = buildAskSystem('me', meChart, null, undefined, daily, 'Alex');
    const meSystemWithDefaults = buildAskSystem('me', meChart, null, undefined, daily, 'Alex', undefined, undefined, undefined, undefined, null, false);
    expect(meSystemWithDefaults).toBe(meSystemNoNewParams);

    const generalSystemNoNewParams = buildAskSystem('general', meChart, null, undefined, daily);
    const generalSystemWithDefaults = buildAskSystem('general', meChart, null, undefined, daily, undefined, undefined, undefined, undefined, undefined, null, false);
    expect(generalSystemWithDefaults).toBe(generalSystemNoNewParams);
  });

  it('④ TODAY / SAFETY / PREDICTION block text is unchanged by ALREADY-state projection', () => {
    const daily = getDailyPillars('2026-08-06', 90);
    const notIntroduced = buildAskSystem('person', meChart, themChart, undefined, daily, 'Alex', 'Sam', undefined, false, false);
    const introduced = buildAskSystem('person', meChart, themChart, undefined, daily, 'Alex', 'Sam', undefined, false, true);
    for (const marker of ['TODAY —', 'SAFETY: You are not a crisis service', 'TIMING & PREDICTION QUESTIONS']) {
      expect(notIntroduced).toContain(marker);
      expect(introduced).toContain(marker);
    }
  });

  it('⑤ buildAskTurns still passes history through untransformed/undeleted regardless of personIntroduced (history shaping is a route-level concern, not buildAskSystem\'s)', () => {
    const history = [
      { role: 'user' as const, text: 'hi', at: '2026-08-01' },
      { role: 'assistant' as const, text: 'hello', at: '2026-08-01' },
    ];
    const turns = buildAskTurns(history, 'next question', '2026-08-01');
    expect(turns).toEqual([
      { role: 'user', text: 'hi' },
      { role: 'model', text: 'hello' },
      { role: 'user', text: 'next question' },
    ]);
  });

  it('known limitation (documented): the 90-day DAILY PILLARS calendar table can coincidentally contain the candidate\'s bare EN stem name — this is expected and out of §5\'s scope (timing data, not identity material)', () => {
    const daily = getDailyPillars('2026-08-07', 90);
    const system = buildAskSystem('person', meChart, themChart, undefined, daily, 'Alex', 'Sam', undefined, false, true);
    const dailyPillarsSection = system.slice(system.indexOf('DAILY PILLARS —'), system.indexOf('RULES (non-negotiable)'));
    // themChart's EN stem (e.g. "Yang Fire") is expected to reappear here purely by calendar
    // coincidence roughly every 10 days across a 90-day window — not a §5 regression.
    expect(dailyPillarsSection.includes(themChart.dayMaster.stem)).toBe(true);
  });
});

describe('buildAskSystem — §8 prompt additions (1 sentence each, no replacement)', () => {
  const meChart = calculateSaju({ date: '1990-06-15', time: '14:30' });
  const themChart = calculateSaju({ date: '1988-03-02', time: '09:00' });

  it('BASIS PRIORITY gets the new "no concrete facts yet" sentence (person mode)', () => {
    const system = buildAskSystem('person', meChart, themChart, undefined, []);
    expect(system).toContain('When the user has given you no concrete facts yet, say so briefly and offer possibilities — do not let the chart fill the gap as if it were evidence.');
  });

  it('KOREAN VOICE gets item 8 (honorific mirroring) in person mode only', () => {
    const personSystem = buildAskSystem('person', meChart, themChart, undefined, []);
    expect(personSystem).toContain('8) Mirror the user\'s way of naming the other person');

    const meSystem = buildAskSystem('me', meChart, null, undefined, []);
    expect(meSystem).not.toContain('Mirror the user\'s way of naming the other person');
  });
});

describe('POST /api/ask — pipeline (BRIEF-100B §1/§2/§9)', () => {
  const themInput = { date: '1988-03-02', time: '09:00', name: 'Sam' };
  const personBaseBody = {
    mode: 'person' as const,
    me: { date: '1990-06-15', time: '14:30' },
    them: themInput,
  };
  const meBaseBody = {
    mode: 'me' as const,
    me: { date: '1990-06-15', time: '14:30' },
    history: [] as unknown[],
  };
  const [hanjaCandidate] = themNameCandidates(calculateSaju(themInput));

  const understandCard = (opts: { withCandidate?: boolean } = {}) => JSON.stringify({
    parts: UNDERSTAND_LABELS.map((label, i) => ({
      label, text: i === 0 && opts.withCandidate ? `${hanjaCandidate}라 그런 편이에요.` : 'A short specific read.',
    })),
  });
  const mixedLabelCard = () => JSON.stringify({
    parts: [
      { label: UNDERSTAND_LABELS[0], text: 'x' },
      { label: UNDERSTAND_LABELS[1], text: 'y' },
      { label: DECIDE_LABELS[0], text: 'z' },
    ],
  });

  it('① ALREADY + reintroduction in the 1st output -> rejected, correction prompt names the specific violation', async () => {
    mockGenerateJsonChat.mockClear();
    mockGenerateJsonChat
      .mockResolvedValueOnce(understandCard({ withCandidate: true }))
      .mockResolvedValueOnce(understandCard());

    const history = [
      { role: 'user' as const, text: 'Sam은 어떤 사람이야?' },
      { role: 'assistant' as const, text: `Sam은 ${hanjaCandidate}라 직진형이에요.` },
    ];
    const res = await POST(makeAskRequest({ ...personBaseBody, history, question: '더 얘기해줘' }));
    const data = await res.json() as { answer?: unknown };

    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(2);
    const correctionTurns = mockGenerateJsonChat.mock.calls[1][1] as Array<{ role: string; text: string }>;
    const correctionMsg = correctionTurns[correctionTurns.length - 1].text;
    expect(correctionMsg).toContain('REINTRODUCTION VIOLATION');
    expect(correctionMsg).toContain(hanjaCandidate);
    expect(data.answer).toBeTruthy();
  });

  it('② mixed labels -> rejected, one correction regeneration', async () => {
    mockGenerateJsonChat.mockClear();
    mockGenerateJsonChat
      .mockResolvedValueOnce(mixedLabelCard())
      .mockResolvedValueOnce(understandCard());

    const res = await POST(makeAskRequest({ ...personBaseBody, history: [], question: 'How does Sam feel about this?' }));
    const data = await res.json() as { answer?: { parts?: Array<{ label: string }> } };

    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(2);
    const correctionTurns = mockGenerateJsonChat.mock.calls[1][1] as Array<{ role: string; text: string }>;
    expect(correctionTurns[correctionTurns.length - 1].text).toContain('LABEL SET VIOLATION');
    expect(data.answer?.parts?.map(p => p.label)).toEqual([...UNDERSTAND_LABELS]);
  });

  it('③ strict_script question but the model answers with a labeled card -> rejected, one correction regeneration', async () => {
    mockGenerateJsonChat.mockClear();
    mockGenerateJsonChat
      .mockResolvedValueOnce(understandCard())
      .mockResolvedValueOnce(JSON.stringify({ text: 'line one\n\nline two' }));

    const res = await POST(makeAskRequest({ ...personBaseBody, history: [], question: '문장 두 개 써줘' }));
    const data = await res.json() as { answer?: { text?: string; parts?: unknown } };

    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(2);
    const correctionTurns = mockGenerateJsonChat.mock.calls[1][1] as Array<{ role: string; text: string }>;
    expect(correctionTurns[correctionTurns.length - 1].text).toContain('SCRIPT CONTRACT VIOLATION');
    expect(data.answer?.parts).toBeUndefined();
    expect(data.answer?.text).toBe('line one\n\nline two');
  });

  it('④ parse failure recovers once via a plain retry; two consecutive parse failures -> 502 code:parse', async () => {
    mockGenerateJsonChat.mockClear();
    mockGenerateJsonChat.mockResolvedValueOnce('not json at all').mockResolvedValueOnce('still not json');

    const res = await POST(makeAskRequest({ ...meBaseBody, question: 'What should I focus on?' }));
    const data = await res.json() as { code?: string };

    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(502);
    expect(data.code).toBe('parse');
  });

  it('④b a single parse failure followed by a valid response recovers -> 200, exactly 2 calls', async () => {
    mockGenerateJsonChat.mockClear();
    mockGenerateJsonChat.mockResolvedValueOnce('not json').mockResolvedValueOnce(JSON.stringify({ text: 'ok now' }));

    const res = await POST(makeAskRequest({ ...meBaseBody, question: 'What should I focus on?' }));
    const data = await res.json() as { answer?: { text?: string } };

    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
    expect(data.answer?.text).toBe('ok now');
  });

  it('⑤a correction result STILL has a label-set violation -> final disposition normalizes the labels, served (not 502)', async () => {
    mockGenerateJsonChat.mockClear();
    mockGenerateJsonChat.mockResolvedValueOnce(mixedLabelCard()).mockResolvedValueOnce(mixedLabelCard());

    const res = await POST(makeAskRequest({ ...personBaseBody, history: [], question: 'How does Sam feel about this?' }));
    const data = await res.json() as { answer?: { parts?: Array<{ label: string }> } };

    expect(res.status).toBe(200);
    expect(data.answer?.parts?.map(p => p.label)).toEqual([...UNDERSTAND_LABELS]);
  });

  it('⑤b correction result STILL violates the strict_script contract -> final disposition downgrades to {text}, served', async () => {
    mockGenerateJsonChat.mockClear();
    mockGenerateJsonChat.mockResolvedValueOnce(understandCard()).mockResolvedValueOnce(mixedLabelCard()); // still has `parts`

    const res = await POST(makeAskRequest({ ...personBaseBody, history: [], question: '문장 두 개 써줘' }));
    const data = await res.json() as { answer?: { text?: string; parts?: unknown } };

    expect(res.status).toBe(200);
    expect(data.answer?.parts).toBeUndefined();
    expect(typeof data.answer?.text).toBe('string');
  });

  it('⑤c correction result STILL reintroduces the candidate -> final disposition soft-serves as-is (not 502)', async () => {
    mockGenerateJsonChat.mockClear();
    mockGenerateJsonChat
      .mockResolvedValueOnce(understandCard({ withCandidate: true }))
      .mockResolvedValueOnce(understandCard({ withCandidate: true }));

    const history = [
      { role: 'user' as const, text: 'Sam은 어떤 사람이야?' },
      { role: 'assistant' as const, text: `Sam은 ${hanjaCandidate}라 직진형이에요.` },
    ];
    const res = await POST(makeAskRequest({ ...personBaseBody, history, question: '더 얘기해줘' }));
    const data = await res.json() as { answer?: { parts?: Array<{ text: string }> } };

    expect(res.status).toBe(200);
    expect(data.answer?.parts?.[0]?.text).toContain(hanjaCandidate); // soft-served as-is
  });

  it('⑥ a clean first output -> zero regenerations, exactly 1 model call', async () => {
    mockGenerateJsonChat.mockClear();
    mockGenerateJsonChat.mockResolvedValueOnce(JSON.stringify({ text: 'a clean, valid answer' }));

    const res = await POST(makeAskRequest({ ...meBaseBody, question: 'What should I focus on?' }));
    const data = await res.json() as { answer?: { text?: string } };

    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(data.answer?.text).toBe('a clean, valid answer');
  });

  it('label-order-only violation is fixed for free — no extra model call', async () => {
    mockGenerateJsonChat.mockClear();
    const shuffled = [UNDERSTAND_LABELS[2], UNDERSTAND_LABELS[0], UNDERSTAND_LABELS[1]];
    mockGenerateJsonChat.mockResolvedValueOnce(JSON.stringify({
      parts: shuffled.map(label => ({ label, text: 'x' })),
    }));

    const res = await POST(makeAskRequest({ ...personBaseBody, history: [], question: 'How does Sam feel about this?' }));
    const data = await res.json() as { answer?: { parts?: Array<{ label: string }> } };

    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(1);
    expect(data.answer?.parts?.map(p => p.label)).toEqual([...UNDERSTAND_LABELS]);
  });
});

describe('POST /api/ask — call failure classification (BRIEF-100B §2)', () => {
  const meBaseBody = {
    mode: 'me' as const,
    me: { date: '1990-06-15', time: '14:30' },
    history: [] as unknown[],
  };

  it('429 -> retried once; a subsequent success is served', async () => {
    mockGenerateJsonChat.mockClear();
    mockGenerateJsonChat
      .mockRejectedValueOnce(new Error('Gemini API error 429: rate limited'))
      .mockResolvedValueOnce(JSON.stringify({ text: 'ok after retry' }));

    const res = await POST(makeAskRequest({ ...meBaseBody, question: 'hi' }));
    const data = await res.json() as { answer?: { text?: string } };

    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
    expect(data.answer?.text).toBe('ok after retry');
  });

  it('a 5xx status is retried once', async () => {
    mockGenerateJsonChat.mockClear();
    mockGenerateJsonChat
      .mockRejectedValueOnce(new Error('Gemini API error 503: unavailable'))
      .mockResolvedValueOnce(JSON.stringify({ text: 'ok' }));

    const res = await POST(makeAskRequest({ ...meBaseBody, question: 'hi' }));
    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });

  it('a 400 status is NOT retried — immediate 502 code:call', async () => {
    mockGenerateJsonChat.mockClear();
    mockGenerateJsonChat.mockRejectedValueOnce(new Error('Gemini API error 400: bad request'));

    const res = await POST(makeAskRequest({ ...meBaseBody, question: 'hi' }));
    const data = await res.json() as { code?: string };

    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(502);
    expect(data.code).toBe('call');
  });

  it('the withTimeout rejection literal is retried', async () => {
    mockGenerateJsonChat.mockClear();
    mockGenerateJsonChat
      .mockRejectedValueOnce(new Error('LLM timed out after 30000ms'))
      .mockResolvedValueOnce(JSON.stringify({ text: 'ok' }));

    const res = await POST(makeAskRequest({ ...meBaseBody, question: 'hi' }));
    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });

  it('a missing GEMINI_API_KEY fails immediately, no retry', async () => {
    mockGenerateJsonChat.mockClear();
    mockCreateLlmProvider.mockImplementationOnce(() => {
      throw new Error('GEMINI_API_KEY environment variable is not set');
    });

    const res = await POST(makeAskRequest({ ...meBaseBody, question: 'hi' }));
    const data = await res.json() as { code?: string };

    expect(mockGenerateJsonChat).not.toHaveBeenCalled();
    expect(res.status).toBe(502);
    expect(data.code).toBe('call');
  });

  it('no combination of failures results in more than 2 total model calls (1 primary + 1 shared extra)', async () => {
    mockGenerateJsonChat.mockClear();
    mockGenerateJsonChat
      .mockRejectedValueOnce(new Error('Gemini API error 429: rate limited'))
      .mockRejectedValueOnce(new Error('Gemini API error 429: rate limited again'));

    const res = await POST(makeAskRequest({ ...meBaseBody, question: 'hi' }));
    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(502);
  });
});

describe('POST /api/ask — logging privacy (BRIEF-100B §2)', () => {
  const meBaseBody = {
    mode: 'me' as const,
    me: { date: '1990-06-15', time: '14:30' },
    history: [] as unknown[],
  };

  it('a parse failure never logs raw response content — only rawLen and the error name', async () => {
    mockGenerateJsonChat.mockClear();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mockGenerateJsonChat.mockResolvedValueOnce('not json at all — this text must never appear in logs').mockResolvedValueOnce('still not json — neither must this');

      await POST(makeAskRequest({ ...meBaseBody, question: 'hi' }));

      const loggedTexts = errorSpy.mock.calls.map(c => c.join(' '));
      for (const line of loggedTexts) {
        expect(line).not.toContain('not json at all');
        expect(line).not.toContain('still not json');
      }
      const parseLines = loggedTexts.filter(l => l.includes('stage=parse'));
      expect(parseLines.length).toBeGreaterThan(0);
      for (const line of parseLines) expect(line).toMatch(/rawLen=\d+/);
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe('validateAskAnswer — known limitations, documented on purpose (BRIEF-100B §6/§9)', () => {
  const baseCtx = { askMode: 'verdict_probe' as const, personIntroduced: false, candidates: [] as string[], latestUserText: '' };

  it('limitation ①: an unhedged verdict phrased outside the specific patterns checked is NOT detected — the signal is a backstop, not the real defense (the §4 contract block is)', () => {
    // Asserts a fixed trait ("그런 식", "늘") without a leading 네/맞아/Yes and without the exact
    // "원래 그런 (편|성격|사람)" phrase the pattern below checks for — a real, silent gap.
    const answer = { text: '그 사람 성격이 그래요, 늘 그런 식이죠.' };
    const violations = validateAskAnswer(answer, baseCtx);
    expect(violations.some(v => v.type === 'verdict_opening')).toBe(false);
  });

  it('limitation ②: a leading "네" that ISN\'T actually a character verdict still trips the signal — a false positive that costs one correction regeneration', () => {
    const answer = { text: '네, 좋은 질문이에요. 최근엔 바빠서 연락이 뜸했을 수 있어요.' }; // "Yes" here just means "good question", not a trait confirmation
    const violations = validateAskAnswer(answer, baseCtx);
    expect(violations.some(v => v.type === 'verdict_opening')).toBe(true); // flagged anyway — documented false-positive cost
  });
});


