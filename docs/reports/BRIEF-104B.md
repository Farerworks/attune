# BRIEF-104B — 기질 재부착 억제 (`trait_reattachment`)

## 1. 배경

대화가 길어지면 모델이 이미 말한 성격 근거를 표현만 바꿔서 다시 갖다 붙이는 경향이 있다
(예: T1 "넓은 바다 같은 성향이라" → T5 "수(水) 기운을 품은 성향이라"). 본부가 브리프를
쓰기 전에 내용어 겹침(bag-of-words) 방식을 먼저 재봤으나, 위반과 정상 답변이 겹침 비율
0.10~0.29 한 구간에 섞여 분리 문턱을 세울 수 없었고 언어가 전환된 턴은 겹침이 0.000으로
나와 폐기됐다. 그래서 표적을 13건에서 **기질-원인 문형**만 잡는 7건(실측 32턴 중 12건)으로
낮췄다.

## 2. §1 탐지 규칙 — `trait_reattachment`

`route.ts:1130-1187` 부근에 추가. 한 문장 안에서 (a) 기질-원인 표지와 (b) 날 맥락 부재가
모두 성립하면 위반 1건(문장당 최대 1건 — 같은 문장에 마커가 여러 개 있어도 1건).

- **(a) 기질-원인 표지** — KO는 리터럴 부분문자열: `성향`·`편이거든요`·`편이에요`·`편이라`·
  `기질`·`스타일`·`기운을 품`. EN은 정규식: `tends?\s+to`, `habit of`,
  `(?:they|he|she)\s+prefers?`(3인칭 대명사 바로 앞에 있어야 함 — "you prefer"는 매칭 안 됨),
  `their\s+\w+\s+nature`, `as\s+(?:a|an|the)\s+<Capitalized Two Words>`,
  `(?:water|fire|earth|metal|wood)\s+energy`(오행 원소로 제한 — "direct energy"·"the energy
  of this weekend"처럼 원소 없는 일반 영단어 + energy는 애초에 안 걸림).
- **(b) 날 맥락 제외** — 그 문장에 KO `날`·`오늘`·`내일`·`모레`·`이번 주`·`다음 주`·`요일`,
  EN `day`·`today`·`tomorrow`·`weekend`·요일명·12지지 동물명, 또는 `YYYY-MM-DD`/`N월 N일`
  날짜 패턴이 있으면 그 문장은 건너뛴다.
- **게이트** — `ctx.personIntroduced`가 참일 때만 검사한다(`route.ts:1179`). 새 ctx 필드는
  추가하지 않았다 — `personIntroduced`는 POST에서 `mode === 'person'`일 때만 채워지므로,
  이 필드 하나로 모드 게이트까지 자동으로 겸한다.
- `validateAskAnswer` 안, 언어 검사 바로 뒤에 연결했다(`route.ts:1314`) — firstPass·finalPass
  양쪽 + 평문 폴백에 자동으로 적용된다.

## 3. §2 처분 — 502 금지

- 교정 경고: `buildCorrectionWarnings`에 `TRAIT RE-ATTACHMENT` 문구를 추가(브리프 원문 그대로).
- 교정 후에도 남으면: `applyFinalDisposition`에서 soft flag만 추가(`{ stage: 'trait', action:
  'soft' }`, `route.ts:1501`) — 답 문자열은 손대지 않는다.
- 하드 실패 경로 없음 — `errorResponse`/502 분기 어디에도 `trait_reattachment`를 걸지 않았다.
- `stageOf`에 `trait_reattachment → 'trait'` 추가.

## 4. §3 회귀 검사 — `scripts/verify/trait-regression.mjs`

API 호출 0건. `checkTraitReattachment`/`hasTraitCauseMarker`/`hasDayContext`/
`collectAnswerTextWithTiming`/`splitSentences`의 순수 JS 미러를 만들어(route.ts를 import하지
않으므로 `npx tsx` 없이 순수 `node`로 실행 가능) 두 표본에 적용했다.

### §3.1 양성 — 8파일 × T2~T5 = 32턴, `finalPass.parsed` 기준

```
gemini-3.5-flash-lite-20260811-EN-run1.json     3     1      That kind of friction tends to make them
gemini-3.5-flash-lite-20260811-EN-run1.json     5     2      When faced with a new commitment, they t
gemini-3.5-flash-lite-20260811-EN-run2.json     4     1      It's completely normal for Riley to take
gemini-3.5-flash-lite-20260811-KO-run1.json     5     1      앞서 수(水) 기운이 강한 성향 특유의 신중함이 작용해서, 섣부르게 덜컥
gemini-3.5-flash-lite-20260811-KO-run2.json     5     1      한결이는 결정을 내리기 전에 머릿속으로 판을 넓게 펼쳐놓고 시뮬레이션을
gemini-3.5-flash-lite-20260812-EN-run1.json     5     2      When Riley seems lukewarm, it often refl
gemini-3.5-flash-lite-20260812-EN-run2.json     2     1      That "thinking about it" response is typ
gemini-3.5-flash-lite-20260812-EN-run2.json     5     2      라이는 결정을 내리기 전에 스스로 충분히 소화할 시간이 필요한 편이에요.
gemini-3.5-flash-lite-20260812-KO-run1.json     5     1      수(水) 기운을 품은 성향이라 섣불리 뛰어들기보다 전체 흐름을 깊게 가라
gemini-3.5-flash-lite-20260812-KO-run2.json     2     1      한결이의 그 성향을 생각하면 당장 확답을 재촉하기보다 여유를 주는 게 좋
gemini-3.5-flash-lite-20260812-KO-run2.json     3     1      넓은 시야로 전체를 가늠해 보려는 성향이라, 충분히 생각할 시간이 필요할
gemini-3.5-flash-lite-20260812-KO-run2.json     5     1      큰 그림을 먼저 보는 성향이라 세부 조건이나 진행 방식까지 스스로 납득될

합계: 32턴 중 12턴 위반 (기대 12/32).
```

§3.1 표(0812=7/16 · 0811=5/16 · 전체 12/32)와 완전 일치.

### §3.2 음성 — `trait-negatives.json` 12건, 오탐 0

```
PASS KO-N1 -> 0    PASS KO-N4 -> 0    PASS KO-N5 (★함정) -> 0    PASS EN-N4 -> 0
PASS KO-N2 (★함정) -> 0    PASS EN-N1 -> 0    PASS KO-N6 (★함정) -> 0    PASS EN-N5 (★함정) -> 0
PASS KO-N3 -> 0    PASS EN-N2 (★함정) -> 0    PASS EN-N3 -> 0    PASS EN-N6 (★함정) -> 0

오탐: 0/12
[PASS] §3.1 12/32 완전 일치, §3.2 오탐 0.
```

6개 함정(날 맥락 2건, 마커 정밀도 4건) 전부 정확히 걸리지 않았다. 결과는
`samples/voice-baseline/trait-regression.tsv`에 저장했다. 기존
`samples/voice-baseline/*.json` 8개와 `trait-negatives.json`은 읽기만 하며 수정하지 않는다.

## 5. §4 단위 테스트 9건

`describe('기질 재부착 억제 (BRIEF-104B)', ...)`: personIntroduced 게이트(양성/음성), mode
게이트(POST 통합), 날 제외, KO 마커 정밀도("편이 안전해요" 불일치), EN prefer 3인칭 한정,
`tends to` 양성, POST 통합(교정 후에도 남으면 200·답 원문 유지), `buildCorrectionWarnings`
문구 포함 — 브리프 §4의 9개 항목을 그대로 구현했다.

## 6. 잡히지 않는 것 (그대로 기록)

> 이 판은 **기질-원인 문형**만 탐지한다. 32턴 중 12건을 잡고, **나머지는 잡지 않는다.**
> 남는 것은 문형도 원소 어휘도 없는 **순수한 말바꿈**이다 — 예: 「weighing the **scope**
> and their own **bandwidth**」(T1의 "expansive scope" 재진술), 「**넓은 시야로 전체를
> 가늠해 보려는**」. 본부가 내용어 겹침으로 재봤으나 위반과 정상이 **0.10~0.29 한 구간에
> 섞여** 분리 문턱을 세울 수 없었고, 답이 다른 언어로 넘어간 턴은 겹침이 **0.000**이었다.
> **따라서 「반복이 해결됐다」고 쓰지 않는다. 「문형으로 드러나는 재부착을 막았다」까지가
> 이 판의 성과다.**

## 7. 실행 조건

이 판은 API 호출을 하지 않는다(§3 회귀는 이미 기록된 8개 파일을 재사용). `route.ts`
수정만으로 진행했으며, `npx tsc --noEmit`·`npx vitest run`·`node scripts/verify/
trait-regression.mjs`·`node scripts/verify/voice-baseline.mjs --selftest`·`node
scripts/verify/lang-regression.mjs`·`npm run build` 전부 로컬에서 실행했다.

## 8. 완료 기준 자가점검

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| lint (청정 상태) | 39 (24E/15W), 신규 0 |
| `npx vitest run` | **942 = 933(기존) + 9(신규) passed + 4 expected fail (946)** |
| `node scripts/verify/trait-regression.mjs` | §3.1 12/32 완전 일치, §3.2 오탐 0, `[PASS]` |
| `node scripts/verify/voice-baseline.mjs --selftest` | ALL PASS |
| `node scripts/verify/lang-regression.mjs` | 12행 무변동, `[PASS]` |
| `npm run build` | 성공 |
| 변경 파일 | 정확히 7개: `docs/briefs/BRIEF-104B.md`(신규) · `docs/reports/BRIEF-104B.md`(신규) · `src/app/api/ask/route.ts` · `src/app/api/ask/route.test.ts` · `scripts/verify/trait-regression.mjs`(신규) · `samples/voice-baseline/trait-negatives.json`(신규) · `samples/voice-baseline/trait-regression.tsv`(신규) |
| 기존 `samples/voice-baseline/*.json` 8개 | 수정 없음 (읽기 전용) |

## 9. 근거 (줄 번호는 `BASE_SHA=8d35dbcffc828879ef39cc5edf649dbffcd6cc68` 기준 최종 코드)

- 위반 유형 정의: `route.ts:822` `AskViolationType`
- 탐지 함수: `route.ts:1135-1187` (`TRAIT_CAUSE_KO`/`TRAIT_CAUSE_EN_PATTERNS`/
  `hasTraitCauseMarker`/`DAY_CONTEXT_KO`/`hasDayContext`/`checkTraitReattachment`)
- 검증기 연결: `route.ts:1314`
- 최종 처분(soft flag): `route.ts:1501`
- `stageOf`: `trait_reattachment → 'trait'`
- 교정 경고: `buildCorrectionWarnings`의 `trait_reattachment` case
- 게이트: `ctx.personIntroduced`(기존 필드, 신규 필드 없음)
