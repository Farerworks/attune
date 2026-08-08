# BRIEF-100B-FIX5 (v2) — 시제·상 축 제외 6개를 절 단위 판정에 결합

## 0. 작업 브랜치

**이 판의 모든 커밋은 `main`이 아니라 `fix/100b-fix5`에만 존재한다.** `origin/main`은 시작부터 끝까지 `fc76fb6533195a4fa61c211efdd597e1ba1e6ba0` 그대로다(§0.1의 기준점과 동일 — merge·push·rebase·cherry-pick 없음).

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `docs/briefs/BRIEF-100B-FIX5.md` | §0.5 — 브리프 원문 바이트 그대로 보관 (단독 커밋, `fix/100b-fix5`) |
| `src/app/api/ask/route.ts` | §1.1 — `COMPLETION_EXCLUSIONS` 2개 → 8개(배열 안만) |
| `src/app/api/ask/route.test.ts` | 기대값 교정 26건 + `it.fails` 1건 추가(E-080) + 구조회귀 단언 1건 수정 |
| `docs/reports/BRIEF-100B-FIX5.md` | 본 보고서 |

`TESTSET-100B-FIX4.md` v1.2는 지시서 §0.5·§4 명시대로 저장소에 커밋하지 않았다.

## 2. §0 사전 확인

- 두 파일 해시·바이트 대조 — **일치 확인 후 진행**:
  - `BRIEF-100B-FIX5.md`: sha256 `7f9008e41c54a94fffb68a537fc6b534ef8e2023041ff730c41685ec5d1bbe88`, 18713바이트 — 전달값과 일치
  - `TESTSET-100B-FIX4.md` v1.2: sha256 `1c8c14aeb3e2ff7c70199c7b4554e1fd5f884a8f6a1efc01df59feee6e00a77f`, 24436바이트 — 전달값과 일치
- 기준점 확인(`git pull` 대신 지시된 방식) — `HEAD`·`origin/main` 모두 `fc76fb6533195a4fa61c211efdd597e1ba1e6ba0`로 일치 확인 후 `fix/100b-fix5` 브랜치를 그 커밋에서 생성.

## 3. 구현 요지

`COMPLETION_EXCLUSIONS` 배열에 지시서 §1.1의 6개 정규식(완료·과거 보고 4개 + 의도 선언 1개 + 숙고 1개)을 **주석까지 원문 그대로** 기존 2개 뒤에 추가했다. `detectCompletionRequest`·`splitCompletionParts`·`detectAskMode`는 한 글자도 건드리지 않았다 — 이 배열은 이미 `detectCompletionRequest` 안에서 절 단위 `nonRequest` 판정에만 쓰이고 있었으므로, 배열만 늘리면 새 6개도 같은 자리에서 절 단위로 동작한다(전역 exclusion으로 되돌리지 않음, §1.2 근거).

## 4. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` 전체 — **868개**(기존과 동일 모수, 신규 추가 없음 — 교정만), **864 passed + 4 expected fail**
- [x] `npm run build` 성공
- [x] 신규 테스트: **0건**(§2.2가 새 ID 추가를 금지) / 기대값 교정: **26건** / `it.fails` 전환: **1건**(E-080)

## ④ `route.ts` diff가 `COMPLETION_EXCLUSIONS` 배열 안뿐임 (`git diff`)

```diff
diff --git a/src/app/api/ask/route.ts b/src/app/api/ask/route.ts
@@ -223,8 +223,20 @@ export const COMPLETION_PATTERNS: RegExp[] = [
 export const COMPLETION_EXCLUSIONS: RegExp[] = [
-  /(?:안|못)\s*(?:써|적어|만들어|뽑아)/,
-  /(?:써|적어|만들어|뽑아)\S*\s*(?:할까|말까|될까)/,
+  /(?:안|못)\s*(?:써|적어|만들어|뽑아)/,                              // (기존 1)
+  /(?:써|적어|만들어|뽑아)\S*\s*(?:할까|말까|될까)/,                   // (기존 2)
+
+  // ── BRIEF-100B-FIX5 — 시제·상(相) 축. 이 절은 요청이 아니라 보고·숙고·의도다. ──
+  /(?:써|적어|만들어|뽑아)(?:서)?\s*(?:봤|놨|뒀|보냈)/,
+  /(?:써|적어|만들어|뽑아)줬(?!으면)/,
+  /(?:써|적어|만들어|뽑아)줘서\s*(?:고마|감사|좋았|다행)/,
+  /(?:써|적어|만들어|뽑아)준\s*(?:거|것|건|게)/,
+  /(?:써|적어|만들어|뽑아)(?:볼|보|놓을|둘|줄)?\s*(?:게|야지|려고)/,
+  /(?:써|적어|만들어|뽑아)(?:볼|놓을|둘)(?:까|지)/,
 ];
```
`git diff fc76fb6..HEAD -- src/app/api/ask/route.ts`의 실제 출력에서 변경분은 이 20줄(삭제 2 + 추가 12)이 전부다. `detectCompletionRequest`·`splitCompletionParts`·`detectAskMode`·`COMPLETION_PATTERNS`·`STRICT_SCRIPT_PATTERNS`·`VERDICT_PROBE_PATTERNS`·`validateAskAnswer`·최종 처분·프롬프트 블록·`src/lib/hiddenTruth.ts`는 전부 무변경이다.

## ⑤ `TESTSET` v1.2 115건 재측정 — match / FP / FN

**측정 범위: 고유 입력 115건 중 상위 우선순위(`strict_script` 2건·`verdict_probe` 1건)를 제외한 판정 대상 112건.**

| 항목 | 기준(`fc76fb6`, 이 판 이전) | 이 판(`fix/100b-fix5`) |
|---|---|---|
| 판정 대상 | 112 | 112 |
| **match** | 83 | **108** |
| **FP**(기대 null, 실제 completion) | 26 | **0** — *이 112건 범위에서 관측된 값이며, 전체 자연어 입력에서 FP가 없다는 뜻이 아니다* |
| **FN**(기대 completion, 실제 null) | 3 | **4** |

측정 방법: 커밋된 `route.test.ts`의 X38·L2(전건, v1.2 §3 기준)·E75(전건, v1.2 §4 기준) `it`/`it.each`/`it.fails` 실행 결과를 그대로 집계했다. `it.fails`로 고정된 4건(아래 ⑥)은 FN으로, 나머지는 전부 `TESTSET` v1.2의 「제품 기대값」과 일치(match)했다 — `npx vitest run` 결과(864 passed + 4 expected fail)와 정확히 부합한다.

## ⑥ §4.5 잔여 FN 4건 — 브리프 원문 그대로

| ID | 입력 | 제품 기대값 | 왜 놓치나 |
|---|---|---|---|
| `E-070` | `하나만 더 써줘` | `completion` | 목적어 명사가 이 절에도 앞 절에도 없다 |
| `E-071` | `참고할 거 하나 만들어줘` | `completion` | 같음 |
| `X5-M1` | `써주지 마. 아니, 하나만 써줘.` | `completion` | 같음 |
| `E-080` | `오늘 보낼 메시지 좀 써줘 어제 건 써봤어` | `completion` | **이 판에서 새로 FN이 됨** — 문장부호가 없어 한 절로 묶이고, 절 단위 판정은 절 안의 순서를 보지 않아 새로 추가된 완료 표지("써봤어")가 요청을 이긴다. 부호가 있는 버전(`E-079`)은 문장이 갈려 정상 판정된다. |

이번 재측정은 브리프 §4.5의 사전 실측(match 108 / FP 0 / FN 4)과 **정확히 일치**했다 — 직전 판(FIX4-C)에서 있었던 사전 실측과의 괴리는 이번엔 없었다. 네 건 모두 삭제하거나 "정상 동작"으로 바꾸지 않고, `route.test.ts`에 `it.fails`로 고정해 "지금은 이렇게 실패하는 게 맞다"를 스위트 안에 명시적으로 남겼다.

## ⑦ 교정한 26행 — ID 목록

| 축 | 건수 | ID |
|---|---|---|
| 완료·과거 보고 | 12 | E-037, E-038, E-039, E-040, E-041, E-042, E-043, E-044, E-045, E-046, E-047, E-048 |
| 의도 선언 | 5 | E-053, E-054, E-055, E-056, E-057 |
| 숙고 | 4 | E-012, E-050, E-051, E-052 |
| 완료 + 후속 요청 혼합 | 4 | E-073, E-074, E-075, E-077 |
| 완료 단독 서술 | 1 | E-010 |

모두 `route.test.ts`에서 `'completion'` → `'null'`로 기대값을 교정했다(코드는 변경하지 않았고, v1.1에는 없던 오라클을 v1.2가 채워준 것을 test에 반영한 것). 교정 직후(코드만 바꾸고 테스트는 교정 전) 실행에서 이 26건 + E-080 + 구조회귀 단언 1건 = **정확히 28건**이 실패했고, 이는 §4.5가 예측한 전이(FP→match 26건, match→FN 1건)와 정확히 일치했다 — 구현이 사양과 다르지 않다는 교차 증거다.

## 5. 정직 보고

- 이 판은 §5(여기서 멈춘다) 명시대로 **`fix/100b-fix5` 브랜치에서 구현·자체 검증·보고까지만** 했다. `main` merge·push·Production 배포·100B 종결·RECHECK PASS 선언은 하지 않았다.
- `git push -u origin fix/100b-fix5` 직후 GitHub가 "Create a pull request" 안내를 표시했으나, 지시서 §4가 "PR을 생성하거나 merge하지 말 것"을 명시해 **PR을 만들지 않았다.**
- L군은 v1.2 §3 기준으로 `L-07`·`L-08` 2건뿐이지만(나머지 L-01~L-06·L-09~L-18은 v1.2에서 X행의 「중복 ID」로 흡수됨), 기존 `route.test.ts`의 L군 18건 테스트 블록(FIX4-C에서 작성, 값 전부 무변경 확인됨)은 그대로 두었다 — 삭제하거나 축소할 필요가 없었고(교정 대상 26건 중 L군은 0건), 손댈수록 허용 범위(§4 "route.ts에서 배열 외에 아무것도 바꾸지 말 것"의 정신을 test 파일에도 유지) 밖의 불필요한 변경이 될 뿐이라고 판단했다.

## 6. 커밋 해시 (모두 `fix/100b-fix5`)

- 저장소: https://github.com/Farerworks/attune (브랜치: `fix/100b-fix5`)
- §0.5 브리프 원문 보관: `311e5b0`
- 코드+테스트 커밋: `7e0b432`
