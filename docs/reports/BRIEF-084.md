# BRIEF-084 — Ask "오늘 무슨 날" 질문에 오늘 일진(간지) 평문 명시

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `src/app/api/ask/route.ts` | `buildAskSystem` 안에 `todayLine`(TODAY 식별 라인) 계산 추가 + `DAILY PILLARS` 섹션 맨 앞에 삽입 + 사용 지시 뒤에 규칙 한 줄 추가. 시그니처 변경 없음, 새 계산 로직 없음(기존 `calculateSaju` 재사용) |
| `src/app/api/ask/route.test.ts` | `describe('buildAskSystem — TODAY identity line (BRIEF-084)')` 신규 |
| `scripts/verify/prompt-assembly.mjs` | 동일 취지 체크 6건(3분기 × 2조건) 추가, `getDailyPillars` import 추가 |

## 2. 구현 요지

`dailyPillars[0]?.date`를 오늘로 잡고 `calculateSaju({ date: today })`(시각 생략 → 년·월·일주만, 시주 없음)로 오늘의 년·월·일주를 계산해 `DAILY PILLARS — NEXT 90 DAYS` 헤더 바로 다음 줄에 삽입했다:

```
TODAY — ${today}: ${year.stem} / ${year.branch} year · ${month.stem} / ${month.branch} month · ${day.stem} / ${day.branch} day (일진). Hour is unknown.
```

간지 표기는 기존 `pillarsText`(일일 간지 목록)와 동일한 `stem / branch` 형식을 그대로 재사용했다(새 표기법 없음). day-pillar는 `dailyPillars[0]`과 같은 소스(`calculateSaju`/`getDailyPillars` 둘 다 동일 날짜에 대해 동일한 만세력 계산을 거치므로)라 자동으로 일치한다.

기존 사용 지시(`Use the daily pillars for timing …`) 바로 뒤에 규칙 한 줄을 추가했다:

```
When the user asks what today is, today's energy, or today's saju, first state today's pillars plainly by name (lead with the day pillar / 일진), then interpret. Never answer only in abstract element talk.
```

`TIMING & PREDICTION`, `IDENTITY_MENTIONS_RULES`, `PERSON_RULES`/`SELF_RULES`, 출력 스키마, `localeVoiceBlock()`은 전혀 건드리지 않았다(`git diff` 확인 — 변경분은 `todayLine` 계산 3줄 + 삽입 2줄뿐).

## 3. 신규 테스트

`src/app/api/ask/route.test.ts` — `describe('buildAskSystem — TODAY identity line (BRIEF-084)')`:
- `getDailyPillars('2026-07-22', 90)`(2026-07-22 = 丁酉일, Yin Fire / Rooster)로 고정 픽스처를 만들어 me/person/general 3모드 모두에서: 출력에 `TODAY` 포함 + `daily[0].stem`·`daily[0].branch` 포함(하드코딩 없이 `daily[0]`에서 파생) 확인.

`scripts/verify/prompt-assembly.mjs`에도 동일 조건 6개 체크 추가.

## 4. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` — 252개 전체 통과 (BRIEF-082 완료 시점 251 + 신규 1, 무회귀)
- [x] `npm run build` 성공
- [x] `npx tsx scripts/verify/prompt-assembly.mjs` → **ALL PASS** (29개 체크 전부, 신규 6개 포함)
- [x] **본인 확인** — `buildAskSystem('me', ...)` 실제 출력 발췌 (me: 1990-06-15 14:30, daily: `getDailyPillars('2026-07-22', 90)`):
  ```
  DAILY PILLARS — NEXT 90 DAYS (server-computed, do not modify):
  TODAY — 2026-07-22: Yang Fire / Horse year · Yin Wood / Goat month · Yin Fire / Rooster day (일진). Hour is unknown.
  2026-07-22 (Wed): Yin Fire / Rooster — fire
  2026-07-23 (Thu): Yang Earth / Dog — earth
  ...
  ```
  `daily[0]` = `2026-07-22 Yin Fire Rooster` — TODAY 라인의 day 항목(`Yin Fire / Rooster day`)과 정확히 일치.
- [x] main push 완료 (커밋 해시는 §5)

## 5. 커밋 해시

- 저장소: https://github.com/Farerworks/attune
- 커밋 해시: `d237f29`
