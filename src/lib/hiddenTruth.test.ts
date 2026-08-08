import { describe, it, expect } from 'vitest';
import { findHiddenTruthFraming } from './hiddenTruth';

// BRIEF-100B-FIX2 §2.1 — extraction non-regression: subject present + no negation -> violation /
// subject present + negation -> pass / no subject -> pass. Same fixtures as the original
// BRIEF-100B-FIX ask-route tests, run here against the extracted module directly.

describe('findHiddenTruthFraming (BRIEF-100B-FIX2 §1.1 — extracted from ask/route.ts, logic unchanged)', () => {
  it('주어 있음 + 부정어 없음 -> 위반(true)', () => {
    expect(findHiddenTruthFraming('반응 속도를 보면 은우의 진짜 마음을 읽을 수 있어요.')).toBe(true);
  });

  it('주어 있음 + 부정어 있음 -> 통과(false)', () => {
    expect(findHiddenTruthFraming('진짜 마음을 한 번의 반응으로 알 수는 없어요.')).toBe(false);
  });

  it('주어 없음 -> 통과(false)', () => {
    expect(findHiddenTruthFraming('지금의 거리가 일시적인지 반복되는 패턴인지 가늠하는 데 도움이 될 거예요.')).toBe(false);
  });

  it('바닥 형태 질문("진짜 이유는 뭘까?")도 위반으로 잡는다 — 확정형 캡션 없이도 방향성만으로 판정', () => {
    expect(findHiddenTruthFraming('은우가 연락을 줄인 진짜 이유는 뭘까?')).toBe(true);
  });

  it('바닥 단어 "진심"만으로는 위반이 아니다 — 의도적으로 좁힌 주어 목록', () => {
    expect(findHiddenTruthFraming('그 사람 진심을 존중해주세요.')).toBe(false);
  });

  it('여러 문장 중 하나라도 위반이면 true — 문장 단위 분할이 유지됨을 확인', () => {
    expect(findHiddenTruthFraming('평범한 문장입니다. 숨은 진심을 알아낼 수 있어요. 다른 평범한 문장.')).toBe(true);
  });
});
