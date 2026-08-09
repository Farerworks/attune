# BRIEF-100B-FIX6 (v1.1) — Ask 응답 파싱 실패(502) 결정적 복구

## 0. 작업 브랜치

이 판의 모든 커밋은 `main`이 아니라 `fix/100b-fix6`에만 존재한다. `origin/main`은 시작부터 끝까지 `e7fc088d3b94a18459e161c457486007c3eb5f6f` 그대로다.

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `docs/briefs/BRIEF-100B-FIX6.md` | 브리프 원문 바이트 그대로 보관 (단독 커밋, `fix/100b-fix6`) |
| `src/app/api/ask/route.ts` | §2.1~§2.5 — 수리 함수·`tryParse` 확장·plain-text fallback·프롬프트 보조 문장·로그 필드 |
| `src/app/api/ask/route.test.ts` | 신규 32건 + 기존 회귀 테스트 1건 픽스처 교정(사유는 §7) |
| `docs/reports/BRIEF-100B-FIX6.md` | 본 보고서 |

## 2. 구현 요지

- **§2.1** `repairControlCharsInStrings` — 정규식 없이 문자 단위 스캔(`inString`/`escaped` 상태 추적)으로 JSON 문자열 **안**의 리터럴 LF/CR/TAB만 `\n`/`\r`/`\t` 텍스트로 치환. 문자열 밖은 무접촉.
- **§2.2** `tryParse` 확장 — ① 기존 `extractJson` → ② 실패 시 수리 후 1회 재시도(D4) → ③ 그래도 실패면 펜스·중괄호 흔적으로 `shape`(`object_invalid`/`plain`/`fence_plain`)·`firstChar`·`brace`·`fence`·`repair` 분류. 추가 API 호출 없음(순수 문자열 처리).
- **§2.3** `tryPlainTextFallback` — D6/D7 **AND** `askMode ∈ {strict_script, completion}`일 때만 발동. `T`는 **원본 raw**를 펜스 제거·trim한 값(수리 결과 아님 — 사용자 명시 요구사항 그대로 구현). 기존 검사 대응표(`normalizeAnswer`·`findBanned`·`validateAskAnswer`) 전부를 통과해야 채택, 하나라도 위반이면 폐기하고 기존 재시도/502 경로로 복귀.
- **§2.4** `STRICT_SCRIPT_BLOCK`·`COMPLETION_BLOCK` 끝에 "출력 형식 리마인더" 한 문장 추가 — 소스에는 `\\n`(3문자: 백슬래시 2개+n)로 타이핑해 런타임 값은 `\n`(2문자: 백슬래시 1개+n)이 되도록 함(테스트 ⑭b로 실측 확인).
- **§2.5** `[ask]` 로그에 `shape`·`firstChar`·`brace`·`fence`·`repair`·`fallback` 필드 추가. 수리 성공 시에도(기존엔 성공 로그가 아예 없었음) `shape=object_repaired repair=ctrl_fixed` 한 줄을 새로 남긴다. 원문·개인정보는 여전히 로깅하지 않는다.
- **호출 예산 무변경**: 수리·분류·fallback은 모두 문자열 처리이며, `tryParse` 실패 3개 지점(1차/공유 재시도/교정 재시도) 모두에 동일하게 fallback을 시도하되, 새 Gemini 호출은 추가하지 않았다.

## 3. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` 전체 — **900개**(기존 868 + 신규 32), **896 passed + 4 expected fail**(기존 잔여 FN 4건 그대로, 이 판이 늘리지 않음)
- [x] `npm run build` 성공
- [x] §3 ①~⑯ 전부 구현·통과 — 아래 §4 결과표
- [x] 신규 테스트 32건

## 4. §3 결과표

| # | 케이스 | 결과 |
|---|---|---|
| ① | 정상 JSON(D1) | PASS — 무변경 통과 |
| ② | 펜스 JSON(D2) | PASS |
| ③ | 앞뒤 설명 포함 JSON(D3) | PASS |
| ④ | 문자열 내부 실제 LF(D4) | PASS — 수리 후 파싱 성공, `repaired=true` |
| ⑤ | 문자열 밖 개행(pretty-print) | PASS — 수리기가 무변경으로 통과시킴 |
| ⑥ | `\"`·`\\` + 내부 실제 개행 | PASS — 경계 오인 없이 정확 수리 |
| ⑦ | 잘린 JSON | PASS — 수리 거부(`repair=none`), `shape=object_invalid`(D5) |
| ⑧ | object-like 불법 텍스트 | PASS — `shape=object_invalid`(D5), fallback 미발동 |
| ⑨ | 일반 텍스트 2줄 + strict_script(요청 2개) | PASS — fallback 채택, 200 |
| ⑩ | 같은 텍스트 + completion | PASS — fallback 채택, 200 |
| ⑪ | 문안 수 불일치(요청 2, 텍스트 3줄) | PASS — 특혜 없이 폐기 → 재시도 → 502 |
| ⑫ | 금지어 포함 일반 텍스트 | PASS — 폐기(D8) → 재시도 → 502 |
| ⑬ | askMode=null 일반 텍스트 | PASS — fallback 미발동, 기존 502 경로 |
| ⑭ | 펜스만 있는 일반 텍스트(D7) | PASS — D6과 동일 규칙, fallback 채택 |
| ⑭b | 프롬프트 이스케이프 | PASS — 런타임 값에 2문자 `\n` 시퀀스 존재, 그 자리에 실제 개행 없음 |
| ⑭c | CR·TAB 복구 | PASS — LF와 동일하게 수리 |
| ⑭d | 호출 횟수(fallback 성공) | PASS — 총 1회 |
| ⑭e | 호출 횟수(fallback 폐기 후 재시도) | PASS — 성공 시 총 2회 / 재실패 시 총 2회+502 |
| ⑭f | 로그 계약 | PASS — 필수 필드 전부 존재, 원문 내용 미포함 |
| ⑮ | 분류 무변경(TESTSET v1.2 115건) | PASS — 코드 무접촉이므로 기존 X38/L/E75 + `it.fails` 4건이 전부 그대로 재실행·통과 |
| ⑯ | 전체 스위트 | PASS — 900개(896 passed + 4 expected fail) |

## 5. 로그 필드 예시 (합성 데이터로 캡처 — 실제 Production 관측값 아님)

```
[ask] rid=7eaf862a stage=parse action=repaired status=- timeout=n rawLen=23 shape=object_repaired repair=ctrl_fixed
[ask] rid=cb322983 stage=parse action=fallback_used status=- timeout=n rawLen=12 shape=plain firstChar=hangul brace=n fence=n repair=none fallback=used
[ask] rid=3f47e35b stage=parse action=retry status=- timeout=n rawLen=9 err=SyntaxError shape=plain firstChar=hangul brace=n fence=n repair=none fallback=rejected
[ask] rid=3f47e35b stage=parse action=fail status=- timeout=n rawLen=9 err=SyntaxError shape=plain firstChar=hangul brace=n fence=n repair=none fallback=rejected
```
캡처 방법: 테스트 하네스로 `console.error`를 spy해 합성 요청 3건(수리 성공/fallback 채택/fallback 폐기 후 재시도)을 실행하고 캡처한 뒤 즉시 삭제한 임시 테스트 파일 — 커밋된 파일에는 남아 있지 않다.

## 6. `route.ts` diff 요약

```
$ git diff --stat e7fc088d3b94a18459e161c457486007c3eb5f6f..HEAD -- src/app/api/ask/route.ts
 src/app/api/ask/route.ts | 214 ++++++++++++++++++++++++++++++++++++++++++++---
 1 file changed, 204 insertions(+), 10 deletions(-)
```
추가된 것: `repairControlCharsInStrings`·`classifyFirstChar`·`stripFenceAndTrim`·`tryPlainTextFallback`·`handleParseFailure`(신규 함수 5개), `tryParse`의 반환 타입 확장(`ParseFail`/`ParseFailShape`/`ParseFailFirstChar`), `logAsk`의 opts에 6개 필드, `STRICT_SCRIPT_BLOCK`/`COMPLETION_BLOCK` 끝 문장 1개씩. 지운 것: 기존 3개 `tryParse` 호출 지점의 단순 `logAsk+502` 코드를 `handleParseFailure` 호출로 교체(로직은 그대로, 표현만 통합). `detectAskMode`·`detectCompletionRequest`·`splitCompletionParts`·`COMPLETION_PATTERNS`·`COMPLETION_EXCLUSIONS`·`STRICT_SCRIPT_PATTERNS`·`VERDICT_PROBE_PATTERNS`·`validateAskAnswer`·최종 처분·`src/lib/hiddenTruth.ts`는 전부 무접촉(구조 회귀 테스트로 길이·동작 확인).

## 7. 정직 보고

- **기존 회귀 테스트 1건의 픽스처를 교정했다.** `POST /api/ask — BRIEF-100B-FIX3 회귀 (§2.4)`의 "502 반환 지점·status·body — 파싱 실패 경로는 completion 도입 후에도 무변경" 테스트는 `completion` 모드에서 순수 평문(`'not json'`)을 502로 기대했는데, 이 판이 **정확히 이 시나리오를 복구하도록 설계**돼 있어 이제는 200이 나온다 — 이건 회귀가 아니라 이 브리프의 의도된 효과다. 원래 테스트의 취지("일반 턴은 502 그대로")를 살리기 위해 질문을 `askMode=null`이 되는 문장으로 바꿔 교정했다(§4 "분류 로직 무접촉"은 지켰다 — 코드가 아니라 테스트 픽스처만 바꿨다).
- **fallback은 3개 `tryParse` 실패 지점 전부에 동일하게 배선했다.** 브리프 §0.1이 서술한 실제 502 사례(1차·재시도 모두 같은 지점에서 실패)는 처음 두 지점(1차 호출, 공유 재시도)에서 발생하지만, 세 번째 지점(교정 재생성 이후의 파싱)에도 같은 규칙을 배제할 근거가 없어 동일하게 적용했다. 이 지점은 §3 테스트에서 별도로 재현하지는 않았다(초기 파싱이 성공해야 도달하는 경로라 구성이 더 복잡함) — 다만 로직은 `handleParseFailure`를 그대로 재사용하므로 ①~⑭ 테스트들이 검증한 것과 동일한 코드 경로다.

## 8. 커밋 해시 (모두 `fix/100b-fix6`)

- 저장소: https://github.com/Farerworks/attune (브랜치: `fix/100b-fix6`)
- 브리프 원문 보관: `e6f4966`
- 코드+테스트 커밋: `0650a4f`
