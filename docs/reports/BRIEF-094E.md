# BRIEF-094E — Ask 상단 제목 통일형 재구성 (YS 결정: 1안)

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `src/app/(tabs)/ask/page.tsx` | 상단 고정 구조 재배치(제목+잔량 한 줄, 별도 `TabHeader` 제거), `ChipButton`에 `size` prop 추가(칩 슬림화) |
| `src/app/(tabs)/ask/page.test.tsx` | 신규 3건 + 기존 1건 수정(TabHeader 제거에 따른 어서션 보정) |

## 2. 구현 요지

**제목 통일** — 기존엔 「TabTopBar(ATTUNE+칩+잔량, 고정)」 아래에 별도 `<TabHeader title="Ask" />`가 있어 스크롤하면 "Ask" 제목이 사라졌다. 이번에 `TabHeader` 렌더를 완전히 제거하고, 그 자리에 있던 제목을 `TabTopBar`의 children 영역(=이미 고정된 블록) 맨 위 한 줄로 옮겼다. 좌측 `<h1 className="t-h2">Ask</h1>`(People/You와 동일 컴포넌트가 쓰는 클래스, 동일 타이포), 우측에 기존 잔량 텍스트를 같은 행에 `justify-content: space-between; align-items: center`로 배치했다. "Ask" 텍스트는 이제 화면에 정확히 1회만 존재하고, 스크롤해도 사라지지 않는다. `TabTopBar`·`TabHeader` 컴포넌트 파일 자체는 손대지 않았다(사용 방식만 변경).

**칩 슬림화** — `hasAnyThread`(대화가 하나라도 있는지)를 기준으로 분기했다. 첫 방문(대화 없음)은 기존 그대로(대형 칩 + 캡션, 온보딩 역할 유지). 대화가 하나라도 생기면 `ChipButton`에 새 `size="slim"`을 전달해 `minHeight 48→34`, `padding '12px 18px 12px 10px'→'6px 12px 6px 8px'`, `borderRadius 20→16`으로 축소했다. `+ Someone` 링크도 같은 비례로 축소(`minHeight 34`, `padding '8px 14px'`, `borderRadius 16`). 캡션(`YOU · TIMING · ANYTHING`, `ADD A PERSON`)은 원래도 `hasAnyThread` 상태에선 표시되지 않던 부분이라 변경 없음.

**구현 판단 1건 (보고 명시)** — 브리프 §2가 "이름 fontSize 13→12"를 옵션으로 제시해, 슬림 상태에서만 칩 라벨 fontSize를 13→12로 줄였다(공간이 좁아진 슬림 칩에 맞춘 선택). 오행 점/아바타 크기(26px)는 "현행 유지" 쪽을 택해 그대로 뒀다.

**구현 판단 2건 (보고 명시)** — 브리프 §1이 잔량 텍스트를 "현행 모노 스타일, fontSize 10"이라고 적었는데, 실제 기존 코드는 `fontSize: 11`이었다. "현행"이라는 표현을 우선해 스타일 자체는 그대로(11px) 두고 위치만 옮겼다 — 새로 10px로 줄이는 게 아니라 "지금 있는 스타일을 유지한 채 재배치"가 브리프의 핵심 의도라고 판단했다.

`useKeyboardOpen`·`useKeyboardInset`·`KeyboardPannedTop`은 지시대로 로직을 전혀 바꾸지 않았다 — children이 커졌을 뿐, 감싸는 방식은 동일하다. 전송·쿼터 차감·스레드 저장·프리필 로직도 무변경.

## 3. 테스트

- `"Ask" renders exactly once, inside the fixed/sticky top block`: 화면에 "Ask" 텍스트가 정확히 1개 + sticky/fixed 조상 안에 있음을 확인.
- `the quota text sits in the same row container as the "Ask" title`: 잔량 텍스트가 제목과 같은 부모 행 안에 있는지 확인.
- `chips are small once a conversation exists, and full-size on the empty first visit`: 빈 상태에서 `Me` 칩 `minHeight: 48px`, 스레드가 있는 상태에선 `34px`임을 확인.
- 기존 "Settings 링크는 header 안이 아니다" 테스트는 `TabHeader`(=`<header>`)가 이제 이 페이지에 없으므로 어서션을 null-안전하게 보정했다(의미는 동일 — Settings가 별도 헤더 블록 안에 있지 않음).
- 기존 094B(프리필)·094C(고정 프레임)·FIX·FIX2 테스트 전체 무회귀(359개 전체 통과).

## 4. 렌더 확인 — 3장 (실제 브라우저, Playwright, 390×844)

텔레그램으로 **전송함**.

1. 빈 첫 화면 — 대형 칩(YOU · TIMING · ANYTHING 캡션 포함)과 새 제목 행("Ask" + 잔량)이 함께 보임.
2. 24개 메시지 대화를 중간까지 스크롤 — ATTUNE·Ask 제목·소형 칩(캡션 없음)·잔량이 상단에 그대로 고정되어 남아있음.
3. People 탭 — "People" 제목의 위치·크기가 새 "Ask" 제목과 시각적으로 일치함을 확인(같은 `t-h2` 클래스, ATTUNE 바 바로 아래 좌측 정렬).

## 5. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` — 359개 전체 통과 (기존 356 + 신규 3)
- [x] `npm run build` 성공
- [x] 렌더 확인 3장 — §4, 텔레그램 전송함
- [x] main push 완료 (커밋 해시는 §7)

## 6. 정직 보고

- §2에서 밝힌 대로 잔량 텍스트 fontSize를 브리프가 적은 "10"이 아니라 기존 값 "11" 그대로 유지했다 — 브리프의 "현행"이라는 표현과 실제 코드가 1px 어긋나 있어, 재구성 범위를 벗어나지 않도록 보수적으로 판단했다. 시각적으로 체감되는 차이는 아니라고 본다.
- 칩 라벨 fontSize 13→12(슬림 상태만)는 브리프가 명시한 옵션 중 하나를 택한 것이라 카피/색 변경과는 무관하지만, 엄밀히는 "스타일 값 변경"이라 판단 근거를 여기 남긴다.

## 7. 커밋 해시

- 저장소: https://github.com/Farerworks/attune
- 커밋 해시: `b038c64`
