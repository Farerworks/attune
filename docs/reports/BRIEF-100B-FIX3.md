# BRIEF-100B-FIX3 — 완성물 요청의 분류·단위·출력 형태

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `docs/briefs/BRIEF-100B-FIX3.md` | §0.5 — 브리프 원문 바이트 그대로 보관 (단독 커밋) |
| `src/lib/hiddenTruth.ts` | §1.1 — `splitSentences`에 `export` 키워드 1개만 추가 |
| `src/lib/hiddenTruth.test.ts` | 신규 4건 — export된 `splitSentences`의 §4.5 프로브 값 고정 |
| `src/app/api/ask/route.ts` | 축 A(문장 단위) + 축 B(`completion` 감지) + 축 C(완성물 출력 계약) |
| `src/app/api/ask/route.test.ts` | 신규 40건 |
| `docs/reports/BRIEF-100B-FIX3.md` | 본 보고서 |

허용 경로 확인: `git diff --name-only` 결과 —
```
src/app/api/ask/route.test.ts
src/app/api/ask/route.ts
src/lib/hiddenTruth.test.ts
src/lib/hiddenTruth.ts
```
지시서 §4가 허용한 경로와 정확히 일치. `briefing.ts`·`briefing/route.ts`·클라이언트·`llm.ts`·`store.ts`·`askQuota.ts`·`askPrompts.ts`·환경변수·package 파일은 전부 무접촉.

## 2. 구현 요지

### 축 A — 문장 단위 실제 판정
`validateAskAnswer`의 `strict_script` + `labels === null` + `request !== null` 구간에, 기존 `count`(줄 수) 검사와 **독립적으로** `unit` 검사를 추가했다. `request.unit === 'sentence'`면 각 줄이 정확히 1문장, `'message'`면 각 줄 최대 2문장 — `hiddenTruth.ts`에서 새로 export한 `splitSentences`로 줄 단위 문장 수를 센다. 한 줄이라도 어기면 위반 1건만 보고(줄마다 누적하지 않음). 최종 처분은 **soft 플래그만** — 문장이 넘치는 줄을 자르면 사용자가 보낼 내용이 사라지므로 본문은 절대 건드리지 않는다.

### 축 B — `completion` 모드 신설
`AskMode`에 `'completion'`을 추가하고, `COMPLETION_PATTERNS`(완성물 요청 동사+목적어 패턴 3종, "메시제" 오타 허용 포함)와 `COMPLETION_EXCLUSIONS`(부정/망설임 표현 2종)를 지시서가 준 정규식 그대로 옮겼다. `detectAskMode`의 판정 순서는 `if`-체인의 얼리리턴으로 `strict_script → verdict_probe → completion → null`이 구조적으로 고정된다 — 개수가 있으면 `strict_script`가 먼저 매치해 함수가 즉시 반환되므로 `completion` 검사에 도달할 수조차 없다.

### 축 C — `completion`의 출력 계약
지시서가 준 `COMPLETION_BLOCK` 문자열을 그대로 `askMode === 'completion'`일 때만 `modeBlocks`에 추가했다. 검증기는 `parts` 존재(`completion_parts`) / `followUp` 존재(`completion_contract/followup`) / 형식 마커(`completion_contract/format`) 3가지만 본다 — **개수 검사는 하지 않는다**(`parseScriptRequest`를 이 모드에서 호출하지 않음). 최종 처분은 기존 `downgradeToText`·`stripFollowUp`을 그대로 재사용하고, format 위반은 안전한 자동 수정이 없어 soft 플래그만 남긴다.

## 3. 테스트

`src/lib/hiddenTruth.test.ts` 신규 4건(§4.5 프로브 값 고정) + `src/app/api/ask/route.test.ts` 신규 40건(축 A 7 · `COMPLETION_PATTERNS`/`EXCLUSIONS` 3 · 축 B `detectAskMode` 15 · 축 A 최종처분 1 · 축 C 검증기 8 · `COMPLETION_BLOCK` 프롬프트 2 · 축 C 파이프라인 3 · 회귀 2). 지시서 §2 표의 모든 행을 테스트 설명에 원문 그대로 인용해 1:1 대조 가능하게 했다.

전체 무회귀. **전체 718개 통과**(기존 674 + 신규 44).

## 4. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` 전체 통과 — **718개**
- [x] `npm run build` 성공
- [x] 신규 테스트 수: **44건**(hiddenTruth 4 + ask route 40)
- [x] `git diff --name-only` — §1 참고

## 5. 요구된 8개 항목

**④ `splitSentences` export가 순수 추가임을 보이는 근거**
`git diff src/lib/hiddenTruth.ts` 전체 결과:
```diff
-function splitSentences(text: string): string[] {
+export function splitSentences(text: string): string[] {
```
파일 전체에서 바뀐 줄은 이 한 줄뿐이다 — 정규식·필터 로직·주석 어디도 손대지 않았다.

**⑤ `completion` 우선순위가 `strict_script`를 가리지 않음을 어떤 테스트로 고정했는지**
`detectAskMode — completion` describe 블록의 `'양성 "지금 보낼 문장 2개만 써줘"/"보낼 메시지 2개만 써줘" -> strict_script (개수가 이긴다, 회귀 금지)'` 테스트 — 두 입력 모두 `COMPLETION_PATTERNS`에도 매치될 만한 문장(동사+목적어 포함)이지만 `strict_script`로 판정됨을 직접 단언한다. 구조적으로도 `detectAskMode`가 `if`-체인 얼리리턴이라 `strict_script`가 먼저 매치하면 `completion` 검사 코드에 도달하지 않는다(§2 구현 요지 참고).

**⑥ §1.1의 「부호 없는 문장은 1문장으로 센다」 한계**
`splitSentences`는 종결 부호(`.!?。`) 뒤 공백 또는 줄바꿈 기준으로만 나눈다. `hiddenTruth.test.ts`에 `"오랜만이야 잘 지내"(부호 없음) -> 1문장`을 명시적으로 고정해뒀다 — 이는 관대한 쪽으로 어긋나는 것(위반을 놓칠지언정 정상 문장을 과탐지하지 않음)이라 지시서가 명시한 대로 그대로 두었다. 공백·어미 기반 보강은 하지 않았다.

**⑦ §1.2의 「`메시제`+개수는 여전히 `strict_script` 미검출 = 부분 해소」**
`STRICT_SCRIPT_PATTERNS`는 이 판에서 전혀 손대지 않았다(지시서 금지사항). 따라서 `보낼 메시제 2개만 써줘`처럼 오타+개수가 함께 오면 `strict_script`로도 잡히지 않고, `COMPLETION_PATTERNS`가 `메시제`를 인식해 `completion`으로만 분류된다 — 복붙 가능한 출력은 나오지만 **개수 강제는 없다**. `detectAskMode — completion`의 `'보낼 메시제 좀 써줘'` 양성 케이스는 개수 없는 입력만 다루며, "메시제+개수" 조합에 대한 별도 테스트는 추가하지 않았다(지시서가 요구한 건 이 사실을 보고서에 적는 것이지 새 동작을 만드는 게 아니었으므로) — **이 판은 이 구멍을 부분적으로만 해소한다.**

**⑧ §1.3의 「앞뒤 안내문 억제는 코드 검증 불가, 프롬프트 계약」**
`validateAskAnswer`의 `completion_contract`는 `parts`·`followUp`·형식 마커(번호·불릿·라벨·"/") **형태**만 판정한다. "이 줄이 안내문인지 실제 전송 문장인지"는 정상적인 한 줄짜리 문장과 구분할 기계적 기준이 없어 코드로 판정하지 않았다 — `COMPLETION_BLOCK` 프롬프트 문구(안내문 금지)에만 의존한다. 이 축의 행동 검증은 **배포 후 실사용 RECHECK가 유일한 게이트**다.

## 6. 정직 보고 (요약)

이 판이 닫은 건 §0에서 명시한 세 가지(문장 단위 미집행, 개수 없는 완성물 요청의 미분류, 분류 안 됐을 때의 계약 부재)뿐이다. 차트 출처·미확인 상태 서술(F4) 등 그 외 관측된 결함은 손대지 않았다(지시서 §4 명시). §5의 ⑥⑦⑧에 적은 세 가지 한계는 모두 지시서가 "그대로 두라"고 명시한 것이므로 이 판에서 추가로 보강하지 않았다.

## 7. 커밋 해시

- 저장소: https://github.com/Farerworks/attune
- §0.5 브리프 원문 보관: `9cf5654`
- 코드 커밋: `e23af33`
