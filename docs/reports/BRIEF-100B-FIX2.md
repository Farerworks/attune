# BRIEF-100B-FIX2 — Briefing `starters`에도 F5 방향 판정 적용

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `docs/briefs/BRIEF-100B-FIX2.md` | §0.5 — 브리프 원문 바이트 그대로 보관 (단독 커밋) |
| `src/lib/hiddenTruth.ts` | 신규 — F5 검출기(`findHiddenTruthFraming`) 순수 이동 |
| `src/lib/hiddenTruth.test.ts` | 신규 — 추출된 모듈 직접 테스트 6건 |
| `src/lib/briefing.ts` | 신규 `applyStartersFraming()` — `starters` 3개에 F5 적용 |
| `src/lib/briefing.test.ts` | 신규 7건 |
| `src/app/api/briefing/route.ts` | §1.2/§1.3 배선 — `applyStartersFraming` 호출 + 제거 시 로그 1줄 |
| `src/app/api/ask/route.ts` | §1.1 — 로컬 F5 검출기 정의 삭제, `@/lib/hiddenTruth`에서 import로 교체 (그 외 무변경) |
| `docs/reports/BRIEF-100B-FIX2.md` | 본 보고서 |

허용 경로 확인: `git diff --name-only` 결과 —
```
src/app/api/ask/route.ts
src/app/api/briefing/route.ts
src/lib/briefing.test.ts
src/lib/briefing.ts
```
(+ 신규 `src/lib/hiddenTruth.ts`·`src/lib/hiddenTruth.test.ts`) — 지시서 §4가 허용한 경로와 정확히 일치. `src/app/api/ask/route.test.ts`·`src/app/api/briefing/route.test.ts`는 허용 목록에 없어 손대지 않았다(§6 참고).

## 2. 구현 요지

### §1.1 추출 — 순수 이동
`src/app/api/ask/route.ts`에만 있던 F5 검출기(`HIDDEN_TRUTH_SUBJECT`·`HIDDEN_TRUTH_NEGATION_NEARBY`·`splitSentences`·`findHiddenTruthFraming`)를 `src/lib/hiddenTruth.ts`로 옮기고, `findHiddenTruthFraming`만 export했다. `ask/route.ts`는 로컬 정의를 지우고 `import { findHiddenTruthFraming } from '@/lib/hiddenTruth';` 한 줄만 추가했다 — 그 호출부(`collectAnswerText` 등)는 전혀 손대지 않았다.

**순수 이동임을 보이는 근거**: 정규식 리터럴(`HIDDEN_TRUTH_SUBJECT`, `HIDDEN_TRUTH_NEGATION_NEARBY`)과 `splitSentences`·`findHiddenTruthFraming`의 판정 로직을 `git diff`로 대조하면 문자 단위로 삭제된 위치의 코드와 새 파일에 추가된 코드가 완전히 동일하다(주석 표현만 "어디서 옮겨왔는지"로 바뀜). 새 테스트(`hiddenTruth.test.ts`)는 기존 `ask/route.test.ts`의 F5 픽스처(진짜 마음/진짜 이유/부정형/무주어)를 그대로 재사용해 추출된 모듈에 직접 돌렸고, 기존 `ask/route.test.ts`(661개 테스트 중 F5 관련 전부 포함)는 **한 글자도 수정하지 않은 채** 전부 통과했다 — 이것이 "동작이 한 글자도 달라지지 않았다"는 지시서 §1.1 요구의 직접 증거다.

### §1.2 `starters`에 F5 적용
`briefing.ts`에 `applyStartersFraming(briefing)`을 신설: `starters` 3개 중 하나라도 `findHiddenTruthFraming`에 걸리면 `starters` 키를 **통째로** 제거(부분 제거 없음), 위반 없으면 원본 그대로 반환한다. `starters`가 애초에 없으면(zod `optional()`) 아무것도 안 하고 원본 참조를 그대로 돌려준다.

`briefing/route.ts`는 기존 LLM 호출·파싱·금칙어 재시도 파이프라인(이미 검수 통과한 부분)이 끝난 **직후**, `Response.json` 직전에 `applyStartersFraming`을 호출한다 — 재시도도, 새 LLM 호출도, 502 반환도 없다. 위반이 있으면 `finalBriefing`(starters 없는 버전)을 응답에 쓰고 로그 한 줄을 남긴다.

### §1.3 관측 로그
`logStartersRemoved(rid, count)` — 기존 `[briefing]` 로그와 같은 계열이지만 `stage=starters action=removed count=<개수>`만 남긴다. 질문 원문·PII는 전혀 포함하지 않는다.

## 3. 테스트

- `src/lib/hiddenTruth.test.ts`(신규 6건): 주어+부정어없음→위반 / 주어+부정어있음→통과 / 무주어→통과 / 확정 캡션 없는 질문형도 위반으로 잡힘 / 바닥 단어 "진심"만으로는 위반 아님(좁힌 주어 목록 확인) / 문장 단위 분할이 유지됨.
- `src/lib/briefing.test.ts`(신규 7건): 3개 중 1개 위반→전체 제거 / 3개 전부 위반→전체 제거(count=3) / 부정·한계형 포함→제거 안 함 / 정상 3개→유지 / `starters` 필드 자체 없음→무변경(참조 동일성까지 확인) / 부분 제거가 절대 없음을 확인 / `containsBannedPhrases`는 여전히 starters를 그대로 검사(F5와 안 합쳐졌음을 확인).

전체 무회귀. **전체 674개 통과**(기존 661 + 신규 13).

## 4. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` 전체 통과 — **674개**
- [x] `npm run build` 성공
- [x] 신규 테스트 수: **13건**
- [x] `git diff --name-only` — §1 참고

## 5. `starters` 제거 시 호출 횟수·status 불변을 어떻게 고정했는가

지시서 §4의 허용 경로 목록에 `src/app/api/briefing/route.test.ts`가 포함돼 있지 않아, 이 판에서는 그 파일을 건드리지 않았다(§6에서 상세). 그 대신 다음 두 가지로 "LLM 호출 횟수·status 불변"을 보장했다:

1. **구조적 보장**: `applyStartersFraming`과 `logStartersRemoved`는 순수/동기 함수이고, 기존 LLM 호출·재시도·502 반환이 전부 끝나는 지점(`Response.json` 바로 앞)에서만 호출된다. 이 위치상 새 LLM 호출을 추가할 물리적 경로 자체가 없다.
2. **회귀 확인**: 기존 `src/app/api/briefing/route.test.ts`(24개 테스트, 무수정)가 이번 판 이후에도 전부 그대로 통과했다 — 기존에 검증된 모든 status·body·호출횟수 시나리오가 깨지지 않았다는 뜻이다. 다만 이 24개 테스트 중 `starters` 위반 픽스처로 새 배선 자체를 직접 왕복 검증한 것은 없다 — §1.2 로직 자체의 정확성은 `briefing.test.ts`의 `applyStartersFraming` 단위 테스트가, "배선이 안전한 위치에 있다"는 것은 위 구조적 보장이 각각 담당한다.

## 6. 정직 보고

- **`src/app/api/briefing/route.test.ts`에 `starters` 제거 경로의 엔드투엔드(POST 요청→200 응답) 테스트를 추가하지 못했다** — 지시서 §4의 허용 경로 목록이 `src/app/api/briefing/route.ts`(배선)만 명시하고 그 테스트 파일은 포함하지 않았기 때문이다(다른 경로들은 `hiddenTruth.ts`/`hiddenTruth.test.ts`, `briefing.ts`/`briefing.test.ts`처럼 소스·테스트가 쌍으로 명시된 것과 대조적이라, 의도적 축소로 판단했다). §5에 적은 구조적 보장 + 무수정 회귀로 대체했지만, "실제 POST 파이프라인 안에서" 이 배선이 정확히 동작하는지 확인하는 통합 테스트는 이번 판에 없다 — 필요하다면 별건으로 허용 경로에 추가해 처리해야 한다.
- 이 판은 §1.1에서 "동작이 한 글자도 달라지지 않아야 한다"는 요구를 만족시키기 위해 정규식·로직을 정말 그대로 옮기기만 했다 — 예를 들어 "진심" 단독 비검출, 문장 단위 판정 같은 기존 결정들을 재검토하거나 개선하지 않았다(그건 별건이라는 지시서 §4 명시를 따름).

## 7. 커밋 해시

- 저장소: https://github.com/Farerworks/attune
- §0.5 브리프 원문 보관: `1d3ccb9`
- 코드 커밋: `7686b40`
