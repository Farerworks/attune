# BRIEF-104A v1.2 — 말투 기준선 채집 (제품 코드 무변경)

## §0 맥락 (이 문서가 요구사항의 전부다)

- 대상: **Attune** — Next.js(App Router)+TS. 폴더 `~/projects/attune`, 저장소 `github.com/Farerworks/attune`.
- 목적: **사용자가 실제로 보는 답변의 현재 상태를 숫자로 남긴다.** 고정 6턴 대화를 실제 Gemini로 돌려, **1차 생성분과 교정 후 최종분을 각각** 보존하고 반복·길이·단정 지표를 센다. **이 판은 아무것도 고치지 않는다.**
- **기준 커밋**: `origin/main = 9054808ea79ba0d605952ecc23d162105ea7d7fc`. 작업 전 `git fetch origin && git checkout main && git pull --ff-only && git rev-parse HEAD`로 대조 — 다르면 **중단·보고**.
- **브랜치 `feat/104a-voice-baseline`에서만 작업.** main 직접 push·force push·병합 금지.
- 기준 테스트: **910 = 906 passed + 4 expected fail** — 이번 판은 이 수치를 바꾸지 않는다.
- **`src/` 전체 무접촉.** 프롬프트·규칙·탐지기·`BANNED` 1바이트도 수정 금지.
- 표본 성격: 이 판의 표본은 **탐색용**이다. "문제없음" 판정이나 통계적 일반화에 쓰지 않는다.

## §1 공정 (커밋 정확히 3개)

1. **보관**: 이 문서를 `docs/briefs/BRIEF-104A.md`로 바이트 그대로 저장 → `sha256sum`·`wc -c`를 발사 메시지 기준값과 대조(불일치 시 중단·보고) → 단독 커밋.
2. **하네스**: `scripts/verify/voice-baseline.mjs` 신설 + `scripts/verify/README.md`에 §5 추가.
3. **결과·보고서**: `samples/voice-baseline/*.json` + metrics TSV + `docs/reports/BRIEF-104A.md`.

푸시: `git push -u origin feat/104a-voice-baseline`.

## §2 하네스

VERIFY-KIT 규약을 따른다(README §2의 `server-only` 런타임 패치 그대로. `node_modules` 수정 금지).

### 2.1 실행 전 게이트 — 전부 fail-closed (조건 미충족 시 **exit non-zero**)

- **모델 고정 — 이 판에서 가장 중요한 조건.** 프로덕션은 `gemini-3.5-flash-lite`인데 랩 PC `.env.local`에 `GEMINI_MODEL`이 없어 그대로 두면 `llm.ts` 기본값 `gemini-2.5-flash`로 떨어진다. **다른 모델로 뜬 기준선은 무효다.** 모델명이 `gemini-3.5-flash-lite`가 아니면 **exit 1**. `--force-model=<이름>`으로만 우회 가능하되, **우회 실행 결과는 104A 완료 조건으로 인정하지 않는다**(진단 참고용).
- `GEMINI_API_KEY` 없으면 **exit 1**(성공처럼 끝나면 안 됨 — `scripts/sample.ts`의 exit 0 규약은 여기 적용하지 않는다).
- `LLM_PROVIDER`(`llm.ts:136`, 기본 `gemini`)가 `gemini`가 아니면 **exit 1**.
- `generationConfig` 분기가 `gemini-2.` 계열이 아닌 쪽(temperature 없음)으로 타는지 확인해 결과에 기록.

### 2.2 조립·호출

1. `route.ts`의 `POST`가 하는 조립을 **그대로 복제**: `calculateSaju` → `getDailyPillars` → `hasTodayIntroduced`/`hasPersonIntroduced` → `buildAskSystem` → `buildAskTurns`. 인자 순서·판정 시점 동일. **route.ts를 고쳐 맞추지 말고 하네스를 맞춘다.**
2. Gemini 호출은 `llm.ts`의 `GeminiProvider` 미러링(`scripts/sample.ts` 방식).
3. **2층 저장 (v1.1 핵심 변경).** 제품은 위반 탐지 후 교정 재호출까지 하고 **사용자는 그 결과를 본다.** 따라서 1차만 재면 제품 기준선이 아니다.
   - `firstPass`: 1차 응답 원문 + `validateAskAnswer` 위반 목록 + banned 적중.
   - `finalPass`: 제품과 **동일한** 교정 경로(`buildCorrectionWarnings` → 교정 재호출 → 결정적 보정)를 그대로 태운 최종 출력 + **잔여** 위반.
   - route는 **1차 콜 + 공유 추가 콜 최대 1회**(retry 또는 correction)를 쓴다 — 이 예산 규칙도 그대로 복제한다. 교정이 발생하지 않은 턴은 `finalPass = firstPass`로 명시 기록.
4. 응답 파싱은 `tryParse`. **위반을 임의로 고치지 않는다** — 제품이 하는 보정만 한다.
5. 턴 사이: 응답 `memory`를 누적(중복 제거·최대 20)해 다음 턴 인자로 넘기고 이력도 누적. 누적에 쓰는 것은 **`finalPass`**(사용자가 본 것)다.

### 2.3 호출량·속도

- 기본 호출 **24개**(EN 6턴×2회 + KO 6턴×2회) + **실제 발생한 교정 호출 수** — 최악 48콜.
- **실행 전 해당 계정의 실제 RPM/RPD 한도를 확인해 간격을 정한다.** 확인 못 하면 **4초 간격**(≒15 RPM)으로 보수적으로 간다. 장부 기재 참고값: 무료 한도 500회/일.
- 429 발생 시 즉시 중단·저장·보고(몇 콜까지 됐는지 명기).

### 2.4 결과 파일

`samples/voice-baseline/<model>-<YYYYMMDD>-<lang>-run<N>.json`.
- 파일 헤더에 **고정 정보**: 모델명 실측값 · `generationConfig` · `LLM_PROVIDER` · 기준 커밋 SHA · 실행 시각(ISO) · 하네스 파일 sha256.
- 턴마다: `{turn, userText, systemPromptSha256, firstPass:{raw, parsed, violations, banned}, finalPass:{raw, parsed, violations, corrected:boolean}, extraCallUsed:'none'|'retry'|'correction', wordCount, shape}`.
- **시스템 프롬프트 원문은 저장 금지 — sha256만.**

### 2.5 자체 검증

`--selftest`는 API를 호출하지 않고 하드코딩 입력·기대값으로 §3 자동 지표 함수를 검증해 `ALL PASS` 또는 `[FAIL] <지표>`(실패 시 exit 1). 지표 함수는 순수 함수로 분리할 것.

## §3 지표 (`--metrics` → `samples/voice-baseline/metrics-<YYYYMMDD>.tsv`, 행=턴)

**모든 자동 지표는 `firstPass`·`finalPass` 두 층을 각각 산출한다**(열 접미사 `_first`/`_final`).

- **M1 재소개**: 2턴 이후 `validateAskAnswer`가 `reintroduction`을 낸 턴 수.
- **M2 차트 어휘**: 턴별 오행·간지·원형 어휘 토큰 수(어휘 목록은 상수로 두고 README §5에 전재).
- **M3 길이**: 턴별 단어 수(한국어는 어절) + shape(`parts`/`text`) + **턴1 대비 턴4·5·6 비율**.
  - **계산 대상 = 사용자에게 보이는 본문 텍스트만**: `parts[].text` + `timing` + `followUp`. **제외**: JSON key, `memory`(화면 미표시), 그리고 **part 라벨**. 라벨은 화면에 표시되지만 고정 상수라 장황함을 반영하지 않으므로 분량 지표에서 뺀다 — "안 보이는 것"이 아니라 "고정값"이라 빼는 것이며, 이 사유를 README에 적을 것.
- **M4 단정(후보)**: `\b(always|never|will|definitely|guarantee[ds]?)\b` + `항상|절대|반드시|할 거예요|될 거예요` 적중 수. **단어 경계 필수**. 이 열은 **후보 적중 수일 뿐**이며 별도 열 `M4_context`에 적중 문장을 원문 보존해 본부가 실제 단정인지 수동 판정한다.
- **M5 도입부**: 각 답변 첫 12단어를 **원문 그대로** 보존(스크립트는 분류하지 않는다 — 분류는 본부).
- **M6 속마음(후보)**: `hidden_truth_framing`·`verdict_opening` 적중 수 + `진짜 마음|진짜 이유|real(ly)? feel|deep down` 적중 수. M4와 동일하게 `M6_context` 열에 적중 문장 원문 보존 → 문맥 판정은 본부.
- **M7 표면 중복**: 서로 다른 턴의 문장쌍 중 정규화 토큰 Jaccard ≥ 0.6 인 쌍 수(정규화 = 소문자화+구두점 제거+공백 분할).
- **M7b 의미 반복 — 수동 판정 칸 (이 판의 핵심)**: 자동 탐지기를 새로 만들지 않는다. TSV에 빈 열 `M7b_verdict`(`YES`/`NO`/`UNCLEAR`)와 `M7b_evidence`(근거 문장쌍)를 만들고, **2턴 이후 각 답변이 이전 답변과 같은 차트 근거·성격 설명·행동 조언을 새 표현으로 반복했는지** 채우게 한다. farr02는 **열만 만들고 비워 둔다** — 판정은 본부·조언자가 화자 정보를 가린 상태로 **독립 2인** 수행한다.

## §4 고정 6턴 (한 글자도 바꾸지 말 것)

모드 `person`. ME: 1993-07-14 08:30(이름 없음) / THEM: 1990-11-23 21:00 · **Riley**(EN) / **한결**(KO).

| # | EN | KO |
|---|---|---|
| 1 | I want to ask Riley to work on a project with me. How should I bring it up? | 한결이한테 같이 프로젝트 하자고 제안하려는데 어떻게 꺼내는 게 좋을까? |
| 2 | I brought it up yesterday and they just said they'd think about it. | 어제 얘기 꺼냈더니 생각해보겠다고만 했어. |
| 3 | Should I ask again? When would be a good day? | 다시 물어봐도 될까? 언제가 좋을까? |
| 4 | No reply today. | 오늘은 답이 없었어. |
| 5 | Why are they being so lukewarm about this? | 얘는 왜 이렇게 미지근한 걸까? |
| 6 | Write me two messages I could send. | 그럼 보낼 만한 메시지 두 개만 써줘. |

턴 3은 타이밍, 턴 6은 완성 요청을 의도적으로 건드린다 — **shape가 달라지는 것이 정상**이다.

## §5 완료 기준

- `npx tsc --noEmit` 오류 0
- **lint (v1.2 확정)**: 이 저장소는 기준 커밋 `9054808`에서 이미 lint가 실패한다. **청정 클론 확정 실측 = 39 problems = 24 errors + 15 warnings, exit 1** 〔본부 실측: 신규 clone·`git status --porcelain` 공란·node v22.22.2·npm 10.9.7·`npm ci`·eslint v9.39.4·`npm run lint`〕. 따라서 "lint 0"은 조건이 아니다.
  - **조건 ⑴** 작업 후 전체가 **24 errors / 15 warnings를 넘지 않을 것**(신규 0).
  - **조건 ⑵** 신규 파일 `scripts/verify/voice-baseline.mjs` **단독 lint 오류 0**(경고도 0을 목표로 할 것 — `scripts/verify/prompt-assembly.mjs`가 0E 2W인 전례를 따르지 말 것).
  - **조건 ⑶** 측정은 **`git status --porcelain`에 커밋 대상 외 파일이 없는 상태**에서 실행하고, 그 출력과 lint 전문을 보고서에 첨부한다. 작업용 스크래치 파일을 저장소 루트에 두지 말 것 — **직전 30/32 숫자 불일치의 원인이 정확히 이것이었다.**
  - 참고(기지 사항): `src/app/page.test.tsx:3:27 'screen' is defined but never used`(warning)은 **BRIEF-102B가 만든 유일한 신규 lint 문제**로, erratum 기록 후 `src/`를 만지는 다음 판에서 정리한다. 104A는 `src/` 무접촉이므로 **baseline에 포함된 채로 둔다.**
- `npx vitest run` **910 = 906 passed + 4 expected fail 무변동**(변했으면 중단·보고)
- `node scripts/verify/voice-baseline.mjs --selftest` → `ALL PASS`
- **`git diff main --stat`에 `src/` 경로가 하나도 없을 것** — 명령 출력을 보고서에 그대로 첨부
- 기본 24콜 완료 + **실제 교정 호출 수 명기**(429로 중단 시 몇 콜까지인지) + 결과 JSON 4개 + metrics TSV 커밋
- 보고서 `docs/reports/BRIEF-104A.md`: 모델명 실측값 · `generationConfig` · `LLM_PROVIDER` · 실행 시각 · 사용한 호출 간격과 그 근거(확인한 RPM/RPD 또는 4초 기본값) · **지표 요약표를 `first-pass 준수율`과 `사용자 노출 최종 출력` 두 층으로 분리** · 런 간 변동폭 · 커밋 해시 3종 · 보관본 sha256·바이트 대조 결과
- 채팅 보고: 두 층 요약표 + **M3 턴1 대비 턴4·5·6 비율** + **M7 중복쌍 수** + **교정 발생 턴 수**를 숫자로

## §6 금지사항

- **`src/` 전부 무접촉.** 개선점을 발견해도 고치지 말고 보고서 '특이사항'에만 적는다.
- `package.json`·`package-lock.json` 수정 금지(새 의존성 금지 — Node 내장 + 기존 devDeps만).
- API 키 출력 금지. `.env.local` 커밋 금지. 시스템 프롬프트 원문 저장 금지.
- 6턴 문장·생년 데이터·인물 이름 변경 금지.
- **M7b 판정 칸을 farr02가 채우지 말 것**(열만 생성, 값은 공란).
- main 직접 push·force push·병합 금지.

## §7 근거 (기준 `9054808` 실측)

`buildAskSystem`(route.ts:474) / `buildAskTurns`(:725) / `validateAskAnswer`(:835) / `buildCorrectionWarnings`(:1070) / `hasTodayIntroduced`(:118) / `hasPersonIntroduced`(:168) / `tryParse`(:1161) / `AskViolationType` 9종(:811) / `BANNED`(:19) / `LLM_PROVIDER`(llm.ts:136). VERIFY-KIT 규약·`server-only` 패치 = `scripts/verify/README.md` §2. 호출 미러링 선례 = `scripts/sample.ts`.

**본부 사전 실행 확인**: `server-only` 패치 후 `buildAskSystem` 호출 성공(person 프롬프트 **20,233자**) / `getDailyPillars`는 **문자열 날짜**를 받는다(`Date` 객체를 넘기면 `startDate.split is not a function`) / `detectAskMode('Write me two messages I could send.') === 'completion'`, 턴 3은 `null` / **lint 청정 클론 실측: `e67228f` = 38 (24E/14W) → `9054808` = 39 (24E/15W), delta = errors +0 · warnings +1**(상세 = `LINT-BASELINE-9054808.md`).
