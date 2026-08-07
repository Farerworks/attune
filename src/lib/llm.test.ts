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
