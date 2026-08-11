# BRIEF-104A — 말투 기준선 채집 (제품 코드 무변경)

## 0. 작업 브랜치

이 판의 모든 커밋은 `main`이 아니라 `feat/104a-voice-baseline`에만 존재한다. `origin/main`은 시작부터 끝까지 `9054808ea79ba0d605952ecc23d162105ea7d7fc` 그대로다. `src/` 전체 무접촉(§4 확인 참조).

## 1. §0.5 보관본 대조

- `docs/briefs/BRIEF-104A.md` — 12,552바이트 / sha256 `c4a0db74bf45c9a1f88e2f60d1cb8aeb54f1c85c5b8cf692ebf527541a488eb4` — 발사 메시지 기준값과 **일치**.

## 2. 실행 조건 (§2.1 게이트 통과 기록)

| 항목 | 값 |
|---|---|
| 모델명 실측값 | `gemini-3.5-flash-lite` (게이트 통과, forced=false) |
| generationConfig 분기 | new — no temperature, thinkingConfig.thinkingLevel='minimal' (gemini-2.x 계열 아님) |
| LLM_PROVIDER | `gemini` |
| 실행 시각(ISO) | `2026-08-11T07:50:45.799Z` (4개 런 공통) |
| 호출 간격 | 4,000ms — 계정의 실제 RPM/RPD를 확인할 방법이 없어(대시보드 접근 불가) 브리프 §2.3 기본값(≒15 RPM) 그대로 사용 |
| 총 API 호출 수 | **25** (기본 24 + 교정 1) |
| 429 발생 | 없음 |

## 3. 하네스

- `scripts/verify/voice-baseline.mjs` 신설 (route.ts:474 `buildAskSystem` / :725 `buildAskTurns` / :118 `hasTodayIntroduced` / :139 `themNameCandidates` / :168 `hasPersonIntroduced` / :387 `detectAskMode` / :395 `detectContinuationHint` / :835 `validateAskAnswer` / :1161 `tryParse` / :1204 `tryPlainTextFallback`를 서버-only 우회로 **직접 import** — VERIFY-KIT §2 기법 그대로, `route.ts` 무수정). `llm.ts`의 `createLlmProvider`도 동일 기법으로 직접 import해 **실제 GeminiProvider**를 그대로 사용(브리프가 요구한 "미러링"보다 한 단계 더 충실한 방식 — §7 특이사항 참조).
- export되지 않은 함수(`normalizeAnswer` route.ts:755 / `fixLabelOrder` :933 / `applyFinalDisposition` :989 / `buildCorrectionWarnings` :1070 / `todayNameCandidates` :109 / `findBanned`+`BANNED` :103,19)는 파일별 줄 인용과 함께 하네스 안에 읽기 전용으로 복제 — `route.ts`는 한 바이트도 수정하지 않았다.
- `scripts/verify/README.md` §5에 사용법·모델 게이트·M2 어휘 목록·M3 범위·§2.2의 브리프-코드 불일치(아래 §7) 전재.

## 4. `src/` 무접촉 확인

```
$ git diff main --stat
 docs/briefs/BRIEF-104A.md              | 117 ++++++
 docs/reports/BRIEF-104A.md             | (본 보고서)
 scripts/verify/README.md               |  53 +++
 scripts/verify/voice-baseline.mjs      | 750+ (신설)
 samples/voice-baseline/*.json          |  4개 (신설)
 samples/voice-baseline/metrics-*.tsv   |  1개 (신설)
```
`src/` 경로 0건.

## 5. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 오류 0
- [x] lint — 청정 클론 조건(`git status --porcelain`에 이번 판 커밋 대상 외 파일 없음, 저장소 루트의 기존 미추적 스크래치 파일은 측정 동안 `/tmp`로 임시 대피 후 원복)에서 측정: **39 problems = 24 errors + 15 warnings** — 브리프 §5가 명시한 베이스라인(9054808 실측)과 **정확히 일치**, 신규 0건.
  - 신규 파일 `scripts/verify/voice-baseline.mjs` 단독: **0 errors, 0 warnings**(목표 달성 — prompt-assembly.mjs의 0E 2W 전례를 따르지 않음).
- [x] `npx vitest run` — **910 = 906 passed + 4 expected fail**, 무변동
- [x] `node scripts/verify/voice-baseline.mjs --selftest` → `ALL PASS`
- [x] `git diff main --stat`에 `src/` 경로 0건 (§4)
- [x] 기본 24콜 완료 + 실제 교정 호출 1건 + 결과 JSON 4개 + metrics TSV 커밋

## 6. 지표 요약 — firstPass(1차 준수율) vs finalPass(사용자 노출)

24턴(EN×2런 + KO×2런 × 6턴) 기준.

| 지표 | firstPass | finalPass |
|---|---|---|
| M1 재소개 적중 턴 | 0 | 0 |
| M4 단정(후보) 적중 수 | 1 | 1 |
| M6 속마음(후보) 적중 수 | 0 | 0 |
| M1/M4/M6 전부 0인 턴 | 23/24 | 23/24 |
| 평균 wordCount | 71.9 | 72.0 |
| M7 표면 중복쌍(런 내부, 합계) | 0 | 0 |

**M3 — 턴1 대비 턴4·5·6 단어수 비율** (firstPass/finalPass, 4개 런):

| 런 | 턴4 | 턴5 | 턴6 |
|---|---|---|---|
| EN #1 | 0.47 / 0.46 | 1.02 / 1.00 | 0.31 / 0.30 |
| EN #2 | 0.44 / 0.44 | 1.06 / 1.06 | 0.43 / 0.43 |
| KO #1 | 0.34 / 0.34 | 1.00 / 1.00 | 0.26 / 0.26 |
| KO #2 | 0.29 / 0.29 | 0.40 / 0.40 | 0.18 / 0.18 |

턴4("No reply today.")·턴6(완성 요청 — 두 메시지 작성)은 짧은 shape 2 답변이 정상이라 비율이 낮게 나오는 것 자체가 기대된 모양이다(브리프 §4 "shape가 달라지는 것이 정상"). 턴5(왜 미지근한지 묻는 질문)는 턴1과 비슷하거나 더 긴 3-part 답변으로 돌아와 비율이 1.0 근방에 몰려 있다.

**교정 발생**: 총 1턴(EN #1 턴1) — firstPass가 `label_set` 위반(라벨 세트가 DECIDE/UNDERSTAND 어느 쪽과도 안 맞음)으로 교정 재호출됨. finalPass는 위반 0으로 해소.

**런 간 변동폭**: M1/M6는 4개 런 전부 0으로 변동 없음. M4는 1개 런(추정: 위 표에서 어느 런인지는 TSV의 `M4_context_*` 열 참조)에서만 1건 적중, 나머지 3개 런은 0 — 표본이 4런뿐이라 통계적 결론은 낼 수 없음(브리프 §0 "탐색용" 명시). M3 비율은 런마다 어느 정도 편차가 있음(턴5 비율이 EN #2에서 1.06, KO #2에서 0.40으로 가장 크게 벌어짐).

## 7. 특이사항·판단

1. **GeminiProvider를 미러링 대신 실제 import**: 브리프는 "`llm.ts`의 GeminiProvider 미러링(`scripts/sample.ts` 방식)"을 지시했으나, `scripts/sample.ts`가 그 방식을 쓴 이유는 `server-only` 우회 기법을 안 쓰기 때문이었다. `route.ts`(→ `llm.ts`)를 이미 §2 우회로 직접 import하는 이 하네스는 `createLlmProvider()`를 그대로 가져다 썼다 — 손으로 재구현한 코드와 실제 코드가 어긋날 위험이 없는, 더 충실한 방식이라 판단해 그렇게 했다. 동작(엔드포인트, `generationConfig` 분기, 에러 처리)은 100% `llm.ts` 원본과 동일하다.
2. **메모리 누적 상한 불일치(§2.2 vs 실코드)**: 브리프 §2.2 point 5는 "응답 memory를 누적(중복 제거·최대 20)"이라고 적었지만, 실제 클라이언트(`src/lib/askQuota.ts`의 `appendMemory`/`MEMORY_CAP`)는 **10**으로 캡한다. 하네스는 실제 코드(10)를 따랐다 — 이 판의 목적이 "실제 제품 동작"을 재는 것이므로 브리프 문구보다 코드를 우선했다. `scripts/verify/README.md` §5에도 명시.
3. **`baseCommitSha` 메타 필드 사후 정정**: 최초 수집 시 하네스가 `git rev-parse HEAD`를 그대로 기록해, 이미 만들어둔 브리프 보관 커밋(`66d5527`)이 찍혔다. `src/`는 이 브랜치에서 전혀 바뀌지 않았으므로 "이 결과를 만든 코드가 어느 커밋이었나"의 올바른 답은 §0 기준 커밋(`9054808`)이다. 하네스를 상수로 고치고, 이미 저장된 4개 JSON의 `meta.baseCommitSha` 필드만 `9054808...`로 사후 정정했다(실측 데이터·raw 응답·지표는 전혀 건드리지 않음).
4. **`harnessFileSha256` 메타 필드가 현재 파일 해시와 다름**: 수집 실행 후 lint 경고 5건(미사용 매개변수/import)을 고치면서 하네스 파일이 바뀌어, JSON에 저장된 해시(`636242...`)가 현재 파일 해시(§8의 코드 커밋 해시로 확인 가능)와 다르다. 수집 로직(호출 흐름·재시도/교정 상태기계·지표 함수)은 전혀 바뀌지 않았고 변경분은 이름 변경·`void` 문·미사용 import 제거뿐이므로 데이터 유효성에는 영향 없다.
5. **lint 측정을 위한 저장소 루트 임시 정리**: §5 조건 ⑶이 요구하는 "커밋 대상 외 파일 없음" 상태를 만들기 위해, 이전 판들이 남긴 저장소 루트의 미추적 스크래치 파일(BRIEF-*.md 다수, coverage.js 등 41개)을 측정 직전 `/tmp`로 옮기고 측정 직후 전부 원복했다. 삭제된 파일은 없다.

## 8. 커밋 해시

- 저장소: https://github.com/Farerworks/attune (브랜치: `feat/104a-voice-baseline`)
- 브리프 원문 보관: `66d5527`
- 하네스+README 커밋: `d1e2858`
- 결과+metrics+보고서 커밋: `9b0feb4`

## 9. Erratum (BRIEF-104A-FIX — API 호출 0, raw 응답 무접촉)

원 보고서(§1~§8)는 위 그대로 두고, 사후 발견된 지표 정의 결함 3건과 재산출 결과만 아래에 덧붙인다. **이 판에서 모델을 다시 호출한 적은 없다** — API 호출 수 = **0**. `firstPass`/`finalPass`의 raw 응답은 전혀 건드리지 않았고, 지표를 계산하는 순수 함수만 고쳤다.

### 9.1 정정 3건

1. **M4(한국어) 일반형 누락** — 원래 정규식이 `할 거예요`·`될 거예요` 두 어간만 잡아, 「반가워할 거예요」·「아닐 거예요」 같은 다른 어간의 미래형을 놓쳤다. `[가-힣]+(?:을|ㄹ)?\s*(?:거예요|거야|겁니다|것입니다)` 일반형으로 교체. **위반이 아니라 후보일 뿐**이라는 원칙은 그대로 — 헤지·부정형("아닐 거예요")도 후보로 잡되 자동으로 단정 위반 확정하지 않는다. `M4_manual_first`/`M4_manual_final` 열 신설(공란).
2. **M6 정규식이 키워드 없는 속마음 서술을 못 잡음** — 정규식 매칭과 무관하게 **24턴 전부**에 `M6_manual_final`/`M6_manual_evidence` 열 신설(공란), 본부·조언자가 수동 판정.
3. **M7b가 `N/A`를 `NO`로 흡수** — `M7b_verdict` 허용값에 `N/A` 추가, `computeM7bAggregate()` 신설로 `overall`(YES/전체)과 `applicable`(YES/(전체−N/A)) 두 비율을 분리 산출하도록 준비(값 자체는 본부가 채운 뒤에 의미를 가짐).

### 9.2 재산출 결과

- 새 파일: `samples/voice-baseline/metrics-20260811-v2.tsv` (24행 + 헤더, 기존과 동일 행수/턴 순서)
- 기존 `samples/voice-baseline/metrics-20260811.tsv`는 **감사 추적용으로 그대로 보존**(`git diff` 무변경 확인).
- **M4 후보 수**: firstPass/finalPass 공통 **1 → 4** (EN "will keep them engaged" 기존 1건 유지 + KO 신규 3건: EN#1턴1은 무변화, KO#1턴1·KO#1턴4·KO#2턴4가 새로 잡힘 — 브리프 §7이 지목한 "아닐 거예요" 사례 2건 포함).
- **M6**: 0 → 0 (정규식 자체는 무변경이라 자동 열은 동일값 — 이번 정정은 수동 판정 칸 추가가 핵심이라 정규식 결과는 그대로임이 정상).
- **`M6_manual_final` 행 생성 확인**: 24/24턴 전부 존재.

### 9.3 raw JSON 4개 sha256 대조 (작업 전 vs 작업 후 — 완전 동일)

| 파일 | sha256 |
|---|---|
| `...-EN-run1.json` | `73fd147d0e2cee28d430d11d4243fe99db7d94494bdfaca01578d88c55b60292` (무변동) |
| `...-EN-run2.json` | `189004d5ec875ec56c71d416f82d5a71ffdafc36e603e73afaa107b1ff68ac8a` (무변동) |
| `...-KO-run1.json` | `cbf76b19b88da9c2ccade9c9e30e82b536e3fd78a9aa21ed7e9f8205ee558cf2` (무변동) |
| `...-KO-run2.json` | `8b09cb3d9f0bd8caebfa40b24a94dc30d2d4d6781e2c51c501b39fc6b1e0c4da` (무변동) |

### 9.4 erratum 커밋 해시

- 저장소: https://github.com/Farerworks/attune (브랜치: `feat/104a-voice-baseline`, 기존 3커밋 `66d5527`·`d1e2858`·`9b0feb4`는 재작성 없이 그대로 보존)
- 보관 커밋: `7d100e0`
- 정정 커밋: (본 커밋 자신 — 규약상 보고서는 자신의 해시를 적지 않는다; 채팅 보고에 기재)
