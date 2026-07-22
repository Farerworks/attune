# BRIEF-083 — Ask 예언·택일 처리 재설계

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `src/app/api/ask/route.ts` | `PREDICTION_RULES` 블록 교체 + daily-pillars 게이트 한 줄 문구 소폭 조정 |
| `src/app/api/ask/route.test.ts` | 신규 테스트 2건 추가 |
| `scripts/verify/prompt-assembly.mjs` | `buildAskSystem` import 추가 + 새 규칙 블록 검사 6건 추가(3분기 × 2조건) |

## 2. 교체 전/후 규칙 블록 요지

**전** — `PREDICTION QUESTIONS`: 예/아니오 예측 질문 전부를 한 갈래로만 다뤘고, 규칙 4번에 한국어 회피 문장(`"그건 사주가 예/아니오로 답해 주는 질문은 아니에요. 대신 흐름으로 보면 —"`)이 통째로 박혀 있어 모델이 매번 그대로 복붙했다. 택일(길일) 질문도 이 규칙 하나로 걷어차여 거부됐다.

**후** — `TIMING & PREDICTION QUESTIONS`: 두 갈래로 명확히 분리했다.
- **A) 통제 불가능한 결과의 예/아니오** — 여전히 거부하되, "매번 새로 표현하라(word that line freshly every time; never reuse a set phrase)"고 명시하고 고정 한국어 예시 문장은 완전히 삭제. 이어서 현재 흐름 + 지금 맞는 행동 하나로 pivot.
- **B) 사용자가 통제하는 행동의 택일** — 이제 실제로 답한다. `DAILY PILLARS` 데이터를 근거로 구체적인 길일과 그 이유(어느 날의 기운이 해당 행동에 맞는지)를 제시하되, 행동의 타이밍만 추천하고 결과(예: "그날 이길 거예요")는 절대 약속하지 않는다.
- 마지막 줄로 "고정 거부 템플릿 금지, 매번 새로 표현"을 한 번 더 못박음.

daily-pillars 게이트 문구도 `Use the daily pillars ONLY when the question is about timing or when to take action.` → `Use the daily pillars for timing / auspicious-day questions (see TIMING & PREDICTION) and whenever the question is about when to act.`로 조정해 새 규칙 B와 명시적으로 맞물리게 했다. `IDENTITY_MENTIONS_RULES`, `PERSON_RULES`/`SELF_RULES`, 출력 스키마, `localeVoiceBlock()` 등 다른 블록은 전혀 건드리지 않았다(`git diff`로 확인 — 변경분은 `PREDICTION_RULES` 블록과 게이트 한 줄뿐).

## 3. 신규 테스트 목록

`src/app/api/ask/route.test.ts` — `describe('buildAskSystem — TIMING & PREDICTION block (BRIEF-083)')`:
1. `contains the new "TIMING & PREDICTION" structure for all 3 modes` — me/person/general 3분기 모두 `'TIMING & PREDICTION'` 문자열 포함 확인.
2. `no longer contains the old canned Korean refusal sentence, for all 3 modes` — 3분기 모두 `'예/아니오로 답해 주는 질문은 아니에요'` 미포함 확인.

`scripts/verify/prompt-assembly.mjs`에도 동일한 두 조건을 3분기 × 2 = 6개 체크로 추가(이 킷은 원래 `buildAskSystem`을 불러오지 않았어서 import를 새로 추가했다).

## 4. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` — 251개 전체 통과 (BRIEF-081 완료 시점 249 + 신규 2, 무회귀)
- [x] `npm run build` 성공
- [x] `npx tsx scripts/verify/prompt-assembly.mjs` → **ALL PASS** (23개 체크 전부, 신규 6개 포함). 실행 발췌:
  ```
  [PASS] askSystem (me): contains "TIMING & PREDICTION"
  [PASS] askSystem (me): old canned Korean refusal sentence absent
  [PASS] askSystem (person): contains "TIMING & PREDICTION"
  [PASS] askSystem (person): old canned Korean refusal sentence absent
  [PASS] askSystem (general): contains "TIMING & PREDICTION"
  [PASS] askSystem (general): old canned Korean refusal sentence absent
  ...
  ALL PASS
  ```
- [x] main push 완료 (커밋 해시는 §5)

## 5. 특이사항 정직 보고

- 완료 기준 3번은 브리프 원문에 `node scripts/verify/prompt-assembly.mjs`로 적혀 있었지만, 이 스크립트는 `.ts` 소스 파일을 직접 import하므로 순수 `node`로는 실행되지 않는다(`ERR_MODULE_NOT_FOUND`). `scripts/verify/README.md`에 이미 문서화된 대로 `npx tsx scripts/verify/prompt-assembly.mjs`로 실행해 ALL PASS를 확인했다 — 브리프의 표기는 축약 표현으로 이해했다.
- `scripts/verify/prompt-assembly.mjs`는 이번 BRIEF 전에는 예언 규칙의 텍스트 내용을 전혀 검사하지 않았다(날짜 마커 로직만 검사). "검사한다면 갱신"이라는 조건문이었지만, 이 킷의 취지(조립된 프롬프트 텍스트의 회귀를 잡는 것)에 맞춰 `buildAskSystem` import와 6개 체크를 새로 추가했다 — 이견이 있으면 되돌릴 수 있다.
- 그 외 어긋난 기대값이나 사고는 없었다.

## 6. 커밋 해시

- 저장소: https://github.com/Farerworks/attune
- 커밋 해시: `3009367`
