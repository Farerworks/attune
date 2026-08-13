# BRIEF-106 — 교차언어 답변 탐지·처분

## 1. 배경

`route.ts:623`(PERSON_RULES 9)·`:654`(일반/나 모드 7)는 "질문의 언어를 감지해 모든 자유
텍스트를 그 언어로 쓰고 절대 섞지 말 것"이라고 프롬프트에 못 박아 두었지만, 이를 실제로
검증하는 코드는 없었다. 본부가 기록된 음성 기준선 8개 파일·48턴·firstPass/finalPass 96행을
전수 조사한 결과, 답 전체가 반대 언어인 사례(비율 1.000)와 답 일부에 반대 언어가 섞인 사례
(최대 비율 0.202)가 확인됐고, 그 사이 구간은 완전히 비어 있었다. 이 판은 그 둘을
`response_language_drift`(전체 반대 언어 — 하드 실패)와 `foreign_language_leak`(일부 혼입 —
교정 시도 후 soft flag)로 나누어 탐지·처분하는 결정적 검증기를 추가한다.

## 2. `expectedLang`/`nameAllowlist` — ctx 필드 + POST 계산

`AskValidationCtx`에 105의 `dailyPillarLookup`/`todayDate`와 같은 패턴으로 선택 필드 2개를
추가했다(`route.ts:824-833`).

```ts
expectedLang?: 'ko' | 'en';
nameAllowlist?: string[];
```

`expectedLang`은 `POST` 안에서 계산한다(검증기는 `history`를 모르므로). 최신 질문의 한글
음절 수 vs 라틴 문자 수를 비교해 판정하고, 둘 다 0이거나 같으면(예: "ㅇㅋ", "?", 이모지만
있는 입력) **새로 판정하지 않고** `history`의 `role === 'user'` 메시지를 최신순으로 거슬러
올라가며 같은 규칙을 적용해 처음 판정되는 값을 승계한다. 끝까지 판정 못 하면
`undefined`로 두어 검증기가 언어 검사를 통째로 건너뛴다(105의 `dailyPillarLookup` 부재와
동일한 fail-open). 함수 `detectExpectedLang`은 테스트를 위해 export했다(`route.ts`).

`nameAllowlist`는 `[내 이름, 상대 이름] 중 비어 있지 않은 것 + ['Attune', 'Google',
'Gemini']`로 POST가 구성한다(`route.ts:1782-1791`). `ctx.candidates`(간지·아키타입 명칭)는
의도적으로 제외했다 — "Earth Dragon"이 §0 실측에서 잡아야 했던 혼입 그 자체이기 때문이다.

## 3. 탐지 로직 — `checkAnswerLanguage`

`route.ts:1077-1098`. 검사 대상 문자열은 `collectAnswerTextWithTiming(answer)`
(`text`·`parts[].text`·`followUp`·`timing`) — `JSON.stringify(answer)`를 쓰지 않는다. 파트
라벨("LIKELY RECEPTION" 등)과 JSON 키는 계약상 항상 영어라서 그걸 세면 모든 한국어 답이
위반으로 잡히기 때문이다.

계산: `nameAllowlist`의 각 항목을 전부 공백으로 치환해 제거 → `ko` = `[가-힣]` 개수, `la` =
`[A-Za-z]` 개수, `total = ko + la`(한자·숫자·기호는 애초에 세지 않음) → `off` =
`expectedLang==='en'`이면 `ko`, `'ko'`이면 `la` → `ratio = off/total`.

| 조건 | 결과 |
|---|---|
| `total === 0` | 위반 없음 |
| `ratio >= 0.5` | `response_language_drift` |
| `off > 0` | `foreign_language_leak` |
| 그 외 | 위반 없음 |

문턱 0.5는 §0 실측의 빈 구간(혼입 최대 0.202, 전환 최소 1.000) 한가운데다. `detail`에
`${expectedLang}|${ko}|${la}|${ratio.toFixed(3)}`를 담는다. `validateAskAnswer` 안,
date-pillar 검사 바로 뒤에 연결했다(`route.ts:1219`).

## 4. 처분

- **교정 경고**(`buildCorrectionWarnings`, `route.ts:1420` 이하) — 언어 경고를 배열 **맨
  앞**에 넣도록 함수를 재구성했다(`schemaInvalid`/`banned` push보다 먼저). drift/leak 각각
  전용 경고 문구.
- **`stageOf`**(`route.ts`) — 두 유형 모두 `'lang'`.
- **drift 하드 실패** — `errorResponse`의 `code` 유니온에 `'language'`를 추가했다. POST의
  두 지점 모두에서 502:
  - ⓐ 교정 1회 후에도 drift가 남으면, `banned` 하드 실패 직후(`route.ts` 재검증 지점)
  - ⓑ 예산이 이미 소진돼 교정을 못 한 경우, `banned` 하드 실패 직후 — `applyFinalDisposition`으로
    내려보내지 않는다.
- **leak — soft flag** — 교정 1회 시도 후 남으면 답은 그대로 내보내고
  `applyFinalDisposition`에 `{ stage: 'lang', action: 'soft' }` 플래그만 추가한다. 답
  문자열은 기계로 고치지 않는다.
- **로그** — `logAsk`로 `stage='lang'`, `action`은 `'regen'`(첫 위반 시 기존 루프가 자동
  처리)/`'fail'`(502)/`'soft'`(혼입 잔존, `applyFinalDisposition`의 플래그로 기록).
- `validateAskAnswer`는 firstPass·finalPass 두 지점 모두에서 이미 호출되므로, 언어 검사를
  그 안에 넣는 것만으로 양쪽에 자동 적용된다. 별도 호출 경로를 만들지 않았다.

## 5. 하네스 정합 (`scripts/verify/voice-baseline.mjs`)

`runOneTurn`의 ctx에 `expectedLang: detectExpectedLang(question, history)`,
`nameAllowlist: [themName, 'Attune', 'Google', 'Gemini']`을 추가했다(`meName` 상당 픽스처가
하네스에 없어 그만큼 짧다). `applyFinalDispositionMirror`/`buildCorrectionWarningsMirror`도
`foreign_language_leak`(soft flag) + 두 언어 유형의 경고 문구(맨 앞 삽입)로 확장했고,
`runOneTurn`의 두 하드 실패 지점에 `HardFail('language', …)`를 추가해 프로덕션의 ⓐ/ⓑ와
동일한 자리에서 멈추도록 했다. 사유는 `scripts/verify/README.md`의 "Erratum (BRIEF-106)"
절에 기록했다.

## 6. 회귀 검사 — `scripts/verify/lang-regression.mjs`

API 호출 0건. `checkAnswerLanguage`/`collectAnswerTextWithTiming`의 순수 JS 미러를 만들어
(route.ts를 import하지 않으므로 `npx tsx` 없이 순수 `node`로 실행 가능) 기존
`samples/voice-baseline/*.json` 8개·96행에 적용했다. 실제 출력:

```
file                                          turn  pass       ko   la   ratio  verdict
gemini-3.5-flash-lite-20260811-EN-run1.json   3     firstPass  70   410  0.146  leak
gemini-3.5-flash-lite-20260811-EN-run1.json   3     finalPass  70   410  0.146  leak
gemini-3.5-flash-lite-20260811-EN-run2.json   2     firstPass  22   195  0.101  leak
gemini-3.5-flash-lite-20260811-EN-run2.json   2     finalPass  22   195  0.101  leak
gemini-3.5-flash-lite-20260812-EN-run2.json   4     firstPass  131  0    1.000  drift
gemini-3.5-flash-lite-20260812-EN-run2.json   4     finalPass  131  0    1.000  drift
gemini-3.5-flash-lite-20260812-EN-run2.json   5     firstPass  272  0    1.000  drift
gemini-3.5-flash-lite-20260812-EN-run2.json   5     finalPass  272  0    1.000  drift
gemini-3.5-flash-lite-20260812-EN-run2.json   6     firstPass  45   0    1.000  drift
gemini-3.5-flash-lite-20260812-EN-run2.json   6     finalPass  45   0    1.000  drift
gemini-3.5-flash-lite-20260812-KO-run1.json   3     firstPass  166  42   0.202  leak
gemini-3.5-flash-lite-20260812-KO-run1.json   3     finalPass  174  30   0.147  leak

합계: 96행 중 12행 위반(drift 6 · leak 6), 나머지 84행 위반 0.
[PASS] §6 기대표와 완전 일치, 오탐 0.
```

§6 기대표와 완전 일치, 오탐(84행 중 위반으로 잡힌 것) 0건. 결과는
`samples/voice-baseline/lang-regression.tsv`에 저장했다. 기존
`samples/voice-baseline/*.json` 8개는 이 스크립트가 읽기만 하며 수정하지 않는다(§9 참조).

## 7. 단위 테스트 (8건, `src/app/api/ask/route.test.ts`)

`describe('교차언어 답변 탐지·처분 (BRIEF-106)', ...)` 아래 §7이 지정한 8건을 그대로
구현했다: drift 1건, leak 1건("Earth Dragon" 혼입), 라벨 오탐 없음, `nameAllowlist` 동작,
`expectedLang` 미전달 시 fail-open, 한자만 섞인 경우 위반 0, 판정 승계("ㅇㅋ" → 직전
한국어 메시지 승계), `buildCorrectionWarnings`의 언어 경고 index 0.

## 8. 특이사항 — 기존 테스트 6건의 픽스처 수정

`expectedLang`/`nameAllowlist`를 POST ctx에 실제로 연결하자, 언어와 무관한 목적으로
작성된 기존 테스트 6건이 실패했다. 원인은 하나같이 동일했다: 목(mock) 응답 텍스트가 질문
언어와 무관하게 범용 영어 placeholder("A short specific read.", `text:'x'` 등)였는데, 이제는
그 답이 실제로 검사 대상이 되면서 (예: 한국어 질문 + 영어 placeholder 답) 관련 없는 이유로
새 언어 위반이 잡힌 것이다. 실제 모델은 프롬프트 규칙을 지켜 항상 질문과 같은 언어로
답하므로, 이는 감지기의 오류가 아니라 픽스처가 애초에 비현실적이었던 것을 이번에 처음으로
드러낸 것이다.

수정은 전부 픽스처(mock 데이터)에만 가했고, 어떤 테스트의 검증 대상(라벨 세트·재소개·
script contract 등)도 바꾸지 않았다:

- `understandCard`에 `lang` 옵션을 추가해 비후보 자리 필러 텍스트를 한국어/영어로 선택 가능하게 함.
- `mixedLabelCard`의 `'x'/'y'/'z'`를 `'1'/'2'/'3'`(숫자)로 교체 — 숫자는 언어 감지기가
  애초에 세지 않으므로 어느 질문 언어와도 중립.
- ①/⑤c(재소개) 테스트: 한국어 질문에 맞춰 두 번째 목 응답에 `lang: 'ko'` 지정.
- ③(strict_script) 테스트: 두 번째 목 응답을 영어 2줄에서 한국어 2줄로 교체 + 기대값 갱신.
- completion 파이프라인 테스트: `card`의 `text:'x'` → `'1'`.
- safetyAck 스킵 테스트: 목 응답/기댓값을 영어 → 한국어(질문과 동일 언어)로 교체.

## 9. 완료 기준 자가점검

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| lint (청정 상태) | 39 (24E/15W), 신규 0 |
| `npx vitest run` | **923 = 915(기존) + 8(신규) passed + 4 expected fail (927)** |
| `node scripts/verify/voice-baseline.mjs --selftest` | ALL PASS |
| `node scripts/verify/lang-regression.mjs` | §6 표와 완전 일치, 오탐 0 |
| `npm run build` | 성공 |
| `git diff origin/main --name-only` | 8개 이내 (아래 커밋 목록 참조) |
| 기존 `samples/voice-baseline/*.json` 8개 | 수정 없음 (읽기 전용) |

## 10. 근거 (줄 번호는 `BASE_SHA=9312c62c887314a47799ea72dbb141aa5d3dda88` 기준)

- 언어 규칙 원문: `route.ts:623`(PERSON_RULES 9), `:654`(일반/나 모드 7)
- ctx 선택 필드: `route.ts:824-833`
- 탐지 함수: `route.ts:1077-1098` `checkAnswerLanguage`
- 검증기 연결: `route.ts:1219`
- POST의 expectedLang/nameAllowlist 계산: `route.ts:1782-1791`
- 하드 실패 ⓐ/ⓑ, `errorResponse` code 유니온: POST 핸들러 내 두 지점 + `errorResponse` 시그니처

## §FIX (BRIEF-106-FIX) — 교차언어 **요청**에서의 오탐 제거

### 배경

BRIEF-106 §2는 "예상 언어 = 질문의 언어"로 정했는데, **사용자가 다른 언어로 된 결과물을
요구하는 경우**를 빠뜨렸다. "라일리한테 보낼 영어 메시지 두 개 써줘"처럼 한국어 질문으로
영어 결과물을 요구하면, 모델이 정확히 요구대로(영어로) 답했는데도 `response_language_drift`
로 잡혀 502가 났다. 재시도해도 같은 결과라 막다른 길이었다. 탐지 함수·문턱 0.5·leak 처분·
회귀 스크립트는 전혀 건드리지 않고, 두 가지만 바꿨다.

### §1 — 명시적 언어 지시가 있으면 검사를 건너뛴다

`EXPLICIT_LANGUAGE_PATTERNS`(5개, `route.ts`) + `hasExplicitLanguageRequest(question)`을
신설해 export했다. 매칭되면 POST가 `expectedLang`을 **어느 언어인지 추론하지 않고**
`undefined`로 둬 언어 검사 자체를 건너뛴다(105의 `dailyPillarLookup` 부재와 동일한
fail-open). 언어명 또는 언어 방향 표지가 확인된 범위 안에서만 매칭하며, 언어명 없는
`번역`/`translate` 단독 패턴은 넣지 않았다 — Attune에서 "그 사람의 침묵을 번역해줘" 같은
문장은 행동·침묵을 해석해 달라는 비유이지 언어 번역 요청이 아니기 때문이다. 패턴 ⑤ 끝에는
`\b`를 붙이지 않았다(`VERDICT_PROBE_PATTERNS`가 이미 겪은 함정 — JS의 `\b`는 ASCII 기준이라
한글 뒤에서 성립하지 않는다).

**본부 실행 검증 결과 재현**: 참이어야 하는 21개 전건 매칭, 거짓이어야 하는 22개 전건
무매칭, 기록된 8파일의 고유 질문 12개 전건 무매칭 — 전부 본부가 미리 계산한 표와 일치했다.

### §2 — 보낼 글 모드에서는 drift도 soft flag

`ctx.askMode`가 `'strict_script'` 또는 `'completion'`이면(`sendMode`), `response_language_
drift`가 있어도 502를 내지 않는다. 그 답은 제3자에게 보낼 내용물이라 서버가 그 사람의
언어를 알 수 없고, 틀리면 사용자 눈에 보이므로 다시 물으면 된다. 두 하드 실패 지점(예산
소진 경로/교정 후 경로) 모두에 `!sendMode &&` 조건을 추가했고, `applyFinalDisposition`에는
`response_language_drift`도 `foreign_language_leak`과 함께 soft flag를 받도록 했다(답
문자열은 여전히 손대지 않음). 위반 **유형 자체는 바꾸지 않았다** — 보낼 글 모드에서도
탐지 결과는 `response_language_drift` 그대로다.

### §3 — 회귀 12행 무변동

`scripts/verify/lang-regression.mjs`는 파일명으로 `expectedLang`을 정하고 탐지 함수만
호출하며 `hasExplicitLanguageRequest`를 전혀 부르지 않는다. 스크립트를 수정하지 않고
재실행한 결과, §6과 동일하게 **96행 중 12행(drift 6·leak 6), 나머지 84행 위반 0**이었다.
다만 이 결과가 §1의 정당성을 증명하지는 않는다 — 회귀는 §1을 아예 지나가지 않으므로,
§1·§2의 검증은 전적으로 아래 §4 통합 테스트에 달려 있다.

### §4 — 신규 테스트 10건

`describe('교차언어 요청에서의 오탐 제거 (BRIEF-106-FIX)', ...)`:

- 패턴 단위 3건 — 참 21개 전건 매칭, 거짓 22개 전건 무매칭, 코퍼스 고유 질문 12개 매칭 0건.
- 502 분기 4조합(A~D) — 예산 소진/교정 후 × 보낼 글 모드/일반 대화, 실제 POST로 각각 통과.
  A·B(보낼 글 모드)는 200 + 답 원문 유지 + 로그에 `stage=lang action=soft`. C·D(일반 대화)는
  502 + `code:'language'` + 로그에 `stage=lang action=fail`.
- 통합 시나리오 E("라일리한테 보낼 영어 메시지 두 개 써줘", 브리프 원문 그대로)·F(영어 대화 중
  "Write it in Korean") — 둘 다 6개 항목(선행 확인·expectedLang undefined·200·모델 호출
  정확히 1회·교정 경고 없음·답 문자열 완전 동일) 전부 확인.
- G — 보낼 글 모드에서도 `validateAskAnswer`가 `response_language_drift` 유형을 그대로
  내는지(유형 무변경) 확인.

### 한계 (그대로 기록)

> 명시적 언어 지시가 있는 요청에서는 사용자가 요구한 언어를 서버가 추론하지 않으므로,
> **요청 언어를 실제로 지켰는지 서버가 검증하지 않는다.** 이번 FIX의 목적은 정당한
> 교차언어 결과물 요청이 502로 차단되거나 잘못된 교정을 받는 것을 막는 데 한정한다. 요청
> 언어 준수 검증은 이 판의 범위가 아니다.
>
> 또한 `EXPLICIT_LANGUAGE_PATTERNS`는 **언어명 또는 언어 방향 표지가 확인된 범위 안에서만**
> 넉넉하게 매칭한다. 표지 없는 `번역`·`translate`는 관계·행동 해석의 비유일 수 있어
> 제외했다 — 검사 생략은 곧 언어 전환 결함의 fail-open이므로 이 게이트를 무제한으로 넓히지
> 않는다. **언어명 없이 상대의 언어를 암시하는 요청(「라일리는 영어권이니까 그 스타일로」)은
> 이 게이트에 걸리지 않는다**(알려진 잔여 구멍, 보낼 글 모드에서는 §2의 soft 처분이
> 받는다). 이 게이트로 검사가 생략되는 턴의 실제 비율은 **프로덕션 로그로만 알 수 있다** —
> 필요해지면 별도 판에서 계측한다.

### 완료 기준 자가점검

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| lint (청정 상태) | 39 (24E/15W), 신규 0 |
| `npx vitest run` | **933 = 923(기존, BRIEF-106까지) + 10(신규) passed + 4 expected fail (937)** |
| `node scripts/verify/lang-regression.mjs` | §6과 동일 12행, `[PASS]`, 무변동 |
| `node scripts/verify/voice-baseline.mjs --selftest` | ALL PASS |
| `npm run build` | 성공 |
| 변경 파일 | 정확히 4개: `docs/briefs/BRIEF-106-FIX.md`(신규) · `docs/reports/BRIEF-106.md`(본 절 append) · `src/app/api/ask/route.ts` · `src/app/api/ask/route.test.ts` |

### 근거 (줄 번호는 `a4dc511` 기준)

- 예상 언어 계산: `route.ts` `detectExpectedLang(question, history)` 호출부(POST)
- 명시적 언어 요청 게이트: `EXPLICIT_LANGUAGE_PATTERNS`/`hasExplicitLanguageRequest`
- 502 분기 ⓑ 예산 소진 / ⓐ 교정 후: POST 핸들러 내 두 지점, `sendMode` 변수로 공유
- `\b` 함정 선례: `VERDICT_PROBE_PATTERNS` 주석
- 보낼 글 모드 판정 패턴: `STRICT_SCRIPT_PATTERNS`(「메시지 두 개」 포함), `COMPLETION_PATTERNS`(「메시지 좀 써줘」 포함)
