// F5: hidden-truth framing (BRIEF-100B-FIX §1) — direction-based, not a vocabulary blacklist.
// Flags a sentence only when it names the "real"/"hidden" truth AND makes a positive, unhedged claim
// that it's knowable ("진짜 마음을 읽을 수 있어요", or a bare framing question like "진짜 이유는 뭘까?" with
// no limiting language). A negation/limit word anywhere in the same sentence ("알 수는 없어요") clears it —
// per §1 F5, the negated/limiting form is exactly what must pass, never get caught by an unhedged-only
// pattern check. Deliberately narrow: bare "진심" alone is NOT a trigger (too common in benign use,
// e.g. "그 사람 진심을 존중해주세요"), only the compound phrases actually observed in the SMOKE defect.
//
// Extracted from src/app/api/ask/route.ts as a pure move (BRIEF-100B-FIX2 §1.1) — regex and
// judgment logic byte-for-byte unchanged — so src/lib/briefing.ts can apply the same rule to
// Briefing's `starters` without importing app code (coreBoundary.test.ts forbids that).

const HIDDEN_TRUTH_SUBJECT = /(진짜\s*마음|진짜\s*이유|숨은\s*진심|숨은\s*진실|속마음(?:을|이)?\s*확정)/;
const HIDDEN_TRUTH_NEGATION_NEARBY = /(없|어렵|힘들|모르|아니)/;

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?。])\s+|\n+/).filter(s => s.trim().length > 0);
}

export function findHiddenTruthFraming(text: string): boolean {
  return splitSentences(text).some(s => HIDDEN_TRUTH_SUBJECT.test(s) && !HIDDEN_TRUTH_NEGATION_NEARBY.test(s));
}
