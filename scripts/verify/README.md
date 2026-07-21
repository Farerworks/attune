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

## Standing rules for this kit

- Expected values (ganzi, label strings, etc.) are fixed reference points.
  If a script fails, report the failure — don't quietly edit the expectation
  to match new behavior. That's the one thing that would make this kit
  useless.
- No `node_modules` edits, ever, for any bypass. Runtime patches only,
  scoped to the verifying script's own process.
- Playwright stays out of `package.json`. Install it before `render-smoke.mjs`,
  remove it (via `npm install`) after.
