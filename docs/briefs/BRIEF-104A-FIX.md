# BRIEF-104A-FIX — 지표 재산출 (API 호출 0 · 재수집 금지)

## §0 맥락 (이 문서가 요구사항의 전부다)

- 대상: **Attune** — 폴더 `~/projects/attune`, 저장소 `github.com/Farerworks/attune`.
- 목적: BRIEF-104A로 **이미 수집된 raw 응답은 그대로 두고**, 지표 정의의 결함 3건만 고쳐 **지표를 다시 계산**한다. **모델을 다시 부르지 않는다.**
- 결함은 **본부 지시문(BRIEF-104A §3)의 오류**다. 하네스는 사양대로 구현됐다 — 이 판은 하네스 탓이 아니다.
- **기준 브랜치**: `feat/104a-voice-baseline` = `9b0feb4…`(작업 전 `git fetch origin && git checkout feat/104a-voice-baseline && git pull --ff-only && git log --oneline -1`로 확인. 다르면 중단·보고).
- `origin/main`은 `9054808…` 그대로여야 한다. **`src/` 전체 무접촉.**
- 기준 테스트: **910 = 906 passed + 4 expected fail** — 무변동.
- lint baseline: **39 problems (24 errors, 15 warnings)** — 신규 0, 하네스 단독 0E/0W 유지.

### 이 판만의 특례 (명시적 예외)
BRIEF-104A는 "커밋 정확히 3개"를 요구했다. **사후 발견 결함 수정을 위해 이 조건에 예외를 둔다** — 기존 3커밋은 **손대지 않는다**. **force-push·rebase·amend 전부 금지.** 아래 §1의 erratum 커밋을 **뒤에 추가**한다.

## §1 공정 (erratum 커밋 정확히 2개, 순서 고정)

1. **보관 커밋**: 이 문서를 `docs/briefs/BRIEF-104A-FIX.md`로 **바이트 그대로** 저장 → `sha256sum`·`wc -c`를 발사 메시지 기준값과 대조(불일치 시 중단·보고) → 단독 커밋.
2. **정정 커밋**: §2 하네스 수정 + §3 재산출 산출물 + §4 문서 정정.

푸시: `git push origin feat/104a-voice-baseline` (같은 브랜치에 추가 푸시).

## §2 하네스 수정 (`scripts/verify/voice-baseline.mjs`)

### 2.1 M4 — 후보 범위는 넓히되, **위반 확정은 하지 않는다**

- 한국어 후보 정규식을 일반형으로 교체: 기존 `할\s*거예요|될\s*거예요` → **`(항상|절대|반드시)` + `[가-힣]+(을|ㄹ)?\s*거예요|[가-힣]+(을|ㄹ)?\s*거야|[가-힣]+(을|ㄹ)?\s*겁니다|[가-힣]+(을|ㄹ)?\s*것입니다`** 계열(구현 방식은 재량, **`-ㄹ 거예요`가 임의 어간에 붙는 경우를 잡을 것**).
- 영어 정규식(`\b(always|never|will|definitely|guarantee[ds]?)\b`)은 **무변경**.
- **핵심 제약**: 이 열은 **후보 적중 수일 뿐이며 위반이 아니다.** 「아닐 거예요」·「없을 거예요」·「모를 거예요」 같은 **완곡한 부정·헤지 표현을 자동으로 단정 위반으로 확정하지 말 것.**
- TSV에 다음 열을 **신설하고 값은 공란으로 둔다**(판정은 본부·조언자): `M4_manual_first`, `M4_manual_final` — 값 영역 `YES`/`NO`/`UNCLEAR`.
- 기존 `M4_context_first`·`M4_context_final`(적중 문장 원문)은 유지하고, 넓어진 정규식 기준으로 다시 채운다.

### 2.2 M6 — 정규식과 무관하게 **모든 finalPass 턴**에 수동 판정 칸

- 기존 자동 열(`M6_first`·`M6_final`·`M6_context_*`)은 유지.
- 신설: `M6_manual_final`(`YES`/`NO`/`UNCLEAR`) + `M6_manual_evidence` — **24턴 전부에 행이 존재해야 한다**(정규식 적중이 0인 턴도 포함). 값은 **공란**.
- 판정 정의를 `scripts/verify/README.md` §5에 적을 것: **"상대의 속마음·동기·미래 반응을, 사용자가 알려준 사실이나 반복 관찰 없이 서술했는가."** 키워드가 없어도 대상이다.

### 2.3 M7b — `N/A`를 별도 값으로 분리

- `M7b_verdict` 허용값을 **`YES` / `NO` / `UNCLEAR` / `N/A`** 로 확장.
- `N/A` = 형식이 달라 의미 반복 판정 대상이 아닌 턴(예: 완성 요청에 대한 메시지 초안). **`NO`와 절대 합산하지 않는다.**
- 집계 출력은 **두 값을 함께** 낼 것: `전체 후속 턴 기준 (YES / T2~T6 전체 20)` **그리고** `적용 가능 턴 기준 (YES / N/A 제외한 턴 수)`.

### 2.4 재수집 금지 보장

- `--metrics` 경로는 **네트워크를 타지 않는다.** 이 경로에서 `createLlmProvider`·`fetch`가 호출되지 않음을 코드 구조로 보장하고, 보고서에 **"이 판의 API 호출 수 = 0"**을 명기한다.
- `samples/voice-baseline/*.json` 4개 파일은 **바이트 무접촉.** 작업 전후 sha256을 보고서에 대조 기재한다(4개 전부).

### 2.5 selftest 확장

`--selftest`에 아래를 추가하고 전부 `ALL PASS`여야 한다(실패 시 exit 1):
- M4_KO 일반형이 「반가워할 거예요」·「아닐 거예요」를 **둘 다 후보로** 잡는다(둘 다 적중 = 2).
- M4는 위반 판정 열을 스스로 채우지 않는다(수동 열이 공란으로 생성된다).
- M7b 집계가 `N/A`를 분모에서 제외한다(예: YES 4 / NO 0 / N/A 1 → 전체 4/5, 적용 가능 4/4).

## §3 재산출

- `--metrics` 실행 → **새 파일** `samples/voice-baseline/metrics-20260811-v2.tsv` 생성. **기존 `metrics-20260811.tsv`는 감사 추적용으로 남긴다**(삭제·덮어쓰기 금지).
- 두 TSV의 행 수·턴 순서는 동일해야 한다(24행 + 헤더).

## §4 문서 정정

- `scripts/verify/README.md` §5에 **erratum 절**을 추가: 무엇이 왜 틀렸는지(M4 한국어 정규식이 `-ㄹ 거예요` 일반형을 놓침 / M6 정규식이 키워드 없는 속마음 추정을 못 잡음 / M7b가 `N/A`를 `NO`로 흡수), 재수집을 하지 않은 이유(raw 응답 보존·지표는 순수 함수).
- `docs/reports/BRIEF-104A.md`에 **§9 erratum** 절을 **추가**한다(기존 절 수정 금지 — 원 보고서는 그대로 두고 뒤에 붙일 것). 내용: 정정 3건, 새 TSV 경로, raw JSON 4개 sha256 무변동 대조표, **API 호출 0**, erratum 커밋 2개 해시.

## §5 완료 기준

- `npx tsc --noEmit` 오류 0
- lint: 전체가 **24E/15W를 넘지 않을 것**(신규 0) + `scripts/verify/voice-baseline.mjs` 단독 **0E/0W**. `git status --porcelain`에 커밋 대상 외 파일이 없는 상태에서 측정하고 출력 첨부.
- `npx vitest run` **910 = 906 + 4** 무변동
- `--selftest` → `ALL PASS`(§2.5 신규 항목 포함)
- **`git diff origin/main --name-only`에 `src/` 경로 0건**
- **raw JSON 4개 sha256이 작업 전후 동일**(대조표 첨부)
- **API 호출 0** 명기
- 기존 3커밋 해시(`66d5527`·`d1e2858`·`9b0feb4`)가 **그대로 존재**함을 `git log --oneline`으로 증명(재작성 없음)
- 채팅 보고: erratum 커밋 2종 해시 + 보관본 sha256·바이트 대조 결과 + 새 TSV 경로 + M4 후보 수 변화(구/신) + `M6_manual_final` 행 24개 생성 확인

## §6 금지사항

- **force-push·rebase·amend·기존 3커밋 수정 전부 금지.**
- **모델 재호출 금지**(API 호출 0). `samples/voice-baseline/*.json` 바이트 수정 금지.
- 기존 `metrics-20260811.tsv` 삭제·덮어쓰기 금지.
- `src/` 전체 무접촉. `package.json`·`package-lock.json` 수정 금지.
- **수동 판정 칸(`M4_manual_*`·`M6_manual_final`·`M7b_verdict`)을 farr02가 채우지 말 것** — 열만 만들고 공란.
- 헤지 표현을 단정 위반으로 자동 확정 금지(§2.1).
- main 직접 push 금지.

## §7 근거

- 결함 3건의 근거 데이터: `metrics-20260811.tsv` — KO 양 런 턴4가 「마음을 닫은 건 **아닐 거예요**」로 시작하는데 `M4=0` / KO 턴2·턴5의 속마음 서술이 `M6=0` / T6 4건이 `NO`로 합산되어 반복률이 실제보다 낮게 읽힘.
- 관련 코드: `M4_EN` :151 · `M4_KO` :152 · `jaccard`/M7 :203–229 · `MEMORY_CAP` 주석 :806.
