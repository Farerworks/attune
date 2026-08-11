# VERIFY-KIT

Independent verification scripts, separate from the vitest suite. These exist
for checks that don't fit `npx vitest run` well — assembled *text* output
(prompts), third-party dependency drift, and actual browser rendering. They
live in the repo (not as session-scoped temp files) so any review session can
clone the repo and reproduce them immediately.

**Rule of thumb:** if `npx vitest run` already covers it, it does not belong
here. This kit is for checks that live "outside the tests."

## §1 — `prompt-assembly.mjs`

Builds real `buildBriefingPrompt()` output (via `calculateSaju`) and checks a
battery of label-leakage / section-shape invariants against the assembled
*text* — the kind of thing unit tests on individual builder functions don't
catch once everything is concatenated together. Also re-verifies the
`buildAskTurns` date-marker cases standalone.

```
npx tsx scripts/verify/prompt-assembly.mjs
```

Expected output ends with `ALL PASS`. Any `[FAIL] ...` line names the failed
check; the script exits non-zero if anything failed.

## §2 — server-only bypass

`src/app/api/ask/route.ts` imports `src/lib/llm.ts`, which does
`import 'server-only'`. That package throws unless the Next.js
`"react-server"` build condition is active — which it never is in a plain
`node`/`tsx` process. Both `prompt-assembly.mjs` and `render-smoke.mjs` (via
the app it drives) need to load code that touches that import chain, so
`prompt-assembly.mjs` patches Node's CJS loader in-memory for the lifetime of
the script:

```js
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'server-only') return {};
  return originalLoad.apply(this, arguments);
};
```

This never touches `node_modules` on disk — it's a runtime patch scoped to
the script's own process. Do not "fix" this by editing
`node_modules/server-only` or adding a local override package; that would
have to be repeated by hand after every `npm install` and is exactly the kind
of thing this kit exists to avoid.

## §3 — `engine-check.mjs`

Pins three hand-verified `calculateSaju()` results (see `ENGINE-CHECK.md`) —
including the 야자시 (23:00 day-boundary) policy set by `saju.ts`'s
`ec.setSect(2)` — and fails loudly if a `lunar-javascript` version bump ever
changes them silently.

```
npx tsx scripts/verify/engine-check.mjs
```

Expected output ends with `ALL PASS`. If a case fails, **do not edit the
expected values to make it pass** — report the drift; the expected values are
the fixed reference point, not the thing under test.

## §4 — `render-smoke.mjs`

Drives a real browser against a running dev server to catch what static
checks can't: actual layout, actual click handlers, actual DOM after
hydration. Needs Playwright, which is **not** a project dependency (keeping
it out of `package.json` avoids bloating every `npm install` for a check that
runs occasionally). Install it temporarily, run the script, then restore
`node_modules`:

```
npm install --no-save --no-package-lock playwright@1.61.1
npx playwright install chromium

npm run dev -- -p 3100 &        # any free port; pass it as argv[1]
npx tsx scripts/verify/render-smoke.mjs 3100

# afterward — restores node_modules to match package-lock.json exactly:
npm install
```

Port defaults to `3100` if omitted. Checks performed:

1. Onboarding `DateInput`: typing `2` / `4` / `1989` into month/day/year
   normalizes to `02`/`04`/`1989` and enables the Continue CTA
   (BRIEF-058-FIX stale-closure blur regression).
2. All 5 tab headers (home/people/ask/you/settings) render at one shared
   height, and the Settings link appears on exactly home/people/ask/you
   (not settings) — BRIEF-077.
3. On `/you`, tapping the DAY column opens the Ilju sheet with a rendered
   profile name — BRIEF-074.

Screenshots are written to `/tmp` only. **Never commit screenshots or other
render artifacts** — if you need to show someone a screenshot, send the file,
don't check it in.

## §5 — `voice-baseline.mjs` (BRIEF-104A)

Collects a real-Gemini "voice baseline": the fixed 6-turn scenario (English +
Korean, 2 runs each) through the exact `/api/ask` assembly, saving both the
model's first-attempt output (`firstPass`) and what the user actually saw
after any correction turn (`finalPass`). This script makes **no changes** to
`src/` — the retry/correction control flow, and a handful of small pure
functions that `route.ts` does not export, are duplicated read-only in the
script (each with a `route.ts:<line>` citation) rather than editing `route.ts`
to export them.

```
npx tsx scripts/verify/voice-baseline.mjs --selftest
  # pure §3 metric-function checks only — no API key, no network

GEMINI_MODEL=gemini-3.5-flash-lite npx tsx scripts/verify/voice-baseline.mjs
  # full collection — requires GEMINI_API_KEY; see the model gate below

npx tsx scripts/verify/voice-baseline.mjs --metrics [--date=YYYYMMDD]
  # reads samples/voice-baseline/*.json for that date, writes the metrics TSV
```

**Model gate**: production runs `gemini-3.5-flash-lite`, but a lab machine's
`.env.local` may not set `GEMINI_MODEL`, which makes `llm.ts` fall back to
`gemini-2.5-flash`. A baseline collected on the wrong model is invalid, so the
script refuses to run (`exit 1`) unless `GEMINI_MODEL` resolves to exactly
`gemini-3.5-flash-lite`. `--force-model=<name>` overrides this for a
diagnostic-only run, tagged `modelGateForced: true` in its output — such a
run does not count as a valid 104A baseline.

**Why collection mode needs `npx tsx`, not plain `node`**: it dynamically
imports `route.ts`/`llm.ts`/`saju.ts` (TypeScript) through the same §2
server-only bypass used above. `--selftest` and `--metrics` touch no `.ts`
file and can run under plain `node` too.

**M2 chart-vocabulary list** (§3's "어휘 목록은 상수로 두고 README §5에 전재"):
five elements in English (`wood, fire, earth, metal, water`) and Korean
(Sino-Korean single char + native word: `목 화 토 금 수 나무 불 흙 쇠 물`);
the ten heavenly stems as hanja and Korean reading (`甲乙丙丁戊己庚辛壬癸` /
`갑을병정무기경신임계`); the twelve earthly branches as hanja, Korean
reading, and Korean animal name (`子丑寅卯辰巳午未申酉戌亥` /
`자축인묘진사오미유술해` / `쥐 소 호랑이 토끼 용 뱀 말 양 원숭이 닭 개 돼지`);
and generic chart/archetype vocabulary (`archetype, chart, day master, 사주,
일주, 원형, 기운, 오행`). English tokens match with `\b` word boundaries
(case-insensitive); Korean/hanja tokens match as plain substrings (Korean has
no reliable `\b` boundary — same reasoning `route.ts`'s own
`normalizeForMatch` uses). Coarse and exploratory by design (BRIEF-104A §0's
own "탐색용" caveat) — occurrence count, not a claim of semantic accuracy.

**M3 scope note**: word/length counts include `parts[].text` + `timing` +
plain `{text}` + `followUp` — never `memory` (never shown to the user) and
never the part **label** (`WHAT'S LIKELY GOING ON` etc. are fixed constants,
not prose the model wrote, so counting them would inflate length without
reflecting anything about the model's actual verbosity).

**Known discrepancy vs. the brief text**: BRIEF-104A §2.2 point 5 describes
memory accumulation as "중복 제거·최대 20", but the actual client
(`src/lib/askQuota.ts`'s `appendMemory`, `MEMORY_CAP`) caps at **10**, not 20.
This script follows the real code (10) — matching production behavior is the
entire point of a baseline — not the brief's stated number.

## Standing rules for this kit

- Expected values (ganzi, label strings, etc.) are fixed reference points.
  If a script fails, report the failure — don't quietly edit the expectation
  to match new behavior. That's the one thing that would make this kit
  useless.
- No `node_modules` edits, ever, for any bypass. Runtime patches only,
  scoped to the verifying script's own process.
- Playwright stays out of `package.json`. Install it before `render-smoke.mjs`,
  remove it (via `npm install`) after.
