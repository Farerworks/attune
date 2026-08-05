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
