# BRIEF-091 — iOS 표시 2건: 입력 포커스 자동 확대 방지 + 상단바 안전영역 비침 수정

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `src/app/(tabs)/ask/page.tsx` | Ask 컴포저 `<textarea>`의 `fontSize: 15` → `16` |
| `src/components/TabTopBar.tsx` | sticky 컨테이너에 `paddingTop: 'env(safe-area-inset-top, 0px)'` 한 줄 추가 |
| `src/app/(tabs)/ask/page.test.tsx` | 컴포저 textarea의 `fontSize`가 16임을 렌더 테스트로 확인 |
| `src/app/globals.css.test.ts` (신규) | `.field-input`/`.field-textarea`의 font-size ≥16px 정적 스캔 |
| `src/components/TabTopBar.test.tsx` (신규) | safe-area paddingTop 존재 + 배경/blur 무변경 정적 스캔 |

## 2. 텍스트 입력 요소 전수 점검 결과

| 요소 | 위치 | 이전 | 이후 |
|---|---|---|---|
| Ask 컴포저 `<textarea>` | `src/app/(tabs)/ask/page.tsx` | 15px (인라인) | **16px** (수정) |
| `.field-input` (이름/온보딩 등) | `src/app/globals.css` | 16px | 16px (변경 없음, 이미 충족) |
| `.field-textarea` (situation 등) | `src/app/globals.css` | 16px | 16px (변경 없음, 이미 충족) |
| `SegmentInput`(연·월·일, 시·분 입력) | `src/components/DateInput.tsx` (DateInput·TimeInput 공용) | 16px (인라인) | 16px (변경 없음, 이미 충족) |

저장소 전체의 `<input>`/`<textarea>`를 grep으로 전수 확인한 결과, 16px 미만은 Ask 컴포저 1건뿐이었다. `new/page.tsx`의 이름 입력·situation 텍스트영역, `onboarding/page.tsx`의 이름 입력은 모두 `className="field-input"`/`"field-textarea"`를 그대로 쓰고 있어 별도 인라인 fontSize가 없다 — globals.css의 16px을 상속.

## 3. 상단바 안전영역 — 실측(Playwright, 390×844 뷰포트)

4개 탭(Home/People/You/Ask) 각각에서 "ATTUNE" 라벨을 감싸는 sticky 컨테이너의 `getBoundingClientRect()`:

| 탭 | top | height | position | computed paddingTop |
|---|---|---|---|---|
| Home | 0 | 40 | sticky | 0px |
| People | 0 | 40 | sticky | 0px |
| You | 0 | 40 | sticky | 0px |
| Ask | 0 | 40 | sticky | 0px |

4탭 모두 높이 40px로 동일 — 077의 헤더 높이 동일성이 유지된다. `paddingTop`이 `0px`로 정상 계산된 것은(데스크톱 Chromium이라 `env(safe-area-inset-top)`이 폴백값 0을 반환) 선언 자체가 무효화되지 않고 적용되고 있음을 보여준다 — 실제 노치가 있는 기기에서는 이 값이 노치 높이(iPhone 기준 통상 47~59px)로 대체되어 배경이 그만큼 위로 확장된다.

## 4. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` — 296개 전체 통과 (기존 291 + 신규 5, 무회귀)
- [x] `npm run build` 성공
- [x] 본인 렌더 확인 — 위 §3 표 (4탭 상단바 높이 40px로 동일)
- [x] main push 완료 (커밋 해시는 §6)
- [ ] YS 아이폰 확인 — 입력창 탭 후 확대 없음 + 스크롤 시 시계 영역에 텍스트 비침 없음 (환경상 제가 직접 확인 불가, YS 게이트로 넘김)

## 5. 정직 보고

- `paddingTop: 'env(safe-area-inset-top, 0px)'`는 데스크톱 Chromium/jsdom 어디서도 실제 0이 아닌 값으로 확인할 수 없었다 — `env(safe-area-inset-top)`는 실제 노치/상태바가 있는 기기(iOS Safari, PWA standalone)에서만 0이 아닌 값을 반환하는 CSS 환경 변수라서, 이 환경에서 검증 가능한 것은 "선언이 소스에 존재하고 무효화되지 않는다"는 것까지다. 비침이 실제로 사라지는지는 YS 실기기 확인이 필요하다.
- jsdom은 `env()` 함수를 CSS 값으로 파싱하지 못해(`cssstyle` 패키지 한계) 렌더 테스트로 `paddingTop` 속성 자체를 확인할 수 없었다 — 실제로 렌더링해보니 `paddingTop` 선언이 통째로 드롭되고 `padding` 단축 속성만 남는 것을 확인했다. 그래서 이 항목만 소스 텍스트 정적 스캔(`TabTopBar.test.tsx`)으로 대체했다 — 이전 BRIEF들에서 겪은 jsdom 한계(`isContentEditable`, `scrollIntoView` 등)와 같은 종류의 환경 문제다.
- 입력 폰트 확대 방지도 마찬가지로 실제 iOS Safari의 확대 동작 자체는 이 환경에서 재현·검증이 불가능하다 — "모든 텍스트 입력 요소의 font-size가 16px 이상"이라는 조건까지만 코드/테스트로 확인했다.

## 6. 커밋 해시

- 저장소: https://github.com/Farerworks/attune
- 커밋 해시: (본 커밋 — 텔레그램 완료 보고에 함께 남긴다)
