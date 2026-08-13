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
  validateAskAnswer, UNDERSTAND_LABELS, DECIDE_LABELS, parseScriptRequest,
  COMPLETION_PATTERNS, COMPLETION_EXCLUSIONS,
  COMPLETION_SEGMENT_SPLIT, COMPLETION_QUOTE_SPAN, COMPLETION_REPORT_MARKER, COMPLETION_FORBID,
  COMPLETION_CANCEL, COMPLETION_REQUEST_ENDINGS, splitCompletionParts, detectCompletionRequest,
  repairControlCharsInStrings, tryParse, tryPlainTextFallback,
  buildDailyPillarLookup, applyFinalDisposition, buildCorrectionWarnings,
  detectExpectedLang, hasExplicitLanguageRequest,
} = await import('./route');
const { splitSentences } = await import('@/lib/hiddenTruth');
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
    // Korean, matching the Korean question below (BRIEF-106's language detector now checks this).
    mockGenerateJsonChat.mockResolvedValue(JSON.stringify({ text: '평범한 답변이에요.' }));

    const res = await POST(makeAskRequest({ ...baseBody, question: '나 진짜 죽고 싶어', safetyAck: true }));
    const data = await res.json() as { safety?: string; answer?: { text?: string } };

    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(1);
    expect(data.safety).toBeUndefined();
    expect(data.answer?.text).toBe('평범한 답변이에요.');
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

  // BRIEF-106 — `lang` picks the non-candidate filler text so these fixtures stay consistent with
  // whichever question language a given test pairs them with (POST now computes `expectedLang`
  // from the question and checks the mocked answer against it, so a generic English filler under
  // a Korean question would trip the new cross-language detector for reasons unrelated to what
  // these tests actually verify).
  const understandCard = (opts: { withCandidate?: boolean; lang?: 'ko' | 'en' } = {}) => JSON.stringify({
    parts: UNDERSTAND_LABELS.map((label, i) => ({
      label, text: i === 0 && opts.withCandidate
        ? `${hanjaCandidate}라 그런 편이에요.`
        : opts.lang === 'ko' ? '짧고 구체적인 설명이에요.' : 'A short specific read.',
    })),
  });
  // Digits, not letters — invisible to the language detector either way (BRIEF-106 §3 never counts
  // digits/symbols), so this fixture stays usable under both English- and Korean-question tests.
  const mixedLabelCard = () => JSON.stringify({
    parts: [
      { label: UNDERSTAND_LABELS[0], text: '1' },
      { label: UNDERSTAND_LABELS[1], text: '2' },
      { label: DECIDE_LABELS[0], text: '3' },
    ],
  });

  it('① ALREADY + reintroduction in the 1st output -> rejected, correction prompt names the specific violation', async () => {
    mockGenerateJsonChat.mockClear();
    mockGenerateJsonChat
      .mockResolvedValueOnce(understandCard({ withCandidate: true, lang: 'ko' }))
      .mockResolvedValueOnce(understandCard({ lang: 'ko' }));

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
      .mockResolvedValueOnce(understandCard({ lang: 'ko' }))
      .mockResolvedValueOnce(JSON.stringify({ text: '첫째 줄이에요.\n\n둘째 줄이에요.' }));

    const res = await POST(makeAskRequest({ ...personBaseBody, history: [], question: '문장 두 개 써줘' }));
    const data = await res.json() as { answer?: { text?: string; parts?: unknown } };

    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(2);
    const correctionTurns = mockGenerateJsonChat.mock.calls[1][1] as Array<{ role: string; text: string }>;
    expect(correctionTurns[correctionTurns.length - 1].text).toContain('SCRIPT CONTRACT VIOLATION');
    expect(data.answer?.parts).toBeUndefined();
    expect(data.answer?.text).toBe('첫째 줄이에요.\n\n둘째 줄이에요.');
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
      .mockResolvedValueOnce(understandCard({ withCandidate: true, lang: 'ko' }))
      .mockResolvedValueOnce(understandCard({ withCandidate: true, lang: 'ko' }));

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

// ══════════════════════════════════════════════════════════════════════════
// BRIEF-100B-FIX v1 — Ask 응답의 사실성·출력 계약 집행
// ══════════════════════════════════════════════════════════════════════════
//
// F1/F3(most rows)/F4 have no output validator (§4.5 gave no "existing-contract-unenforced"
// evidence for them the way it did for F2, and a mocked LLM can't demonstrate real model
// reasoning) — coverage there is prompt-content assertions confirming the new/reinforced rule
// text is present, referencing the §2 table's own input examples in each test's description for
// traceability. F2 and F5 get real validators, covered end-to-end via validateAskAnswer +
// POST pipeline tests below.

describe('buildAskSystem — F1 TEMPORAL STATE block (BRIEF-100B-FIX §1 F1, prompt-only)', () => {
  const meChart = calculateSaju({ date: '1990-06-15', time: '14:30' });
  const themChart = calculateSaju({ date: '1988-03-02', time: '09:00' });

  it('person mode includes the TEMPORAL STATE block', () => {
    const system = buildAskSystem('person', meChart, themChart, undefined, []);
    expect(system).toContain('TEMPORAL STATE');
  });

  it('me/general modes do not include it (the "other person\'s reaction" concept is person-only)', () => {
    for (const mode of ['me', 'general'] as const) {
      const system = buildAskSystem(mode, meChart, null, undefined, []);
      expect(system).not.toContain('TEMPORAL STATE');
    }
  });

  it('음성 「그래서 내가 먼저 연락하기로 했어」/「내일 얘기 꺼내볼까 해」 — forbids presupposing a reaction to an unexecuted plan', () => {
    const system = buildAskSystem('person', meChart, themChart, undefined, []);
    expect(system).toContain('A stated intention');
    expect(system).toContain('NOT a completed event');
    expect(system).toContain("Never ask about, or write as if you already know, the other person's reaction to something that hasn't happened yet");
  });

  it('양성 「어제 연락했어」/「연락했는데 답이 없어」 — reactions/results ARE fair game once the user reports them', () => {
    const system = buildAskSystem('person', meChart, themChart, undefined, []);
    expect(system).toContain('Only bring up or ask about their reaction after the user reports the action actually happened');
    expect(system).toContain('답이 없어');
  });
});

describe('buildAskSystem — F3 FOLLOW-UP RULE reinforcement (BRIEF-100B-FIX §1 F3)', () => {
  const meChart = calculateSaju({ date: '1990-06-15', time: '14:30' });
  const themChart = calculateSaju({ date: '1988-03-02', time: '09:00' });

  it('음성 「완성 문구·목록·정확한 출력 요청」 -> new rule states followUp is omitted entirely (all 3 modes)', () => {
    for (const mode of ['me', 'person', 'general'] as const) {
      const system = buildAskSystem(mode, meChart, mode === 'person' ? themChart : null, undefined, []);
      expect(system).toContain('Omit followUp entirely when you just gave a complete, ready-to-use output');
    }
  });

  it('음성 「아직 발생하지 않은 결과를 묻는 질문」 -> new rule ties followUp to TEMPORAL STATE (person mode)', () => {
    const system = buildAskSystem('person', meChart, themChart, undefined, []);
    expect(system).toContain("Never let followUp ask about the outcome or reaction to something that hasn't happened yet");
  });

  it('regression: 「이미 사용자가 답한 사실을 다시 묻는 질문 — 금지」 wording unchanged (all 3 modes)', () => {
    for (const mode of ['me', 'person', 'general'] as const) {
      const system = buildAskSystem(mode, meChart, mode === 'person' ? themChart : null, undefined, []);
      expect(system).toContain('Never re-ask what the user already told you');
    }
  });
});

describe('buildAskSystem — F4 EVIDENCE FOR CLAIMS ABOUT THEM block (BRIEF-100B-FIX §1 F4, prompt-only)', () => {
  const meChart = calculateSaju({ date: '1990-06-15', time: '14:30' });
  const themChart = calculateSaju({ date: '1988-03-02', time: '09:00' });

  it('person mode includes the block; me/general do not (no "other person" concept there)', () => {
    const person = buildAskSystem('person', meChart, themChart, undefined, []);
    expect(person).toContain('EVIDENCE FOR CLAIMS ABOUT THEM');
    for (const mode of ['me', 'general'] as const) {
      const system = buildAskSystem(mode, meChart, null, undefined, []);
      expect(system).not.toContain('EVIDENCE FOR CLAIMS ABOUT THEM');
    }
  });

  it('음성 「취향 언급이 없던 대화에서 은우가 좋아하는 X」 -> unfounded claims require the user to have actually said it', () => {
    const system = buildAskSystem('person', meChart, themChart, undefined, []);
    expect(system).toContain('never state the other person\'s tastes, private thoughts, or future reactions as a known fact unless the user actually told you');
  });

  it('양성 「사용자가 앞선 턴에 취향을 말한 대화」 -> using it is allowed AND not mandatory every turn (no forced avoidance, no forced repetition)', () => {
    const system = buildAskSystem('person', meChart, themChart, undefined, []);
    expect(system).toContain('Do NOT avoid a preference the user actually stated just to be safe');
    expect(system).toContain('you just don\'t have to bring it up in every single answer');
  });

  it('양성 「조건형 표현 (평소 좋아한다고 말한 게 있다면)」 -> named as an allowed pattern', () => {
    const system = buildAskSystem('person', meChart, themChart, undefined, []);
    expect(system).toContain('평소 좋아한다고 말한 게 있다면');
  });

  it('음성 「근거 없는 낙관 — 은우가 사실 당신을 많이 좋아할 가능성이 커요」 -> possibility language still needs grounding', () => {
    const system = buildAskSystem('person', meChart, themChart, undefined, []);
    expect(system).toContain('"~일 가능성이 커요" still needs to connect to something the user told you or a repeated pattern');
    expect(system).toContain('must not be the only explanation offered');
  });

  it('음성 「상대의 미래 반응 보장」 -> explicit banned examples, framed as never a guarantee', () => {
    const system = buildAskSystem('person', meChart, themChart, undefined, []);
    expect(system).toContain('Never promise how the other person will react');
    expect(system).toContain('되어줄 거예요'); // the exact SMOKE defect #3 wording
    expect(system).toContain('a reaction is always a possibility, never a guarantee');
  });

  it('regression: 「사용자가 감정만 고백 — 상대 반응을 차트로 설명하지 않음」 covered by the pre-existing BASIS PRIORITY fact-first ordering (no new rule needed, unchanged)', () => {
    const system = buildAskSystem('person', meChart, themChart, undefined, []);
    expect(system).toContain('Facts the user has told you');
  });
});

describe('buildAskSystem — F5 NO HIDDEN-TRUTH FRAMING prompt block (BRIEF-100B-FIX §1 F5, prompt half)', () => {
  const meChart = calculateSaju({ date: '1990-06-15', time: '14:30' });
  const themChart = calculateSaju({ date: '1988-03-02', time: '09:00' });

  it('person mode includes the block; me/general do not', () => {
    const person = buildAskSystem('person', meChart, themChart, undefined, []);
    expect(person).toContain('NO HIDDEN-TRUTH FRAMING');
    for (const mode of ['me', 'general'] as const) {
      const system = buildAskSystem(mode, meChart, null, undefined, []);
      expect(system).not.toContain('NO HIDDEN-TRUTH FRAMING');
    }
  });

  it('names the exact banned phrasing and the allowed limiting-form alternative', () => {
    const system = buildAskSystem('person', meChart, themChart, undefined, []);
    expect(system).toContain('진짜 마음을 읽을 수 있어요');
    expect(system).toContain('진짜 이유를 알 수 있어요');
    expect(system).toContain('a single reaction can\'t reveal someone\'s real feelings');
  });
});

describe('buildAskSystem — STRICT_SCRIPT_BLOCK framing removed + unit nuance (BRIEF-100B-FIX §1 F2 / §5 결재)', () => {
  const meChart = calculateSaju({ date: '1990-06-15', time: '14:30' });
  const themChart = calculateSaju({ date: '1988-03-02', time: '09:00' });

  it('the old "plus at most one short sentence of framing" allowance is gone', () => {
    const system = buildAskSystem('person', meChart, themChart, undefined, [], 'Alex', 'Sam', undefined, false, false, 'strict_script', false);
    expect(system).not.toContain('plus at most one short sentence of framing');
    expect(system).toContain('Give EXACTLY the requested number of lines');
    expect(system).toContain('nothing before them, nothing after them, no leading explanation, no closing remark');
  });

  it('states the sentence-vs-message unit distinction and the format-marker ban', () => {
    const system = buildAskSystem('person', meChart, themChart, undefined, [], 'Alex', 'Sam', undefined, false, false, 'strict_script', false);
    expect(system).toContain('If the count was for "문장"/sentences, each line is exactly one sentence');
    expect(system).toContain('may be up to two short sentences when that reads naturally');
    expect(system).toContain('No numbering, no bullets, no labels, no "/" separators');
  });
});

describe('detectAskMode — "메시지 N개" gap fix (BRIEF-100B-FIX §1 F2, evidence gap vs §4.5)', () => {
  it('"보낼 메시지 2개만 써줘" (the SMOKE brief\'s own §2 example) is now detected as strict_script — it was NOT before this BRIEF', () => {
    expect(detectAskMode('보낼 메시지 2개만 써줘')).toBe('strict_script');
  });

  it('"멘트 두 개 써줘" still works (regression — not replaced, just extended)', () => {
    expect(detectAskMode('멘트 두 개 써줘')).toBe('strict_script');
  });
});

describe('parseScriptRequest (BRIEF-100B-FIX §1 F2)', () => {
  it.each([
    ['문장 두 개 써줘', { count: 2, unit: 'sentence' }],
    ['문장 3개 써줘', { count: 3, unit: 'sentence' }],
    ['3문장 써줘', { count: 3, unit: 'sentence' }],
    ['멘트 두 개 써줘', { count: 2, unit: 'message' }],
    ['메시지 2개만 써줘', { count: 2, unit: 'message' }],
    ['write 2 lines', { count: 2, unit: 'message' }],
    ['give me 3 messages', { count: 3, unit: 'message' }],
    ['exactly 2 sentences', { count: 2, unit: 'sentence' }],
  ] as const)('%s -> %o', (text, expected) => {
    expect(parseScriptRequest(text)).toEqual(expected);
  });

  it('no explicit count -> null (a bare request like "보낼 문장 써줘" never reaches this — detectAskMode already requires a count)', () => {
    expect(parseScriptRequest('그냥 편하게 얘기해줘')).toBeNull();
  });
});

describe('validateAskAnswer — F2 script contract (BRIEF-100B-FIX §1/§2)', () => {
  const scriptCtx = (latestUserText: string) =>
    ({ askMode: 'strict_script' as const, personIntroduced: false, candidates: [] as string[], latestUserText });

  it('양성 「문장 두 개」 — exactly 2 lines, no markers, no followUp -> no script_contract violations', () => {
    const answer = { text: '오랜만이야.\n잘 지내?' };
    const violations = validateAskAnswer(answer, scriptCtx('문장 두 개 써줘'));
    expect(violations.filter(v => v.type === 'script_contract')).toEqual([]);
  });

  it('양성 「메시지 2개」 — each line may hold 2 short sentences, still no violation', () => {
    const answer = { text: '오랜만이야! 잘 지내?\n한번 보자.' };
    const violations = validateAskAnswer(answer, scriptCtx('메시지 2개만 써줘'));
    expect(violations.filter(v => v.type === 'script_contract')).toEqual([]);
  });

  it('음성 count — 3 lines when 2 were requested -> script_contract(count)', () => {
    const answer = { text: '하나.\n둘.\n셋.' };
    const violations = validateAskAnswer(answer, scriptCtx('문장 두 개 써줘'));
    expect(violations).toContainEqual({ type: 'script_contract', detail: 'count' });
  });

  it('음성 format — leading numbering -> script_contract(format)', () => {
    const answer = { text: '1. 오랜만이야.\n2. 잘 지내?' };
    const violations = validateAskAnswer(answer, scriptCtx('문장 두 개 써줘'));
    expect(violations).toContainEqual({ type: 'script_contract', detail: 'format' });
  });

  it('음성 format — "/" separator within a line -> script_contract(format)', () => {
    const answer = { text: '오랜만이야/잘 지내?\n한번 보자.' };
    const violations = validateAskAnswer(answer, scriptCtx('문장 두 개 써줘'));
    expect(violations).toContainEqual({ type: 'script_contract', detail: 'format' });
  });

  it('음성 followUp — present in a script answer -> script_contract(followup)', () => {
    const answer = { text: '오랜만이야.\n잘 지내?', followUp: '보내고 나서 어땠는지 알려줘요.' };
    const violations = validateAskAnswer(answer, scriptCtx('문장 두 개 써줘'));
    expect(violations).toContainEqual({ type: 'script_contract', detail: 'followup' });
  });

  it('askMode is null (no explicit count) -> script_contract is never checked, regardless of shape', () => {
    const answer = { text: '아무거나.\n여러 줄이어도.\n상관없어.', followUp: '괜찮아요?' };
    const violations = validateAskAnswer(answer, { askMode: null, personIntroduced: false, candidates: [], latestUserText: '그냥 얘기해줘' });
    expect(violations.filter(v => v.type === 'script_contract')).toEqual([]);
  });
});

describe('validateAskAnswer — F5 hidden-truth framing (BRIEF-100B-FIX §1 F5)', () => {
  const baseCtx = { askMode: null, personIntroduced: false, candidates: [] as string[], latestUserText: '' };

  it('음성 「반응 속도를 보면 은우의 진짜 마음을 읽을 수 있어요」 -> 차단', () => {
    const answer = { text: '반응 속도를 보면 은우의 진짜 마음을 읽을 수 있어요.' };
    expect(validateAskAnswer(answer, baseCtx).some(v => v.type === 'hidden_truth_framing')).toBe(true);
  });

  it('음성 추천 칩(=followUp) 「은우가 연락을 줄인 진짜 이유는 뭘까?」 -> 차단', () => {
    const answer = { text: '평범한 답변이에요.', followUp: '은우가 연락을 줄인 진짜 이유는 뭘까?' };
    expect(validateAskAnswer(answer, baseCtx).some(v => v.type === 'hidden_truth_framing')).toBe(true);
  });

  it('양성 「진짜 마음을 한 번의 반응으로 알 수는 없어요」 -> 반드시 통과', () => {
    const answer = { text: '진짜 마음을 한 번의 반응으로 알 수는 없어요.' };
    expect(validateAskAnswer(answer, baseCtx).some(v => v.type === 'hidden_truth_framing')).toBe(false);
  });

  it('양성 「지금의 거리가 일시적인지 반복되는 패턴인지 가늠하는 데 도움이 될 거예요」 -> 통과', () => {
    const answer = { text: '지금의 거리가 일시적인지 반복되는 패턴인지 가늠하는 데 도움이 될 거예요.' };
    expect(validateAskAnswer(answer, baseCtx).some(v => v.type === 'hidden_truth_framing')).toBe(false);
  });

  it('checks all 3 parts[].text too, not just {text}', () => {
    const answer = { parts: [
      { label: 'x', text: '평범한 문장.' },
      { label: 'y', text: '숨은 진심을 알아낼 수 있어요.' },
      { label: 'z', text: '평범한 문장.' },
    ] };
    expect(validateAskAnswer(answer, baseCtx).some(v => v.type === 'hidden_truth_framing')).toBe(true);
  });
});

describe('POST /api/ask — F2 script contract pipeline (BRIEF-100B-FIX §1/§2)', () => {
  const personBaseBody = {
    mode: 'person' as const,
    me: { date: '1990-06-15', time: '14:30' },
    them: { date: '1988-03-02', time: '09:00', name: 'Sam' },
    history: [] as unknown[],
  };

  it('clean 2-line script answer -> served as-is, exactly 1 call, no correction', async () => {
    mockGenerateJsonChat.mockClear();
    mockGenerateJsonChat.mockResolvedValueOnce(JSON.stringify({ text: '오랜만이야.\n잘 지내?' }));

    const res = await POST(makeAskRequest({ ...personBaseBody, question: '문장 두 개 써줘' }));
    const data = await res.json() as { answer?: { text?: string } };

    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(1);
    expect(data.answer?.text).toBe('오랜만이야.\n잘 지내?');
  });

  it('too many lines -> rejected once with SCRIPT LINE COUNT VIOLATION; still wrong after retry -> final disposition truncates to the requested count', async () => {
    mockGenerateJsonChat.mockClear();
    mockGenerateJsonChat
      .mockResolvedValueOnce(JSON.stringify({ text: '하나.\n둘.\n셋.' }))
      .mockResolvedValueOnce(JSON.stringify({ text: '하나.\n둘.\n셋.' }));

    const res = await POST(makeAskRequest({ ...personBaseBody, question: '문장 두 개 써줘' }));
    const data = await res.json() as { answer?: { text?: string } };

    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(2);
    const correctionTurns = mockGenerateJsonChat.mock.calls[1][1] as Array<{ role: string; text: string }>;
    expect(correctionTurns[correctionTurns.length - 1].text).toContain('SCRIPT LINE COUNT VIOLATION');
    expect(res.status).toBe(200);
    expect(data.answer?.text).toBe('하나.\n둘.');
  });

  it('followUp present on a script answer -> rejected once with SCRIPT FOLLOWUP VIOLATION; still present after retry -> final disposition strips it', async () => {
    mockGenerateJsonChat.mockClear();
    mockGenerateJsonChat
      .mockResolvedValueOnce(JSON.stringify({ text: '오랜만이야.\n잘 지내?', followUp: '보내고 나서 어땠는지 알려줘요.' }))
      .mockResolvedValueOnce(JSON.stringify({ text: '오랜만이야.\n잘 지내?', followUp: '보내고 나서 어땠는지 알려줘요.' }));

    const res = await POST(makeAskRequest({ ...personBaseBody, question: '문장 두 개 써줘' }));
    const data = await res.json() as { answer?: { text?: string; followUp?: string } };

    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(2);
    const correctionTurns = mockGenerateJsonChat.mock.calls[1][1] as Array<{ role: string; text: string }>;
    expect(correctionTurns[correctionTurns.length - 1].text).toContain('SCRIPT FOLLOWUP VIOLATION');
    expect(res.status).toBe(200);
    expect(data.answer?.followUp).toBeUndefined();
    expect(data.answer?.text).toBe('오랜만이야.\n잘 지내?');
  });

  it('format markers (numbering) -> rejected once with SCRIPT FORMAT VIOLATION; still wrong after retry -> soft-served as-is (no safe auto-strip)', async () => {
    mockGenerateJsonChat.mockClear();
    mockGenerateJsonChat
      .mockResolvedValueOnce(JSON.stringify({ text: '1. 오랜만이야.\n2. 잘 지내?' }))
      .mockResolvedValueOnce(JSON.stringify({ text: '1. 오랜만이야.\n2. 잘 지내?' }));

    const res = await POST(makeAskRequest({ ...personBaseBody, question: '문장 두 개 써줘' }));
    const data = await res.json() as { answer?: { text?: string } };

    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(2);
    const correctionTurns = mockGenerateJsonChat.mock.calls[1][1] as Array<{ role: string; text: string }>;
    expect(correctionTurns[correctionTurns.length - 1].text).toContain('SCRIPT FORMAT VIOLATION');
    expect(res.status).toBe(200);
    expect(data.answer?.text).toBe('1. 오랜만이야.\n2. 잘 지내?'); // soft-served, unchanged
  });

  it('양성 「개수 지정 없는 일반 상담 질문」 — regression: normal 3-part card unaffected by the new F2 checks', async () => {
    mockGenerateJsonChat.mockClear();
    mockGenerateJsonChat.mockResolvedValueOnce(JSON.stringify({
      parts: UNDERSTAND_LABELS.map(label => ({ label, text: 'A short specific read.' })),
    }));

    const res = await POST(makeAskRequest({ ...personBaseBody, question: 'How does Sam feel about this?' }));
    const data = await res.json() as { answer?: { parts?: Array<{ label: string }> } };

    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(1);
    expect(data.answer?.parts?.map(p => p.label)).toEqual([...UNDERSTAND_LABELS]);
  });
});

describe('POST /api/ask — F5 hidden-truth framing pipeline (BRIEF-100B-FIX §1/§2)', () => {
  const meBaseBody = {
    mode: 'me' as const,
    me: { date: '1990-06-15', time: '14:30' },
    history: [] as unknown[],
  };

  it('a hidden-truth claim -> rejected once with HIDDEN-TRUTH FRAMING VIOLATION; still present after retry -> soft-served as-is', async () => {
    mockGenerateJsonChat.mockClear();
    mockGenerateJsonChat
      .mockResolvedValueOnce(JSON.stringify({ text: '반응 속도를 보면 진짜 마음을 읽을 수 있어요.' }))
      .mockResolvedValueOnce(JSON.stringify({ text: '반응 속도를 보면 진짜 마음을 읽을 수 있어요.' }));

    const res = await POST(makeAskRequest({ ...meBaseBody, question: '그 사람 속마음이 궁금해' }));
    const data = await res.json() as { answer?: { text?: string } };

    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(2);
    const correctionTurns = mockGenerateJsonChat.mock.calls[1][1] as Array<{ role: string; text: string }>;
    expect(correctionTurns[correctionTurns.length - 1].text).toContain('HIDDEN-TRUTH FRAMING VIOLATION');
    expect(res.status).toBe(200);
    expect(data.answer?.text).toBe('반응 속도를 보면 진짜 마음을 읽을 수 있어요.'); // soft-served
  });

  it('a hedged/limiting form of the same subject -> zero regenerations, exactly 1 call', async () => {
    mockGenerateJsonChat.mockClear();
    mockGenerateJsonChat.mockResolvedValueOnce(JSON.stringify({ text: '진짜 마음을 한 번의 반응으로 알 수는 없어요.' }));

    const res = await POST(makeAskRequest({ ...meBaseBody, question: '그 사람 속마음이 궁금해' }));
    const data = await res.json() as { answer?: { text?: string } };

    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(1);
    expect(data.answer?.text).toBe('진짜 마음을 한 번의 반응으로 알 수는 없어요.');
  });
});

describe('POST /api/ask — BRIEF-100B-FIX regression (§2 회귀)', () => {
  const personBaseBody = {
    mode: 'person' as const,
    me: { date: '1990-06-15', time: '14:30' },
    them: { date: '1988-03-02', time: '09:00', name: 'Sam' },
  };
  const [hanjaCandidate] = themNameCandidates(calculateSaju({ date: '1988-03-02', time: '09:00' }));

  it('양성 「정체성 단어」 — reintroduction suppression still fires alongside the new F2/F5 checks (첫 소개 1회 외 누적 0회 유지)', async () => {
    mockGenerateJsonChat.mockClear();
    mockGenerateJsonChat.mockResolvedValueOnce(JSON.stringify({
      parts: UNDERSTAND_LABELS.map((label, i) => ({
        label, text: i === 0 ? `${hanjaCandidate}라 그런 편이에요.` : 'A short specific read.',
      })),
    })).mockResolvedValueOnce(JSON.stringify({
      parts: UNDERSTAND_LABELS.map(label => ({ label, text: 'A short specific read, no identity words.' })),
    }));

    const history = [
      { role: 'user' as const, text: 'Sam은 어떤 사람이야?' },
      { role: 'assistant' as const, text: `Sam은 ${hanjaCandidate}라 직진형이에요.` },
    ];
    const res = await POST(makeAskRequest({ ...personBaseBody, history, question: '더 얘기해줘' }));
    const data = await res.json() as { answer?: { parts?: Array<{ text: string }> } };

    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(2);
    for (const p of data.answer?.parts ?? []) expect(p.text).not.toContain(hanjaCandidate);
  });

  it('양성 「전체 610 테스트」 — this file itself is part of that count; a plain unrelated question still resolves normally end-to-end', async () => {
    mockGenerateJsonChat.mockClear();
    mockGenerateJsonChat.mockResolvedValueOnce(JSON.stringify({ text: 'a clean, valid answer' }));

    const res = await POST(makeAskRequest({ mode: 'me', me: { date: '1990-06-15', time: '14:30' }, history: [], question: 'What should I focus on?' }));
    const data = await res.json() as { answer?: { text?: string } };

    expect(res.status).toBe(200);
    expect(data.answer?.text).toBe('a clean, valid answer');
  });

  it('양성 「호출 예산」 — usedExtraCall 경로의 최대 호출 횟수 불변: F2+F5 double-violation in the SAME answer still costs only 1 extra call', async () => {
    mockGenerateJsonChat.mockClear();
    // A single answer that violates BOTH script count (3 lines instead of 2) AND hidden-truth framing.
    const badScript = JSON.stringify({ text: '하나.\n둘.\n진짜 마음을 읽을 수 있어요.' });
    mockGenerateJsonChat.mockResolvedValueOnce(badScript).mockResolvedValueOnce(badScript);

    const res = await POST(makeAskRequest({ ...personBaseBody, history: [], question: '문장 두 개 써줘' }));

    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(2); // never more than 1 primary + 1 shared extra call
    expect(res.status).toBe(200); // final disposition serves it, never a 502
  });
});

// ══════════════════════════════════════════════════════════════════════════
// BRIEF-100B-FIX3 — 완성물 요청의 분류·단위·출력 형태
// ══════════════════════════════════════════════════════════════════════════

describe('detectAskMode — completion (BRIEF-100B-FIX3 §1.2/§2.2)', () => {
  it.each([
    '보낼 메시지 좀 써줘', '답장 좀 써줘', '메시지 써줘', '멘트 좀 뽑아줘',
    '보낼 문장 써줘', '뭐라고 보낼지 써줘', '보낼 메시제 좀 써줘',
  ])('양성 "%s" -> completion', (text) => {
    expect(detectAskMode(text)).toBe('completion');
  });

  it.each([
    '뭐라고 답할까?', '그럼 뭐 하자고 할까?', '어제 연락했어', '답장 왔어',
    '답장 안 써', '답장 써야 할까?',
  ])('음성 "%s" -> null (의도적 제외)', (text) => {
    expect(detectAskMode(text)).toBeNull();
  });

  it('양성 "지금 보낼 문장 2개만 써줘"/"보낼 메시지 2개만 써줘" -> strict_script (개수가 이긴다, 회귀 금지)', () => {
    expect(detectAskMode('지금 보낼 문장 2개만 써줘')).toBe('strict_script');
    expect(detectAskMode('보낼 메시지 2개만 써줘')).toBe('strict_script');
  });

  it('양성 "지현이는 원래 그런 성격이야?" -> verdict_probe (회귀 금지)', () => {
    expect(detectAskMode('지현이는 원래 그런 성격이야?')).toBe('verdict_probe');
  });
});

describe('COMPLETION_PATTERNS / COMPLETION_EXCLUSIONS — exported tables (BRIEF-100B-FIX3 §1.2, table-driven like BRIEF-100B §3)', () => {
  it('둘 다 RegExp 배열로 export된다', () => {
    expect(Array.isArray(COMPLETION_PATTERNS)).toBe(true);
    expect(COMPLETION_PATTERNS.every((p: unknown) => p instanceof RegExp)).toBe(true);
    expect(Array.isArray(COMPLETION_EXCLUSIONS)).toBe(true);
    expect(COMPLETION_EXCLUSIONS.every((p: unknown) => p instanceof RegExp)).toBe(true);
  });

  it('COMPLETION_PATTERNS 중 하나 이상이 "메시지 좀 써줘"에 매치된다', () => {
    expect(COMPLETION_PATTERNS.some((p: RegExp) => p.test('메시지 좀 써줘'))).toBe(true);
  });

  it('COMPLETION_EXCLUSIONS 중 하나 이상이 "답장 안 써"에 매치된다', () => {
    expect(COMPLETION_EXCLUSIONS.some((p: RegExp) => p.test('답장 안 써'))).toBe(true);
  });
});

describe('validateAskAnswer — Axis A 문장 단위 계약 (BRIEF-100B-FIX3 §1.1/§2.1)', () => {
  const scriptCtx = (latestUserText: string) =>
    ({ askMode: 'strict_script' as const, personIntroduced: false, candidates: [] as string[], latestUserText });

  it('음성 「문장 2개」 요청 + 2줄×각2문장(=4문장) -> script_contract/unit 검출 (이 판의 핵심 회귀)', () => {
    const answer = { text: '오랜만이야! 잘 지내?\n요즘 바빴지. 미안해.' };
    const violations = validateAskAnswer(answer, scriptCtx('지금 보낼 문장 2개만 써줘'));
    expect(violations).toContainEqual({ type: 'script_contract', detail: 'unit' });
  });

  it('양성 같은 요청 + 2줄 각 1문장 -> 위반 없음', () => {
    const answer = { text: '오랜만이야.\n잘 지내?' };
    const violations = validateAskAnswer(answer, scriptCtx('지금 보낼 문장 2개만 써줘'));
    expect(violations.filter(v => v.type === 'script_contract')).toEqual([]);
  });

  it('양성 「메시지 2개」 요청 + 2줄 각 2문장 -> 위반 없음(message는 2문장까지 허용)', () => {
    const answer = { text: '오랜만이야! 잘 지내?\n한번 보자! 언제 시간 돼?' };
    const violations = validateAskAnswer(answer, scriptCtx('보낼 메시지 2개만 써줘'));
    expect(violations.filter(v => v.type === 'script_contract')).toEqual([]);
  });

  it('음성 「메시지 2개」 요청 + 한 줄이 3문장 -> unit 검출', () => {
    const answer = { text: '오랜만이야! 잘 지내? 한번 보자.\n다음 주 어때?' };
    const violations = validateAskAnswer(answer, scriptCtx('보낼 메시지 2개만 써줘'));
    expect(violations).toContainEqual({ type: 'script_contract', detail: 'unit' });
  });

  it('양성 줄 수도 틀리고 문장 수도 틀림 -> count와 unit 둘 다 보고', () => {
    const answer = { text: '오랜만이야! 잘 지내?\n한번 보자! 언제 시간 돼?\n또 하나.' };
    const violations = validateAskAnswer(answer, scriptCtx('지금 보낼 문장 2개만 써줘'));
    expect(violations).toContainEqual({ type: 'script_contract', detail: 'count' });
    expect(violations).toContainEqual({ type: 'script_contract', detail: 'unit' });
  });

  it('양성 「오랜만이야 잘 지내」(부호 없음) 1줄 + 「문장 1개」 요청 -> 위반 없음(알려진 관대함, 고정)', () => {
    const answer = { text: '오랜만이야 잘 지내' };
    const violations = validateAskAnswer(answer, scriptCtx('문장 한 개 써줘'));
    expect(violations.filter(v => v.type === 'script_contract')).toEqual([]);
  });
});

describe('POST /api/ask — Axis A unit 위반의 최종 처분 (BRIEF-100B-FIX3 §2.1)', () => {
  const personBaseBody = {
    mode: 'person' as const,
    me: { date: '1990-06-15', time: '14:30' },
    them: { date: '1988-03-02', time: '09:00', name: 'Sam' },
    history: [] as unknown[],
  };

  it('재생성으로도 안 고쳐지면 SCRIPT UNIT VIOLATION로 교정 경고가 나가고, 최종 처분은 본문 무변경 + soft', async () => {
    mockGenerateJsonChat.mockClear();
    const badUnit = JSON.stringify({ text: '오랜만이야! 잘 지내?\n요즘 바빴지. 미안해.' });
    mockGenerateJsonChat.mockResolvedValueOnce(badUnit).mockResolvedValueOnce(badUnit);

    const res = await POST(makeAskRequest({ ...personBaseBody, question: '지금 보낼 문장 2개만 써줘' }));
    const data = await res.json() as { answer?: { text?: string } };

    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(2);
    const correctionTurns = mockGenerateJsonChat.mock.calls[1][1] as Array<{ role: string; text: string }>;
    expect(correctionTurns[correctionTurns.length - 1].text).toContain('SCRIPT UNIT VIOLATION');
    expect(res.status).toBe(200);
    expect(data.answer?.text).toBe('오랜만이야! 잘 지내?\n요즘 바빴지. 미안해.'); // 본문 무변경 — 자르지 않는다
  });
});

describe('validateAskAnswer — Axis C completion 출력 계약 (BRIEF-100B-FIX3 §1.3/§2.3)', () => {
  const completionCtx = { askMode: 'completion' as const, personIntroduced: false, candidates: [] as string[], latestUserText: '메시지 좀 써줘' };

  it('음성 completion + parts 3개 -> completion_parts', () => {
    const answer = { parts: UNDERSTAND_LABELS.map(label => ({ label, text: 'x' })) };
    const violations = validateAskAnswer(answer, completionCtx);
    expect(violations.some(v => v.type === 'completion_parts')).toBe(true);
  });

  it('음성 completion + followUp 있음 -> completion_contract/followup', () => {
    const answer = { text: '오랜만이야.', followUp: '보내고 나서 반응 알려줘요.' };
    const violations = validateAskAnswer(answer, completionCtx);
    expect(violations).toContainEqual({ type: 'completion_contract', detail: 'followup' });
  });

  it.each(['1. 오랜만이야.', '- 오랜만이야.', 'A: 오랜만이야.', '가/나 오랜만이야.'])(
    '음성 completion + 형식 마커("%s") -> completion_contract/format',
    (line) => {
      const answer = { text: line };
      const violations = validateAskAnswer(answer, completionCtx);
      expect(violations).toContainEqual({ type: 'completion_contract', detail: 'format' });
    },
  );

  it('양성 completion + 안내문 없는 1줄 텍스트 -> 위반 없음', () => {
    const answer = { text: '오랜만이야. 잘 지내?' };
    const violations = validateAskAnswer(answer, completionCtx);
    expect(violations).toEqual([]);
  });

  it('양성 completion에서는 개수 검사를 하지 않는다(script_contract/count 미발생)', () => {
    const answer = { text: '오랜만이야.\n잘 지내?\n한번 보자.' }; // 몇 줄이든 count 위반 없음
    const violations = validateAskAnswer(answer, completionCtx);
    expect(violations.filter(v => v.type === 'script_contract')).toEqual([]);
  });
});

describe('buildAskSystem — COMPLETION_BLOCK (BRIEF-100B-FIX3 §1.3/§2.3)', () => {
  const meChart = calculateSaju({ date: '1990-06-15', time: '14:30' });
  const themChart = calculateSaju({ date: '1988-03-02', time: '09:00' });

  it('askMode="completion" -> COMPLETION_BLOCK 정확히 1회 포함, STRICT_SCRIPT_BLOCK 미포함', () => {
    const system = buildAskSystem('person', meChart, themChart, undefined, [], 'Alex', 'Sam', undefined, false, false, 'completion', false);
    const count = (system.match(/COMPLETION REQUEST — the user asked you to write something/g) ?? []).length;
    expect(count).toBe(1);
    expect(system).not.toContain('SCRIPT REQUEST — the user asked for message lines');
  });

  it('askMode=null -> COMPLETION_BLOCK 미포함', () => {
    const system = buildAskSystem('person', meChart, themChart, undefined, [], 'Alex', 'Sam', undefined, false, false, null, false);
    expect(system).not.toContain('COMPLETION REQUEST');
  });
});

describe('POST /api/ask — Axis C completion 파이프라인 (BRIEF-100B-FIX3 §2.3)', () => {
  const meBaseBody = {
    mode: 'me' as const,
    me: { date: '1990-06-15', time: '14:30' },
    history: [] as unknown[],
  };

  it('completion + parts 3개 -> 재생성 1회(COMPLETION CONTRACT VIOLATION), 계속 위반이면 최종적으로 shape 2로 강등', async () => {
    mockGenerateJsonChat.mockClear();

    const personBaseBody = {
      mode: 'person' as const,
      me: { date: '1990-06-15', time: '14:30' },
      them: { date: '1988-03-02', time: '09:00', name: 'Sam' },
      history: [] as unknown[],
    };
    // '1' (digit), not a letter — BRIEF-106's language detector never counts digits either way, so
    // this stays neutral under the Korean question below (see understandCard's comment above).
    const card = JSON.stringify({ parts: UNDERSTAND_LABELS.map(label => ({ label, text: '1' })) });
    mockGenerateJsonChat.mockResolvedValueOnce(card).mockResolvedValueOnce(card);

    const res = await POST(makeAskRequest({ ...personBaseBody, question: '메시지 좀 써줘' }));
    const data = await res.json() as { answer?: { text?: string; parts?: unknown } };

    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(2);
    const correctionTurns = mockGenerateJsonChat.mock.calls[1][1] as Array<{ role: string; text: string }>;
    expect(correctionTurns[correctionTurns.length - 1].text).toContain('COMPLETION CONTRACT VIOLATION');
    expect(res.status).toBe(200);
    expect(data.answer?.parts).toBeUndefined();
    expect(typeof data.answer?.text).toBe('string');
  });

  it('completion + followUp -> 재생성 1회(COMPLETION FOLLOWUP VIOLATION), 계속 있으면 최종적으로 제거', async () => {
    mockGenerateJsonChat.mockClear();
    const withFollowUp = JSON.stringify({ text: '오랜만이야.', followUp: '보내고 나서 반응 알려줘요.' });
    mockGenerateJsonChat.mockResolvedValueOnce(withFollowUp).mockResolvedValueOnce(withFollowUp);

    const res = await POST(makeAskRequest({ ...meBaseBody, question: '메시지 좀 써줘' }));
    const data = await res.json() as { answer?: { text?: string; followUp?: string } };

    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(2);
    const correctionTurns = mockGenerateJsonChat.mock.calls[1][1] as Array<{ role: string; text: string }>;
    expect(correctionTurns[correctionTurns.length - 1].text).toContain('COMPLETION FOLLOWUP VIOLATION');
    expect(res.status).toBe(200);
    expect(data.answer?.followUp).toBeUndefined();
    expect(data.answer?.text).toBe('오랜만이야.');
  });

  it('completion + 깨끗한 1줄 답변 -> 재생성 없이 1회 호출로 종료', async () => {
    mockGenerateJsonChat.mockClear();
    mockGenerateJsonChat.mockResolvedValueOnce(JSON.stringify({ text: '오랜만이야. 잘 지내?' }));

    const res = await POST(makeAskRequest({ ...meBaseBody, question: '메시지 좀 써줘' }));
    const data = await res.json() as { answer?: { text?: string } };

    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(1);
    expect(data.answer?.text).toBe('오랜만이야. 잘 지내?');
  });
});

describe('POST /api/ask — BRIEF-100B-FIX3 회귀 (§2.4)', () => {
  const meBaseBody = {
    mode: 'me' as const,
    me: { date: '1990-06-15', time: '14:30' },
    history: [] as unknown[],
  };

  it('양성 「호출 예산」 — completion 경로도 1차 호출 + 최대 1회 추가 호출을 넘지 않는다(새 재시도 경로 없음)', async () => {
    mockGenerateJsonChat.mockClear();
    const bad = JSON.stringify({ text: '1. 오랜만이야.', followUp: '어땠어요?' }); // format + followup 동시 위반
    mockGenerateJsonChat.mockResolvedValueOnce(bad).mockResolvedValueOnce(bad);

    const res = await POST(makeAskRequest({ ...meBaseBody, question: '메시지 좀 써줘' }));

    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200); // 최종 처분이 서빙 — 502 아님
  });

  it('양성 「502 반환 지점·status·body」 — askMode가 null인 파싱 실패 경로는 completion 도입 후에도 무변경(BRIEF-100B-FIX6 이후: completion/strict_script 한정 fallback 대상이 아닌 경우)', async () => {
    mockGenerateJsonChat.mockClear();
    mockGenerateJsonChat.mockResolvedValueOnce('not json').mockResolvedValueOnce('still not json');

    const res = await POST(makeAskRequest({ ...meBaseBody, question: '오늘 컨디션이 어때?' }));
    const data = await res.json() as { code?: string };

    expect(res.status).toBe(502);
    expect(data.code).toBe('parse');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// BRIEF-100B-FIX4-C v3 — completion 판정을 「인용 분리 + 마지막 유효 의도」 구조로 교체
// ══════════════════════════════════════════════════════════════════════════
//
// 정본: TESTSET-100B-FIX4.md v1.1 (sha256 e5154111a567697e6a5d942ea1ae7667652d14e1c1ef2da2a52f9aed213e459e).
// 아래 3건(X5-M1·E-070·E-071)은 TESTSET §4.5가 명시한 "잔여 FN" — 이 판이 해결하지 않는 알려진 한계다.
// `it.fails`로 고정해 "지금은 깨져 있고, 그게 의도된 상태임"을 스위트 안에 그대로 남긴다 — 삭제하거나
// "정상 동작"으로 위장하지 않는다(브리프 §4 금지사항). 나머지는 `it.each`로 TESTSET §2/§3/§4를 그대로 옮긴다.

describe('detectAskMode — TESTSET X군 8축 38건 (BRIEF-100B-FIX4-C §2.1, 기대값 그대로)', () => {
  it.each([
    ['X1-P1', '메시지 써줘. 아, 아니다.', 'null'],
    ['X1-P2', '답장 써줘. 됐어 내가 쓸게.', 'null'],
    ['X1-P3', '문장 좀 써줘. 아니야 그냥 놔둬.', 'null'],
    ['X1-N1', '메시지 써줘. 아까 건 써봤어.', 'completion'],
    ['X1-B1', '메시지 써줘. 아 잠깐만.', 'null'],
    ['X1-M1', '메시지 써줘. 아니다. 그냥 짧게 하나만 써줘.', 'completion'],
    ['X2-P1', '답장 써줘, 아니 이미 써봤어. 됐어.', 'null'],
    ['X2-P2', '메시지 써줘 아니다 이미 써놨어', 'null'],
    ['X2-N1', '아까 써준 거 말고 새로운 답장 써줘.', 'completion'],
    ['X2-B1', '메시지 써줘 아니 문자로 써줘', 'completion'],
    ['X3-P1', '걔가 "메시지 써줘"라고 보냈어', 'null'],
    ['X3-P2', '"문장 좀 써줘"라고 하더라', 'null'],
    ['X3-N1', '걔한테 "잘 지내?"라고 보낼 메시지 써줘', 'completion'],
    ['X3-B1', '걔가 "답장 좀"이라고만 했는데 뭐라고 쓸지 문장 써줘', 'completion'],
    ['X4-P1', '친구가 나한테 답장 써달라고 했어', 'null'],
    ['X4-P2', '걔가 답장 써달래', 'null'],
    ['X4-P3', '엄마가 문자 써달라고 하시네', 'null'],
    ['X4-N1', '써달라고 했는데 내가 쓸게', 'null'],
    ['X4-B1', '걔가 답장 써달라는데 어떻게 하지', 'null'],
    ['X5-P1', '메시지 써주지 마', 'null'],
    ['X5-P2', '답장 쓰지 마', 'null'],
    ['X5-P3', '답장 쓰지 말라고 해줘', 'null'],
    ['X5-N1', '문자 보내지 말라고 써줘', 'completion'],
    ['X5-B1', '메시지 써주지 말고 그냥 조언만 해줘', 'null'],
    ['X6-P1', '걔가 답장 안 하면 메시지 하나 써줘', 'completion'],
    ['X6-P2', '내일까지 답 없으면 문자 써줘', 'completion'],
    ['X6-P3', '혹시 연락 오면 답장 써줘', 'completion'],
    ['X6-B1', '걔가 먼저 연락하면 그때 문장 써줄래?', 'completion'],
    ['X7-M1', '걔가 답장 써달래. 뭐라고 쓸지 문장 하나 써줘', 'completion'],
    ['X7-M2', '친구가 메시지 써달라고 했는데 보낼 답장 좀 써줘', 'completion'],
    ['X7-M3', '걔가 "빨리 답장 줘"래. 보낼 메시지 써줘', 'completion'],
    ['X8-M1', '메시지 써줘. 아 근데 걔가 이미 답장 써달래.', 'completion'],
    ['X8-M2', '문장 좀 써줘. 아까 건 써봤어.', 'completion'],
    ['X8-M3', '메시지 써줘. 아니다 걔가 먼저 쓴대.', 'null'],
    ['X5-M2', '하나 써줘. 아니, 써주지 마.', 'null'],
    ['X5-M1c', '메시지 써주지 마. 아니, 문장 하나만 써줘.', 'completion'],
    ['X5-M2c', '메시지 하나 써줘. 아니, 써주지 마.', 'null'],
  ] as const)('%s %s -> %s', (_id, text, expected) => {
    expect(detectAskMode(text) ?? 'null').toBe(expected);
  });

  // TESTSET §4.5 잔여 FN — 기대값은 completion이지만 §1.2의 목적어-필수 규칙상 이 문장 단독으로는
  // sawObject가 이월될 앞 절이 없어 탐지되지 않는다(§1.4 근거 4). 알려진 한계로 고정.
  it.fails('X5-M1 써주지 마. 아니, 하나만 써줘. -> completion (잔여 FN, §4.5)', () => {
    expect(detectAskMode('써주지 마. 아니, 하나만 써줘.') ?? 'null').toBe('completion');
  });
});

describe('detectAskMode — TESTSET L군 논리 감사 18건 (BRIEF-100B-FIX4-C §2.1)', () => {
  it.each([
    ['L-01', '아까 써준 거 말고 새로운 답장 써줘.', 'completion'],
    ['L-02', '답장 써줘, 아니 이미 써봤어. 됐어.', 'null'],
    ['L-03', '메시지 써줘. 아, 아니다.', 'null'],
    ['L-04', '답장 써줘. 됐어 내가 쓸게.', 'null'],
    ['L-05', '문장 좀 써줘. 아니야 그냥 놔둬.', 'null'],
    ['L-06', '메시지 써줘. 아까 건 써봤어.', 'completion'],
    ['L-07', '메시지를 써볼지 고민인데 일단 예시 하나 만들어줘.', 'completion'],
    ['L-08', '어제 답장 써봤어. 오늘 보낼 메시지 좀 써줘.', 'completion'],
    ['L-09', '걔가 답장 안 하면 메시지 하나 써줘', 'completion'],
    ['L-10', '내일까지 답 없으면 문자 써줘', 'completion'],
    ['L-11', '혹시 연락 오면 답장 써줘', 'completion'],
    ['L-12', '걔가 "메시지 써줘"라고 보냈어', 'null'],
    ['L-13', '친구가 나한테 답장 써달라고 했어', 'null'],
    ['L-14', '걔가 답장 써달래', 'null'],
    ['L-15', '"문장 좀 써줘"라고 하더라', 'null'],
    ['L-16', '메시지 써주지 마', 'null'],
    ['L-17', '답장 쓰지 말라고 해줘', 'null'],
    ['L-18', '문자 보내지 말라고 써줘', 'completion'],
  ] as const)('%s %s -> %s', (_id, text, expected) => {
    expect(detectAskMode(text) ?? 'null').toBe(expected);
  });
});

describe('detectAskMode — TESTSET E군 기존 브리프 81건, 회귀 감시 (BRIEF-100B-FIX4-C §2.1)', () => {
  it.each([
    ['E-001', '어제 답장 써봤는데 별로였어. 오늘 보낼 메시지 좀 써줘.', 'completion'],
    ['E-002', '아까 써준 거 말고 새로운 답장 써줘.', 'completion'],
    ['E-003', '메시지를 써볼지 고민인데 일단 예시 하나 만들어줘.', 'completion'],
    ['E-004', '내가 한번 써볼게. 참고할 문장도 하나 뽑아줘.', 'completion'],
    ['E-005', '아까 멘트 만들어서 보냈는데, 이번에는 다른 문장으로 써줘.', 'completion'],
    ['E-006', '문장 좀 써줘. 아까 건 써봤어.', 'completion'],
    ['E-007', '어제 답장 써봤는데 별로였어 오늘 보낼 메시지 좀 써줘', 'completion'],
    ['E-008', '메시지 써봤어 근데 별로야 다시 써줘', 'completion'],
    ['E-009', '답장 써볼게 근데 문장 하나만 뽑아줘', 'completion'],
    ['E-010', '어제 답장 써봤는데 별로였어.', 'null'],
    ['E-011', '아까 써준 거 말고 다른 걸 생각하고 있어.', 'null'],
    ['E-012', '메시지를 써볼지 고민이야.', 'null'],
    ['E-013', '내가 한번 써볼게.', 'null'],
    ['E-014', '보낼 메시지 좀 써줘', 'completion'],
    ['E-015', '답장 좀 써줘', 'completion'],
    ['E-016', '메시지 써줘', 'completion'],
    ['E-017', '멘트 좀 뽑아줘', 'completion'],
    ['E-018', '보낼 문장 써줘', 'completion'],
    ['E-019', '뭐라고 보낼지 써줘', 'completion'],
    ['E-020', '보낼 메시제 좀 써줘', 'completion'],
    ['E-021', '문장 써주라', 'completion'],
    ['E-022', '메시지 써봐줘', 'completion'],
    ['E-023', '답장 써줬으면 좋겠어', 'completion'],
    ['E-024', '메시지 하나 만들어줬으면 해', 'completion'],
    ['E-025', '보낼 멘트를 뽑아줬으면 좋겠는데', 'completion'],
    ['E-026', '답장 써줬으면 하는데 가능해?', 'completion'],
    ['E-027', '답장 써서 보내게 문장 좀 만들어줘', 'completion'],
    ['E-028', '메시지 써주세요', 'completion'],
    ['E-029', '답장 써줄래?', 'completion'],
    ['E-030', '문자 하나 써주면 좋겠어', 'completion'],
    ['E-031', '메시지 써줄 수 있어?', 'completion'],
    ['E-032', '문장 좀 만들어주라', 'completion'],
    ['E-033', '메시지 써줘 지금', 'completion'],
    ['E-034', '답장 어떻게 써?', 'completion'],
    ['E-035', 'draft a reply for me', 'completion'],
    ['E-036', 'I need to write a message', 'completion'],
    ['E-037', '답장 써봤어', 'null'],
    ['E-038', '메시지 써서 보냈어', 'null'],
    ['E-039', '문자 써놨어', 'null'],
    ['E-040', '어제 메시지 적어서 보냈어', 'null'],
    ['E-041', '아까 멘트 만들어서 보냈어', 'null'],
    ['E-042', '문자 써 보냈어', 'null'],
    ['E-043', '메시지 써뒀어', 'null'],
    ['E-044', '답장 써줬어', 'null'],
    ['E-045', '메시지 써줘서 고마워', 'null'],
    ['E-046', '아까 답장 써준 거 보냈어', 'null'],
    ['E-047', '메시지 써서 보냈는데 답이 없어', 'null'],
    ['E-048', '답장 써봤는데 어때?', 'null'],
    ['E-049', '내가 답장 썼어', 'null'],
    ['E-050', '답장 써볼까?', 'null'],
    ['E-051', '메시지를 한번 써볼지 고민이야', 'null'],
    ['E-052', '답장 써놓을까?', 'null'],
    ['E-053', '답장 써볼게', 'null'],
    ['E-054', '메시지 써둘게', 'null'],
    ['E-055', '답장 써야지', 'null'],
    ['E-056', '문자 써놓을게', 'null'],
    ['E-057', '메시지 써보려고', 'null'],
    ['E-058', '답장을 써야 할까?', 'null'],
    ['E-059', '답장 안 써', 'null'],
    ['E-060', '메시지 쓰기 싫어', 'null'],
    ['E-061', '지금 보낼 문장 2개만 써줘', 'strict_script'],
    ['E-062', '보낼 메시지 2개만 써줘', 'strict_script'],
    ['E-063', '지현이는 원래 그런 성격이야?', 'verdict_probe'],
    ['E-064', '뭐라고 답할까?', 'null'],
    ['E-065', '그럼 뭐 하자고 할까?', 'null'],
    ['E-066', '어제 연락했어', 'null'],
    ['E-067', '답장 왔어', 'null'],
    ['E-068', '문장 하나 골라줘', 'null'],
    ['E-069', 'she wrote me a message', 'null'],
    ['E-072', '그냥 써줘', 'null'],
    ['E-073', '메시지 써봤는데 친구에게 보여줘.', 'null'],
    ['E-074', '답장 써봤는데 이것 좀 봐줘.', 'null'],
    ['E-075', '메시지 써놨는데 읽어줘.', 'null'],
    ['E-076', '답장 써줘, 아니 이미 써봤어. 됐어.', 'null'],
    ['E-077', '답장 써봤는데 그냥 그대로 보내려고.', 'null'],
    ['E-078', '메시지 써줘 아니다 이미 써놨어', 'null'],
    ['E-079', '어제 답장 써봤어. 오늘 보낼 메시지 좀 써줘.', 'completion'],
    ['E-081', '답장 써줘서 고마워. 하나만 더 써줘.', 'completion'],
  ] as const)('%s %s -> %s', (_id, text, expected) => {
    expect(detectAskMode(text) ?? 'null').toBe(expected);
  });

  // TESTSET §4.5 잔여 FN — 목적어 명사(COMPLETION_PATTERNS)가 이 문장에도, 이월 대상 앞 절에도 전혀
  // 없어 탐지되지 않는다. 알려진 한계로 고정(§4 "지원 범위 밖으로 삭제·정상 동작으로 바꾸지 말 것").
  it.fails('E-070 하나만 더 써줘 -> completion (잔여 FN, §4.5)', () => {
    expect(detectAskMode('하나만 더 써줘') ?? 'null').toBe('completion');
  });
  it.fails('E-071 참고할 거 하나 만들어줘 -> completion (잔여 FN, §4.5)', () => {
    expect(detectAskMode('참고할 거 하나 만들어줘') ?? 'null').toBe('completion');
  });

  // BRIEF-100B-FIX5 §2.3 — E-080은 이 판에서 새로 FN이 된다. 완료 표지("써봤어")가 이제 절 전체를
  // 제외시키는데, splitSentences가 부호 없는 이 문장을 한 절로 묶어 순서를 못 보고 완료 표지가 이긴다
  // (부호 있는 버전인 E-079는 문장이 갈려 정상 판정된다). FP 26 해소와 맞바꾼 알려진 교환 비용(§4.5).
  it.fails('E-080 오늘 보낼 메시지 좀 써줘 어제 건 써봤어 -> completion (신규 잔여 FN, BRIEF-100B-FIX5 §4.5)', () => {
    expect(detectAskMode('오늘 보낼 메시지 좀 써줘 어제 건 써봤어') ?? 'null').toBe('completion');
  });
});

describe('COMPLETION_* 정규식 6종 — 양성·음성 최소 1건 (BRIEF-100B-FIX4-C §2.2)', () => {
  it('COMPLETION_SEGMENT_SPLIT — "일단" 앞에서 갈라진다(양성) / 갈릴 표지가 없으면 그대로다(음성)', () => {
    expect('그렇구나 일단 예시 하나 줘'.split(COMPLETION_SEGMENT_SPLIT).length).toBeGreaterThan(1);
    expect('그냥 평범한 문장입니다'.split(COMPLETION_SEGMENT_SPLIT)).toEqual(['그냥 평범한 문장입니다']);
  });

  it('COMPLETION_QUOTE_SPAN — 따옴표 구간을 찾는다(양성) / 따옴표 없으면 매치 없음(음성)', () => {
    expect(COMPLETION_QUOTE_SPAN.test('"메시지 써줘"라고 했어')).toBe(true);
    expect(COMPLETION_QUOTE_SPAN.test('메시지 써줘라고 했어')).toBe(false);
  });

  it('COMPLETION_REPORT_MARKER — "라고 했"/"~대"는 표지다(양성) / 전달 동사 없는 "라고 보낼"은 표지가 아니다(음성)', () => {
    expect(COMPLETION_REPORT_MARKER.test('라고 했어')).toBe(true);
    expect(COMPLETION_REPORT_MARKER.test('걔가 답장 써달래')).toBe(true);
    expect(COMPLETION_REPORT_MARKER.test('라고 보낼 메시지')).toBe(false);
  });

  it('COMPLETION_FORBID — "지 마"/"지 말고" 둘 다 표지다(양성) / 평범한 요청은 아니다(음성)', () => {
    expect(COMPLETION_FORBID.test('써주지 마')).toBe(true);
    expect(COMPLETION_FORBID.test('써주지 말고 조언만')).toBe(true);
    expect(COMPLETION_FORBID.test('메시지 써줘')).toBe(false);
  });

  it('COMPLETION_CANCEL — "아니"/"됐어" 등은 취소 표지다(양성) / 무관한 문장은 아니다(음성)', () => {
    expect(COMPLETION_CANCEL.test('아니 됐어')).toBe(true);
    expect(COMPLETION_CANCEL.test('메시지 써줘')).toBe(false);
  });

  it('COMPLETION_REQUEST_ENDINGS — "써줘"류 요청 어미다(양성) / 완료형 어미는 아니다(음성)', () => {
    expect(COMPLETION_REQUEST_ENDINGS.test('하나만 써줘')).toBe(true);
    expect(COMPLETION_REQUEST_ENDINGS.test('하나 써봤어')).toBe(false);
  });
});

describe('splitCompletionParts — 3개 고정 사례 (BRIEF-100B-FIX4-C §2.2)', () => {
  it('걔가 "메시지 써줘"라고 보냈어 -> quote 1개, user 부분에는 요청이 없다', () => {
    const parts = splitCompletionParts('걔가 "메시지 써줘"라고 보냈어');
    expect(parts.filter(p => p.kind === 'quote')).toHaveLength(1);
    expect(detectCompletionRequest('걔가 "메시지 써줘"라고 보냈어')).toBe(false);
  });

  it('걔한테 "잘 지내?"라고 보낼 메시지 써줘 -> 표지 없는 "라고 보낼"이라 인용에 안 먹히고, user 꼬리(실제 요청)가 살아있다', () => {
    const parts = splitCompletionParts('걔한테 "잘 지내?"라고 보낼 메시지 써줘');
    const userText = parts.filter(p => p.kind === 'user').map(p => p.text).join('');
    expect(userText).toContain('메시지 써줘');
    expect(detectCompletionRequest('걔한테 "잘 지내?"라고 보낼 메시지 써줘')).toBe(true);
  });

  it('메시지 써줘. 아니다 걔가 먼저 쓴대. -> 두 번째 문장이 "아니다"(user) + "걔가 먼저 쓴대"(quote)로 갈린다', () => {
    const sentences = splitSentences('메시지 써줘. 아니다 걔가 먼저 쓴대.');
    expect(sentences).toHaveLength(2);
    const parts = splitCompletionParts(sentences[1]);
    expect(parts.some(p => p.kind === 'user' && p.text === '아니다')).toBe(true);
    expect(parts.some(p => p.kind === 'quote' && p.text.includes('걔가 먼저 쓴대'))).toBe(true);
  });
});

describe('구조 회귀 — BRIEF-100B-FIX4-C §2.3', () => {
  it('COMPLETION_PATTERNS 무변경 (3개, 기존 문구 그대로)', () => {
    expect(COMPLETION_PATTERNS).toHaveLength(3);
    expect(COMPLETION_PATTERNS.some(p => p.test('메시지 좀 써줘'))).toBe(true);
  });

  it('BRIEF-100B-FIX5 §2.4 — COMPLETION_EXCLUSIONS는 2개 -> 8개, 기존 2개는 [0]·[1]에 그대로', () => {
    expect(COMPLETION_EXCLUSIONS).toHaveLength(8);
    expect(COMPLETION_EXCLUSIONS[0].test('안 써')).toBe(true);
    expect(COMPLETION_EXCLUSIONS[1].test('써야 할까')).toBe(true);
  });

  it('STRICT_SCRIPT_PATTERNS·VERDICT_PROBE_PATTERNS 무변경 (개수 6개 / 6개, 우선순위 유지)', () => {
    expect(STRICT_SCRIPT_PATTERNS).toHaveLength(6);
    expect(VERDICT_PROBE_PATTERNS).toHaveLength(6);
    expect(detectAskMode('지금 보낼 문장 2개만 써줘')).toBe('strict_script');
    expect(detectAskMode('지현이는 원래 그런 성격이야?')).toBe('verdict_probe');
  });

  it('validateAskAnswer·최종 처분·프롬프트 블록 무변경 — 기존 BRIEF-100B-FIX/FIX3 테스트 전건이 이 파일 안에서 그대로 통과(회귀는 전체 vitest 실행 수치로 별도 확인)', () => {
    const answer = { text: '문장 하나.' };
    const ctx: { askMode: null; personIntroduced: boolean; candidates: string[]; latestUserText: string } =
      { askMode: null, personIntroduced: false, candidates: [], latestUserText: '' };
    expect(validateAskAnswer(answer, ctx)).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// BRIEF-100B-FIX6 — Ask 응답 파싱 실패(502) 결정적 복구
// ══════════════════════════════════════════════════════════════════════════

const meBody = { mode: 'me' as const, me: { date: '1990-06-15', time: '14:30' }, history: [] as unknown[] };

describe('repairControlCharsInStrings (BRIEF-100B-FIX6 §2.1)', () => {
  it('④ 문자열 안의 실제 LF를 텍스트 \\n으로 치환한다', () => {
    const raw = '{"text":"a\nb"}'; // a와 b 사이가 실제 개행 문자
    const repaired = repairControlCharsInStrings(raw);
    expect(repaired).toBe('{"text":"a\\nb"}');
    expect(JSON.parse(repaired)).toEqual({ text: 'a\nb' });
  });

  it('⑤ 문자열 밖의 개행(들여쓰기된 JSON)은 훼손하지 않는다', () => {
    const pretty = '{\n  "text": "hello"\n}';
    expect(repairControlCharsInStrings(pretty)).toBe(pretty);
  });

  it('⑥ 이스케이프된 따옴표(\\")·백슬래시(\\\\)를 문자열 경계로 오인하지 않고, 내부 실제 개행만 정확히 수리한다', () => {
    const raw = '{"text":"she said \\"hi\\" and used \\\\ then\nnext"}';
    const repaired = repairControlCharsInStrings(raw);
    const parsed = JSON.parse(repaired) as { text: string };
    expect(parsed.text).toBe('she said "hi" and used \\ then\nnext');
  });

  it('⑭c 문자열 안의 실제 CR·TAB도 LF와 동일하게 수리한다', () => {
    const raw = '{"text":"a\rb\tc"}';
    const repaired = repairControlCharsInStrings(raw);
    expect(JSON.parse(repaired)).toEqual({ text: 'a\rb\tc' });
  });
});

describe('tryParse — D-상태 분류 (BRIEF-100B-FIX6 §1/§2.2)', () => {
  it('① 정상 JSON(D1) — 무변경 통과', () => {
    const res = tryParse('{"text":"hi"}');
    expect(res.ok).toBe(true);
    if (res.ok) { expect(res.value).toEqual({ text: 'hi' }); expect(res.repaired).toBe(false); }
  });

  it('② 펜스로 감싼 JSON(D2) — 정상 파싱', () => {
    const res = tryParse('```json\n{"text":"hi"}\n```');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toEqual({ text: 'hi' });
  });

  it('③ 앞뒤 설명 포함 JSON(D3) — 정상 파싱', () => {
    const res = tryParse('Here you go:\n{"text":"hi"}\nHope that helps!');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toEqual({ text: 'hi' });
  });

  it('④ 문자열 내부 실제 줄바꿈(D4) — 수리 후 파싱 성공, repaired=true', () => {
    const res = tryParse('{"text":"a\nb"}');
    expect(res.ok).toBe(true);
    if (res.ok) { expect(res.value).toEqual({ text: 'a\nb' }); expect(res.repaired).toBe(true); }
  });

  it('⑦ 잘린 JSON({"text":"... 끝) — 수리 거부(변경 없음) → 실패, shape=object_invalid, repair=none', () => {
    const res = tryParse('{"text":"abc');
    expect(res.ok).toBe(false);
    if (!res.ok) { expect(res.shape).toBe('object_invalid'); expect(res.repair).toBe('none'); expect(res.brace).toBe(true); }
  });

  it('⑧ object-like 불법 텍스트({ 있으나 파싱 불가) — shape=object_invalid(D5), fallback 대상 아님', () => {
    const res = tryParse('{ this is not valid json, sorry }');
    expect(res.ok).toBe(false);
    if (!res.ok) { expect(res.shape).toBe('object_invalid'); expect(res.brace).toBe(true); }
  });

  it('명백한 일반 텍스트(D6) — shape=plain, brace=false, fence=false', () => {
    const res = tryParse('오랜만이야.\n잘 지내?');
    expect(res.ok).toBe(false);
    if (!res.ok) { expect(res.shape).toBe('plain'); expect(res.brace).toBe(false); expect(res.fence).toBe(false); }
  });

  it('⑭ 펜스만 있고 내부 일반 텍스트(D7) — shape=fence_plain', () => {
    const res = tryParse('```\n오랜만이야.\n잘 지내?\n```');
    expect(res.ok).toBe(false);
    if (!res.ok) { expect(res.shape).toBe('fence_plain'); expect(res.fence).toBe(true); expect(res.brace).toBe(false); }
  });
});

describe('tryPlainTextFallback — 단위 (BRIEF-100B-FIX6 §2.3)', () => {
  const strictCtx = (latestUserText: string) =>
    ({ askMode: 'strict_script' as const, personIntroduced: false, candidates: [] as string[], latestUserText });
  const completionCtx = { askMode: 'completion' as const, personIntroduced: false, candidates: [] as string[], latestUserText: '메시지 좀 써줘' };
  const nullCtx = { askMode: null, personIntroduced: false, candidates: [] as string[], latestUserText: '오늘 기분이 어때?' };

  it('D5(object_invalid)에는 절대 발동하지 않는다', () => {
    const parseFail = tryParse('{ broken') as Exclude<ReturnType<typeof tryParse>, { ok: true }>;
    expect(tryPlainTextFallback(parseFail, '{ broken', 'me', completionCtx)).toBeNull();
  });

  it('⑬ askMode가 strict_script/completion이 아니면 D6이어도 발동하지 않는다', () => {
    const raw = '오랜만이야.\n잘 지내?';
    const parseFail = tryParse(raw) as Exclude<ReturnType<typeof tryParse>, { ok: true }>;
    expect(tryPlainTextFallback(parseFail, raw, 'me', nullCtx)).toBeNull();
  });

  it('⑨ strict_script + 요청 개수와 일치하는 일반 텍스트 -> 채택', () => {
    const raw = '오랜만이야.\n잘 지내?';
    const parseFail = tryParse(raw) as Exclude<ReturnType<typeof tryParse>, { ok: true }>;
    const fb = tryPlainTextFallback(parseFail, raw, 'me', strictCtx('지금 보낼 문장 2개만 써줘'));
    expect(fb).toEqual({ text: raw });
  });

  it('⑪ 특혜 금지 — 요청 개수와 다른 일반 텍스트는 폐기', () => {
    const raw = '하나.\n둘.\n셋.';
    const parseFail = tryParse(raw) as Exclude<ReturnType<typeof tryParse>, { ok: true }>;
    const fb = tryPlainTextFallback(parseFail, raw, 'me', strictCtx('지금 보낼 문장 2개만 써줘'));
    expect(fb).toBeNull();
  });

  it('⑫ 금지어 포함 텍스트는 폐기(D8)', () => {
    const raw = '이건 weakness를 이용하는 문장입니다.';
    const parseFail = tryParse(raw) as Exclude<ReturnType<typeof tryParse>, { ok: true }>;
    const fb = tryPlainTextFallback(parseFail, raw, 'me', completionCtx);
    expect(fb).toBeNull();
  });
});

describe('POST /api/ask — BRIEF-100B-FIX6 파이프라인 (§3 ⑨~⑬·⑭d·⑭e)', () => {
  it('⑨ 명백한 일반 텍스트(2줄) + askMode=strict_script(요청 2개) -> fallback 채택, 200, 호출 1회', async () => {
    mockGenerateJsonChat.mockClear();
    mockGenerateJsonChat.mockResolvedValueOnce('오랜만이야.\n잘 지내?');

    const res = await POST(makeAskRequest({ ...meBody, question: '지금 보낼 문장 2개만 써줘' }));
    const data = await res.json() as { answer?: { text?: string } };

    expect(res.status).toBe(200);
    expect(data.answer?.text).toBe('오랜만이야.\n잘 지내?');
    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(1); // ⑭d
  });

  it('⑩ 같은 텍스트 + askMode=completion -> fallback 채택, 200, 호출 1회', async () => {
    mockGenerateJsonChat.mockClear();
    mockGenerateJsonChat.mockResolvedValueOnce('오랜만이야.\n잘 지내?');

    const res = await POST(makeAskRequest({ ...meBody, question: '메시지 좀 써줘' }));
    const data = await res.json() as { answer?: { text?: string } };

    expect(res.status).toBe(200);
    expect(data.answer?.text).toBe('오랜만이야.\n잘 지내?');
    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(1); // ⑭d
  });

  it('⑪ 줄 수 불일치(요청 2, 텍스트 3줄) -> fallback 폐기(특혜 금지), 재시도도 같으면 502, 호출 2회', async () => {
    mockGenerateJsonChat.mockClear();
    const bad = '하나.\n둘.\n셋.';
    mockGenerateJsonChat.mockResolvedValueOnce(bad).mockResolvedValueOnce(bad);

    const res = await POST(makeAskRequest({ ...meBody, question: '지금 보낼 문장 2개만 써줘' }));
    const data = await res.json() as { code?: string };

    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(502);
    expect(data.code).toBe('parse');
  });

  it('⑫ 금지어 포함 일반 텍스트 -> fallback 폐기(D8), 재시도도 같으면 502', async () => {
    mockGenerateJsonChat.mockClear();
    const bad = '이건 weakness를 이용하는 문장입니다.';
    mockGenerateJsonChat.mockResolvedValueOnce(bad).mockResolvedValueOnce(bad);

    const res = await POST(makeAskRequest({ ...meBody, question: '메시지 좀 써줘' }));
    const data = await res.json() as { code?: string };

    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(502);
    expect(data.code).toBe('parse');
  });

  it('⑬ askMode=null(일반 턴)의 일반 텍스트 -> fallback 발동 안 함, 기존 실패 경로(502) 그대로', async () => {
    mockGenerateJsonChat.mockClear();
    mockGenerateJsonChat.mockResolvedValueOnce('그냥 평범한 대답입니다.').mockResolvedValueOnce('역시 평범한 대답입니다.');

    const res = await POST(makeAskRequest({ ...meBody, question: '오늘 기분이 어때?' }));
    const data = await res.json() as { code?: string };

    expect(res.status).toBe(502);
    expect(data.code).toBe('parse');
  });

  it('⑭ 펜스만 있고 내부 일반 텍스트(D7) + strict_script -> D6과 동일 규칙으로 fallback 채택', async () => {
    mockGenerateJsonChat.mockClear();
    mockGenerateJsonChat.mockResolvedValueOnce('```\n오랜만이야.\n잘 지내?\n```');

    const res = await POST(makeAskRequest({ ...meBody, question: '지금 보낼 문장 2개만 써줘' }));
    const data = await res.json() as { answer?: { text?: string } };

    expect(res.status).toBe(200);
    expect(data.answer?.text).toBe('오랜만이야.\n잘 지내?');
  });

  it('⑭e 1차 fallback 폐기 -> 공유 재시도 1회 -> 재시도가 정상 JSON이면 총 2회 호출로 성공', async () => {
    mockGenerateJsonChat.mockClear();
    const badFirst = '하나.\n둘.\n셋.'; // 개수 불일치로 fallback 폐기
    const goodSecond = JSON.stringify({ text: '오랜만이야.\n잘 지내?' });
    mockGenerateJsonChat.mockResolvedValueOnce(badFirst).mockResolvedValueOnce(goodSecond);

    const res = await POST(makeAskRequest({ ...meBody, question: '지금 보낼 문장 2개만 써줘' }));
    const data = await res.json() as { answer?: { text?: string } };

    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
    expect(data.answer?.text).toBe('오랜만이야.\n잘 지내?');
  });

  it('D4 수리 성공은 askMode와 무관하게 동작한다 (일반 턴에서도 수리 후 정상 200)', async () => {
    mockGenerateJsonChat.mockClear();
    mockGenerateJsonChat.mockResolvedValueOnce('{"text":"오랜만이야.\n잘 지내?"}'); // 실제 개행 포함

    const res = await POST(makeAskRequest({ ...meBody, question: '오늘 기분이 어때?' }));
    const data = await res.json() as { answer?: { text?: string } };

    expect(res.status).toBe(200);
    expect(data.answer?.text).toBe('오랜만이야.\n잘 지내?');
  });
});

describe('로그 계약 (BRIEF-100B-FIX6 §2.5, 테스트 ⑭f)', () => {
  it('파싱 실패·fallback 폐기 로그에 필수 필드가 전부 있고, 원문 내용은 로그에 없다', async () => {
    mockGenerateJsonChat.mockClear();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const bad = '하나.\n둘.\n셋.';
      mockGenerateJsonChat.mockResolvedValueOnce(bad).mockResolvedValueOnce(bad);

      await POST(makeAskRequest({ ...meBody, question: '지금 보낼 문장 2개만 써줘' }));

      const lines = errorSpy.mock.calls.map(c => c.join(' ')).filter(l => l.startsWith('[ask]'));
      const parseLines = lines.filter(l => l.includes('stage=parse'));
      expect(parseLines.length).toBeGreaterThan(0);
      for (const line of parseLines) {
        expect(line).toMatch(/shape=(object_repaired|object_invalid|plain|fence_plain)/);
        expect(line).toMatch(/firstChar=(brace|quote|fence|hangul|latin|space|other)/);
        expect(line).toMatch(/brace=[yn]/);
        expect(line).toMatch(/fence=[yn]/);
        expect(line).toMatch(/repair=(none|ctrl_fixed|failed)/);
        expect(line).not.toContain('하나');
        expect(line).not.toContain('둘');
        expect(line).not.toContain('셋');
      }
      expect(lines.some(l => l.includes('fallback=rejected'))).toBe(true);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('D4 수리 성공 로그 — shape=object_repaired repair=ctrl_fixed, 원문 내용은 없음', async () => {
    mockGenerateJsonChat.mockClear();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mockGenerateJsonChat.mockResolvedValueOnce('{"text":"오랜만이야.\n잘 지내?"}');
      const res = await POST(makeAskRequest({ ...meBody, question: '오늘 기분이 어때?' }));
      expect(res.status).toBe(200);

      const lines = errorSpy.mock.calls.map(c => c.join(' ')).filter(l => l.startsWith('[ask]'));
      const repairedLine = lines.find(l => l.includes('shape=object_repaired'));
      expect(repairedLine).toBeDefined();
      expect(repairedLine).toContain('repair=ctrl_fixed');
      expect(repairedLine).not.toContain('오랜만이야');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('fallback 채택 로그 — fallback=used, 원문 내용은 없음', async () => {
    mockGenerateJsonChat.mockClear();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mockGenerateJsonChat.mockResolvedValueOnce('오랜만이야.\n잘 지내?');
      await POST(makeAskRequest({ ...meBody, question: '지금 보낼 문장 2개만 써줘' }));

      const lines = errorSpy.mock.calls.map(c => c.join(' ')).filter(l => l.startsWith('[ask]'));
      const usedLine = lines.find(l => l.includes('fallback=used'));
      expect(usedLine).toBeDefined();
      expect(usedLine).not.toContain('오랜만이야');
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe('프롬프트 이스케이프 보조 문장 (BRIEF-100B-FIX6 §2.4, 테스트 ⑭b)', () => {
  const meChart = calculateSaju({ date: '1990-06-15', time: '14:30' });

  it('STRICT_SCRIPT_BLOCK — 런타임 값에 백슬래시 1개+n(2문자) 시퀀스가 있고, 그 자리에 실제 개행은 없다', () => {
    const system = buildAskSystem('me', meChart, null, undefined, [], 'Alex', undefined, undefined, false, undefined, 'strict_script', false);
    expect(system).toContain('Newlines inside "text" must be written as \\n, never as a raw line break.');
    const idx = system.indexOf('Output format reminder');
    const end = system.indexOf('raw line break.', idx);
    expect(idx).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(idx);
    const sentence = system.slice(idx, end + 'raw line break.'.length);
    expect(sentence.includes('\n')).toBe(false);
  });

  it('COMPLETION_BLOCK — 런타임 값에 백슬래시 1개+n(2문자) 시퀀스가 있고, 그 자리에 실제 개행은 없다', () => {
    const system = buildAskSystem('me', meChart, null, undefined, [], 'Alex', undefined, undefined, false, undefined, 'completion', false);
    expect(system).toContain('Newlines inside "text" must be written as \\n, never as a raw line break.');
    const idx = system.indexOf('Output format reminder');
    const end = system.indexOf('raw line break.', idx);
    expect(idx).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(idx);
    const sentence = system.slice(idx, end + 'raw line break.'.length);
    expect(sentence.includes('\n')).toBe(false);
  });
});

describe('구조 회귀 — BRIEF-100B-FIX6 §4 (분류 로직 무접촉)', () => {
  it('COMPLETION_PATTERNS·COMPLETION_EXCLUSIONS·STRICT_SCRIPT_PATTERNS·VERDICT_PROBE_PATTERNS 무변경(길이 그대로)', () => {
    expect(COMPLETION_PATTERNS).toHaveLength(3);
    expect(COMPLETION_EXCLUSIONS).toHaveLength(8);
    expect(STRICT_SCRIPT_PATTERNS).toHaveLength(6);
    expect(VERDICT_PROBE_PATTERNS).toHaveLength(6);
  });

  it('⑮ 분류 무변경 — 대표 샘플 재확인(전건 증거는 이 파일의 기존 X38/L/E75 + it.fails 4건이 그대로 재실행되는 것)', () => {
    // detectAskMode·detectCompletionRequest·splitCompletionParts·COMPLETION_* 상수는 이 BRIEF에서
    // 손대지 않았으므로, FIX5에서 고정된 TESTSET v1.2 115건 corpus의 테스트 블록이 이 파일 안에서
    // 그대로 재실행돼 동일하게 통과하는 것 자체가 ⑮의 증거다(코드가 물리적으로 무변경).
    expect(detectAskMode('메시지 써줘')).toBe('completion');
    expect(detectAskMode('답장 써봤어')).toBe(null);
    expect(detectAskMode('메시지 써주지 마')).toBe(null);
  });
});

describe('날짜–간지 결정적 검증 (BRIEF-105 §2.2/§3)', () => {
  const dailyPillars = getDailyPillars('2026-08-11', 90);
  const lookup = buildDailyPillarLookup(dailyPillars);
  const baseCtx = { askMode: null, personIntroduced: false, candidates: [], latestUserText: '', dailyPillarLookup: lookup, todayDate: '2026-08-11' };

  it('T1 — 기준표 생성: 2026-08-18 -> 나무 쥐 / Wood Rat / 갑자 / 甲子', () => {
    const entry = lookup.get('2026-08-18');
    expect(entry).toBeDefined();
    expect(entry?.friendlyKo).toBe('나무 쥐');
    expect(entry?.friendlyEn).toBe('Wood Rat');
    expect(entry?.ganziHangul).toBe('갑자');
    expect(entry?.ganziHanja).toBe('甲子');
  });

  it('T2 — 실패 재현(회귀 고정): 「8월 18일(물 호랑이 날)」 -> date_pillar_mismatch 1건, detail에 날짜·오답·정답 포함', () => {
    const answer = { text: '다음 주 화요일인 8월 18일(물 호랑이 날)은 흐름이 부드러워질 거예요.' };
    const dp = validateAskAnswer(answer, baseCtx).filter(v => v.type === 'date_pillar_mismatch');
    expect(dp).toHaveLength(1);
    expect(dp[0].detail).toContain('2026-08-18');
    expect(dp[0].detail).toContain('물 호랑이');
    expect(dp[0].detail).toContain('나무 쥐');
  });

  it('T3 — 정상 통과: 「8월 14일(쇠 원숭이 날)」은 실제 정답이라 위반 0', () => {
    const answer = { text: '8월 14일(쇠 원숭이 날)은 실속 있게 움직이기 좋아요.' };
    const dp = validateAskAnswer(answer, baseCtx).filter(v => v.type === 'date_pillar_mismatch');
    expect(dp).toHaveLength(0);
  });

  it('T4 — 영어: "a Water Tiger day"는 위반 1, "a Wood Rat day"는 위반 0', () => {
    const wrong = validateAskAnswer({ text: 'Tuesday, August 18 is a Water Tiger day.' }, baseCtx)
      .filter(v => v.type === 'date_pillar_mismatch');
    expect(wrong).toHaveLength(1);

    const right = validateAskAnswer({ text: 'Tuesday, August 18 is a Wood Rat day.' }, baseCtx)
      .filter(v => v.type === 'date_pillar_mismatch');
    expect(right).toHaveLength(0);
  });

  it('T5 — 오탐 방지: 날짜 없이 간지만 언급하면 위반 0', () => {
    const dp = validateAskAnswer({ text: '물 호랑이 기운이 은은하게 느껴지는 하루예요.' }, baseCtx)
      .filter(v => v.type === 'date_pillar_mismatch');
    expect(dp).toHaveLength(0);
  });

  it('T6 — 교정 경고: buildCorrectionWarnings가 날짜·오답·정답을 담은 문구를 만든다', () => {
    const warnings = buildCorrectionWarnings(false, [], [
      { type: 'date_pillar_mismatch', detail: '2026-08-18|물 호랑이|나무 쥐' },
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('DATE');
    expect(warnings[0]).toContain('2026-08-18');
    expect(warnings[0]).toContain('물 호랑이');
    expect(warnings[0]).toContain('나무 쥐');
  });

  it('T7 — 최종 보정: 괄호형은 날 이름만 제거되고 문장은 보존, 비괄호형은 변경 없이 soft 플래그', () => {
    const bracketAnswer = { text: '다음 주 화요일인 8월 18일(물 호랑이 날)은 흐름이 부드러워질 거예요.' };
    const bracketViolations = validateAskAnswer(bracketAnswer, baseCtx).filter(v => v.type === 'date_pillar_mismatch');
    const bracketResult = applyFinalDisposition(bracketAnswer, bracketViolations, baseCtx);
    expect(bracketResult.answer.text).toBe('다음 주 화요일인 8월 18일은 흐름이 부드러워질 거예요.');
    expect(bracketResult.flags).toContainEqual({ stage: 'datepillar', action: 'strip_dayname' });

    const plainAnswer = { text: '물 호랑이 기운이라 그래요, 8월 18일은.' };
    const plainViolations = validateAskAnswer(plainAnswer, baseCtx).filter(v => v.type === 'date_pillar_mismatch');
    expect(plainViolations.length).toBeGreaterThan(0);
    const plainResult = applyFinalDisposition(plainAnswer, plainViolations, baseCtx);
    expect(plainResult.answer.text).toBe(plainAnswer.text);
    expect(plainResult.flags).toContainEqual({ stage: 'datepillar', action: 'soft' });
  });

  it('T8 — 다중 날짜 면제: 날 이름이 문장 속 어느 날짜와도 맞으면 다른 날짜에 대해 잡지 않는다', () => {
    const answer = { text: '이번 주 금요일인 8월 14일(쇠 원숭이 날)이나 다음 주 화요일인 8월 18일은 흐름이 부드러워요.' };
    const dp = validateAskAnswer(answer, baseCtx).filter(v => v.type === 'date_pillar_mismatch');
    expect(dp).toHaveLength(0);
  });

  it('T9 — 다중 날짜 귀속(회귀 고정): 실측 실패 원문 -> date_pillar_mismatch 정확히 1건, 가장 가까운 날짜(8/18)로 귀속', () => {
    const answer = { text: '이번 주 금요일인 8월 14일(원숭이 날)이나 다음 주 화요일인 8월 18일(물 호랑이 날)은 흐름이 부드러워 부담 없이 가볍게 안부를 묻기 좋아요.' };
    const dp = validateAskAnswer(answer, baseCtx).filter(v => v.type === 'date_pillar_mismatch');
    expect(dp).toHaveLength(1);
    expect(dp[0].detail).toBe('2026-08-18|물 호랑이|나무 쥐');
    expect(dp.some(v => (v.detail ?? '').includes('2026-08-14'))).toBe(false);
  });
});

describe('교차언어 답변 탐지·처분 (BRIEF-106)', () => {
  const langCtx = (expectedLang: 'ko' | 'en' | undefined, nameAllowlist: string[] = []) =>
    ({ askMode: null, personIntroduced: false, candidates: [] as string[], latestUserText: '', expectedLang, nameAllowlist });

  it('1) expectedLang=en + 답이 전부 한국어 -> response_language_drift 1건', () => {
    const answer = { text: '이건 전부 한국어로 쓰인 답변이에요. 영어 단어가 하나도 없어요.' };
    const v = validateAskAnswer(answer, langCtx('en'));
    const drift = v.filter(x => x.type === 'response_language_drift');
    expect(drift).toHaveLength(1);
  });

  it('2) expectedLang=ko + 답이 한국어인데 「Earth Dragon」 포함 -> foreign_language_leak 1건', () => {
    const answer = { text: '오늘은 Earth Dragon 기운이 강해서 대화가 편안하게 흘러갈 거예요.' };
    const v = validateAskAnswer(answer, langCtx('ko'));
    expect(v.filter(x => x.type === 'response_language_drift')).toHaveLength(0);
    expect(v.filter(x => x.type === 'foreign_language_leak')).toHaveLength(1);
  });

  it('3) expectedLang=ko + 답 전부 한국어(파트 라벨은 계약상 영어 대문자) -> 위반 0 (라벨 오탐 없음)', () => {
    const answer = {
      parts: UNDERSTAND_LABELS.map(label => ({ label, text: '짧고 구체적인 한국어 문장이에요.' })),
    };
    const v = validateAskAnswer(answer, langCtx('ko')).filter(
      x => x.type === 'response_language_drift' || x.type === 'foreign_language_leak',
    );
    expect(v).toHaveLength(0);
  });

  it('4) expectedLang=en + 답 전부 영어인데 상대 이름이 「한결」 -> 위반 0 (nameAllowlist 동작)', () => {
    const answer = { text: '한결 has been a bit quiet lately, but that does not mean much on its own.' };
    const v = validateAskAnswer(answer, langCtx('en', ['한결'])).filter(
      x => x.type === 'response_language_drift' || x.type === 'foreign_language_leak',
    );
    expect(v).toHaveLength(0);
  });

  it('5) expectedLang 미전달 -> 언어 위반 0 (fail-open 가드)', () => {
    const answer = { text: 'This is a fully English answer with zero Korean characters at all.' };
    const v = validateAskAnswer(answer, langCtx(undefined)).filter(
      x => x.type === 'response_language_drift' || x.type === 'foreign_language_leak',
    );
    expect(v).toHaveLength(0);
  });

  it('6) expectedLang=ko + 답에 한자 「水」·「壬」만 섞임 -> 위반 0 (한자는 애초에 안 셈)', () => {
    const answer = { text: '오늘은 壬水 기운이 도와줘서 대화가 한결 편안하게 풀릴 거예요.' };
    const v = validateAskAnswer(answer, langCtx('ko')).filter(
      x => x.type === 'response_language_drift' || x.type === 'foreign_language_leak',
    );
    expect(v).toHaveLength(0);
  });

  it('7) 판정 승계: 최신 질문이 「ㅇㅋ」(판정 불가) + 직전 user 메시지가 한국어 -> ko 승계', () => {
    const history = [
      { role: 'user' as const, text: '오늘 컨디션이 좀 어때?' },
      { role: 'assistant' as const, text: 'Doing okay, nothing unusual today.' },
    ];
    expect(detectExpectedLang('ㅇㅋ', history)).toBe('ko');
  });

  it('8) buildCorrectionWarnings에서 언어 경고가 배열 index 0', () => {
    const violations = [
      { type: 'label_set' as const },
      { type: 'response_language_drift' as const, detail: 'ko|0|50|1.000' },
    ];
    const warnings = buildCorrectionWarnings(false, [], violations);
    expect(warnings[0]).toContain('LANGUAGE VIOLATION');
    expect(warnings.some(w => w.includes('LABEL SET VIOLATION'))).toBe(true);
  });
});

describe('교차언어 요청에서의 오탐 제거 (BRIEF-106-FIX)', () => {
  // §1.3 — 참이어야 하는 21개 (오른쪽은 걸린 패턴 번호, 참고용)
  const explicitTrue: Array<[string, string]> = [
    ['라일리한테 보낼 영어 메시지 두 개 써줘', '②'],
    ['영문 답장 써줘', '②'],
    ['한국어 문장으로 바꿔줘', '②'],
    ['일본어 편지 하나 써줘', '②'],
    ['영어 메세지 두 개만', '②'],
    ['영어로 메시지 써줘', '①'],
    ['영문으로 써줘', '①'],
    ['한국어로 답해줘', '①'],
    ['이거 영어로 번역해줘', '①'],
    ['한국어로 번역해줘', '①'],
    ['영문으로 번역해줘', '①'],
    ['English로 써줘', '⑤'],
    ['Korean으로 답해줘', '⑤'],
    ['English 로 써줘', '⑤'],
    ['Write me an English message', '④'],
    ['Give me a Korean reply', '④'],
    ['Give me an English translation', '④'],
    ['Translate it to Korean', '③'],
    ['Translate this into Japanese', '③'],
    ['write it in Korean', '③'],
    ['in English please', '③'],
  ];

  // §1.3 — 거짓이어야 하는 22개
  const explicitFalse: string[] = [
    // 비유적 번역
    'Can you translate what their silence means?',
    'Translate their mixed signals for me.',
    'Can you translate this behavior?',
    '그 사람의 침묵을 번역해줘',
    '그 행동이 무슨 뜻인지 번역해줘',
    '이 애매한 신호 좀 해석해줘',
    '번역해줘',
    'translate this',
    // 언어를 화제로만 언급 / 일반 질문
    '영어 공부 얘기 좀 해줘',
    'Should I ask again?',
    '오늘 어때?',
    '라일리한테 뭐라고 보낼까?',
    '그 사람 원래 그래?',
    '8월 18일 어때?',
    // 언어 지시 없는 보낼 글 요청
    'Write me two messages I could send.',
    '문장 두 개 써줘',
    '메시지 좀 써줘',
    '답장 안 써',
    // 음성 기준선 6턴 픽스처의 실제 질문
    'I want to ask Riley to work on a project with me. How should I bring it up?',
    'I brought it up yesterday and they just said they would think about it.',
    'No reply today.',
    'Why are they being so lukewarm about this?',
  ];

  it('§1.3 참 21개 — 전건 매칭', () => {
    for (const [q] of explicitTrue) {
      expect(hasExplicitLanguageRequest(q), `should match: ${q}`).toBe(true);
    }
  });

  it('§1.3 거짓 22개 — 전건 무매칭', () => {
    for (const q of explicitFalse) {
      expect(hasExplicitLanguageRequest(q), `should NOT match: ${q}`).toBe(false);
    }
  });

  it('§1.3 코퍼스 고유 질문 12개 — 매칭 0건 (회귀 12행이 그대로여야 하는 근거)', () => {
    const corpusQuestions = [
      "I want to ask Riley to work on a project with me. How should I bring it up?",
      "I brought it up yesterday and they just said they'd think about it.",
      'Should I ask again? When would be a good day?',
      'No reply today.',
      'Why are they being so lukewarm about this?',
      'Write me two messages I could send.',
      '한결이한테 같이 프로젝트 하자고 제안하려는데 어떻게 꺼내는 게 좋을까?',
      '어제 얘기 꺼냈더니 생각해보겠다고만 했어.',
      '다시 물어봐도 될까? 언제가 좋을까?',
      '오늘은 답이 없었어.',
      '얘는 왜 이렇게 미지근한 걸까?',
      '그럼 보낼 만한 메시지 두 개만 써줘.',
    ];
    for (const q of corpusQuestions) {
      expect(hasExplicitLanguageRequest(q), `should NOT match: ${q}`).toBe(false);
    }
  });

  // §4.2 — 502 분기 네 조합. meBaseBody 재사용(완료 모드는 'me' 모드로도 재현 가능).
  const meBaseBody = {
    mode: 'me' as const,
    me: { date: '1990-06-15', time: '14:30' },
    history: [] as unknown[],
  };

  it('§4.2 combo A — 예산 소진 + 보낼 글 모드(completion)에서 drift는 502 아님, soft flag', async () => {
    mockGenerateJsonChat.mockClear();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const englishText = 'This is a fully English answer with no Korean words in it at all right now.';
    mockGenerateJsonChat
      .mockResolvedValueOnce('not json at all')
      .mockResolvedValueOnce(JSON.stringify({ text: englishText }));

    const res = await POST(makeAskRequest({ ...meBaseBody, question: '메시지 좀 써줘' }));
    const data = await res.json() as { answer?: { text?: string } };

    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
    expect(data.answer?.text).toBe(englishText); // 답 원문 유지
    expect(errSpy.mock.calls.some(c => String(c[0]).includes('stage=lang action=soft'))).toBe(true);
    errSpy.mockRestore();
  });

  it('§4.2 combo B — 교정 후에도 drift + 보낼 글 모드(completion)면 502 아님, soft flag', async () => {
    mockGenerateJsonChat.mockClear();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const englishText = 'Here is a fully English reply with zero Korean characters present.';
    mockGenerateJsonChat
      .mockResolvedValueOnce(JSON.stringify({ text: englishText }))
      .mockResolvedValueOnce(JSON.stringify({ text: englishText }));

    const res = await POST(makeAskRequest({ ...meBaseBody, question: '메시지 좀 써줘' }));
    const data = await res.json() as { answer?: { text?: string } };

    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
    expect(data.answer?.text).toBe(englishText); // 최종 교정 응답 유지
    expect(errSpy.mock.calls.some(c => String(c[0]).includes('stage=lang action=soft'))).toBe(true);
    errSpy.mockRestore();
  });

  it('§4.2 combo C — 예산 소진 + 일반 대화(askMode null)면 drift는 502, code:language', async () => {
    mockGenerateJsonChat.mockClear();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGenerateJsonChat
      .mockResolvedValueOnce('not json at all')
      .mockResolvedValueOnce(JSON.stringify({ text: 'This is a fully English answer with no Korean words in it at all.' }));

    const res = await POST(makeAskRequest({ ...meBaseBody, question: '오늘 컨디션이 좀 어때?' }));
    const data = await res.json() as { code?: string };

    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(502);
    expect(data.code).toBe('language');
    expect(errSpy.mock.calls.some(c => String(c[0]).includes('stage=lang action=fail'))).toBe(true);
    errSpy.mockRestore();
  });

  it('§4.2 combo D — 교정 후에도 drift + 일반 대화(askMode null)면 502, code:language', async () => {
    mockGenerateJsonChat.mockClear();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const englishText = 'This reply stays fully in English with no Korean at all in it.';
    mockGenerateJsonChat
      .mockResolvedValueOnce(JSON.stringify({ text: englishText }))
      .mockResolvedValueOnce(JSON.stringify({ text: englishText }));

    const res = await POST(makeAskRequest({ ...meBaseBody, question: '오늘 컨디션이 좀 어때?' }));
    const data = await res.json() as { code?: string };

    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(502);
    expect(data.code).toBe('language');
    expect(errSpy.mock.calls.some(c => String(c[0]).includes('stage=lang action=fail'))).toBe(true);
    errSpy.mockRestore();
  });

  // §4.3 — 통합 시나리오 E/F. 둘 다 6개 확인 항목을 전부 검사한다.
  const personBody = {
    mode: 'person' as const,
    me: { date: '1990-06-15', time: '14:30' },
    them: { date: '1988-03-02', time: '09:00', name: 'Riley' },
    history: [] as Array<{ role: 'user' | 'assistant'; text: string }>,
  };

  it('§4.3 E — 「라일리한테 보낼 영어 메시지 두 개 써줘」: 정당한 영어 요청이 502·오교정 없이 그대로 나간다', async () => {
    mockGenerateJsonChat.mockClear();
    const question = '라일리한테 보낼 영어 메시지 두 개 써줘';
    const englishAnswer = 'Hey! Are you free to grab coffee this week?\n\nLet me know what day works best for you!';
    mockGenerateJsonChat.mockResolvedValueOnce(JSON.stringify({ text: englishAnswer }));

    // 1) 선행 확인
    expect(hasExplicitLanguageRequest(question)).toBe(true);
    // 2) expectedLang이 undefined로 계산됨 (POST와 동일한 공식)
    const expectedLang = hasExplicitLanguageRequest(question) ? undefined : detectExpectedLang(question, personBody.history);
    expect(expectedLang).toBeUndefined();

    const res = await POST(makeAskRequest({ ...personBody, question }));
    const data = await res.json() as { answer?: { text?: string } };

    // 3) HTTP 200
    expect(res.status).toBe(200);
    // 4) 모델 호출 정확히 1회
    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(1);
    // 5) 전달된 turns에 언어 교정 경고 없음
    const turnsSent = mockGenerateJsonChat.mock.calls[0][1] as Array<{ role: string; text: string }>;
    expect(turnsSent.some(t => t.text.includes('LANGUAGE VIOLATION') || t.text.includes('LANGUAGE MIXING'))).toBe(false);
    // 6) 답 문자열이 모킹한 것과 완전 동일
    expect(data.answer?.text).toBe(englishAnswer);
  });

  it('§4.3 F — 영어 대화 중 「Write it in Korean」: 정당한 한국어 요청이 502·오교정 없이 그대로 나간다', async () => {
    mockGenerateJsonChat.mockClear();
    const history = [
      { role: 'user' as const, text: 'How should I text them today?' },
      { role: 'assistant' as const, text: 'Keep it light and short — a quick check-in works well.' },
    ];
    const question = 'Write it in Korean';
    const koreanAnswer = '네, 알겠어요! 오늘 하루도 편안하게 보내세요.';
    mockGenerateJsonChat.mockResolvedValueOnce(JSON.stringify({ text: koreanAnswer }));

    // 1) 선행 확인
    expect(hasExplicitLanguageRequest(question)).toBe(true);
    // 2) expectedLang이 undefined로 계산됨
    const expectedLang = hasExplicitLanguageRequest(question) ? undefined : detectExpectedLang(question, history);
    expect(expectedLang).toBeUndefined();

    const meBody = { mode: 'me' as const, me: { date: '1990-06-15', time: '14:30' }, history };
    const res = await POST(makeAskRequest({ ...meBody, question }));
    const data = await res.json() as { answer?: { text?: string } };

    // 3) HTTP 200
    expect(res.status).toBe(200);
    // 4) 모델 호출 정확히 1회
    expect(mockGenerateJsonChat).toHaveBeenCalledTimes(1);
    // 5) 전달된 turns에 언어 교정 경고 없음
    const turnsSent = mockGenerateJsonChat.mock.calls[0][1] as Array<{ role: string; text: string }>;
    expect(turnsSent.some(t => t.text.includes('LANGUAGE VIOLATION') || t.text.includes('LANGUAGE MIXING'))).toBe(false);
    // 6) 답 문자열이 모킹한 것과 완전 동일
    expect(data.answer?.text).toBe(koreanAnswer);
  });

  it('§4.3 G — 보낼 글 모드에서도 validateAskAnswer는 response_language_drift 유형을 그대로 낸다 (유형 무변경)', () => {
    const ctx = {
      askMode: 'completion' as const, personIntroduced: false, candidates: [] as string[], latestUserText: '',
      expectedLang: 'ko' as const, nameAllowlist: [] as string[],
    };
    const answer = { text: 'This is a fully English answer with no Korean words in it at all.' };
    const violations = validateAskAnswer(answer, ctx);
    expect(violations.filter(v => v.type === 'response_language_drift')).toHaveLength(1);
    expect(violations.some(v => v.type === 'foreign_language_leak')).toBe(false);
  });
});

