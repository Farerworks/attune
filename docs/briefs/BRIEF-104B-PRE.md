# BRIEF-104B-PRE — 재기준선 채집 (105 이후 상태)

## §0 맥락 (이 문서가 요구사항의 전부다)

- 대상: **Attune** — 폴더 `~/projects/attune`, 저장소 `github.com/Farerworks/attune`.
- **왜 다시 뜨나**: BRIEF-104A 기준선은 **`9054808` 시점 프롬프트**로 채집됐다. 그 뒤 **105가 프롬프트를 실제로 바꿨다**(예시 탈오염 4곳 + `date_pillar_mismatch` 검증기·교정 경고 신설). 이 상태로 104B를 옛 기준선과 직접 비교하면 **「104B가 바꾼 것」과 「105가 이미 바꾼 것」이 섞인다.** 105의 변경이 반복·말투 지표에 영향이 없을 **개연성**은 높지만 **개연성은 측정이 아니다.**
- **이 판의 목적 2가지**
  1. **104B의 참된 before 확보** — 현 main 상태의 기준선.
  2. **105 부작용 점검** — 105가 말투 지표를 움직였는지 확인. 겸사겸사 **실사용 답변에서 날짜 오류가 실제로 사라졌는지**도 본다.
- **기준 커밋 `BASE_SHA` = `91e2e725780c959d865ed411a39954a5c221b554`**(105 + 105-FIX 병합 완료본). 작업 시작 시:

  ```bash
  git fetch origin
  BASE_SHA=91e2e725780c959d865ed411a39954a5c221b554
  git checkout main && git pull --ff-only
  test "$(git rev-parse HEAD)"              = "$BASE_SHA" || { echo "STOP: HEAD 불일치"; exit 1; }
  test "$(git rev-parse origin/main)"       = "$BASE_SHA" || { echo "STOP: origin/main 불일치"; exit 1; }
  test "$(git merge-base HEAD origin/main)" = "$BASE_SHA" || { echo "STOP: merge-base 불일치"; exit 1; }
  echo "BASE_SHA 3중 일치 확인"
  ```
- **전용 브랜치 `feat/104b-pre-rebaseline`.** main 직접 push·force push·rebase·병합 금지.
- 기준 테스트 **919 = 915 passed + 4 expected fail** — 이 판은 이 수치를 **바꾸지 않는다**.
- lint baseline **39 (24E/15W)** — 신규 0.
- **`src/` 전체 무접촉.** 이 판은 측정만 한다.

## §1 공정 (커밋 정확히 3개)

1. **보관**: 이 문서를 `docs/briefs/BRIEF-104B-PRE.md`로 바이트 그대로 저장 → `sha256sum`·`wc -c` 기준값 대조(불일치 시 중단·보고) → 단독 커밋.
2. **하네스 정합**: §2 수정 + `scripts/verify/README.md` §5에 사유 추가.
3. **결과·보고서**: `samples/voice-baseline/*.json`(신규) + metrics TSV + `docs/reports/BRIEF-104B-PRE.md`.

푸시: `git push -u origin feat/104b-pre-rebaseline`.

## §2 하네스 정합 — **본부 정정: 「코드 변경 0」이 아니다**

본부는 처음에 「하네스 코드 변경 0으로 다시 돌리면 된다」고 말했으나 **틀렸다.** 확인해보니:

- 105는 `AskValidationCtx`에 `dailyPillarLookup`·`todayDate`를 **선택 필드로** 추가했다(기존 호출부가 안 깨지도록). `route.ts:831–832`
- 프로덕션 `POST`는 이 둘을 **실제로 채워서** 넘긴다. `route.ts:1680–1681` — `dailyPillarLookup: buildDailyPillarLookup(dailyPillars)`, `todayDate: today`
- **104A 하네스는 105 이전에 작성돼 이 둘을 안 넘긴다.** 그러면 `route.ts:1139`의 `if (ctx.dailyPillarLookup)` 가드에 걸려 **날짜 검증이 통째로 건너뛰어진다.**

즉 고치지 않으면 **프로덕션과 다른 파이프라인을 재게 된다** — 날짜 위반이 안 잡히고, 그 위반이 소비했을 교정 재호출도 안 일어나서 finalPass가 달라진다.

### 수정 내용 (이것만)

`scripts/verify/voice-baseline.mjs`에서 `validateAskAnswer`에 넘기는 ctx에 **`dailyPillarLookup`과 `todayDate`를 추가**한다.

- `dailyPillarLookup` = `buildDailyPillarLookup(dailyPillars)` — **하네스가 이미 만들어 쓰는 그 `dailyPillars` 배열**을 그대로 넣는다. 새로 계산 금지.
- `todayDate` = 하네스가 `buildAskSystem`에 쓰는 그 오늘 날짜와 **같은 값**.
- **`route.ts:1660~1690` 부근 POST의 ctx 구성과 필드·값이 일치하는지 눈으로 대조하고, 그 줄 번호를 보고서에 적을 것.**
- 교정 경고·최종 보정 경로도 프로덕션과 같은 순서로 타는지 확인(105가 `applyFinalDisposition`·`stageOf`에 새 유형을 넣었다).

**그 외 하네스 로직은 손대지 말 것** — 6턴 픽스처, 호출 예산, 지표 함수, `--selftest`, `--metrics` 전부 무변경.

## §3 채집

- **모델 게이트 그대로**: `gemini-3.5-flash-lite`가 아니면 **exit 1**. `GEMINI_API_KEY` 없으면 exit 1. `LLM_PROVIDER` ≠ `gemini`면 exit 1.
- **같은 6턴 픽스처, EN×2 + KO×2 = 기본 24콜** + 실제 교정 호출. 호출 간격은 104A와 동일 기준(RPM 확인 또는 4초).
- 결과 파일명은 날짜가 들어가므로 **기존 `20260811` 파일들과 자동으로 안 겹친다. 기존 파일은 절대 건드리지 말 것.**
- `--metrics` → 새 TSV. **기존 `metrics-20260811.tsv`·`metrics-20260811-v2.tsv` 무접촉.**
- 수동 판정 열(`M4_manual_*`·`M6_manual_final`·`M7b_verdict`)은 **열만 만들고 공란** — farr02가 채우지 말 것.

## §4 보고서 — **대조가 본체다**

`docs/reports/BRIEF-104B-PRE.md`에 아래를 담는다.

1. **실행 조건**: 모델명 실측값 · `generationConfig` · `LLM_PROVIDER` · 기준 커밋 · 실행 시각 · 호출 간격과 근거 · 총 호출 수(기본 24 + 교정 N).
2. **104A(구) ↔ 이번(신) 대조표** — 지표별 두 값을 나란히. `M1`·`M2`·`M3`(길이·shape·턴1 대비 비율)·`M4`·`M6`·`M7`, firstPass·finalPass 각각.
3. **`date_pillar_mismatch` 발생 수** — 이번 채집에서 몇 건인지. **0이면 105가 실사용에서 먹혔다는 뜻**이므로 그렇게 적을 것.
4. **shape 안정성**: 같은 입력에 대해 런마다 `parts`/`text`가 갈리는지(104A에서 KO 턴5가 갈렸다).
5. **판단은 쓰지 말 것** — 「좋아졌다/나빠졌다」는 본부가 한다. 숫자와 사실만.

## §5 완료 기준

- `npx tsc --noEmit` 0
- lint: 전체 **24E/15W 초과 금지**(신규 0) + `voice-baseline.mjs` 단독 **0E/0W**. `git status --porcelain` 청정 상태에서 측정·출력 첨부
- `npx vitest run` **919 = 915 + 4 무변동**(`set -o pipefail` + `PIPESTATUS`)
- `node scripts/verify/voice-baseline.mjs --selftest` → `ALL PASS`
- **`git diff origin/main --name-only`에 `src/` 경로 0건**
- **기존 `samples/voice-baseline/*20260811*` 파일 전부 sha256 무변동**(대조표 첨부)
- 기본 24콜 완료(429 시 몇 콜까지인지 명기) + 신규 JSON 4개 + 신규 TSV + 보고서 커밋
- 채팅 보고: 커밋 3종 + 보관본 sha256·바이트 대조 + **§4의 대조표** + **`date_pillar_mismatch` 건수** + ctx 대조한 `route.ts` 줄 번호

## §6 금지사항

- **`src/` 전부 무접촉.**
- 기존 `samples/voice-baseline/*20260811*` 파일 **수정·삭제 금지**.
- 6턴 픽스처·인물 데이터·지표 정의·호출 예산 변경 금지.
- 수동 판정 열을 채우지 말 것.
- 보고서에 개선/악화 판단 쓰지 말 것(숫자와 사실만).
- `package.json`·`package-lock.json` 수정 금지.
- main 직접 push·force push·rebase·병합 금지.

## §7 근거

- 105가 추가한 선택 필드: `AskValidationCtx.dailyPillarLookup`·`todayDate` = `route.ts:831–832`.
- 프로덕션이 채워 넘기는 곳: `route.ts:1680–1681`.
- 미전달 시 검증이 건너뛰어지는 가드: `route.ts:1139`(`if (ctx.dailyPillarLookup)`), 최종 보정 쪽 `:1334`.
- 104A 기준선 원본: `samples/voice-baseline/gemini-3.5-flash-lite-20260811-{EN,KO}-run{1,2}.json`.
