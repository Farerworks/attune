import 'server-only';

// Update GEMINI_MODEL to the latest free-tier Flash model as needed.
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
const OLLAMA_MODEL = 'gemma3';
const OLLAMA_BASE_URL = 'http://localhost:11434';

export interface ChatTurn { role: 'user' | 'model'; text: string }
export interface ChatOpts { maxTokens?: number; thinkingBudget?: number; temperature?: number }

export interface LlmProvider {
  generateJson(prompt: string, maxTokens?: number, thinkingBudget?: number): Promise<string>;
  generateJsonChat(system: string, turns: ChatTurn[], opts?: ChatOpts): Promise<string>;
}

interface GeminiResponse {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

function extractGeminiText(data: GeminiResponse): string {
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error(`Gemini returned no text (finishReason: ${candidate?.finishReason ?? 'UNKNOWN'})`);
  }
  return text;
}

/**
 * generationConfig, branched by model family (BRIEF-100D §1). `gemini-2.` models keep the
 * legacy shape (temperature + thinkingConfig.thinkingBudget, preserving 0="off"/N="budget" as
 * before — never omitted, since omitting means dynamic thinking, a different meaning). Anything
 * else (currently just gemini-3.5-flash-lite) goes to the new shape: no temperature, no
 * thinkingBudget, thinkingConfig.thinkingLevel fixed to 'minimal' regardless of the caller's
 * budget value. No exception is thrown for unrecognized model names — they fall through to the
 * new shape, same as any other non-2.x model (100C's `test-model-x` included).
 */
function buildGenerationConfig(maxTokens: number, thinkingBudget: number, temperature: number): Record<string, unknown> {
  const shared = {
    maxOutputTokens: maxTokens,
    responseMimeType: 'application/json',
  };
  if (GEMINI_MODEL.startsWith('gemini-2.')) {
    return { ...shared, temperature, thinkingConfig: { thinkingBudget } };
  }
  return { ...shared, thinkingConfig: { thinkingLevel: 'minimal' } };
}

class GeminiProvider implements LlmProvider {
  private readonly apiKey: string;

  constructor() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY environment variable is not set');
    this.apiKey = key;
  }

  async generateJson(prompt: string, maxTokens = 2048, thinkingBudget = 0): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: buildGenerationConfig(maxTokens, thinkingBudget, 0.4),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${errText}`);
    }

    const data = await res.json() as GeminiResponse;
    return extractGeminiText(data);
  }

  async generateJsonChat(system: string, turns: ChatTurn[], opts: ChatOpts = {}): Promise<string> {
    const { maxTokens = 2048, thinkingBudget = 0, temperature = 0.4 } = opts;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: turns.map(t => ({ role: t.role, parts: [{ text: t.text }] })),
        generationConfig: buildGenerationConfig(maxTokens, thinkingBudget, temperature),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${errText}`);
    }

    const data = await res.json() as GeminiResponse;
    return extractGeminiText(data);
  }
}

class OllamaProvider implements LlmProvider {
  async generateJson(prompt: string, maxTokens = 2048, thinkingBudget = 0): Promise<string> {
    void thinkingBudget; // not supported by Ollama — signature parity only
    const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        format: 'json',
        options: { num_predict: maxTokens },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Ollama error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    return data.response as string;
  }

  async generateJsonChat(system: string, turns: ChatTurn[], opts: ChatOpts = {}): Promise<string> {
    const flattened = system + '\n\n' +
      turns.map(t => `${t.role === 'user' ? 'USER' : 'ASSISTANT'}: ${t.text}`).join('\n');
    return this.generateJson(flattened, opts.maxTokens, opts.thinkingBudget);
  }
}

export function createLlmProvider(): LlmProvider {
  const provider = process.env.LLM_PROVIDER ?? 'gemini';
  if (provider === 'ollama') return new OllamaProvider();
  return new GeminiProvider();
}
