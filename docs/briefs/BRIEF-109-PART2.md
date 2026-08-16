# BRIEF-109 PART 2 v1.1 — 공유 카드 PNG 한국어 라벨 (Copy STEP 6 · PART B)

> **PART 1을 먼저 끝낸 뒤 같은 브랜치에서 이어서 한다.**
> 브랜치: `feat/109-share-png-ko` / BASE_SHA: `9e7ca16c648e8faa5fd08b591e5f2398945b3e50`
> v1.1: 조언자 검수 반영 — KO fail-hard(§3.2)·판별 trim·글리프 목록 전체 문구화.

## 0. 범위 (한 기능): **공유 PNG가 한국어 카드일 때, 주변 라벨 13개를 한국어로 그린다.**

## 1. 왜 결함인가

중앙 인용문은 이미 한국어로 그려진다(`:214`). 주변 라벨 13개는 영어 상수 고정이라 **한 장 안에서 언어가 섞이고**, 라벨 폰트 `Space Mono`에는 **한글 글리프가 없어** 문자열만 바꾸면 두부(□)가 된다.

## 2. 언어 판별 — 새 체계 금지

`drawShareCard` **맨 앞**(첫 라벨 `:126`보다 위)에서 한 번 계산해 전부에 쓴다.

```ts
const quoteText = (b?.dynamic?.click?.takeaway ?? b?.dynamic?.clash?.takeaway ?? '').trim();
const langSource = quoteText || (b?.headline ?? '').trim() || (reading.situation ?? '').trim() || '';
const ko = /[가-힣]/.test(langSource);
```

- `quoteText` 선언(`:211`)을 **위로 올린다**(`.trim()` 추가 — `:212`의 공백 truthy도 함께 고쳐짐). `:214` 폰트 분기는 `ko` 사용으로 교체(동작 동일).
- **`navigator.language`·전역 locale·설정 화면 도입 금지.**

## 3. 폰트 — `DESIGN-DIRECTION` v2.1 원칙 8

`ko`인 라벨만: `ctx.font` = `'500 <기존 크기>px "Pretendard Variable"'`(**크기 현행 그대로** 33/30/30/27/24px, **공명도 500** — 결재 완료), `ctx.letterSpacing` = `'0px'`.
`ko`가 아니면 **현행 그대로** — 영어 카드는 이전과 픽셀 동일이어야 한다.

### 3.1 face 로드 — 빠뜨리면 두부가 그려진다

`Pretendard Variable`은 **dynamic subset**(`unicode-range` 분할)이라 `document.fonts.load()`의 **두 번째 인자(text)가 필수**다. KO 글리프 상수를 만들고(파일 상단), 기존 preload 블록(`:276~280`)에 **한 줄 추가**한다(기존 5줄 삭제 금지):

```ts
const KO_GLYPHS = '우리의 흐름 누구를 단정하는 말이 아니에요 사주 기반 강한 흐름 엇갈린 신호 천천히 쌓이는 관계 나 상대 목 화 토 금 수';
// preload 블록 안:
document.fonts.load('500 30px "Pretendard Variable"', KO_GLYPHS),
```

### 3.2 KO fail-hard — 두부 PNG를 「성공」으로 주지 않는다

현재 preload는 실패를 조용히 삼킨다. **EN은 현행 유지.** 단 `ko`이면 preload 후 확인하고, 실패 시 **PNG를 만들지 않는다**:

```ts
if (ko && !document.fonts.check('500 30px "Pretendard Variable"', KO_GLYPHS)) {
  setRendering(false); return;   // dataUrl null 유지 → 기존 'Could not render card.' 뷰
}
```

새 오류 문구·새 뷰 금지 — **기존 실패 뷰 재사용**. 판별식은 render()에서도 계산할 수 있게 둔다.

## 4. 문구 — 확정본. 한 글자도 바꾸지 말 것

| 위치 | EN(유지) | KO |
|---|---|---|
| `:129` | our dynamic | 우리의 흐름 |
| `:229` | not a verdict on anyone | 누구를 단정하는 말이 아니에요 |
| `:250` | POWERED BY SAJU | 사주 기반 |
| `:20`~`:22` 공명 | STRONG CURRENT / MIXED SIGNALS / SLOW BUILD | 강한 흐름 / 엇갈린 신호 / 천천히 쌓이는 관계 |
| `:189`·`:190` 범례 fallback | me / them | 나 / 상대 |
| 축 5개 | wood/fire/earth/metal/water | 목 / 화 / 토 / 금 / 수 |

- 공명은 `RESONANCE_POSTER` 옆에 KO 맵을 신설(EN 맵 삭제 금지).
- 축 라벨은 PART 1 옵션으로 — `ko`일 때만 `axisLabels`·`axisFont`(`'500 30px "Pretendard Variable"'`)·`axisLetterSpacing`(`'0px'`) 전달.
- 범례 fallback 조건(이름·아키타입 둘 다 없을 때만) 불변.
- **`:245`의 `ATTUNE`은 번역하지 않는다.**

## 5. 테스트 — `ShareModal.test.tsx`(없으면 신규). `ctx` 스파이로 `font`·`letterSpacing`·`fillText` 인자 검사.

1. KO `takeaway` → `fillText`에 `우리의 흐름`·`누구를 단정하는 말이 아니에요`·`사주 기반` 포함
2. KO → `font`에 `"Pretendard Variable"` 1회 이상 + `letterSpacing='0px'`
3. EN → `our dynamic`·`POWERED BY SAJU` 포함, `"Pretendard Variable"` **0회**
4. `takeaway` 공백 + `headline` 한국어 → KO 판정(fallback 체인)
5. `ATTUNE`은 양쪽 모두 그대로
6. 공명 `strong-current` + KO → `강한 흐름`
7. KO + `fonts.check` false 모킹 → `fillText` 미호출·`dataUrl` 미생성(기존 실패 뷰)

## 6. 금지 사항

1. **`MyCardModal.tsx` 무접촉** 2. EN 산출물의 폰트·자간·크기·좌표 변경 금지 3. 인용문 폰트 분기 변경 금지(판별 변수만 `ko`로) 4. `ATTUNE` 번역·확정 문구 임의 수정 금지 5. 새 폰트 추가 금지(`Pretendard Variable`은 `layout.tsx:74`에 기로드) 6. `navigator.language`·전역 locale 금지 7. main 직접 push/force push/rebase/merge commit 금지

## 7. 완료 기준

1. `npx tsc --noEmit` 0 2. lint 39(24E/15W) 이하 3. vitest 기준 **979+4 expected fail** — passed 신규만큼 증가·expected fail 4 불변 4. build 성공 5. PART 1+2 합계 변경 파일 = `shareChart.ts`·`shareChart.test.ts`·`ShareModal.tsx`·`ShareModal.test.tsx` + `docs/briefs/` 보관 2개. **`MyCardModal.tsx` 미포함일 것** 6. 브랜치 push. **병합 금지** — 본부 검수 후 별도 지시

> **⚠ 육안 검증은 완료 기준이 아니다** — 배포 후 본부·YS가 한다. 「육안 확인 완료」 대신 **우려 좌표를 지목**해 보고할 것.

## 8. 보고 양식

```
BASE_SHA 확인: / 브랜치·커밋(PART1·2 각각):
변경 파일(git diff --stat 원문):
tsc: / lint: / vitest: / build:
추가 테스트 목록: / MyCardModal 무접촉 보장 방법:
육안 검증 필요 좌표: / 막힌 점:
```
