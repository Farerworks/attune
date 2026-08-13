# BRIEF-104B — 기질 재부착 억제 (`trait_reattachment`)

## §0 맥락 (이 문서가 요구사항의 전부다)

- 대상: **Attune** — 폴더 `~/projects/attune`, 저장소 `github.com/Farerworks/attune`.
- **기준 커밋 `BASE_SHA` = `8d35dbcffc828879ef39cc5edf649dbffcd6cc68`**(106 + 106-FIX 병합 완료본).

  ```bash
  git fetch origin
  BASE_SHA=8d35dbcffc828879ef39cc5edf649dbffcd6cc68
  git checkout main && git pull --ff-only
  test "$(git rev-parse HEAD)"        = "$BASE_SHA" || { echo "STOP: HEAD 불일치"; exit 1; }
  test "$(git rev-parse origin/main)" = "$BASE_SHA" || { echo "STOP: origin/main 불일치"; exit 1; }
  echo "BASE_SHA 확인"
  ```
- **전용 브랜치 `feat/104b-trait`.** main 직접 push·force push·rebase·병합 금지.
- 기준 테스트 **933 passed + 4 expected fail (937)** — 기존 933 전건 유지.
- lint baseline **39 (24E/15W)** — 신규 0.

### 무엇이 문제인가

대화가 길어지면 모델이 **이미 말한 성격 근거를 다시 갖다 붙인다.** 표현만 바꿔서.

- T1: 「한결이는 **넓은 바다 같은 성향이라**…」 ← 최초 소개. **정상**
- T5: 「**수(水) 기운을 품은 성향이라** 섣불리 뛰어들기보다…」 ← 같은 근거를 다시 붙임
- 심지어 모델이 자백하기도 한다 — 0811 KO-run1 T5: 「**앞서** 수(水) 기운이 강한 성향 특유의…」

### ⚠ 본부가 먼저 잰 것 — 표적을 13에서 7로 낮췄다

이 판의 원래 표적은 **13/16**이었다. **브리프를 쓰기 전에 방법이 성립하는지 재봤고, 성립하지 않았다.**

| 시도한 방법 | 결과 |
|---|---|
| 내용어 겹침(bag-of-words) | 전 구간 0.10~0.29에 몰려 **분리 구간 없음**. `EN-run2 T4`는 겹침 **0.000**인데 위반(답이 한국어로 넘어가 토큰이 안 겹침) → **폐기** |
| **기질-원인 문형 탐지** | **채택.** 아래 §1 |

**남는 9건은 순수한 말바꿈**(「weighing the **scope** and their **bandwidth**」)이라 **서버가 문자로 판별할 수 없다.** 이 판은 **7건만 잡는다.** 나머지는 보고서에 「기계로 잡히지 않음」으로 명시하고 남긴다. **표적을 부풀리지 말 것.**

---

## §1 탐지 규칙 — `trait_reattachment`

**한 문장 안에서 아래 두 조건이 모두 성립하면 위반 1건.**

**(a) 기질-원인 표지**가 있다

```
KO: 성향 | 편이거든요 | 편이에요 | 편이라 | 기질 | 스타일 | 기운을 품
EN: tends to | tend to | as a/an/the <Archetype Two Words> | their <word> nature
    | habit of | they/he/she prefer(s) | <word> energy
```

**(b) 그 문장에 「날 맥락」이 없다** — 있으면 **그 문장은 건너뛴다**

```
KO: 날 | 오늘 | 내일 | 모레 | 이번 주 | 다음 주 | 요일 | YYYY-MM-DD | N월 N일
EN: day | today | tomorrow | weekend | Monday…Sunday
    | Rat|Ox|Tiger|Rabbit|Dragon|Snake|Horse|Goat|Monkey|Rooster|Dog|Pig
```

### ⚠ (b)가 이 판의 핵심이다

「**Earth Dragon 날**처럼 중심이 잡히는 날」·「오늘 같은 **수(水) 기운**이 감도는 날」·「the **energy** of this weekend」는 **그날의 기운**이지 인물의 성격이 아니다. 105가 만든 일진 기계가 있으므로 **날 얘기는 정상이고 건드리면 안 된다.** 제외하지 않으면 정상 답변이 무더기로 잡힌다(본부 실측: 제외 전 9건 중 3건이 오탐).

### 적용 조건 (게이트)

- **`mode === 'person'` 이고 `ctx.personIntroduced === true` 일 때만 검사한다.**
- **`personIntroduced`는 이미 있다**(`route.ts`의 `AskValidationCtx`, `reintroduction` 검사가 쓰는 그 필드). **새로 만들지 말 것.**

**⚠ 이 게이트는 필수다.** 본부 실측 — 게이트 없이 돌리면 **T1(최초 소개) 8개 중 7개가 걸린다.** T1의 「한결이는 넓은 바다 같은 성향이라」는 **정상 동작**이다. 처음 소개하는 걸 막으면 제품이 망가진다.

`detail`에 걸린 문장의 앞 40자를 담는다(보고·로그용).

---

## §2 처분 — **502 금지**

| 단계 | 처리 |
|---|---|
| 교정 경고 | `buildCorrectionWarnings`에 추가. 언어 경고 다음 |
| 교정 후에도 남으면 | **`applyFinalDisposition`에서 soft flag만** — `{ stage: 'trait', action: 'soft' }` |
| 하드 실패 | **절대 금지** |

**반복은 거슬리지만 쓸 수는 있다.** 언어 전환처럼 답을 버릴 사안이 아니다. 답 문자열도 **기계로 수정하지 말 것**(문장을 잘라내면 글이 깨진다).

`stageOf`에 `trait_reattachment` → `'trait'` 추가.

교정 경고 문구:

```
⚠ TRAIT RE-ATTACHMENT — You already explained this person's disposition earlier in this
conversation. Do not restate it as the reason. Explain THIS situation instead — what changed,
what has not happened yet, what the timeline looks like. Regenerate without the trait clause.
```

---

## §3 회귀 검사 — **이게 게이트다 (API 호출 0)**

`scripts/verify/trait-regression.mjs`를 신설한다. **모델을 부르지 않는다.**

### 3.1 양성 — 기록된 8파일 × T2~T5 = **32턴**

**T1은 최초 소개라 제외, T6은 대본 모드라 제외.** 본부가 같은 규칙으로 돌린 정답표 — **한 칸이라도 다르면 중단·보고.**

| 코퍼스 | 런 | 턴 | 건수 | 걸린 문장(앞부분) |
|---|---|---|---|---|
| 20260812 | EN-run1 | T5 | 2 | When Riley seems lukewarm, it often reflects a habit |
| 20260812 | EN-run2 | T2 | 1 | That "thinking about it" response is typical when Ri |
| 20260812 | EN-run2 | T5 | 2 | 라이는 결정을 내리기 전에 스스로 충분히 소화할 시간이 필요한 편이에요 |
| 20260812 | KO-run1 | T5 | 1 | 수(水) 기운을 품은 성향이라 섣불리 뛰어들기보다 전체 흐름을 |
| 20260812 | KO-run2 | T2 | 1 | 한결이의 그 성향을 생각하면 당장 확답을 재촉하기보다 |
| 20260812 | KO-run2 | T3 | 1 | 넓은 시야로 전체를 가늠해 보려는 성향이라, 충분히 |
| 20260812 | KO-run2 | T5 | 1 | 큰 그림을 먼저 보는 성향이라 세부 조건이나 진행 방식까지 |
| 20260811 | EN-run1 | T3 | 1 | That kind of friction tends to make them withdraw en |
| 20260811 | EN-run1 | T5 | 2 | When faced with a new commitment, they tend to pause |
| 20260811 | EN-run2 | T4 | 1 | It's completely normal for Riley to take their time |
| 20260811 | KO-run1 | T5 | 1 | 앞서 수(水) 기운이 강한 성향 특유의 신중함이 작용해서 |
| 20260811 | KO-run2 | T5 | 1 | 한결이는 결정을 내리기 전에 머릿속으로 판을 넓게 펼쳐놓고 |

**합계: 0812 = 7/16 · 0811 = 5/16 · 전체 12/32.**

### 3.2 음성 — **본부 작성 12건, 오탐 0이 완료 기준**

첨부한 `trait-negatives.json`을 **바이트 그대로** `samples/voice-baseline/trait-negatives.json`에 저장한다.
**기준값: sha256 `8688fddeea989ff7da9ca4a6260dbd22aa61c06144281b426cba69e8366f853f` / 4,777바이트.** 불일치 시 중단·보고.

**12건 전부 위반 0이어야 한다.** 그중 6건은 일부러 만든 함정이다:

| id | 함정 |
|---|---|
| `KO-N2` | 「**Earth Dragon 날**」·「오늘 같은 **수(水) 기운**」 — 날 얘기 |
| `EN-N2` | 「an **Earth Dragon day**」·「Earth Dragon **energy**」 — 날 얘기 |
| `KO-N5` | 「기다리는 **편이 안전해요**」 — 권유지 기질이 아님 |
| `KO-N6` | 「분위기가 차분한 **편이에요**」 — 그날 얘기 |
| `EN-N5` | 「if you **prefer** to keep it low-key」 — 사용자의 선택 |
| `EN-N6` | 「the **energy** of this weekend」 — 날 얘기 |

**⚠ 음성 12건 중 하나라도 걸리면 실패다.** 이 판에는 오탐을 잴 다른 표본이 없다 — **적용 가능 턴의 대부분이 위반이라 정상 표본이 실제 데이터에 거의 없다.** 그래서 본부가 직접 썼다.

결과를 `samples/voice-baseline/trait-regression.tsv`로 저장·커밋한다.

---

## §4 단위 테스트 (기존 933 무손상)

`src/app/api/ask/route.test.ts`에 추가:

1. `personIntroduced: true` + 「수(水) 기운을 품은 성향이라…」 → `trait_reattachment` 1건
2. **`personIntroduced: false`** + 같은 문장 → **위반 0** (T1 게이트)
3. `mode !== 'person'` → 위반 0
4. 「2026-08-22(토) **Earth Dragon 날**처럼 중심이 잡히는 날」 → **위반 0** (날 제외)
5. 「기다리는 **편이 안전해요**」 → **위반 0**
6. 「if you **prefer** to keep it low-key」 → **위반 0**
7. `tends to` 영어 문장 → 1건
8. POST 통합: 교정 후에도 남으면 **200**·답 원문 유지·`applyFinalDisposition`이 `{stage:'trait', action:'soft'}` — **502가 아님**
9. `buildCorrectionWarnings`에 `TRAIT RE-ATTACHMENT` 포함

---

## §5 보고서 — **잡히지 않는 것을 반드시 적을 것**

`docs/reports/BRIEF-104B.md`에 아래를 **그대로** 담는다.

> 이 판은 **기질-원인 문형**만 탐지한다. 32턴 중 12건을 잡고, **나머지는 잡지 않는다.**
> 남는 것은 문형도 원소 어휘도 없는 **순수한 말바꿈**이다 — 예: 「weighing the **scope** and their own **bandwidth**」(T1의 "expansive scope" 재진술), 「**넓은 시야로 전체를 가늠해 보려는**」. 본부가 내용어 겹침으로 재봤으나 위반과 정상이 **0.10~0.29 한 구간에 섞여** 분리 문턱을 세울 수 없었고, 답이 다른 언어로 넘어간 턴은 겹침이 **0.000**이었다.
> **따라서 「반복이 해결됐다」고 쓰지 않는다. 「문형으로 드러나는 재부착을 막았다」까지가 이 판의 성과다.**

또한 실행 조건·`route.ts` 수정 줄 번호·회귀 표 실제 출력을 담는다.

---

## §6 완료 기준

- `npx tsc --noEmit` exit 0
- lint **24E/15W 초과 금지**(신규 0), 신규 `.mjs` 단독 **0E/0W**. `git status --porcelain` 빈 상태에서 측정·출력 첨부
- `npx vitest run` — **기존 933 passed 전건 유지** + 신규 9건 + **4 expected fail 불변**. 최종 수치 명기(`set -o pipefail` + `PIPESTATUS`)
- **`node scripts/verify/trait-regression.mjs`** → §3.1 표와 **완전 일치**(12/32) + **§3.2 음성 12건 오탐 0**
- `node scripts/verify/voice-baseline.mjs --selftest` → `ALL PASS`
- **`node scripts/verify/lang-regression.mjs` → 12행 무변동 `[PASS]`** (106 회귀가 안 깨졌는지)
- `npm run build` 성공
- **변경 파일은 정확히 이 7개**:
  1. `docs/briefs/BRIEF-104B.md` (이 문서 바이트 그대로 보관 → sha256·`wc -c` 대조)
  2. `docs/reports/BRIEF-104B.md`
  3. `src/app/api/ask/route.ts`
  4. `src/app/api/ask/route.test.ts`
  5. `scripts/verify/trait-regression.mjs`
  6. `samples/voice-baseline/trait-negatives.json`
  7. `samples/voice-baseline/trait-regression.tsv`
- **기존 `samples/voice-baseline/*.json` 8개 sha256 무변동**(대조표 첨부)
- 채팅 보고: 커밋 목록 + 보관본 sha256·바이트 대조 + **회귀 표 실제 출력(양성 12/32 · 음성 오탐 0)** + vitest 최종 수치 + 수정한 `route.ts` 줄 번호

---

## §7 금지사항

- **프롬프트를 건드리지 말 것.** 「반복하지 마」는 이미 4곳에 있고 프롬프트는 2만 자다. 이 판은 **탐지와 처분**만 한다.
- **502·하드 실패 금지.** 반복은 답을 버릴 사안이 아니다.
- **답 문자열 자동 수정 금지**(soft flag만).
- **`personIntroduced` 게이트를 빼지 말 것** — 빼면 T1 최초 소개가 걸린다(본부 실측 8개 중 7개).
- **날 맥락 제외를 빼지 말 것** — 빼면 정상 일진 답변이 걸린다.
- **`lang-regression.mjs`·`voice-baseline.mjs`·기존 `samples/*.json` 수정 금지.**
- **음성 표본 `trait-negatives.json`을 수정하지 말 것.** 걸리면 탐지기를 고치는 것이지 표본을 고치는 게 아니다.
- **표적을 부풀리지 말 것** — 12/32가 전부다. 보고서에 「반복 해결」이라고 쓰지 말 것.
- `package.json`·`package-lock.json` 수정 금지. main 직접 push·force push·rebase·병합 금지.

---

## §8 근거 (줄 번호는 `BASE_SHA` 기준)

- 위반 유형 정의: `route.ts:822` `AskViolationType`
- ctx·`personIntroduced`: `route.ts:824–836` `AskValidationCtx`
- 검증기: `route.ts:1044` `validateAskAnswer` — **여기 안에 넣는다**(firstPass·finalPass 양쪽 + 평문 폴백이 자동으로 덮인다)
- 자유 텍스트 수집: `route.ts:229` `collectAnswerTextWithTiming`
- 최종 처분: `route.ts:1265` 부근 `applyFinalDisposition` / 단계명 `stageOf`
- 교정 경고: `buildCorrectionWarnings`
- 기존 소개 판정: `hasPersonIntroduced` / `themNameCandidates`
- 실측 원본: `samples/voice-baseline/gemini-3.5-flash-lite-2026081{1,2}-{EN,KO}-run{1,2}.json`
