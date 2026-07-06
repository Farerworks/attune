# Attune

상대방 생년월일로 한국식 사주를 계산해 성향 분석과 대화 조언을 영어로 제공하는 웹앱.

## Running

```bash
npm run dev      # development server (http://localhost:3000)
npm test         # run all tests
npm run sample   # generate samples/briefing-sample.json (requires GEMINI_API_KEY)
```

## Environment Variables

Create `.env.local` in the project root (never committed):

| Variable | Required | Default | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | Yes (for Gemini) | — | Google AI Studio API key. Get one at https://aistudio.google.com/app/apikey |
| `LLM_PROVIDER` | No | `gemini` | LLM backend: `gemini` or `ollama` |

### Gemini model

The active Gemini model is a constant at the top of `src/lib/llm.ts`:

```typescript
const GEMINI_MODEL = 'gemini-2.5-flash';
```

Change this line to switch models without touching any other code.

### Ollama (local dev)

Set `LLM_PROVIDER=ollama` and have Ollama running at `http://localhost:11434` with a `gemma3` model pulled (`ollama pull gemma3`).

## API

### `POST /api/briefing`

Calculates saju for two people, calls the LLM, and returns a personality briefing.

**Rate limit:** 10 requests per IP per hour.

**Request body:**

```json
{
  "me":   { "date": "1999-03-14", "time": "08:20" },
  "them": { "date": "2000-11-02", "name": "Mia" },
  "relationship": "crush",
  "situation": "We're in the same class. I want to ask her out on Friday."
}
```

**curl example:**

```bash
curl -X POST http://localhost:3000/api/briefing \
  -H "Content-Type: application/json" \
  -d '{
    "me":   { "date": "1999-03-14", "time": "08:20" },
    "them": { "date": "2000-11-02", "name": "Mia" },
    "relationship": "crush",
    "situation": "We are in the same class. I want to ask her out on Friday."
  }'
```

**Response shape:**

```json
{
  "briefing": {
    "headline": "...",
    "theirProfile": { "personality": {...}, "communication": {...}, "decisions": {...}, "stress": {...} },
    "spectrums": { "communication": 0-100, "decisions": 0-100, "pace": 0-100, "stress": 0-100 },
    "dynamic": { "resonance": "strong-current | mixed-signals | slow-build", "click": {...}, "clash": {...}, "watch": {...} },
    "playbook": [{ "type": "do | dont", "tip": "...", "why": "..." }]
  },
  "charts": {
    "me":   { "dayMaster": {...}, "elements": {...}, "pillarsKnown": 6 | 8, "pillars": {...} },
    "them": { "dayMaster": {...}, "elements": {...}, "pillarsKnown": 6 | 8, "pillars": {...} }
  }
}
```

**Error responses:**

| Status | When |
|---|---|
| 400 | Invalid request body |
| 429 | Rate limit exceeded (`retryAfterMinutes` field included) |
| 502 | LLM call failed or banned phrases detected after retry |

## Verification

The values below are computed by `lunar-javascript` (solar-term based month pillar). Cross-check with a Korean 만세력 site (e.g. saju.co.kr) before relying on these for production.

### Fixture dates — Year / Month / Day pillars

| Date       | Year pillar            | Month pillar          | Day pillar           |
|------------|------------------------|-----------------------|----------------------|
| 1999-03-14 | 己卯 Yin Earth/Rabbit  | 丁卯 Yin Fire/Rabbit  | 乙丑 Yin Wood/Ox     |
| 2000-11-02 | 庚辰 Yang Metal/Dragon | 丙戌 Yang Fire/Dog    | 甲子 Yang Wood/Rat   |
| 1991-05-17 | 辛未 Yin Metal/Goat    | 癸巳 Yin Water/Snake  | 丁亥 Yin Fire/Pig    |

### 입춘(立春, Ipchun) solar-term boundary — year 2000

| Date       | Year pillar              | Note                         |
|------------|--------------------------|------------------------------|
| 2000-02-03 | 己卯 Yin Earth/Rabbit    | Before 입춘 — 1999 year pillar |
| 2000-02-04 | 己卯 Yin Earth/Rabbit    | 입춘 day — still prior year  |
| 2000-02-05 | 庚辰 Yang Metal/Dragon   | After 입춘 — 2000 year pillar  |

The year pillar changes between 2000-02-03 and 2000-02-05, confirming that month/year pillar calculation correctly uses solar terms (절기).
