# BRIEF-105 v1.2 — 날짜–간지 사실 오류 차단 (예시 탈오염 + 결정적 검증)

## §0 맥락 (이 문서가 요구사항의 전부다)

- 대상: **Attune** — 폴더 `~/projects/attune`, 저장소 `github.com/Farerworks/attune`.
- **문제(실측)**: Ask 타이밍 답변이 **틀린 날짜–간지**를 말한다. 시스템 프롬프트에 정답이 들어 있는데도 틀린다.
  - **확정 오류 1건**: 「다음 주 화요일인 **8월 18일(물 호랑이 날)**」 ← 2026-08-18 = **甲子 · 나무 쥐**(KO run2 턴3).
  - **모호 1건(이 판 범위 밖)**: 「이번 주 금요일인 **양 금요일**(14일)」(KO run1 턴3) — 2026-08-14 = 庚申이고 **庚 = Yang Metal이므로 천간은 맞다.** 같은 답변의 `timing` 필드가 「2026-08-14 (금) - 금(金) 기운」으로 정확한 것으로 보아 **틀린 주장이 아니라 「양 금(陽金)」+「요일」이 뭉개진 불완전·모호 표기**다. → `ambiguous_day_name` 후보로만 등재하고 **이번 판에서 잡지 않는다**.
  - 발생률 정정: **확정 오류 KO 타이밍 턴 1/2**(이전 보고의 「2/2」는 본부 과대 판정 — 정정). EN은 구체 날짜를 회피해 0/2.
  - 부수 관찰: `timing` 필드의 **오행 수준 주장은 3/3 정확**했다. 실패는 **자유 문장 안의 친근명(동물 이름)**에서만 났다 — 프롬프트 예시에 심긴 토큰과 정확히 겹친다.
- **원인(강한 가설)**: 프롬프트 **예시 문자열에 실제 간지가 박혀 있다.** 조립된 person 프롬프트 안에 「물 호랑이」가 **4회**(route.ts:570·571·572·704), "Water Tiger"가 2회 등장한다. 모델이 지시문의 예시를 실제 데이터로 착각해 베낀다.
- 타이밍은 `PREDICTION_RULES` B에서 우리가 **「이건 답한다」고 선을 그은 영역**이다. 그 영역에서 검증 가능한 사실을 틀리는 것은 말투 문제가 아니라 **정확성 결함**이다.
- **기준 커밋 `BASE_SHA` = `d6cda51b3da45ef97290533b705d2dae1d6b21cc`** (104A + 104A-FIX ff-only 병합 완료본, 본부 실측 확정). `9054808ea79ba0d605952ecc23d162105ea7d7fc`는 **병합 전 기준**으로만 기록하며 이 판의 BASE_SHA가 **아니다**.

  작업 시작 시 아래를 실행하고, **셋 중 하나라도 `BASE_SHA`와 다르면 코드 작업 없이 중단·보고**한다:

  ```bash
  git fetch origin
  BASE_SHA=d6cda51b3da45ef97290533b705d2dae1d6b21cc
  git checkout main && git pull --ff-only
  test "$(git rev-parse HEAD)"                        = "$BASE_SHA" || { echo "STOP: HEAD 불일치"; exit 1; }
  test "$(git rev-parse origin/main)"                 = "$BASE_SHA" || { echo "STOP: origin/main 불일치"; exit 1; }
  test "$(git merge-base HEAD origin/main)"           = "$BASE_SHA" || { echo "STOP: merge-base 불일치"; exit 1; }
  echo "BASE_SHA 3중 일치 확인"
  ```
- **전용 브랜치 `fix/105-date-pillar`에서만 작업.** main 직접 push·force push·rebase·병합 금지.
- 기준 테스트: **910 = 906 passed + 4 expected fail** 〔`d6cda51`에서 본부 재실행 확인 — tsc exit 0·vitest exit 0〕. 이 판은 신규 테스트만큼 늘어난다.
- lint baseline: **39 problems (24 errors, 15 warnings)** — 신규 0.

## §1 공정 (커밋 정확히 3개)

1. **보관**: 이 문서를 `docs/briefs/BRIEF-105.md`로 바이트 그대로 저장 → `sha256sum`·`wc -c`를 발사 기준값과 대조(불일치 시 중단·보고) → 단독 커밋.
2. **코드**: §2 구현 + §3 테스트.
3. **보고서**: `docs/reports/BRIEF-105.md`.

푸시: `git push -u origin fix/105-date-pillar`.

## §2 변경 사양 (정확히 2건)

### 2.1 [탈오염] 프롬프트 예시에서 실제 간지 제거 — `src/app/api/ask/route.ts`

대상 4곳: **:570 · :571 · :572 · :704**. 「물 호랑이」·「임인(壬寅)」·"Water Tiger"를 **플레이스홀더로 교체**한다.

- 교체 규칙: 한국어 예시는 `<간지>(<한자>)일`·`'<날 이름>' 날`·`<날 이름> 기운이…` 형태로, 영어 예시는 `a <Day Name> day`·`with this <Day Name> energy…` 형태로 쓴다.
- **실제로 존재하는 간지·동물·오행 조합을 예시에 단 하나도 남기지 말 것.** 60갑자 어느 것도, 「나무 쥐」류 친근명 어느 것도 예시에 넣지 않는다.
- **바꾸는 것은 예시 표기뿐이다.** 규칙 문장의 의미(최초 1회만 정식 명칭 + 친근명 / 이후 짧은 핸들만 / 연속 두 답변이 같은 문장으로 시작 금지)는 **그대로 유지**한다. 문장을 다시 쓰지 말고 예시 토큰만 갈아끼운다.
- 완료 증명: `grep -nE "물 호랑이|Water Tiger|임인|壬寅" src/app/api/ask/route.ts` → **0건**.

### 2.2 [신설] 날짜–간지 결정적 검증 — 위반 유형 `date_pillar_mismatch`

**예시 제거만으로 끝내지 않는다.** 모델이 뱉은 (날짜, 간지/날 이름) 조합을 **서버가 이미 계산해 둔 기준표와 대조**한다.

1. **기준표**: `buildAskSystem`에 넘어가는 것과 **같은 `dailyPillars` 배열**(90일)로 맵을 만든다 — `date → { stemEn, branchEn, friendlyKo, friendlyEn, ganziHangul, ganziHanja }`. 새로 계산하지 말고 **이미 있는 값을 그대로 쓴다**(`src/lib/saju.ts` 무접촉 — 읽기만).
2. **검증 컨텍스트**: `AskValidationCtx`에 이 맵과 `todayDate`를 **추가**한다(기존 필드 무변경). `validateAskAnswer`가 사용자 노출 텍스트 전부(`parts[].text` + `timing` + `text` + `followUp`)를 검사한다.
3. **파싱**: `src/lib/hiddenTruth.ts`의 기존 `splitSentences`로 문장 단위로 쪼갠 뒤, 한 문장 안에 **날짜 표현**과 **간지·날 이름 토큰**이 함께 나타나면 대조한다. 날짜가 없는 간지 언급은 검증 불가로 **넘어간다**(오탐 방지).
   - **날짜 해석 규칙(연도 없는 표기 주의)**:
     - `YYYY-MM-DD` → 기준표에서 직접 조회.
     - `M월 D일` / `Month D`(연도 없음) → **기준표 90일 안에서 같은 월·일 후보를 찾아 후보가 정확히 1개일 때만 검증**한다. 0개거나 복수면 **검증하지 않고 soft diagnostic**만 남긴다(연말을 넘는 90일 창에서 연도를 현재 연도로 고정하면 오판이 난다).
     - 「오늘」·"today" → `todayDate`에 정확히 매핑.
     - **기준표 범위 밖 날짜는 mismatch로 판정하지 않는다.**
   - **토큰 어휘**: 60갑자 한글·한자, 친근명은 **오행×동물 전체 조합**(「쇠 원숭이」/"Metal Monkey"). **동물명 단독(「원숭이」)·오행 단독(「금」)은 이번 판의 검증 대상이 아니다** — 부분 일치는 오탐 위험이 커서 P0에 넣지 않는다. 부분 명칭만 등장한 문장은 **검증 없이 통과**시키고 그 사실을 diagnostic으로 남긴다.
   - **괄호 주의**: 날짜는 본문에, 날 이름은 괄호에 있는 형태(`8월 18일(물 호랑이 날)`)가 실제 실패 사례다. `splitSentences`가 괄호를 본문과 **다른 단위로 쪼개지 않는지** T2·T7에서 반드시 확인할 것 — 쪼개지면 검증이 통째로 빠진다.
4. **판정**: 문장 안 날짜의 기준표 값과 언급된 간지·날 이름이 다르면 → `{ type: 'date_pillar_mismatch', detail: '<date>|<claimed>|<correct>' }`.
5. **교정**: `buildCorrectionWarnings`에 항목 추가 — 경고문에 **정답을 명시**한다. 예: `⚠ DATE–PILLAR MISMATCH — You wrote "<claimed>" for <date>, but <date> is "<correct>". Use the DAILY PILLARS table verbatim or omit the day name. Regenerate.` (기존 「1차 콜 + 공유 추가 콜 최대 1회」 예산 규칙은 **그대로**. 새 호출을 늘리지 않는다.)
6. **최종 보정(안전한 자동 수정)**: 교정 후에도 불일치가 남거나 예산이 이미 소진됐으면, **날 이름 부분만 제거**한다 — `(물 호랑이 날)`·`— '물 호랑이' 날`·`(Water Tiger day)`처럼 **괄호·삽입구로 붙은 경우에만** 제거하고 문장은 남긴다. 괄호·삽입구가 아니면 **자르지 말고 soft 플래그만**(문장 훼손 금지).
   - **제거 후 재검증 필수**: 제거한 뒤 **사용자 노출 문자열 전체를 다시 모아 재검사**해 `date_pillar_mismatch`가 사라졌는지 확인한다. 제거 **전** 위반 내역은 보고·로그 diagnostic에 보존하되, **사용자 응답 본문에는 내부 경고·플래그 문구가 한 글자도 섞이지 않아야 한다.**
7. `applyFinalDisposition`·`stageOf`에 새 유형을 반영한다.

## §3 테스트 (정확히 7건)

- **T1** 기준표 생성: `dailyPillars`로 만든 맵이 2026-08-18 → 「나무 쥐 / Wood Rat / 갑자 / 甲子」를 준다.
- **T2** 실패 재현(회귀 고정): 답변 텍스트 「다음 주 화요일인 8월 18일(물 호랑이 날)은 흐름이 부드러워…」 → `date_pillar_mismatch` **1건**, detail에 `2026-08-18`·`물 호랑이`·`나무 쥐` 포함.
- **T3** 정상 통과: 「8월 14일(**쇠 원숭이** 날)」 → 위반 0. (모델 실측 출력은 「원숭이 날」이었으나 **동물 단독은 이번 판의 파서 계약 밖**이라 테스트는 전체 명칭으로 쓴다 — §2.2.3 참조.)
- **T4** 영어: "Tuesday, August 18 is a Water Tiger day" → 위반 1 / "…a Wood Rat day" → 위반 0.
- **T5** 오탐 방지: 날짜 없이 간지만 언급(「물 호랑이 기운이…」) → 위반 **0**.
- **T6** 교정 경고: `buildCorrectionWarnings`가 정답 문자열을 포함한 경고를 만든다.
- **T7** 최종 보정: 괄호형 「8월 18일(물 호랑이 날)」 → 「8월 18일」로 축약되고 나머지 문장은 보존 / 비괄호형은 **변경 없이** soft 플래그.

**「정확히 7건」의 의미**: 신규 Vitest `it`/`test` **선언이 정확히 7개**다. T4와 T7은 **각각 한 선언 안에서 정상·위반 양쪽 assertion을 수행**한다(선언을 쪼개지 말 것 — 쪼개면 아래 산술이 깨진다).

수치 기대: **910 + 7 = 917 = 913 passed + 4 expected fail**. 실측을 보고서에 기재(다르면 사유 명기).

## §4 완료 기준

- `npx tsc --noEmit` 0
- lint: 전체가 **24E/15W 초과 금지**(신규 0), `git status --porcelain` 청정 상태에서 측정·출력 첨부
- `npx vitest run` §3 기준 통과(`set -o pipefail` + `PIPESTATUS`로 exit 별도 포착)
- `npm run build` 성공
- **`grep -nE "물 호랑이|Water Tiger|임인|壬寅" src/app/api/ask/route.ts` → 0건** (출력 첨부)
- **BASE_SHA 3중 일치 확인 출력 첨부**(`HEAD` · `origin/main` · `merge-base`)
- 제거 보정이 동작한 경우 **사용자 노출 문자열에 내부 경고 문구 0건**임을 테스트로 확인
- **조립 프롬프트 회귀 확인**: `scripts/verify/prompt-assembly.mjs` 통과 + `buildAskSystem` 결과에 실제 간지 예시가 없음을 보고서에 기재
- 보고서 `docs/reports/BRIEF-105.md` 커밋
- 채팅 보고: 커밋 3종 + 보관본 sha256·바이트 대조 + 테스트 수치 + grep 0건 출력

## §5 금지사항

- **말투·문체 관련 규칙 문장 수정 금지**(104B 영역). 이 판은 **사실 정확성만** 다룬다.
- `src/lib/**` 무접촉(`saju.ts`는 읽기만). 전송 페이로드·API 라우트 계약 변경 금지.
- **API 호출 예산 증가 금지** — 공유 추가 콜 1회 규칙 유지.
- 오탐을 감수하고 잡지 말 것: 날짜가 없으면 검증하지 않는다. 문장을 자르는 자동 보정은 **괄호·삽입구 형태에만**.
- `samples/voice-baseline/**` 무접촉(기준선 데이터는 이 판의 대상이 아니다). 재수집 금지.
- main 직접 push·force push·rebase·병합 금지.

## §6 근거

- 실패 실측: BRIEF-104A 기준선 `-KO-run2.json` 턴 3(**확정 오류**). `-KO-run1.json` 턴 3은 **모호 표기**로 재분류(§0) — 회귀 테스트의 P0 재현 사례는 **「8월 18일(물 호랑이 날)」 하나로 충분**하다.
- 정답 실측: `getDailyPillars('2026-08-11', 90)` — 08-14 = 庚申(Yang Metal / Monkey), 08-18 = 甲子(Yang Wood / Rat) 〔본부 실측〕.
- 프롬프트에 정답이 들어 있음: 조립 결과에 `2026-08-18 (Tue): Yang Wood / Rat — wood` 포함 〔본부 실측〕.
- 오염원: `route.ts` :570 · :571 · :572 · :704 〔본부 grep 실측 — 「물 호랑이」 4회, "Water Tiger" 2회〕.
- 연결 지점: `AskViolationType` :811 · `validateAskAnswer` :835 · `applyFinalDisposition` :989 · `buildCorrectionWarnings` :1070 · `stageOf` :1050.
