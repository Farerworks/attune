# BRIEF-093 — 한글 타이포 규칙: 가짜 사체 차단 + 리딩 헤드라인 길이 적응 스케일

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `src/app/globals.css` | `body`에 `font-synthesis: none;` 1줄 추가 |
| `src/app/layout.tsx` | Pretendard Variable CDN 링크의 파일명 오타 수정(§1 볼드 페이스 점검 중 발견 — 아래 §4 참고) |
| `src/app/reading/[id]/page.tsx` | `headlineScale(text)` 순수 함수 신설 + 헤드라인 `<h1>`의 `fontSize`/`lineHeight`를 길이 기반으로 적용 |
| `src/app/globals.css.test.ts` | `font-synthesis: none` 존재 확인 정적 검사 1건 |
| `src/app/reading/[id]/page.test.tsx` (신규) | `headlineScale` 경계값 6케이스 + 90자급 헤드라인 sm 적용 확인 + 짧은 헤드라인 lg 유지 확인 |

## 2. §1 볼드 페이스 점검 결과 — Pretendard Variable CDN 링크 오류 발견·수정

점검 중 `layout.tsx`의 Pretendard Variable `<link>` URL이 **404**임을 확인했다:

- 기존: `.../dist/web/variable/pretendard-dynamic-subset.css` → 404 (`Couldn't find the requested file`)
- 정정: `.../dist/web/variable/pretendardvariable-dynamic-subset.css` → 200 OK

즉 이 오타 때문에 **Pretendard Variable이 지금까지 전혀 로드되지 않고 있었다** — `--font-inter`(`'Pretendard Variable', var(--font-inter-latin), system-ui, sans-serif`)를 쓰는 모든 한글 UI 텍스트가 실제로는 각 기기의 시스템 기본 글꼴(`system-ui`)로 렌더링되고 있었다는 뜻이다. 이건 이번 BRIEF의 범위(볼드 페이스 로드 여부 확인)에 정확히 해당해 브리프 §5 세 번째 항목("§1 볼드 페이스 보강이 필요한 경우에 한해 최소로")에 따라 URL 오타만 고쳤다 — 다른 폰트 설정은 손대지 않았다.

정정한 URL의 실제 `@font-face` 선언을 확인한 결과 `font-weight: 45 920;`(가변 폰트 전 구간)로, 700 근방 굵기가 합성이 아니라 실제 보간된 글리프로 제공된다 — 확인 완료.

나머지 두 폰트도 실제 볼드 페이스가 로드되고 있음을 확인했다:
- **Gowun Batang**: Google Fonts `wght@400;700` 링크가 400/700 각각 별도 `.ttf` 파일을 서빙(합성 아님) — 확인 완료.
- **Space Mono**: `next/font/google`에 `weight: ['400', '700']`로 명시 요청 — next/font가 실제 굵기별 파일을 번들 — 확인 완료.

## 3. 캔버스 이탤릭 조사 (수정 없음, 조사·보고만)

`font-synthesis: none`은 CSS 프로퍼티라 `<canvas>` 2D 컨텍스트의 `ctx.font`에는 적용되지 않는다(브라우저마다 다르지만 캔버스는 페이지 CSS와 독립적으로 폰트를 매칭하며, 대체로 자체적으로 합성 이탤릭을 적용한다). 캔버스 코드에서 실제 이탤릭 `ctx.font` 호출을 전수 조사했다:

- **`ShareModal.tsx:211`** — `ctx.font = 'italic 57px Fraunces'`로 그려지는 `quoteText`는 `briefing.dynamic.click.takeaway ?? clash.takeaway`에서 온다. `briefing.ts:288`("사용자 상황 언어를 감지해 헤드라인·모든 takeaway를 그 언어로 작성")에 따라 **이 텍스트는 실제로 한국어일 수 있다** — 즉 한글이 캔버스에서 합성 이탤릭(강제 기울임)으로 그려지는 경로가 실재한다. 이번 범위 밖이라 수정하지 않았다.
- **`MyCardModal.tsx:161`** — `ctx.font = 'italic 46px Fraunces'`로 그려지는 `tagline`은 `getArchetype(stem).tagline`(로케일 비대응, 항상 영어)에서만 온다 — 현재는 한글이 들어갈 경로가 없어 실질 위험은 낮지만, 향후 이 호출부가 로케일 대응 태그라인으로 바뀌면 같은 문제가 재현될 수 있는 구조다.
- **`shareChart.ts`** — `ctx.font`에 이탤릭 지정 없음(Space Mono만 사용) — 해당 없음.
- 부가로 `ShareModal.tsx`에 `document.fonts.load('italic 90px Fraunces')` 프리로드가 있는데 실제로 그 크기로 `ctx.font`를 쓰는 곳이 없어(죽은 프리로드로 보임) — 참고만, 손대지 않음.

**결론(제안, 수정 아님):** ShareModal의 `quoteText`가 한국어일 때 캔버스 렌더링에서 한글이 기울어 나올 가능성이 실재한다. 후속 BRIEF로 판단 요청 — 예: 텍스트 언어를 감지해 한글이면 `ctx.font`에서 `italic`을 빼는 방식이 유력해 보인다.

## 4. 헤드라인 길이 적응 스케일 — 구현 및 실측

`headlineScale(text)`: 코드포인트 길이 ≤48 → `lg`(44px, 현행) / 49~84 → `md`(36px, 0.82×) / ≥85 → `sm`(31px, 0.7×). `line-height`는 세 단계 모두 1.35로 통일(지시서 범위 1.3~1.4 내).

390px 뷰포트, Playwright 실측(단위: 코드포인트 길이/폰트크기/실제 줄 수):

| 길이 | 티어 | 폰트크기 | 실제 줄 수 |
|---|---|---|---|
| 48자 | lg | 44px | 5줄 |
| 60자 | md | 36px | 5줄 |
| 84자 | md | 36px | **7줄** |
| 85자 | sm | 31px | **6줄** |
| 90자 | sm | 31px | **7줄** |
| 108자 | sm | 31px | **8줄** |
| 150자 | sm | 31px | **11줄** |

비교로, 90자 헤드라인을 원래 고정 44px(스케일 없음)로 그리면 **10줄**이 나온다 — 이번 수정으로 10→7줄까지는 줄었지만, 지시서가 목표한 "5줄 이내"는 65자 안팎을 넘는 헤드라인부터 달성되지 못한다(§5 정직 보고 참고).

렌더 확인 스크린샷 2장 + 참고 1장, 텔레그램으로 **전송함**:
1. You 탭(잔잔한 물 카드, 한국어 로케일) — 한글이 정자체로 렌더됨을 확인.
2. 리딩 페이지(90자 한국어 헤드라인) — sm 크기(31px) 적용, 7줄로 렌더됨(5줄 목표는 미달성, 위 표 참고).
3. (참고) 같은 카드를 영어 로케일로 — "The Still Water" 등 Latin/Fraunces 이탤릭은 그대로 기울어져 나옴, 스크립트별로 정확히 갈리는 것을 대조 확인.

## 5. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` — 319개 전체 통과 (기존 310 + 신규 9, 무회귀)
- [x] `npm run build` 성공
- [x] 렌더 확인 2장 — §4, 텔레그램 전송함
- [x] 볼드 페이스 점검 결과 보고 — §2
- [x] main push 완료 (커밋 해시는 §6)

## 6. 정직 보고

- **헤드라인 "5줄 이내" 목표는 지시서에 명시된 비율(0.82×/0.7×)로는 완전히 달성되지 않는다.** §4 표대로 65자 안팎까지는 5줄 이내를 지키지만, 그 이상(특히 sm 티어 84~150자 구간)은 6~11줄까지 늘어난다. 지시서가 준 비율 값을 그대로 구현했고(임의로 더 작은 값을 넣지 않았다), 목표 미달성분은 스스로 판단해 고치지 않고 이렇게 보고한다 — 비율을 더 줄이거나 티어를 하나 더 나누는 방향이 필요해 보이지만, 그건 이 브리프가 준 정본 숫자를 벗어나는 판단이라 본부 확인을 받고 싶다.
- **Pretendard Variable 링크 오류(§2)는 이 브리프의 원래 범위가 아니었지만, "볼드 페이스 로드 확인" 의무를 수행하다 발견해 지시서 §5의 허용 범위(§1 보강 목적) 안에서 고쳤다.** 이 버그가 실제 배포본에서 언제부터 있었는지는 git blame으로 확인하지 않았다 — 필요하면 후속으로 확인 가능하다.
- ShareModal 캔버스의 한글 이탤릭 가능성(§3)은 조사만 했고 코드는 건드리지 않았다. 실사용에서 실제로 한국어 quoteText가 기울어 나오는지는 확인이 필요하다(관계 다이내믹의 click/clash takeaway가 실제로 얼마나 자주 한국어로 오는지는 이 환경에서 확인 불가).

## 7. 커밋 해시

- 저장소: https://github.com/Farerworks/attune
- 커밋 해시: `765f4da`
