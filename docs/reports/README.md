# BRIEF completion reports

Starting with BRIEF-079, the full completion report for a BRIEF is committed
to this directory as `BRIEF-NNN.md`, instead of living only in the chat
transcript. Chat transcripts scroll away; a file in the repo doesn't.

## Format

Each `BRIEF-NNN.md` contains:

1. **변경 파일** — every file touched, with a one-line description of what
   changed in it.
2. **자가점검 체크** — the completion-criteria checklist from the BRIEF,
   each item marked done with how it was verified (command run, output seen).
3. **특이사항·이견·사고 정직 보고** — anything that came up that wasn't in
   the original BRIEF: assumptions made where the spec was ambiguous,
   disagreements with a reference value (reported, never silently
   "corrected"), bugs found and fixed along the way, scope questions. If
   nothing came up, this section says so explicitly — it isn't skipped.
4. **커밋 해시** — the commit(s) this report corresponds to, and the repo
   URL.

## What this changes about Telegram reports

The chat report becomes short: **"완료 + 커밋 해시"** — two lines. Anyone who
wants the full detail reads `docs/reports/BRIEF-NNN.md` in the repo. This
keeps the chat readable and keeps the authoritative record in version
control, where it can be diffed, linked, and found later without digging
through conversation history.

## Scope

This directory is reports only — narrative, not code. It's never read by the
app or the test suite. If a report needs to reference a script's output
(e.g. `scripts/verify/*.mjs`), paste the relevant excerpt into the report;
don't turn the report into a second copy of the script.
