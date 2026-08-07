import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const mockGenerateJson = vi.fn();
vi.mock('@/lib/llm', () => ({
  createLlmProvider: () => ({ generateJson: mockGenerateJson }),
}));

const { POST } = await import('./route');
const { _resetStore } = await import('@/lib/rateLimit');

const EMPTY_INSIGHT = { takeaway: 'x', detail: 'x' };

function makeBriefingJson(headline: string): string {
  return JSON.stringify({
    headline,
    theirProfile: {
      personality: EMPTY_INSIGHT, communication: EMPTY_INSIGHT,
      decisions: EMPTY_INSIGHT, stress: EMPTY_INSIGHT,
    },
    spectrums: { communication: 50, decisions: 50, pace: 50, stress: 50 },
    mySpectrums: { communication: 50, decisions: 50, pace: 50, stress: 50 },
    dynamic: { resonance: 'mixed-signals', click: EMPTY_INSIGHT, clash: EMPTY_INSIGHT, watch: EMPTY_INSIGHT },
    playbook: [
      { type: 'do', tip: 'x', why: 'x' },
      { type: 'do', tip: 'x', why: 'x' },
      { type: 'dont', tip: 'x', why: 'x' },
    ],
  });
}

function makeRequest(ip: string): Request {
  return new Request('http://localhost/api/briefing', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip },
    body: JSON.stringify({
      me: { date: '1990-06-15', time: '14:30' },
      them: { date: '1988-03-02', time: '09:00', name: 'Sam' },
      relationship: 'Friend',
      situation: 'test',
    }),
  });
}

function makeRequestWithPII(ip: string, name: string, situation: string): Request {
  return new Request('http://localhost/api/briefing', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip },
    body: JSON.stringify({
      me: { date: '1990-06-15', time: '14:30' },
      them: { date: '1988-03-02', time: '09:00', name },
      relationship: 'Friend',
      situation,
    }),
  });
}

/** A banned-phrase-carrying, otherwise-valid briefing JSON (BRIEF-100E §2.1's banned scenarios). */
function makeBannedBriefingJson(): string {
  return makeBriefingJson('weakness');
}

/** Only the `[briefing]`-prefixed lines a console.error spy captured (BRIEF-100E §2). */
function briefingLogLines(spy: ReturnType<typeof vi.spyOn>): string[] {
  return spy.mock.calls
    .map((args: unknown[]) => args[0] as unknown)
    .filter((arg: unknown): arg is string => typeof arg === 'string' && arg.startsWith('[briefing]'));
}

let ipCounter = 0;
function freshIp(): string {
  ipCounter += 1;
  return `10.0.0.${ipCounter}`;
}

beforeEach(() => {
  _resetStore();
  mockGenerateJson.mockReset();
});

describe('POST /api/briefing — headline length contract (BRIEF-093B)', () => {
  it('a 61-char Korean headline triggers exactly one length-retry, and the shorter retry result is used', async () => {
    const longKo = '오'.repeat(61); // 61 code points, all Hangul -> limit is 60
    const shortKo = '오'.repeat(30);
    mockGenerateJson
      .mockResolvedValueOnce(makeBriefingJson(longKo))
      .mockResolvedValueOnce(makeBriefingJson(shortKo));

    const res = await POST(makeRequest(freshIp()));
    const body = await res.json();

    expect(mockGenerateJson).toHaveBeenCalledTimes(2);
    expect(mockGenerateJson.mock.calls[1][0]).toContain('Your headline was too long');
    expect(body.briefing.headline).toBe(shortKo);
  });

  it('still too long after the retry -> the over-limit headline is passed through unmodified (no ellipsis/truncation)', async () => {
    const longKo = '오'.repeat(70);
    const stillLongKo = '오'.repeat(65);
    mockGenerateJson
      .mockResolvedValueOnce(makeBriefingJson(longKo))
      .mockResolvedValueOnce(makeBriefingJson(stillLongKo));

    const res = await POST(makeRequest(freshIp()));
    const body = await res.json();

    expect(mockGenerateJson).toHaveBeenCalledTimes(2); // exactly one retry, no further attempts
    expect(body.briefing.headline).toBe(stillLongKo); // passed through as-is, not truncated
  });

  it('a 60-char (at-limit) Korean headline triggers no retry', async () => {
    const atLimitKo = '오'.repeat(60);
    mockGenerateJson.mockResolvedValueOnce(makeBriefingJson(atLimitKo));

    const res = await POST(makeRequest(freshIp()));
    const body = await res.json();

    expect(mockGenerateJson).toHaveBeenCalledTimes(1);
    expect(body.briefing.headline).toBe(atLimitKo);
  });
});

describe('headline character limit — Korean vs English (BRIEF-093B)', () => {
  it('a headline containing Hangul uses the 60-char limit (61 chars retries, 60 does not)', async () => {
    mockGenerateJson.mockResolvedValueOnce(makeBriefingJson('오'.repeat(61) + 'ok'));
    await POST(makeRequest(freshIp()));
    expect(mockGenerateJson).toHaveBeenCalledTimes(2);
  });

  it('an English-only headline uses the 90-char limit (91 chars retries, 90 does not)', async () => {
    mockGenerateJson.mockResolvedValueOnce(makeBriefingJson('a'.repeat(90)));
    await POST(makeRequest(freshIp()));
    expect(mockGenerateJson).toHaveBeenCalledTimes(1); // exactly 90 -> at limit, no retry

    mockGenerateJson.mockReset();
    mockGenerateJson
      .mockResolvedValueOnce(makeBriefingJson('a'.repeat(91)))
      .mockResolvedValueOnce(makeBriefingJson('a'.repeat(80)));
    await POST(makeRequest(freshIp()));
    expect(mockGenerateJson).toHaveBeenCalledTimes(2); // 91 -> over the 90-char English limit, retries
  });
});

// ══════════════════════════════════════════════════════════════════════════
// BRIEF-100E v3 — /api/briefing 실패 단계 구조화 로그
// ══════════════════════════════════════════════════════════════════════════

describe('POST /api/briefing — structured failure logging (BRIEF-100E §2.1: all 5 stage/action points)', () => {
  it('1) initial call returns unparseable text -> stage=parse action=initial category=parse_failed upstreamStatus=na', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mockGenerateJson.mockResolvedValueOnce('not valid json at all');

      const res = await POST(makeRequest(freshIp()));
      expect(res.status).toBe(502);

      const lines = briefingLogLines(errorSpy);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(/^\[briefing\] rid=[0-9a-f-]+ stage=parse action=initial status=502 category=parse_failed upstreamStatus=na$/);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('2) initial = banned-phrase JSON, retry returns unparseable text -> stage=parse action=banned_retry category=parse_failed', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mockGenerateJson
        .mockResolvedValueOnce(makeBannedBriefingJson())
        .mockResolvedValueOnce('still not valid json');

      const res = await POST(makeRequest(freshIp()));
      expect(res.status).toBe(502);

      const lines = briefingLogLines(errorSpy);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(/^\[briefing\] rid=[0-9a-f-]+ stage=parse action=banned_retry status=502 category=parse_failed upstreamStatus=na$/);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('3) initial and retry are both banned-phrase JSON -> stage=banned action=after_retry category=banned_after_retry', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mockGenerateJson
        .mockResolvedValueOnce(makeBannedBriefingJson())
        .mockResolvedValueOnce(makeBannedBriefingJson());

      const res = await POST(makeRequest(freshIp()));
      expect(res.status).toBe(502);

      const lines = briefingLogLines(errorSpy);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(/^\[briefing\] rid=[0-9a-f-]+ stage=banned action=after_retry status=502 category=banned_after_retry upstreamStatus=na$/);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('4) [REQUIRED — proves the stage variable] initial call itself rejects with Gemini API error 503 -> stage=call action=initial category=upstream_http upstreamStatus=503', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mockGenerateJson.mockRejectedValueOnce(new Error('Gemini API error 503: service unavailable'));

      const res = await POST(makeRequest(freshIp()));
      expect(res.status).toBe(502);

      const lines = briefingLogLines(errorSpy);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(/^\[briefing\] rid=[0-9a-f-]+ stage=call action=initial status=502 category=upstream_http upstreamStatus=503$/);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('5) [REQUIRED — proves the stage variable] initial = banned-phrase JSON, retry call rejects with Gemini API error 503 -> stage=call action=banned_retry category=upstream_http upstreamStatus=503', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mockGenerateJson
        .mockResolvedValueOnce(makeBannedBriefingJson())
        .mockRejectedValueOnce(new Error('Gemini API error 503: CANARY-LEAK-XXXX'));

      const res = await POST(makeRequest(freshIp()));
      const body = await res.json();

      expect(mockGenerateJson).toHaveBeenCalledTimes(2);
      expect(res.status).toBe(502);
      expect(body).toEqual({ error: 'LLM call failed', detail: 'Gemini API error 503: CANARY-LEAK-XXXX' });

      const lines = briefingLogLines(errorSpy);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(/^\[briefing\] rid=[0-9a-f-]+ stage=call action=banned_retry status=502 category=upstream_http upstreamStatus=503$/);
      expect(lines[0]).not.toContain('CANARY-LEAK-XXXX');
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe('POST /api/briefing — category classification (BRIEF-100E §2.2)', () => {
  it.each([400, 429, 503])('upstream HTTP %d -> category=upstream_http upstreamStatus=%d, nothing else in the field', async (status) => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mockGenerateJson.mockRejectedValueOnce(new Error(`Gemini API error ${status}: some upstream body text`));
      await POST(makeRequest(freshIp()));

      const lines = briefingLogLines(errorSpy);
      expect(lines[0]).toContain(`category=upstream_http upstreamStatus=${status}`);
      expect(lines[0]).toMatch(new RegExp(`upstreamStatus=${status}$`));
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('timeout literal (mocked, not actually waited for) -> category=timeout upstreamStatus=na', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mockGenerateJson.mockRejectedValueOnce(new Error('LLM call timed out after 55000ms'));
      await POST(makeRequest(freshIp()));

      const lines = briefingLogLines(errorSpy);
      expect(lines[0]).toContain('category=timeout upstreamStatus=na');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('"Gemini returned no text (finishReason: MAX_TOKENS)" -> category=empty_response, finishReason/MAX_TOKENS absent from the log', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mockGenerateJson.mockRejectedValueOnce(new Error('Gemini returned no text (finishReason: MAX_TOKENS)'));
      await POST(makeRequest(freshIp()));

      const lines = briefingLogLines(errorSpy);
      expect(lines[0]).toContain('category=empty_response');
      expect(lines[0]).not.toContain('finishReason');
      expect(lines[0]).not.toContain('MAX_TOKENS');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('an unrecognized error message -> category=llm_call_failed', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mockGenerateJson.mockRejectedValueOnce(new Error('some unrelated network failure'));
      await POST(makeRequest(freshIp()));

      const lines = briefingLogLines(errorSpy);
      expect(lines[0]).toContain('category=llm_call_failed upstreamStatus=na');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('misclassification guard: "Gemini API error 400:" / "Gemini returned no text" appearing MID-message (not at the start) -> llm_call_failed, not upstream_http/empty_response', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mockGenerateJson.mockRejectedValueOnce(new Error('Retry failed: Gemini API error 400: bad request'));
      await POST(makeRequest(freshIp()));
      let lines = briefingLogLines(errorSpy);
      expect(lines[0]).toContain('category=llm_call_failed upstreamStatus=na');

      errorSpy.mockClear();
      mockGenerateJson.mockRejectedValueOnce(new Error('unexpected: Gemini returned no text mid-message'));
      await POST(makeRequest(freshIp()));
      lines = briefingLogLines(errorSpy);
      expect(lines[0]).toContain('category=llm_call_failed upstreamStatus=na');
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe('POST /api/briefing — log shape invariants (BRIEF-100E §2.3)', () => {
  it('exactly one [briefing] line per 502 response — never 0, never 2+', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mockGenerateJson.mockRejectedValueOnce(new Error('some failure'));
      const res = await POST(makeRequest(freshIp()));
      expect(res.status).toBe(502);
      expect(briefingLogLines(errorSpy)).toHaveLength(1);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('console.error is called with exactly one string argument — no Error object or extra object appended', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mockGenerateJson.mockRejectedValueOnce(new Error('some failure'));
      await POST(makeRequest(freshIp()));

      const briefingCalls = errorSpy.mock.calls.filter(args => typeof args[0] === 'string' && (args[0] as string).startsWith('[briefing]'));
      expect(briefingCalls).toHaveLength(1);
      expect(briefingCalls[0]).toHaveLength(1);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('rid is a full UUID (not truncated, unlike [ask]\'s 8-char rid)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mockGenerateJson.mockRejectedValueOnce(new Error('some failure'));
      await POST(makeRequest(freshIp()));

      const [line] = briefingLogLines(errorSpy);
      const ridMatch = line.match(/rid=([0-9a-f-]+) stage=/);
      expect(ridMatch).toBeTruthy();
      expect(ridMatch![1]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('two different requests get two different rids', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mockGenerateJson.mockRejectedValueOnce(new Error('failure one'));
      await POST(makeRequest(freshIp()));
      mockGenerateJson.mockRejectedValueOnce(new Error('failure two'));
      await POST(makeRequest(freshIp()));

      const lines = briefingLogLines(errorSpy);
      expect(lines).toHaveLength(2);
      const rid1 = lines[0].match(/rid=([0-9a-f-]+)/)![1];
      const rid2 = lines[1].match(/rid=([0-9a-f-]+)/)![1];
      expect(rid1).not.toBe(rid2);
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe('POST /api/briefing — leak negative control + regression (BRIEF-100E §2.4)', () => {
  it('no PII (name/situation) or canary marker leaks into any [briefing] log line, across a parsing failure (which embeds model output in the thrown error)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const piiName = 'PII-NAME-CANARY-1234';
      const piiSituation = 'PII-SITUATION-CANARY-5678';
      mockGenerateJson.mockResolvedValueOnce('CANARY-LEAK-XXXX not valid json, includes model output text');

      await POST(makeRequestWithPII(freshIp(), piiName, piiSituation));

      const lines = briefingLogLines(errorSpy);
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line).not.toContain(piiName);
        expect(line).not.toContain(piiSituation);
        expect(line).not.toContain('CANARY-LEAK-XXXX');
      }
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('regression: response status/body and mockGenerateJson call count are unchanged for a banned-phrase-after-retry 502', async () => {
    mockGenerateJson
      .mockResolvedValueOnce(makeBannedBriefingJson())
      .mockResolvedValueOnce(makeBannedBriefingJson());

    const res = await POST(makeRequest(freshIp()));
    const body = await res.json();

    expect(mockGenerateJson).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(502);
    expect(body.error).toBe('Briefing contains banned phrases after retry');
    expect(body.detail).toEqual(['weakness']);
  });

  it('a normal 200 response produces zero [briefing] log lines', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mockGenerateJson.mockResolvedValueOnce(makeBriefingJson('A short headline.'));
      const res = await POST(makeRequest(freshIp()));
      expect(res.status).toBe(200);
      expect(briefingLogLines(errorSpy)).toHaveLength(0);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
