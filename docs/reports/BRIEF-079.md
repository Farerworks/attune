# BRIEF-079 — VERIFY-KIT: 검증 스크립트 저장소 내장 + docs/reports 보고 규약 개시

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `scripts/verify/README.md` (신규) | 4개 항목(§1~§4) 사용법 문서. server-only 우회 기법(§2), render-smoke의 playwright 임시 설치·정리 절차 포함 |
| `scripts/verify/prompt-assembly.mjs` (신규) | `buildBriefingPrompt`·`buildAskTurns` 조립 결과에 대한 종합 검사 15건 |
| `scripts/verify/engine-check.mjs` (신규) | `calculateSaju` 만세력 정책 3케이스 고정값 회귀 검사 |
| `scripts/verify/render-smoke.mjs` (신규) | 실제 브라우저 렌더 스모크 3항목(DateInput 정규화·헤더 통일·Ilju 시트) |
| `docs/reports/README.md` (신규) | 이 문서 — 보고 규약 자체를 설명 |
| `docs/reports/BRIEF-079.md` (신규, 이 파일) | 규약 1호 적용 — 이 BRIEF 자신의 완료 보고 |

앱 코드(`src/`)는 일절 수정하지 않았다.

## 2. 자가점검 체크

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` — 246개 전체 통과 (BRIEF-078 완료 시점과 동일, 무회귀)
- [x] `npm run build` 성공

- [x] **`prompt-assembly.mjs` 직접 실행 → ALL PASS.** 실제 실행 발췌:
  ```
  [PASS] lens fragment: exactly 1 present — found 1
  [PASS] internal labels: 0 leaked
  [PASS] them.pillarsKnown === 6 (fixture sanity) — got 6
  [PASS] "their Hour" absent (their birth time is unknown)
  [PASS] THEIR UNDERCURRENTS: <=2 bullets — found 2
  [PASS] THEIR DAY PROFILE block present
  [PASS] their day-pillar essence present
  [PASS] my day-pillar essence absent
  [PASS] gifts strings absent (癸丑 fixture)
  [PASS] KO fields absent (癸丑 fixture)
  [PASS] "White Tiger" (traditionNote) absent (癸丑 fixture)
  [PASS] askTurns: same-day history -> 0 markers — found 0
  [PASS] askTurns: mid-history date change -> 1 marker — found 1
  [PASS] askTurns: yesterday history + today question -> marker on question — [new day — 2026-07-20]
  today question
  [PASS] askTurns: no `at` anywhere (old client) -> 0 markers — found 0

  ALL PASS
  ```

- [x] **`engine-check.mjs` 직접 실행 → ALL PASS.** 실제 실행 발췌:
  ```
  [PASS] 1995-06-15 22:30 (before 야자시 cutoff) — day 丁丑, hour 辛亥
  [PASS] 1995-06-15 23:30 (야자시 — day pillar stays same day, hour advances) — day 丁丑, hour 壬子
  [PASS] 1995-06-16 00:30 (past midnight, next calendar day) — day 戊寅, hour 壬子

  ALL PASS
  ```
  ENGINE-CHECK.md의 실측값과 코드 결과가 셋 다 정확히 일치 — 드리프트 없음.

- [x] **`render-smoke.mjs` 1회 실행 → ALL PASS**, 실행 후 정리 완료. 절차: `npm install --no-save --no-package-lock playwright@1.61.1` → `npx playwright install chromium` → `npm run dev -- -p 3100` (백그라운드) → `npx tsx scripts/verify/render-smoke.mjs 3100` → 서버 종료 → `npm install`로 `node_modules` 원상 복구, `package.json`/`package-lock.json` 무변경 확인(`git status --porcelain` 클린). 실제 실행 발췌:
  ```
  [PASS] DateInput: month="02" — got "02"
  [PASS] DateInput: day="04" — got "04"
  [PASS] DateInput: year="1989" — got "1989"
  [PASS] Continue CTA enabled — disabled=false
  [PASS] all 5 headers share one height — {"home":61.59,"people":61.59,"ask":61.59,"you":61.59,"settings":61.59}
  [PASS] Settings link count matches 1/1/1/1/0 — {"home":1,"people":1,"ask":1,"you":1,"settings":0}
  [PASS] Ilju sheet renders a name heading — "The Still Water of the Ox"

  ALL PASS
  ```
  스크린샷은 `/tmp`에만 저장했고(`verify-render-smoke-onboarding.png`, `verify-render-smoke-ilju-sheet.png`), 검증 후 삭제했다. 커밋되지 않았다.

- [x] main push 완료 (커밋 해시는 §4 참고)

## 3. 특이사항·이견·사고 정직 보고

- **`prompt-assembly.mjs`의 癸丑 서브케이스 구현 방식**: 브리프는 "상대를 癸丑로 바꾼 케이스"라고만 지시했고 실제 달력 날짜를 지정하지 않았다. 癸丑에 해당하는 실제 생년월일을 역산해 찾는 대신, `calculateSaju(them)`으로 만든 실차트를 얕은 복사한 뒤 `pillars.day`와 `dayMaster`만 癸丑(음수 계+축)으로 직접 덮어써 합성 픽스처를 만드는 방식을 택했다 — `briefing.test.ts`가 이미 쓰는 `makeChart` 패턴과 같은 결의 판단이다. `buildBriefingPrompt`는 `SajuChart` 구조만 보고 동작하므로 실제 달력 계산 여부와 무관하게 동일하게 검증된다. 문제라고 판단되면 알려주시면 실제 날짜 기반으로 바꾸겠다.
- **`render-smoke.mjs`의 Continue CTA 체크**: 초안에서 `getByText('Continue').locator('..')` 방식을 먼저 시도했다가 더 직접적인 `button:has-text("Continue")` 선택자로 바로 정리했다 — 스크립트에 죽은 코드가 남지 않았는지 확인 완료.
- 그 외 어긋난 기대값·이견·사고는 없었다. `engine-check.mjs`의 세 케이스 모두 ENGINE-CHECK.md 실측값과 첫 실행부터 정확히 일치했고, `prompt-assembly.mjs`의 15개 검사도 첫 실행에서 전부 통과했다 — 즉 회귀는 발견되지 않았다(이 BRIEF는 검증 킷 신설이 목적이므로 이는 기대된 결과다).

## 4. 커밋 해시

- 저장소: https://github.com/Farerworks/attune
- 커밋 해시: `eb5ee31` (VERIFY-KIT 본체 — 이 보고서 포함). 이 줄을 채워넣은 후속 커밋 해시는 텔레그램 완료 보고에 함께 남긴다.
