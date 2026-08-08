# BRIEF-100B-FIX4-C v3 — completion 판정을 「인용 분리 + 마지막 유효 의도」 구조로 교체

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `docs/briefs/BRIEF-100B-FIX4-C.md` | §0.5 — 브리프 원문 바이트 그대로 보관 (단독 커밋) |
| `src/app/api/ask/route.ts` | §1.2 신규 테이블 6종 + §1.3 `splitCompletionParts`/`detectCompletionRequest` |
| `src/app/api/ask/route.test.ts` | 신규 150건(X 38 + L 18 + E 81 + 정규식 6 + `splitCompletionParts` 3 + 구조회귀 4) |
| `docs/reports/BRIEF-100B-FIX4-C.md` | 본 보고서 |

`TESTSET-100B-FIX4.md`는 지시서 §0.5·§4 명시대로 저장소에 커밋하지 않았다(작업 디렉터리에만 존재).

## 2. §0 사전 확인 (실행 전)

- 두 파일 해시·바이트 대조 — **일치 확인 후 진행**:
  - `BRIEF-100B-FIX4-C.md`: sha256 `d2ebc940862a16d42918272e35379691f4ff4baff706d384997e18ae48c0877a`, 18126바이트 — 전달값과 일치
  - `TESTSET-100B-FIX4.md`: sha256 `e5154111a567697e6a5d942ea1ae7667652d14e1c1ef2da2a52f9aed213e459e`, 13121바이트 — 전달값과 일치
- 기준점 확인(`git pull` 대신 지시된 방식) — `git status --porcelain`에 미추적 브리프 업로드 파일들(이전 판들부터 계속 존재, 추적 대상 아님)만 있었고 추적 파일 변경은 없었다. `git fetch` 후 `HEAD`·`origin/main` 모두 `5c3d693a6839595ed5d92c6f8040cf5d4d019ff0`로 일치 확인.

## 3. 구현 요지

§1.2의 정규식 6종(`COMPLETION_SEGMENT_SPLIT`·`COMPLETION_QUOTE_SPAN`·`COMPLETION_REPORT_MARKER`·`COMPLETION_FORBID`·`COMPLETION_CANCEL`·`COMPLETION_REQUEST_ENDINGS`)과 §1.3의 `splitCompletionParts`·`detectCompletionRequest`를 지시서 원문 그대로 옮겼다(§4의 「정규식을 개선하지 말 것」을 지키기 위해 한 글자도 바꾸지 않음 — §4 근거는 아래 ④에서 diff로 증명). `detectAskMode`는 기존 인라인 `COMPLETION_PATTERNS`/`COMPLETION_EXCLUSIONS` 즉시판정 3줄을 지우고 `detectCompletionRequest(latestUserText)` 한 줄 호출로 교체했다. 우선순위(`strict_script > verdict_probe > completion > null`)는 얼리리턴 구조상 그대로 유지된다. `COMPLETION_PATTERNS`·`COMPLETION_EXCLUSIONS`는 값 무변경, `splitSentences`(`@/lib/hiddenTruth`)도 무접촉.

## 4. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` 전체 — **868개**(기존 718 + 신규 150), 그중 **3건은 `it.fails`(의도된 실패 고정)로 스위트는 정상 종료**(아래 ⑥ 참고)
- [x] `npm run build` 성공
- [x] 신규 테스트 수: **150건**
- [x] 변경 경로 검증 — ④ 참고

## ④ `route.ts` diff가 §1.2~§1.3 범위뿐임 (`git diff`)

```
$ git diff --name-only 5c3d693a6839595ed5d92c6f8040cf5d4d019ff0..HEAD
docs/briefs/BRIEF-100B-FIX4-C.md
src/app/api/ask/route.test.ts
src/app/api/ask/route.ts
```

`route.ts`의 실제 변경분(추가 8개 export, 삭제 3줄)만 발췌:
```diff
+export const COMPLETION_SEGMENT_SPLIT: RegExp = ...
+export const COMPLETION_QUOTE_SPAN: RegExp = (직접 인용 — 따옴표로 묶인 구간을 찾는 정규식, 원문 §1.2와 동일)
+export const COMPLETION_REPORT_MARKER: RegExp = ...
+export const COMPLETION_FORBID: RegExp = ...
+export const COMPLETION_CANCEL: RegExp = ...
+export const COMPLETION_REQUEST_ENDINGS: RegExp = ...
+export function splitCompletionParts(sentence: string): CompletionPart[] { ... }
+export function detectCompletionRequest(text: string): boolean { ... }
```
삭제된 부분은 `detectAskMode`의 기존 인라인 completion 판정 3줄뿐이다:
```diff
-  if (
-    COMPLETION_PATTERNS.some(p => p.test(latestUserText)) &&
-    !COMPLETION_EXCLUSIONS.some(p => p.test(latestUserText))
-  ) return 'completion';
```
그 자리를 `if (detectCompletionRequest(latestUserText)) return 'completion';` 한 줄로 대체했다. `AskMode` 타입 정의(기존에 이미 `'completion'` 포함)·`STRICT_SCRIPT_PATTERNS`·`VERDICT_PROBE_PATTERNS`·`COMPLETION_PATTERNS`·`COMPLETION_EXCLUSIONS`·`validateAskAnswer`·최종 처분·프롬프트 블록은 전부 무변경이다.

## ⑤ `TESTSET` 115건 재측정 — match / mismatch / FP / FN

**측정 범위: 고유 입력 115건 중 상위 우선순위(`strict_script` 2건·`verdict_probe` 1건)를 제외한 판정 대상 112건.**

| 항목 | 수 |
|---|---|
| 고유 입력 | 115 |
| 상위 우선순위(판정 미도달) | 3 |
| **판정 대상** | **112** |
| **match** | **109** |
| **mismatch** | **3** |
| ㄴ **FP**(기대 null, 실제 completion) | **0** — *이 112건 범위에서 관측된 값이며, 전체 자연어 입력에서 FP가 없다는 뜻이 아니다* |
| ㄴ **FN**(기대 completion, 실제 null) | **3** |

측정 방법: `docs/briefs/BRIEF-100B-FIX4-C.md` §2.1이 지정한 X38·L18·E81 전 corpus(문자열 기준 중복 제거 115건)에 대해, X군은 TESTSET의 `기대` 열을, L·E군은 X행과 동일 입력으로 교차 참조되는 경우 그 X행의 `기대`값을(§2 표의 「기존 ID 중복」 열로 확인), 교차 참조가 없는 항목은 §4.5의 "알려진 사용자 불편" 서술이 명시한 의미상 정답(즉 `completion`)을 기준값으로 삼아, 커밋된 `route.test.ts`의 실제 `it`/`it.each`/`it.fails` 실행 결과를 그대로 집계했다.

## ⑥ §4.5 잔여 FN — 브리프 원문 그대로 + 독자 재측정 결과

**브리프 §4.5가 명시한 잔여 4건(그대로 옮김):**

| ID | 입력 | 왜 놓치나 | 이번 범위에서 수용한 이유 |
|---|---|---|---|
| `E-080` | `오늘 보낼 메시지 좀 써줘 어제 건 써봤어` | `splitSentences`가 종결 부호 기준이라 한 문장으로 묶이고, 그 절 안에서 완료 표지가 요청 뒤에 온다 | 고치려면 공백·어미로 절 경계를 추정해야 하는데, 과분할은 곧 과발동이다. 부호가 있으면 정상 분류된다. 불편이 사라지는 것은 아니다 |
| `E-070` `E-071` `X5-M1` | `하나만 더 써줘` · `참고할 거 하나 만들어줘` · `써주지 마. 아니, 하나만 써줘.` | `COMPLETION_PATTERNS`가 목적어 명사를 요구하는데 앞 절에도 목적어가 없다(`sawObject` 이월 불가) | 목적어 없는 `써줘`를 전역 허용하면 일상 대화 상당수가 발동한다. 그 교환 비용이 더 크다고 판단해 이번 범위에서 수용한다 |

**독자 재측정 — 이 4건 중 3건만 실제로 mismatch로 재현됐다.** §1.2~1.3을 지시서 원문 그대로(위 ④의 diff로 증명) 구현한 결과, `X5-M1`·`E-070`·`E-071` 3건은 브리프의 서술대로 `null`을 반환해 FN으로 재현됐다(`route.test.ts`에 `it.fails`로 고정). 그러나 **`E-080`은 직접 추적·자동 검증 모두에서 `completion`을 정확히 반환했다** — `메시지 좀 써` 부분이 절 분리 여부와 무관하게 목적어+동사 패턴에 곧바로 매치되어, 뒤에 오는 "어제 건 써봤어"가 별도로 분리되든 안 되든 최종 판정에 영향을 주지 않았다(코드 흐름을 문장 단위로 직접 손으로 추적해 확인, `route.test.ts`의 `E-080` 항목도 일반 `it`로 통과함). 이 차이는 브리프 §4.5 자체가 "본부 자체 검토 + 스크립트 실행 확인. 독립 검수 미수행"이라 명시한 부분과 관련이 있을 수 있다 — **§4.5의 4건을 지우거나 재분류하지 않고 그대로 옮겨 적되, 내가 독립적으로 재현한 값(3건 mismatch, E-080은 match)을 함께 밝힌다.**

이 3건(`X5-M1`·`E-070`·`E-071`)은 **지원 범위 밖으로 삭제하거나 "정상 동작"으로 바꾸지 않았다** — `route.test.ts`에 `it.fails()`로 고정해, "지금은 기대값과 다르고 그게 의도된 상태"임을 테스트 스위트 안에 그대로 남겼다(내부 단언이 실패해야 `it.fails` 자체는 초록으로 보고된다 — 실수로 통과하게 되면 스위트가 실패하도록 만드는 안전장치이기도 하다).

## ⑦ `splitCompletionParts` 3개 고정 사례 — 어떤 테스트로 잡았는지

`describe('splitCompletionParts — 3개 고정 사례 (BRIEF-100B-FIX4-C §2.2)')`에 3건:

1. `걔가 "메시지 써줘"라고 보냈어` → `parts.filter(kind==='quote')`가 정확히 1개, `detectCompletionRequest(...) === false`로 "user 부분에 요청 없음"을 확인.
2. `걔한테 "잘 지내?"라고 보낼 메시지 써줘` → `라고 보낼`이 `COMPLETION_REPORT_MARKER`의 전달-동사 조건(`보냈|왔|들었|그러|말` 등, `보낼`은 불포함)에 안 걸려 인용 분리가 안 되고 전체가 `user`로 남는다는 걸 직접 추적으로 확인했다 — `user` 파트 텍스트가 `'메시지 써줘'`를 포함하고 `detectCompletionRequest(...) === true`임을 단언.
3. `메시지 써줘. 아니다 걔가 먼저 쓴대.` → `splitSentences`로 2문장 분리 후 두 번째 문장(`아니다 걔가 먼저 쓴대.`)에 `splitCompletionParts`를 적용해, `{kind:'user', text:'아니다'}`와 `{kind:'quote', text:'걔가 먼저 쓴대'}`가 각각 존재함을 단언.

세 사례 모두 사전에 `splitCompletionParts`/`detectCompletionRequest`를 직접 호출해 실제 반환값을 확인한 뒤(코드 실행 결과 기준, 손으로 추정하지 않음) 그 값을 테스트로 고정했다.

## 5. 정직 보고

- 위 ⑥에서 밝힌 대로, 브리프 §4.5의 사전 실측(4건 FN)과 내 독립 재측정(3건 FN + `E-080`은 match) 사이에 실제 차이가 있다. §1.2~1.3 코드가 브리프 원문과 diff상 완전히 동일함(④)을 이미 확인했으므로, 이 차이는 브리프의 사전 프로브 스크립트가 최종 §1 사양과 미세하게 달랐을 가능성이 있다고 본다 — 다만 이는 추정이며 확정할 수 없다. `TESTSET`의 기대값 자체는 바꾸지 않았다(X5-M1의 기대값은 여전히 `completion`으로 고정돼 있고, 실제로는 `null`이 나와 `it.fails`로 문서화했다).
- 이 판은 §5(여기서 멈춘다) 명시대로 **구현과 자체 검증까지만** 했다. Production 배포 여부·100B 종결·RECHECK PASS 선언 등은 하지 않았다 — `git push origin main`으로 원격 저장소에 반영했을 뿐, 그 이상의 배포·검수 관련 행동은 취하지 않았다.

## 6. 커밋 해시

- 저장소: https://github.com/Farerworks/attune
- §0.5 브리프 원문 보관: `5ab1ba8`
- 코드 커밋: `1f07d8f`
