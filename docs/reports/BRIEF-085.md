# BRIEF-085 — 키보드 열릴 때 하단 탭바가 화면 중앙에 뜨는 문제 (iOS)

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `src/lib/keyboard.ts` (신규) | 순수 함수 `isKeyboardOpen(viewportHeight, windowHeight)` + 훅 `useKeyboardOpen()` |
| `src/lib/keyboard.test.ts` (신규) | `isKeyboardOpen` 단위 테스트 5건(닫힘/열림/경계값 2건/작은 갭) |
| `src/lib/useKeyboardOpen.test.tsx` (신규) | 훅 상태 전이 테스트 1건(`visualViewport` 목) |
| `src/components/TabBar.tsx` | `useKeyboardOpen()` 적용 — 열려 있으면 `transform: translateY(120%)` + `pointerEvents: 'none'`, 닫히면 원상복귀. 기존 `--dur-base`/`--ease-out` 토큰으로 트랜지션 |

컴포저(`ask/page.tsx`의 sticky 입력창), 다른 화면, 카피, 색은 전혀 건드리지 않았다.

## 2. 구현 요지 — 순수 함수 임계값 근거

```ts
const KEYBOARD_HEIGHT_THRESHOLD = 120;
export function isKeyboardOpen(viewportHeight: number, windowHeight: number): boolean {
  return windowHeight - viewportHeight > KEYBOARD_HEIGHT_THRESHOLD;
}
```

브리프가 예시로 든 `120`을 그대로 채택했다. 근거: iOS 키보드는 보통 260~340px(기기·언어별 다름)을 차지해 `windowHeight - visualViewport.height`가 그 정도로 벌어지는데, 반해 브라우저 크롬(주소창 접힘/펼침), 소프트웨어 홈 인디케이터, 회전 등으로 생기는 비주얼 뷰포트 오차는 보통 수십 px 이내다. 120px은 "실수로 생기는 뷰포트 오차"와 "실제 키보드"를 가르는 중간 지점으로, 키보드보다 한참 작고 일반적인 UI 오차보다는 한참 크다 — 오탐(false positive)과 미탐(false negative) 양쪽에 여유를 둔 값이다.

`useKeyboardOpen()`은 `window.visualViewport`의 `resize` 이벤트만 구독한다(SSR/미지원 환경 가드 — `typeof window === 'undefined' || !window.visualViewport`이면 즉시 반환, 기본값 `false`). 언마운트 시 리스너를 해제한다. 어느 화면에서 렌더되든 `TabBar` 자체가 판단하므로, 화면 간에 "키보드 열림" 상태를 배선할 필요가 없다(브리프의 요구사항대로).

`TabBar.tsx`는 표시/숨김만 바꿨다 — 높이·아이콘·라우팅·다른 스타일은 그대로다.

## 3. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` — 258개 전체 통과 (BRIEF-084 완료 시점 252 + 신규 6, 무회귀)
- [x] `npm run build` 성공
- [x] `npx tsx scripts/verify/prompt-assembly.mjs` → **ALL PASS** (이 BRIEF는 Ask 프롬프트 로직에 영향이 없으므로 무영향 확인 목적)
- [x] main push 완료 (커밋 해시는 §5)
- [ ] **§5 — 실기기 확인 요청 (완료 기준 5)**: 단위 테스트로는 실제 iOS Safari의 키보드 열림/`visualViewport` 동작 자체를 검증할 수 없다. 개발 서버에서 Playwright로 `window.visualViewport.height`를 실측 키보드 크기만큼(800→460) 강제로 줄이고 `resize` 이벤트를 디스패치해 확인한 결과, 하단 탭바의 렌더 좌표가 `y=736`(뷰포트 안, 정상)에서 `y=812.8`(뷰포트 높이 800을 넘어 화면 밖으로 밀려남)로 이동했고, 다시 460→800으로 복귀시키자 `y=736`으로 정확히 돌아왔다 — 로직 자체는 확인됐다. **다만 이것은 시뮬레이션이며, 실제 iOS 키보드가 열릴 때 `visualViewport.resize`가 정확히 같은 타이밍/값으로 발생하는지는 실기기에서만 확인 가능하다. YS님 아이폰에서 Ask 화면 입력창을 탭해 키보드를 띄웠을 때 (1) 탭바가 더 이상 화면 중앙에 뜨지 않고 (2) 컴포저(입력창)만 키보드 바로 위에 있는지 확인 부탁드립니다.**

## 4. 특이사항

- 시뮬레이션 검증 중 하나 확인한 것: `window.visualViewport` 객체 참조 자체를 교체하면(새 객체로 덮어쓰기) 이미 마운트된 컴포넌트가 구독 중인 기존 객체의 리스너에는 이벤트가 전달되지 않는다 — 실제 브라우저에서는 `visualViewport`가 교체되는 게 아니라 같은 싱글턴 객체의 `height`만 변하므로 문제되지 않지만, 검증 스크립트를 작성하며 이 점을 몰라 첫 시도에서 잘못된 결과를 얻었다. 스크립트를 고쳐 재확인했다(코드 자체의 버그는 아니었음).
- 그 외 어긋난 기대값이나 사고는 없었다.

## 5. 커밋 해시

- 저장소: https://github.com/Farerworks/attune
- 커밋 해시: (본 커밋 — 텔레그램 완료 보고에 함께 남긴다)
