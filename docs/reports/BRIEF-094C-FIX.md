# BRIEF-094C-FIX — iOS 키보드: Ask 입력창이 키보드에 가림 + 상단 고정 이탈

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `src/lib/keyboard.ts` | 새 훅 `useKeyboardInset()` 추가(기존 export 무변경) — `bottomInset`/`topOffset` 반환 |
| `src/lib/useKeyboardOpen.test.tsx` | `useKeyboardInset` 신규 테스트 2건 |
| `src/app/(tabs)/ask/page.tsx` | 하단 입력창 `bottom`을 `bottomInset` 반영, 이중 안전영역 패딩 제거, 상단 `TabTopBar`를 키보드 팬 보정 래퍼(`KeyboardPannedTop`, 신규 로컬 컴포넌트)로 감쌈 |
| `src/app/(tabs)/ask/page.test.tsx` | 신규 1건 |

## 2. 구현 요지

**원인** — iOS는 키보드가 열려도 레이아웃 뷰포트를 줄이지 않고 보이는 영역(visual viewport)만 축소·이동시킨다. 그래서 `position: fixed; bottom: 0`은 키보드 뒤의 화면 맨 아래에 붙고, `sticky top: 0`은 보이는 영역 위로 밀려난다.

**`useKeyboardInset()`** — `window.visualViewport`의 `resize`·`scroll` 두 이벤트 모두 구독해(iOS는 키보드 연 상태에서 스크롤 시 `offsetTop`이 바뀐다) `bottomInset = innerHeight - vv.height - vv.offsetTop`(키보드가 가리는 높이), `topOffset = vv.offsetTop`(보이는 영역이 밀린 양)을 계산한다. `visualViewport` 자체가 없으면(SSR·데스크톱 구형 브라우저 등) `{0, 0}` 고정. 기존 `useKeyboardOpen`·`isKeyboardOpen`·`isTextInputElement`는 손대지 않고 추가만 했다.

**하단 입력부** — 키보드 열림 시 `bottom: 0` 대신 `bottom: bottomInset`으로 바꿔 입력창이 키보드 바로 위에 오도록 했다. `bottomInset`이 0이면(포커스 신호만으로 열림 판정된 데스크톱 등) 기존과 동일하게 동작한다. 키보드 열림 시 붙어있던 `env(safe-area-inset-bottom)` 추가 패딩은 제거했다(키보드 위에서는 홈 인디케이터 영역 자체가 없어 이중 여백이 됐던 부분).

**상단 고정** — `TabTopBar`를 감싸는 로컬 컴포넌트 `KeyboardPannedTop`을 새로 추가했다. 평소엔 스타일 없는 통과 `div`이고, 키보드가 열려 있고 `topOffset > 0`일 때만 내부를 `position: fixed; top:0; left:0; right:0; transform: translateY(topOffset)`로 전환해 실제 보이는 영역 쪽으로 끌어내린다. `TabTopBar` 컴포넌트 파일 자체는 무변경(다른 탭 공용이라 손대지 말라는 지시 준수) — 내부 `z-index: 50`이 그대로 유지되므로 별도 z-index 조정은 필요 없었다. 고정 전환 시 콘텐츠가 위로 당겨지지 않도록, 전환 직전 높이를 측정해 같은 높이의 placeholder를 자리에 남겨둔다(매 렌더마다 실제 높이를 재측정해 상태에 반영 — 새 의존성 없이 순수 훅으로 구현).

## 3. 테스트

- `useKeyboardInset`: ①`innerHeight 800·vv.height 500·offsetTop 40` → `{bottomInset:260, topOffset:40}` ②`visualViewport` 부재 시 `{0,0}`.
- Ask 페이지: 가짜 `visualViewport`(height 460, offsetTop 40)로 키보드 열림을 재현 — 입력창의 `fixed` 조상 `bottom` 값이 `300px`(=800-460-40)로 반영되는지 확인.
- 기존 094B·094C 테스트 전체 무회귀(355개 전체 통과).

## 4. 렌더 확인

키보드 닫힘(평상시) 상태에서 Ask 화면을 실제 브라우저(Playwright, 390×844)로 확인 — 상단 사람 칩/잔량, 하단 입력창 모두 기존과 동일하게 렌더되어 **회귀 없음**을 확인했다(텔레그램 전송하지 않음 — 이번 브리프는 평상시 화면 회귀 확인용으로만 자체 점검).

**iOS 실기기 온스크린 키보드로 인한 visual viewport 팬 현상 자체는 이 환경(Chromium/Playwright)에서 재현 불가** — Chromium은 iOS처럼 레이아웃 뷰포트를 고정한 채 visual viewport만 움직이는 방식으로 동작하지 않는다(가짜 `visualViewport` 이벤트로 로직만 단위 테스트에서 검증). 브리프 §5가 명시한 대로 최종 판정은 YS 실기기가 필요하다.

## 5. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` — 355개 전체 통과 (기존 352 + 신규 3)
- [x] `npm run build` 성공
- [x] 시뮬레이션 한계 인지 — §4, 로직은 단위 테스트로 검증했으나 **실기기 판정 대기**
- [x] main push 완료 (커밋 해시는 §7)

## 6. 정직 보고

- **실기기 판정 대기**: ①키보드 열면 입력창이 키보드 바로 위에 오는지 ②그 상태에서 ATTUNE+사람 칩이 상단에 보이는지 ③키보드 닫으면 원상복구되는지는 계산 로직 단위 테스트로만 검증했고, 실제 iOS Safari의 온스크린 키보드 동작으로는 확인하지 못했다. YS 실기기 확인이 필요하다.
- `KeyboardPannedTop`의 placeholder 높이는 "매 렌더마다 재측정"하는 방식이라, 전환 직후 한 프레임 정도 높이가 이전 값(전환 전 높이)을 쓰다가 즉시 보정될 수 있다 — 대부분 두 높이가 같아(내용 자체는 그대로, 위치만 바뀜) 육안으로 체감되는 점프는 없을 것으로 예상하나, 실기기에서 미세한 깜빡임 여부까지는 확인하지 못했다.

## 7. 비고 — Playwright 상설 설치

이번 렌더 확인부터 §5 지시대로 레포 밖 `~/tools/pw`의 상설 Playwright를 사용했다. 임시 설치·제거 왕복이 없어 `package.json`/`package-lock.json`은 처음부터 끝까지 무변경이었다.

## 8. 커밋 해시

- 저장소: https://github.com/Farerworks/attune
- 커밋 해시: (커밋 후 갱신 예정)
