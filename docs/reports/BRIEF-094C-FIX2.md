# BRIEF-094C-FIX2 — 상단 고정 회귀 교정: 래퍼가 sticky를 무력화

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `src/app/(tabs)/ask/page.tsx` | `KeyboardPannedTop`만 수정 |
| `src/app/(tabs)/ask/page.test.tsx` | 신규 1건 |

## 2. 구현 요지

**원인** — BRIEF-094C-FIX에서 추가한 `KeyboardPannedTop`이 비활성(키보드 닫힘) 상태에서 `<div ref={ref}>{children}</div>`로 `TabTopBar`를 감쌌다. `sticky`는 **부모 박스 안에서만** 붙는데, 이 래퍼의 높이가 상단바 자신의 높이와 정확히 같아서 "붙어 있을 수 있는 남는 공간"이 0이 됐다 — 결과적으로 래퍼째로 스크롤되어 나가버렸다.

**수정 — 브리프 §1의 옵션 B 채택** — 비활성 상태의 래퍼에 `display: 'contents'`를 적용했다. `display: contents`는 그 요소 자체의 박스를 만들지 않고 자식만 부모 자리에 그대로 노출시키는 CSS 값이라, `TabTopBar`의 `position: sticky` div는 이 래퍼가 아니라 **원래의 진짜 부모(페이지 최상단 flex 컨테이너, `.ask-full`)**를 기준으로 동작하게 된다. 옵션 A(래퍼 완전 제거 + Fragment)보다 이쪽을 택한 이유: 기존 `ref` 하나로 높이 측정 로직을 그대로 재사용할 수 있어 변경 범위가 더 작다.

높이 측정도 함께 손봤다: 비활성 시 `ref`는 `display: contents` 래퍼 자신을 가리키는데, `display: contents` 요소는 자체 박스가 없어 `offsetHeight`가 항상 0이다. 그래서 `ref.current.firstElementChild`(TabTopBar의 실제 렌더 div)의 `offsetHeight`를 재는 것으로 바꿨다. 활성(키보드 열림) 상태의 측정·placeholder·`fixed`+`translateY` 로직은 브리프 지시대로 그대로 뒀다.

`useKeyboardInset`과 하단 입력부는 이번 브리프에서 전혀 건드리지 않았다.

## 3. 테스트

기존 sticky 상단 테스트 옆에, 이번 버그를 실제로 재현·검출할 수 있는 구조 검증 1건을 추가했다: 잔량 표기(`QUESTIONS LEFT TODAY`)에서 `position: sticky`인 조상을 찾은 뒤, **그 조상의 바로 위 부모**가 `.ask-full`(페이지 루트) 또는 `display: contents`여야 한다고 검증한다. 수정 전 코드(중간에 박스를 만드는 `<div ref={ref}>`)로는 이 조건을 만족하지 못해 실패했을 것 — jsdom이 sticky의 실제 동작(스크롤 시 붙는지)까지는 재현하지 못하므로, "붙을 공간이 있는 구조인가"를 대신 검증하는 방식이다.

기존 094B·094C·094C-FIX 테스트 전체 무회귀(356개 전체 통과).

## 4. 렌더 확인 — 1장 (실제 브라우저, Playwright, 390×844)

텔레그램으로 **전송함**.

24개 메시지짜리 긴 대화를 중간(뒤쪽)까지 스크롤한 상태(키보드 닫힘)에서 상단 ATTUNE·잔량·사람 칩이 화면에 그대로 고정되어 보이는 것을 확인했다 — FIX 이전 회귀 상태(사라짐)와 달리 정상.

## 5. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` — 356개 전체 통과 (기존 355 + 신규 1)
- [x] `npm run build` 성공
- [x] 렌더 확인 1장 — §4, 텔레그램 전송함
- [x] main push 완료 (커밋 해시는 §7)

## 6. 정직 보고

- 키보드 열림 시의 팬 보정 로직(`useKeyboardInset`, `fixed`+`translateY`)은 이번 브리프에서 손대지 않았고, 그 부분의 실기기 판정은 BRIEF-094C-FIX 보고서에서 이미 "판정 대기"로 남겨둔 상태 그대로다 — 이번 수정은 오직 **키보드 닫힘 상태의 회귀**만 겨냥했다.
- `display: contents`는 구형 Safari 일부 버전에서 접근성 트리 처리에 알려진 이슈가 있었으나, 이 프로젝트가 지원하는 최신 iOS Safari에서는 안정적으로 지원된다고 판단해 별도 폴백은 넣지 않았다.

## 7. 커밋 해시

- 저장소: https://github.com/Farerworks/attune
- 커밋 해시: `7c14443`
