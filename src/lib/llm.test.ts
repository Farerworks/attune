// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));

// Fixed per BRIEF-100C §3: env -> vi.resetModules() -> re-import -> mock fetch -> read the
// request URL's model segment. Production code (llm.ts) is untouched for testability — no
// function splitting, no new exports; this only reaches GEMINI_MODEL through the real
// createLlmProvider()/generateJsonChat() path.
describe('llm.ts — GEMINI_MODEL env override (BRIEF-100C)', () => {
  const originalModel = process.env.GEMINI_MODEL;
  const originalKey = process.env.GEMINI_API_KEY;
  const originalProvider = process.env.LLM_PROVIDER;

  afterEach(() => {
    if (originalModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = originalModel;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
    if (originalProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = originalProvider;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('GEMINI_MODEL unset -> request URL model segment falls back to gemini-2.5-flash', async () => {
    delete process.env.GEMINI_MODEL;
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.LLM_PROVIDER;
    vi.resetModules();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { createLlmProvider } = await import('./llm');
    const provider = createLlmProvider();
    await provider.generateJsonChat('system', [{ role: 'user', text: 'hi' }]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/models/gemini-2.5-flash:generateContent');
  });

  it('GEMINI_MODEL="test-model-x" -> request URL model segment is test-model-x', async () => {
    process.env.GEMINI_MODEL = 'test-model-x';
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.LLM_PROVIDER;
    vi.resetModules();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { createLlmProvider } = await import('./llm');
    const provider = createLlmProvider();
    await provider.generateJsonChat('system', [{ role: 'user', text: 'hi' }]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/models/test-model-x:generateContent');
  });

  it('GEMINI_MODEL="  " (whitespace only) -> falls back to gemini-2.5-flash (empty after trim)', async () => {
    process.env.GEMINI_MODEL = '   ';
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.LLM_PROVIDER;
    vi.resetModules();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { createLlmProvider } = await import('./llm');
    const provider = createLlmProvider();
    await provider.generateJsonChat('system', [{ role: 'user', text: 'hi' }]);

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/models/gemini-2.5-flash:generateContent');
  });
});

describe('llm.ts — generationConfig branched by model family (BRIEF-100D §1/§2)', () => {
  const originalModel = process.env.GEMINI_MODEL;
  const originalKey = process.env.GEMINI_API_KEY;
  const originalProvider = process.env.LLM_PROVIDER;

  afterEach(() => {
    if (originalModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = originalModel;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
    if (originalProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = originalProvider;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  /** env -> vi.resetModules() -> re-import -> mock fetch -> capture the request body's
   * generationConfig (same fixed method as BRIEF-100C). Exercises the real generateJson AND
   * generateJsonChat call paths, not a test-only export. */
  async function captureConfigs(model: string, thinkingBudget: number): Promise<{
    generateJsonConfig: Record<string, unknown>;
    generateJsonChatConfig: Record<string, unknown>;
  }> {
    process.env.GEMINI_MODEL = model;
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.LLM_PROVIDER;
    vi.resetModules();

    const bodies: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(init.body as string) as Record<string, unknown>);
      return Promise.resolve({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { createLlmProvider } = await import('./llm');
    const provider = createLlmProvider();

    await provider.generateJson('a prompt', 2048, thinkingBudget);
    await provider.generateJsonChat('a system prompt', [{ role: 'user', text: 'hi' }], { thinkingBudget });

    return {
      generateJsonConfig: bodies[0].generationConfig as Record<string, unknown>,
      generateJsonChatConfig: bodies[1].generationConfig as Record<string, unknown>,
    };
  }

  // Table from BRIEF-100D §2 — 4 cases × 2 methods = 8 assertions groups.
  it('a) gemini-2.5-flash, budget=0 — generateJson: thinkingBudget:0 kept, temperature present', async () => {
    const { generateJsonConfig } = await captureConfigs('gemini-2.5-flash', 0);
    expect(generateJsonConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect(generateJsonConfig.temperature).toBe(0.4); // generateJson's own hardcoded value, unchanged
  });
  it('a) gemini-2.5-flash, budget=0 — generateJsonChat: thinkingBudget:0 kept, temperature present', async () => {
    const { generateJsonChatConfig } = await captureConfigs('gemini-2.5-flash', 0);
    expect(generateJsonChatConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect(generateJsonChatConfig.temperature).toBe(0.4); // opts default, unchanged
  });

  it('b) gemini-2.5-flash, budget=1024 — generateJson: thinkingBudget:1024 kept, temperature present', async () => {
    const { generateJsonConfig } = await captureConfigs('gemini-2.5-flash', 1024);
    expect(generateJsonConfig.thinkingConfig).toEqual({ thinkingBudget: 1024 });
    expect(generateJsonConfig.temperature).toBe(0.4);
  });
  it('b) gemini-2.5-flash, budget=1024 — generateJsonChat: thinkingBudget:1024 kept, temperature present', async () => {
    const { generateJsonChatConfig } = await captureConfigs('gemini-2.5-flash', 1024);
    expect(generateJsonChatConfig.thinkingConfig).toEqual({ thinkingBudget: 1024 });
    expect(generateJsonChatConfig.temperature).toBe(0.4);
  });

  it('c) gemini-3.5-flash-lite, budget=0 — generateJson: thinkingLevel:"minimal", no thinkingBudget/temperature keys', async () => {
    const { generateJsonConfig } = await captureConfigs('gemini-3.5-flash-lite', 0);
    expect(generateJsonConfig.thinkingConfig).toEqual({ thinkingLevel: 'minimal' });
    expect(generateJsonConfig).not.toHaveProperty('temperature');
  });
  it('c) gemini-3.5-flash-lite, budget=0 — generateJsonChat: thinkingLevel:"minimal", no thinkingBudget/temperature keys', async () => {
    const { generateJsonChatConfig } = await captureConfigs('gemini-3.5-flash-lite', 0);
    expect(generateJsonChatConfig.thinkingConfig).toEqual({ thinkingLevel: 'minimal' });
    expect(generateJsonChatConfig).not.toHaveProperty('temperature');
  });

  it('d) gemini-3.5-flash-lite, budget=1024 — generateJson: still thinkingLevel:"minimal" (caller budget ignored on this path)', async () => {
    const { generateJsonConfig } = await captureConfigs('gemini-3.5-flash-lite', 1024);
    expect(generateJsonConfig.thinkingConfig).toEqual({ thinkingLevel: 'minimal' });
    expect(generateJsonConfig).not.toHaveProperty('temperature');
  });
  it('d) gemini-3.5-flash-lite, budget=1024 — generateJsonChat: still thinkingLevel:"minimal" (caller budget ignored on this path)', async () => {
    const { generateJsonChatConfig } = await captureConfigs('gemini-3.5-flash-lite', 1024);
    expect(generateJsonChatConfig.thinkingConfig).toEqual({ thinkingLevel: 'minimal' });
    expect(generateJsonChatConfig).not.toHaveProperty('temperature');
  });

  it('regression guard: maxOutputTokens and responseMimeType are unchanged on BOTH paths', async () => {
    const legacy = await captureConfigs('gemini-2.5-flash', 0);
    const next = await captureConfigs('gemini-3.5-flash-lite', 0);
    for (const cfg of [legacy.generateJsonConfig, legacy.generateJsonChatConfig, next.generateJsonConfig, next.generateJsonChatConfig]) {
      expect(cfg.responseMimeType).toBe('application/json');
    }
    expect(legacy.generateJsonConfig.maxOutputTokens).toBe(2048);
    expect(legacy.generateJsonChatConfig.maxOutputTokens).toBe(2048);
    expect(next.generateJsonConfig.maxOutputTokens).toBe(2048);
    expect(next.generateJsonChatConfig.maxOutputTokens).toBe(2048);
  });
});
