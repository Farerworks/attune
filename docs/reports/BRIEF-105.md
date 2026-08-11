# BRIEF-105 — 날짜–간지 사실 오류 차단 (예시 탈오염 + 결정적 검증)

## 0. 작업 브랜치

이 판의 모든 커밋은 `main`이 아니라 `fix/105-date-pillar`에만 존재한다. `origin/main`은 시작부터 끝까지 `d6cda51b3da45ef97290533b705d2dae1d6b21cc` 그대로다.

## 1. BASE_SHA 3중 확인

```
$ git fetch origin
$ BASE_SHA=d6cda51b3da45ef97290533b705d2dae1d6b21cc
$ git checkout main && git pull --ff-only
$ test "$(git rev-parse HEAD)" = "$BASE_SHA"          # OK
$ test "$(git rev-parse origin/main)" = "$BASE_SHA"   # OK
$ test "$(git merge-base HEAD origin/main)" = "$BASE_SHA"  # OK
BASE_SHA 3중 일치 확인
```

§0.5 보관본 대조: `docs/briefs/BRIEF-105.md` — 12,529바이트 / sha256 `129c3a32ec2787e270206ba64f422f4c30b8c4f0cf9e6b175066ad3210e22ac6` — 발사 메시지 기준값과 **일치**.

## 2. 변경 파일·diff 요약

| 파일 | 내용 |
|---|---|
| `docs/briefs/BRIEF-105.md` | 브리프 원문 바이트 그대로 보관 (단독 커밋) |
| `src/app/api/ask/route.ts` | §2.1 예시 탈오염 4곳 + §2.2 `date_pillar_mismatch` 신설 (342줄 중 279줄) |
| `src/app/api/ask/route.test.ts` | 신규 7건 |
| `docs/reports/BRIEF-105.md` | 본 보고서 |

```
$ git diff --stat -- "src/app/api/ask/route.ts" "src/app/api/ask/route.test.ts"
 src/app/api/ask/route.test.ts |  73 +++++++++++
 src/app/api/ask/route.ts      | 279 ++++++++++++++++++++++++++++++++++++++++--
 2 files changed, 342 insertions(+), 10 deletions(-)
```

### 2.1 예시 탈오염 (route.ts :570·571·572·704)

「물 호랑이」·「임인(壬寅)」·"Water Tiger" 4곳을 플레이스홀더(`<날 이름>`·`<간지>(<한자>)`·`<Day Name>`)로 교체. 규칙 문장의 의미는 무접촉 — 예시 토큰만 갈아끼움.

```
$ grep -nE "물 호랑이|Water Tiger|임인|壬寅" src/app/api/ask/route.ts
(0건 — grep이 아무 줄도 출력하지 않음, exit 1)
```

실제 `buildAskSystem()` 출력(person 모드, todayIntroduced true/false 둘 다)에서도 재확인:
```
todayIntroduced=true  real-ganzi-hits=[] length=20224
todayIntroduced=false real-ganzi-hits=[] length=20238
```
(참고: 기존 20,233자 대비 소폭 변동 — 플레이스홀더 텍스트 길이 차이일 뿐, 바이트 동일성은 브리프 요구사항이 아니었음.)

### 2.2 `date_pillar_mismatch` 결정적 검증

- **기준표**: `buildDailyPillarLookup(dailyPillars)` — `dailyPillars`(POST가 이미 계산한 90일 배열)를 그대로 읽어 `date → {stemEn, branchEn, element, friendlyKo, friendlyEn, ganziHangul, ganziHanja}` 맵 생성. `saju.ts`는 이미 export된 `STEM_NAMES`/`BRANCH_NAMES`/`friendlyPillarName`만 읽었다(무접촉).
- **검증 컨텍스트**: `AskValidationCtx`에 `dailyPillarLookup?`·`todayDate?` optional 필드 추가 — 기존 필드 무변경, 기존 ctx 리터럴 전부 그대로 컴파일됨.
- **어휘**: `GANZI_VOCABULARY` — (stem×branch) 120쌍의 한글/한자 간지(스템 정확 일치 필요) + 오행×동물 친근명(오행만 일치하면 됨, 음양 무관 — 친근명 문자열 자체가 음양을 구분하지 않으므로). 토큰 문자열로 중복 제거.
  - **구현 중 발견·수정한 버그**: 처음엔 친근명도 (stem,branch) 단위로 토큰을 만들어, 예를 들어 "쇠 원숭이"가 Yang Metal과 Yin Metal 양쪽에서 중복 등록됐다. 이러면 텍스트 안에 정답 친근명이 있어도 "다른 stem" 항목과 대조돼 오탐(false mismatch)이 났다 — T3(정상 통과 케이스)에서 바로 잡혔다. 오행(`element`) 단위 매칭으로 고쳐 해결.
- **문장 파싱**: `splitSentences`로 나눈 뒤 날짜+간지 토큰이 같은 문장에 있을 때만 대조. 괄호형(`8월 18일(물 호랑이 날)`)이 다른 문장으로 안 쪼개지는 것 T2·T7에서 확인.
- **날짜 해석**: ISO 직접 조회 / `M월 D일`·`Month D`(연도 없음)는 90일 창에서 후보 정확히 1개일 때만 / 오늘·today는 `todayDate`. 범위 밖은 mismatch 판정 안 함.
- **교정**: `buildCorrectionWarnings`에 `date_pillar_mismatch` 케이스 추가 — 정답을 명시한 경고문.
- **최종 보정**: `applyFinalDisposition`에서 괄호·삽입구 3가지 형태(`(<token> 날)`·`(<token> day)`·`— '<token>' 날`)만 제거, 비괄호형은 무변경 + soft 플래그. 제거 후 `checkDatePillarSentence`로 재검증(§2.2.6 의무 조항) 수행.
- `applyFinalDisposition`·`stageOf`·`buildCorrectionWarnings`에 새 유형 반영 완료. 이번 판을 위해 `applyFinalDisposition`·`buildCorrectionWarnings`를 export(T6·T7 직접 테스트용 — 이 파일의 기존 관행: `tryPlainTextFallback`·`repairControlCharsInStrings` 등도 같은 이유로 export돼 있음).
- API 호출 예산 무변경 확인 — 새 콜 없음(기존 「1차+공유 1회」 그대로).

## 3. 테스트 (정확히 7건)

| # | 내용 | 결과 |
|---|---|---|
| T1 | 기준표: 2026-08-18 → 나무 쥐/Wood Rat/갑자/甲子 | PASS |
| T2 | 실패 재현: 「8월 18일(물 호랑이 날)」 → 1건, detail에 날짜·오답·정답 포함 | PASS |
| T3 | 정상 통과: 「8월 14일(쇠 원숭이 날)」(정답) → 0건 | PASS |
| T4 | 영어: "Water Tiger day"(오답) → 1 / "Wood Rat day"(정답) → 0, 한 선언 안에서 양쪽 확인 | PASS |
| T5 | 오탐 방지: 날짜 없이 간지만 언급 → 0건 | PASS |
| T6 | 교정 경고: `buildCorrectionWarnings`가 정답 문자열을 포함 | PASS |
| T7 | 최종 보정: 괄호형은 날 이름만 제거·문장 보존 / 비괄호형은 무변경+soft, 한 선언 안에서 양쪽 확인 | PASS |

`it()` 선언 정확히 7개(T4·T7이 각각 정상·위반 양쪽을 한 선언에서 확인).

수치:
```
$ npx vitest run
Test Files  45 passed (45)
     Tests  913 passed | 4 expected fail (917)
```
기대치 **917 = 913 passed + 4 expected fail**과 정확히 일치. `it.fails` 4건 무변동.

## 4. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 오류 0
- [x] lint — 청정 상태(`git status --porcelain`에 이번 판 커밋 대상 외 파일 없음, 저장소 루트의 기존 스크래치 파일은 측정 동안 `/tmp`로 임시 대피 후 원복) 측정: **39 problems = 24 errors + 15 warnings** — 베이스라인과 정확히 일치, 신규 0건(`route.ts`/`route.test.ts` lint 출력에 나타나지 않음).
- [x] `npx vitest run` — 917 = 913 passed + 4 expected fail
- [x] `npm run build` 성공
- [x] `grep -nE "물 호랑이|Water Tiger|임인|壬寅" src/app/api/ask/route.ts` → 0건
- [x] BASE_SHA 3중 일치 확인 (§1)
- [x] 사용자 노출 문자열에 내부 경고 문구 0건 — T7이 스트립 결과 문자열을 정확한 기대값과 `toBe()`로 직접 비교해 확인(경고/플래그 텍스트가 섞일 여지 없음 — 스트립 함수는 패턴 삭제만 하고 아무것도 삽입하지 않음).
- [x] 조립 프롬프트 회귀: `scripts/verify/prompt-assembly.mjs` 실행, `buildAskSystem` 실제 출력에 실제 간지 예시 0건(§2.1). **1건 무관한 기존 실패 발견** — 아래 §6 참조.

## 5. 커밋 해시

- 저장소: https://github.com/Farerworks/attune (브랜치: `fix/105-date-pillar`)
- 브리프 원문 보관: `33d5813`
- 코드+테스트 커밋: `e4b1f3d`
- 보고서 커밋: (본 커밋 자신 — 규약상 보고서는 자신의 해시를 적지 않는다)

## 6. 특이사항·판단

1. **친근명 토큰의 음양 중복 버그(구현 중 자체 발견·수정)**: §2.2에 기록. `friendlyPillarName`이 반환하는 문자열은 오행+동물만 반영하고 음양(Yang/Yin)을 구분하지 않는데, 처음엔 어휘를 (stem,branch) 단위로 만들어 같은 친근명 문자열이 서로 다른 stem 두 개에 중복 등록됐다. 이 때문에 **정답인 문장도 오탐**이 났다(T3에서 처음 잡힘: 8월 14일이 실제 庚申/Yang Metal인데, 어휘의 "쇠 원숭이" 항목 중 Yin Metal 쪽과 대조돼 mismatch가 발생). 친근명 토큰은 오행(`element`)만 비교하도록 고쳐 해결 — 간지 한글/한자 토큰(스템 고유 표기라 음양이 다르면 문자열 자체가 다름: 갑자 vs 을축)은 원래대로 스템 정확 일치를 요구한다.
2. **`prompt-assembly.mjs`의 무관한 기존 실패 1건**: `detectAskMode: "보낼 문장 써줘" (no count) -> null` 체크가 실패한다. 기준 커밋(`d6cda51`)에서 **이 판 이전에도 동일하게 실패**함을 `git stash`로 대조 확인 — completion 감지 로직은 이 브리프가 무접촉으로 못박은 "말투·문체 관련 규칙"(§5)이라 손대지 않았다. 이번 판이 만든 신규 실패가 아님을 명기한다.
3. 그 외 편차 없음.

## 10. Erratum (BRIEF-105-FIX — 다중 날짜 문장 과잉 짝짓기 차단)

이 절만 뒤에 덧붙인다. §1~§9는 원문 그대로 무수정.

### 10.1 무엇이 왜 틀렸었나

BRIEF-105의 `checkDatePillarSentence`는 한 문장에 날짜가 **여러 개** 있어도 문장 안의 **모든 날짜 × 모든 날 이름**을 전수 대조했다. 예를 들어 「이번 주 금요일인 8월 14일(쇠 원숭이 날)이나 다음 주 화요일인 8월 18일(물 호랑이 날)은…」 같은 문장에서, 모델은 "쇠 원숭이"를 08-14에, "물 호랑이"를 08-18에 붙였을 뿐인데, 검증기는 "쇠 원숭이 vs 08-18"·"물 호랑이 vs 08-14" 같은 **모델이 하지도 않은 조합**까지 대조해 거짓 위반을 만들었다. 본부가 BRIEF-104A 기준선 24턴 전수를 새 검증기에 통과시켜, 적중한 1턴의 detail 4건 중 2건이 이런 식으로 거짓임을 실측 확인했다. 이 거짓 detail이 `buildCorrectionWarnings`를 거쳐 모델에게 "네가 틀렸다"고 잘못 지적하면, 모델이 원래 맞았던 부분(08-14/쇠 원숭이)까지 고쳐버릴 위험이 있었다 — 정확성 검증이 오히려 정확한 문장을 망가뜨리는 경로.

### 10.2 면제·귀속 규칙

`checkDatePillarSentence`를 문장 안 **고유 날짜 개수**로 분기:

- **날짜 1개**: BRIEF-105 원래 동작 그대로 — 찾은 모든 날 이름 토큰을 그 하나의 날짜와 직접 대조.
- **날짜 2개 이상**:
  1. **면제**: 날 이름 토큰이 문장 속 **어느 날짜와도** 정답으로 일치하면(오행/스템 기준), 그 문장의 그 토큰은 위반이 아니다 — 모델이 옳게 붙인 것으로 인정.
  2. **귀속**: 면제되지 않은(=문장 속 어떤 날짜와도 안 맞는) 토큰만, 문자 위치 기준 **가장 가까운 날짜**에 귀속시켜 detail을 만든다. 거리가 같으면 문자열상 **더 앞선 날짜**를 쓴다.
  3. 위반 1건당 detail 1개 — 한 날 이름이 여러 날짜에 중복 기록되지 않는다.

구현: `extractDateMentions`가 날짜별 **문자 인덱스**까지 반환하도록 확장하고, `checkDatePillarSentence`에서 고유 날짜 수로 분기 후 `Array.prototype.reduce`로 최근접 날짜를 찾는다. 짝짓기 규칙 외 다른 부분(기준표 생성·교정 경고 문안·괄호 제거 방식)은 무접촉.

### 10.3 실측 사례 전후 detail 비교

원문(BRIEF-104A 기준선 KO-run2 턴3 재현, T9로 회귀 고정):
> 「이번 주 금요일인 8월 14일(원숭이 날)이나 다음 주 화요일인 8월 18일(물 호랑이 날)은 흐름이 부드러워 부담 없이 가볍게 안부를 묻기 좋아요.」

| | 수정 전 (BRIEF-105) | 수정 후 (BRIEF-105-FIX) |
|---|---|---|
| 위반 건수 | 4건(추정 — 본부 실측 기준 동일 계열 문장에서 2건이 거짓) | **1건** |
| detail | `2026-08-14\|물 호랑이\|쇠 원숭이` 등 거짓 포함 | `2026-08-18\|물 호랑이\|나무 쥐`만 |
| 08-14 관련 detail | 있었음(거짓) | **0건** |

(참고: "원숭이" 단독은 동물명 단독이라 이번 판에서도 파서 계약 밖 — 애초에 토큰으로 인식되지 않아 08-14 쪽은 검증 대상 자체가 아니다. §5 금지사항대로 이 계약은 넓히지 않았다.)

### 10.4 테스트

| # | 내용 | 결과 |
|---|---|---|
| T8 | 다중 날짜 면제: 「8월 14일(쇠 원숭이 날)이나 …8월 18일은…」 → 위반 0 | PASS |
| T9 | 다중 날짜 귀속(회귀 고정): 실측 실패 원문 → 정확히 1건, detail=`2026-08-18\|물 호랑이\|나무 쥐`, 08-14 포함 detail 0건 | PASS |

기존 T1~T7 전부 그대로 통과(회귀 0).

```
$ npx vitest run
Test Files  45 passed (45)
     Tests  915 passed | 4 expected fail (919)
```
기대치 **919 = 915 passed + 4 expected fail**과 정확히 일치.

### 10.5 완료 기준 자가점검

- [x] `npx tsc --noEmit` 오류 0
- [x] lint 청정 상태 측정: 39 problems = 24E/15W — 베이스라인과 정확히 일치, `route.ts`/`route.test.ts` 신규 0
- [x] `npx vitest run` 919 = 915 + 4
- [x] `npm run build` 성공
- [x] 기존 T1~T7 전부 회귀 없이 통과
- [x] 기존 3커밋(`33d5813`·`e4b1f3d`·`cec56f3`) `git log --oneline`에 그대로 존재(재작성 없음) — §10.6 참조

### 10.6 erratum 커밋 해시

- 저장소: https://github.com/Farerworks/attune (브랜치: `fix/105-date-pillar`)
- 보관 커밋: `f8724ec`
- 코드+테스트+보고서 커밋: (본 커밋 자신)
