# BRIEF-106 — 교차언어 답변 탐지·처분

## §0 맥락 (이 문서가 요구사항의 전부다)

- 대상: **Attune** — 폴더 `~/projects/attune`, 저장소 `github.com/Farerworks/attune`.
- **기준 커밋 `BASE_SHA` = `9312c62c887314a47799ea72dbb141aa5d3dda88`**(104B-PRE 병합 완료본). 작업 시작 시:

  ```bash
  git fetch origin
  BASE_SHA=9312c62c887314a47799ea72dbb141aa5d3dda88
  git checkout main && git pull --ff-only
  test "$(git rev-parse HEAD)"              = "$BASE_SHA" || { echo "STOP: HEAD 불일치"; exit 1; }
  test "$(git rev-parse origin/main)"       = "$BASE_SHA" || { echo "STOP: origin/main 불일치"; exit 1; }
  test "$(git merge-base HEAD origin/main)" = "$BASE_SHA" || { echo "STOP: merge-base 불일치"; exit 1; }
  echo "BASE_SHA 3중 일치 확인"
  ```
- **전용 브랜치 `feat/106-language`.** main 직접 push·force push·rebase·병합 금지.
- 기준 테스트 **919 = 915 passed + 4 expected fail**. 이 판은 **테스트를 추가하므로 수가 늘어난다** — 늘어난 수를 보고할 것(기존 915건이 깨지면 중단·보고).
- lint baseline **39 (24E/15W)** — 신규 0.

### 무엇이 문제인가 (실측)

프롬프트 규칙은 **「질문의 언어를 감지해 모든 자유 텍스트를 그 언어로 쓰고 절대 섞지 말 것」**이라고 못 박혀 있다(`route.ts:623` PERSON_RULES 9, `:654` 일반/나 모드 7). **그런데 탐지기가 없다.**

본부가 기록된 음성 기준선 **8개 파일 · 48턴 · firstPass/finalPass 96행**을 전수 조사한 실측:

| 파일 | 턴 | 한글자수 | 라틴자수 | 반대언어비율 | 유형 |
|---|---|---|---|---|---|
| 20260812-EN-run2 | T4 | 131 | **0** | **1.000** | 답 전체가 한국어 |
| 20260812-EN-run2 | T5 | 272 | **0** | **1.000** | 답 전체가 한국어 |
| 20260812-EN-run2 | T6 | 45 | **0** | **1.000** | 답 전체가 한국어 |
| 20260811-EN-run1 | T3 | 70 | 410 | 0.146 | 영어 답에 한국어 문장 혼입 |
| 20260811-EN-run2 | T2 | 22 | 195 | 0.101 | followUp만 한국어 |
| 20260812-KO-run1 | T3 | 166 | 42 | 0.202 | 한국어 답에 「Earth Dragon」 혼입 |

(위 6턴은 firstPass·finalPass 양쪽 동일 → **96행 중 12행**. 나머지 **84행은 비율 0.000**.)

**두 가지 사실이 중요하다.**

1. **혼입은 이번에 생긴 게 아니다.** 08-11 기준선(105 이전)에도 있었다. **105가 원인이 아니다** — 이 대조로 원인 규명은 끝났고, 표본을 더 뽑을 필요가 없다.
2. **심각도가 두 갈래로 완전히 갈린다.** 최대 혼입 **0.202** ↔ 최소 전환 **1.000**. **그 사이가 통째로 비어 있다.** 그래서 두 유형을 나눠 다르게 처분할 수 있다.

---

## §1 결함 두 유형

| 유형 | 정의 | 왜 다르게 다루나 |
|---|---|---|
| **`response_language_drift`** | 답 전체가 예상 언어의 **반대 언어**로 쓰임 | 그 사용자에게 **앱이 고장난 것**이다. 못 쓴다 |
| **`foreign_language_leak`** | 예상 언어는 맞는데 **일부에 반대 언어가 섞임** | 흠은 있지만 **읽을 수는 있다**. 기계로 지우면 문장이 깨진다 |

---

## §2 예상 언어 판정 — `expectedLang`

**105가 `dailyPillarLookup`·`todayDate`를 추가한 방식을 그대로 따른다**(`route.ts:824–833`의 `AskValidationCtx`에 **선택 필드**로 추가 → 기존 호출부·테스트 리터럴 무변경, 없으면 검사 건너뜀).

`AskValidationCtx`에 **선택 필드 2개**를 추가한다.

```
expectedLang?: 'ko' | 'en';
nameAllowlist?: string[];
```

**`expectedLang` 계산은 `POST` 안에서 한다**(검증기 안이 아니다 — 검증기는 history를 모른다).

1. **최신 질문**(`question`)에서 한글 음절 `[가-힣]` 수와 라틴 문자 `[A-Za-z]` 수를 센다.
2. 한글 > 라틴 → `'ko'` / 라틴 > 한글 → `'en'`.
3. **둘 다 0이거나 같으면 판정 불가** → `history`의 **`role === 'user'` 메시지를 최신순으로 거슬러 올라가며** 같은 규칙을 적용, **처음 판정되는 것을 승계**한다.
4. 끝까지 판정 못 하면 **`undefined`로 둔다** → 검증기가 언어 검사를 **통째로 건너뛴다**(105의 `if (ctx.dailyPillarLookup)` 가드와 같은 fail-open).

**⚠ 3번이 이 판의 핵심이다.** 「ㅇㅋ」·「?」·「Riley」·이모지만 있는 입력에서 **새로 판정하면 안 된다.** 짧은 입력에 언어를 새로 매기면 멀쩡한 답이 위반으로 잡힌다.

**`nameAllowlist`** = `POST`가 채운다. **`[내 이름, 상대 이름]` 중 비어 있지 않은 것 + `['Attune', 'Google', 'Gemini']`.**

**⚠ `ctx.candidates`(간지·아키타입 명칭)를 여기에 넣지 말 것.** 「Earth Dragon」이 바로 우리가 잡아야 할 혼입이다. 넣으면 §0 표의 마지막 행이 안 잡힌다.

---

## §3 탐지 범위와 계산

**검사 대상 문자열** = `collectAnswerTextWithTiming(answer)`(`route.ts:229`) — `text` · `parts[].text` · `followUp` · `timing`.

**⚠ `JSON.stringify(answer)`를 쓰지 말 것.** 파트 라벨은 **계약상 영어 대문자**이고 JSON 키도 영어다. 그걸 세면 **모든 한국어 답이 위반으로 잡힌다.**

계산 순서:

1. 위 문자열들을 공백으로 이어 붙인다.
2. `nameAllowlist`의 각 항목을 **전부 공백으로 치환**해 제거한다.
3. `ko` = `[가-힣]` 개수, `la` = `[A-Za-z]` 개수, `total = ko + la`.
   - 한자(水·壬 등)·숫자·기호는 **애초에 세지 않는다** — 한국어 문장의 간지 한자는 자동으로 무해해진다.
4. `off` = `expectedLang === 'en'` 이면 `ko`, `'ko'` 이면 `la`.

판정:

| 조건 | 결과 |
|---|---|
| `total === 0` | 위반 없음 |
| `off / total >= 0.5` | **`response_language_drift`** |
| `off > 0` | **`foreign_language_leak`** |
| 그 외 | 위반 없음 |

`detail`에 `` `${expectedLang}|${ko}|${la}|${ratio.toFixed(3)}` ``를 담는다(보고·로그용).

**문턱 0.5의 근거는 §0 실측이다** — 혼입 최대 0.202, 전환 최소 1.000. 0.5는 빈 구간 한가운데다.

---

## §4 처분

### 4.1 교정 경고

`buildCorrectionWarnings`(`route.ts:1368`)에 두 유형을 추가한다. **⚠ 언어 경고는 `warnings` 배열의 맨 앞에 오게 한다** — 다른 경고에 묻히면 안 된다. (`schemaInvalid`·`banned` push보다 먼저 넣는다.)

- drift: `⚠ LANGUAGE VIOLATION — The user wrote in {EXPECTED}, but your answer is in the other language. Rewrite the ENTIRE answer in {EXPECTED}. JSON keys and part labels stay in English.`
- leak: `⚠ LANGUAGE MIXING — Your answer is in {EXPECTED} but contains words from another language. Rewrite those parts in {EXPECTED}. JSON keys and part labels stay in English.`

`stageOf`(`route.ts:1346`)에 두 유형 → `'lang'` 추가.

### 4.2 drift — **하드 실패**

`errorResponse`의 `code` 유니온에 **`'language'`를 추가**하고(`route.ts:1555`), drift가 남으면 **`errorResponse('language', 502)`**.

**이건 새 구조가 아니다.** `banned`가 이미 똑같이 동작한다 — 교정 후에도 걸리면 답을 통째로 버린다(`route.ts:1758`, `:1801`). drift를 같은 자리에 넣는 것뿐이다.

**두 경로 모두에서 502다:**

- ⓐ 교정 1회 후에도 drift → `:1801` 부근 `banned` 하드 실패 **직후**에 같은 모양으로.
- ⓑ **예산이 이미 소진돼 교정을 못 한 경우**(`usedExtraCall === true`, `route.ts:1755–1762`) → `banned` 하드 실패 **직후**에 같은 모양으로. **`applyFinalDisposition`으로 내려보내지 말 것.**

교차언어 답은 **교정을 시도했는지와 무관하게 못 쓰는 물건**이다.

부수 효과 하나를 알아둘 것: 502면 그 답이 **대화 기록에 안 남는다.** §0 실측에서 T4에 넘어간 뒤 **T5·T6까지 안 돌아온 이유**가 한국어 답이 history에 쌓여서다. 버리면 그 연쇄가 끊긴다.

### 4.3 leak — 교정 1회 후 **soft flag**

교정을 1회 시도하고, 그 후에도 남으면 **답은 그대로 내보낸다.** `applyFinalDisposition`(`route.ts:1265`)에 **플래그만** 추가(`{ stage: 'lang', action: 'soft' }`). **답 문자열을 기계로 고치지 말 것** — 외국어 단어를 지우면 문장이 깨진다.

### 4.4 로그

`logAsk`로 `stage='lang'`, `action`은 `'regen'`(교정 시도) / `'fail'`(502) / `'soft'`(혼입 잔존)를 남긴다. **프로덕션에서 실제 발생률을 세기 위한 것이다** — 하네스를 더 돌려 n=2 표본을 늘리는 것보다 이게 정확하다.

### 4.5 firstPass·finalPass 양쪽

`validateAskAnswer`는 **두 지점 모두에서 이미 호출된다**(`route.ts:1752`, `:1803`). 언어 검사를 `validateAskAnswer` **안에** 넣으면 양쪽이 자동으로 걸린다. **별도 호출 경로를 만들지 말 것.**

---

## §5 하네스 정합 (필수)

`scripts/verify/voice-baseline.mjs`의 ctx(`:980–984`)에 **`expectedLang`·`nameAllowlist`를 §2와 같은 규칙으로 채운다.** 안 채우면 하네스가 **언어 검사를 건너뛰어 프로덕션과 다른 파이프라인을 재게 된다**(104B-PRE에서 이미 같은 일이 있었다 — 그 파일 `:976–979` 주석 참조).

`scripts/verify/README.md`에 사유를 추가한다. **그 외 하네스 로직·픽스처·호출 예산·지표 함수는 손대지 말 것.**

---

## §6 회귀 검사 — **이게 게이트다 (API 호출 0)**

`scripts/verify/lang-regression.mjs`를 신설한다. **모델을 부르지 않는다.** 이미 기록된 `samples/voice-baseline/*.json` **8파일 · 48턴 · firstPass/finalPass 96행**의 `parsed` 객체에 새 탐지기를 그대로 적용해 결과를 낸다.

- 파일명 `*-EN-*` → `expectedLang='en'`, `*-KO-*` → `'ko'`.
- `nameAllowlist` = `['Riley', '한결', 'Attune', 'Google', 'Gemini']`(하네스 픽스처 `THEM_NAME`, `:920`).

**기대 출력 — 본부가 같은 사양으로 미리 돌려본 정답이다. 한 칸이라도 다르면 탐지기가 사양과 다른 것이니 중단·보고.**

| 파일 | 턴 | 패스 | ko | la | ratio | 판정 |
|---|---|---|---|---|---|---|
| 20260811-EN-run1 | T3 | first/final | 70 | 410 | 0.146 | leak |
| 20260811-EN-run2 | T2 | first/final | 22 | 195 | 0.101 | leak |
| 20260812-EN-run2 | T4 | first/final | 131 | 0 | 1.000 | **drift** |
| 20260812-EN-run2 | T5 | first/final | 272 | 0 | 1.000 | **drift** |
| 20260812-EN-run2 | T6 | first/final | 45 | 0 | 1.000 | **drift** |
| 20260812-KO-run1 | T3 | firstPass | 166 | 42 | 0.202 | leak |
| 20260812-KO-run1 | T3 | finalPass | 174 | 30 | 0.147 | leak |

**합계: 96행 중 12행 위반(drift 6 · leak 6), 나머지 84행 위반 0.**

**⚠ 오탐 0이 완료 기준이다.** 84행 중 하나라도 위반으로 잡히면 실패다. drift는 하드 실패라 **오탐 1건이 곧 사용자에게는 장애**다.

결과를 `samples/voice-baseline/lang-regression.tsv`로 저장하고 커밋한다.

---

## §7 단위 테스트

`src/app/api/ask/route.test.ts`에 추가(기존 915건 무손상):

1. `expectedLang='en'` + 답이 전부 한국어 → `response_language_drift` 1건
2. `expectedLang='ko'` + 답이 한국어인데 「Earth Dragon」 포함 → `foreign_language_leak` 1건
3. `expectedLang='ko'` + 답 전부 한국어(파트 라벨 영어 대문자 포함) → **위반 0** (라벨이 오탐을 안 만드는지)
4. `expectedLang='en'` + 답 전부 영어인데 상대 이름이 「한결」 → **위반 0** (`nameAllowlist` 동작)
5. `expectedLang` **미전달** → 언어 위반 0 (fail-open 가드)
6. `expectedLang='ko'` + 답에 한자 「水」·「壬」만 섞임 → **위반 0**
7. 판정 승계: 최신 질문이 「ㅇㅋ」(판정 불가) + 직전 user 메시지가 한국어 → `'ko'` 승계
8. `buildCorrectionWarnings`에서 언어 경고가 **배열 index 0**인지

---

## §8 완료 기준

- `npx tsc --noEmit` exit 0
- lint 전체 **24E/15W 초과 금지**(신규 0), 신규 `.mjs` 단독 **0E/0W**. `git status --porcelain` 청정 상태에서 측정·출력 첨부
- `npx vitest run` — **기존 915 passed 전건 유지 + 4 expected fail 불변**, 신규 테스트 8건 통과. **총 수치를 명기**(`set -o pipefail` + `PIPESTATUS`)
- `node scripts/verify/voice-baseline.mjs --selftest` → `ALL PASS`
- **`node scripts/verify/lang-regression.mjs` → §6 표와 완전 일치, 오탐 0**
- `npm run build` 성공
- **`git diff origin/main --name-only`가 아래 8개를 넘지 않을 것**: `docs/briefs/BRIEF-106.md` · `docs/reports/BRIEF-106.md` · `src/app/api/ask/route.ts` · `src/app/api/ask/route.test.ts` · `scripts/verify/voice-baseline.mjs` · `scripts/verify/lang-regression.mjs` · `scripts/verify/README.md` · `samples/voice-baseline/lang-regression.tsv`
- **기존 `samples/voice-baseline/*.json` 8개 전부 sha256 무변동**(대조표 첨부)
- 채팅 보고: 커밋 목록 + 보관본 sha256·바이트 대조 + **§6 회귀 표 실제 출력** + vitest 수치 + 수정한 `route.ts` 줄 번호

---

## §9 금지사항

- **프롬프트(`buildAskSystem`·PERSON_RULES·예시)를 건드리지 말 것.** 규칙은 이미 있다. 이 판은 **탐지와 처분**만 한다. 프롬프트는 이미 2만 자다.
- **사용자에게 보이는 새 문구를 만들지 말 것.** 502는 기존 `friendlyError(502)`가 처리한다.
- **leak에서 답 문자열을 자동 수정하지 말 것**(soft flag만).
- **`ctx.candidates`를 `nameAllowlist`에 넣지 말 것.**
- **`JSON.stringify(answer)`로 언어를 세지 말 것.**
- 6턴 픽스처·인물 데이터·호출 예산·기존 지표 정의 변경 금지.
- 기존 `samples/voice-baseline/*.json` 수정·삭제 금지.
- `package.json`·`package-lock.json` 수정 금지.
- main 직접 push·force push·rebase·병합 금지.

---

## §10 근거 (줄 번호는 `BASE_SHA` 기준)

- 언어 규칙 원문: `route.ts:623`(PERSON_RULES 9), `:654`(일반/나 모드 7)
- 위반 유형 정의: `route.ts:822` `AskViolationType`
- ctx 정의(선택 필드 패턴): `route.ts:824–833`
- 검증기: `route.ts:1044` `validateAskAnswer`
- 자유 텍스트 수집: `route.ts:212` `collectAnswerText` / `:229` `collectAnswerTextWithTiming`
- 최종 처분: `route.ts:1265` `applyFinalDisposition` / 단계명 `:1346` `stageOf`
- 교정 경고: `route.ts:1368` `buildCorrectionWarnings`
- 하드 실패 선례: `route.ts:1555` `errorResponse` / `:1758`·`:1801` `banned`
- 호출 예산: `route.ts:1698` 주석, `:1700`·`:1709`·`:1728`·`:1765` `usedExtraCall`, `:1755–1762` 예산 소진 경로
- POST ctx 구성: `route.ts:1678–1682`
- 하네스 ctx: `scripts/verify/voice-baseline.mjs:980–984`(사유 주석 `:976–979`), 픽스처 이름 `:920`
- 실측 원본: `samples/voice-baseline/gemini-3.5-flash-lite-2026081{1,2}-{EN,KO}-run{1,2}.json`
