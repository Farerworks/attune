# BRIEF-094F — 탭 상단 통일 2단계: People/You/Settings 제목을 고정 상단으로

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `src/components/TabTopBar.tsx` | `title?: string` prop 추가(ATTUNE 행 바로 아래, 같은 sticky 박스 안에 렌더) |
| `src/components/TabTopBar.test.tsx` | 신규 2건 |
| `src/app/(tabs)/people/page.tsx` | `<TabTopBar title="People" />`로 교체, `<TabHeader>` 제거 |
| `src/app/(tabs)/people/page.test.tsx` | 신규 1건 + 기존 1건 어서션 보정 |
| `src/app/(tabs)/you/page.tsx` | 동일하게 `title="You"` |
| `src/app/(tabs)/you/page.test.tsx` | 신규 1건 + 기존 1건 어서션 보정 |
| `src/app/(tabs)/settings/page.tsx` | 동일하게 `title="Settings"` |
| `src/app/(tabs)/settings/page.test.tsx` | 신규 1건 |
| `src/app/(tabs)/home/page.test.tsx` | 신규 1건(h1 부재 회귀 가드) |

## 2. 구현 요지

**`TabTopBar`의 `title` prop** — BRIEF-094E에서 Ask에 직접 구현했던 "ATTUNE 행 아래, 같은 고정 박스 안에 제목"을 공용 컴포넌트로 승격했다. `title`이 있으면 `<h1 className="t-h2" style={{margin:'0 0 12px'}}>{title}</h1>`을 ATTUNE 행 바로 아래에 렌더한다. 여백 로직은 "ATTUNE 행 아래에 뭔가(제목 또는 children) 있는가"를 하나의 조건(`hasBelow = Boolean(title) || Boolean(children)`)으로 묶어, 기존에 `children`만으로 판단하던 padding/marginBottom 분기를 그대로 확장했다 — `title` 없이 `children`만 쓰는 기존 Ask 케이스는 이 조건이 이전과 완전히 동일한 값으로 평가되므로 픽셀 변화가 없다. `title`도 `children`도 없는 기존 페이지 호출부(있다면)도 마찬가지로 무변화.

**3개 화면 적용** — People·You·Settings에서 `<TabTopBar .../>` 아래에 있던 `<TabHeader title="..." />` 호출을 지우고, 그 문자열을 `TabTopBar`의 `title` prop으로 옮겼다. 각 페이지의 나머지 콘텐츠·로직·카피는 전혀 건드리지 않았다.

**`TabHeader` 미사용 전환** — 이번 변경으로 `TabHeader` 컴포넌트를 실제로 쓰는 곳이 0개가 됐다(Ask는 BRIEF-094E에서, People/You/Settings는 이번에 전환). 지시대로 **`TabHeader.tsx` 파일은 삭제하지 않고 그대로 남겨뒀다** — 정리는 후속 소소 브리프에서 진행 예정.

Ask·홈은 이번 브리프에서 전혀 손대지 않았다.

## 3. 테스트

- `TabTopBar`: `title` 지정 시 sticky 박스 내부에 해당 텍스트의 `<h1>` 존재 / `title` 미지정 시 `<h1>` 부재 — 각 1건.
- People·You·Settings: 각 화면에 제목 텍스트가 정확히 1회 등장하고 sticky 조상 내부에 있음을 확인 — 각 1건.
- 홈: `<h1>`이 여전히 없음을 확인하는 회귀 가드 1건(신규 — 기존에 이 테스트가 없어서 새로 추가).
- 기존 People·You "Settings 링크는 header 안이 아니다" 테스트는 `TabHeader`(=`<header>`)가 이제 이 페이지들에 없으므로 null-안전하게 어서션을 보정했다(BRIEF-094E에서 Ask에 했던 것과 동일한 보정).
- 기존 전체 무회귀(365개 전체 통과).

## 4. 렌더 확인 — 3장 (실제 브라우저, Playwright, 390×844)

텔레그램으로 **전송함**.

1. People — 저장된 사람 10명으로 목록을 중간까지 스크롤한 상태에서 ATTUNE·"People" 제목이 상단에 그대로 고정되어 남아있음을 확인.
2. You — 여덟 글자 카드 아래까지 스크롤한 상태에서 ATTUNE·"You" 제목이 동일하게 고정됨을 확인.
3. Home — 이번 브리프의 수정 대상이 아님을 실제로도 확인: 여전히 무제목 지면, 기존 "오늘의 판" 구조 그대로 무변형.

## 5. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` — 365개 전체 통과 (기존 359 + 신규 6)
- [x] `npm run build` 성공
- [x] 렌더 확인 3장 — §4, 텔레그램 전송함
- [x] main push 완료 (커밋 해시는 §7)

## 6. 정직 보고

- `TabHeader.tsx`는 지시대로 삭제하지 않았지만, 현재 코드베이스 전체에서 실제로 import해 쓰는 곳은 0개다(정의 파일 자신 제외) — 다음 "소소 정리" 브리프에서 삭제 여부를 판단하면 될 것 같다.
- People/You/Settings 페이지 콘텐츠 자체(리딩 목록, 여덟 글자 카드, 설정 행 등)는 전혀 건드리지 않았으므로, 제목 위치 변경 외의 시각적 차이는 없다.

## 7. 커밋 해시

- 저장소: https://github.com/Farerworks/attune
- 커밋 해시: `a8b30de`
