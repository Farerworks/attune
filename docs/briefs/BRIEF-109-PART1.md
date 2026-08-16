# BRIEF-109 PART 1 — 오각형 축 라벨 옵션화 (Copy STEP 6 · PART B 준비)

> **PART 2와 같은 브랜치에서 순서대로 작업한다. PART 1을 먼저 커밋하고 PART 2로 넘어갈 것.**

## 0. 범위 (한 기능)

`shareChart.ts`의 `drawElementPentagon`이 **축 라벨·폰트·자간을 인자로 받을 수 있게** 한다.
**이 PART는 눈에 보이는 변화가 0이어야 한다** — 인자를 안 넘기면 지금과 픽셀 동일.

- **BASE_SHA**: `9e7ca16c648e8faa5fd08b591e5f2398945b3e50` (origin/main)
- **브랜치**: `feat/109-share-png-ko` (main 직접 push 금지)

## 1. 왜 필요한가

PART 2에서 공유 PNG의 축 라벨을 `wood/fire/…` → `목/화/토/금/수`로 바꾼다. 그런데 `drawElementPentagon`은 **`MyCardModal`도 함께 쓴다**〔`MyCardModal.tsx:172`〕. `MyCardModal`은 **영어 전용 산출물**이므로, 함수 안에서 언어를 판단하면 안 된다. **호출자가 넘기고, 기본값은 영어**여야 한다.

## 2. 할 일 — `src/lib/shareChart.ts` 한 파일

`DrawElementPentagonOptions`에 **선택 인자 3개**를 추가하고, 구조분해에서 **기본값을 현재 하드코딩된 값 그대로** 준다.

```ts
axisLabels?: readonly string[];   // 기본값: EL_ORDER
axisFont?: string;                // 기본값: '400 30px "Space Mono"'
axisLetterSpacing?: string;       // 기본값: '4px'
```

- 현재 `:61`의 `ctx.font = '400 30px "Space Mono"'` → `ctx.font = axisFont`
- 현재 `:62`의 `ctx.letterSpacing = '4px'` → `ctx.letterSpacing = axisLetterSpacing`
- 현재 `:69`의 `ctx.fillText(k, lx, ly)` → **`axisLabels[i]`를 그린다**(`EL_ORDER.forEach((k, i) => …)`의 `i` 사용)
- `axisLabels`의 길이가 5가 아니면 **기본값(영어)으로 되돌린다** — 잘못된 인자가 라벨을 누락시키지 않게

**그 외 로직·좌표·색·순서는 한 줄도 바꾸지 않는다.**

## 3. 테스트 — `src/lib/shareChart.test.ts` 보강

`ctx`를 스파이 객체로 두고 검사한다(실제 렌더 불필요).

1. **회귀 가드(가장 중요)**: 새 인자를 **아무것도 안 넘겼을 때** `fillText`가 `wood`·`fire`·`earth`·`metal`·`water` 5개를 순서대로 그리고, `font`에 `'400 30px "Space Mono"'`, `letterSpacing`에 `'4px'`가 설정된다
2. `axisLabels: ['목','화','토','금','수']` 전달 시 그 5개가 순서대로 그려진다
3. `axisFont`·`axisLetterSpacing` 전달 시 그 값이 설정된다
4. `axisLabels`가 길이 3짜리 배열이면 **영어 5개로 되돌아간다**

## 4. 금지 사항

1. **`src/components/MyCardModal.tsx` 무접촉** — 한 줄도 수정 금지
2. **`src/components/ShareModal.tsx` 이 PART에서는 무접촉** (PART 2에서 다룬다)
3. 좌표·각도·색·그리드·시리즈 폴리곤 로직 변경 금지
4. `navigator.language`·locale 체계 도입 금지
5. main 직접 push / force push / rebase / merge commit 금지

## 5. 완료 기준

1. `npx tsc --noEmit` → 0 에러
2. `npm run lint` → 39(24E/15W) 이하
3. `npx vitest run` → 기준 **979 passed + 4 expected fail**. passed는 신규만큼 증가, **expected fail 4 불변**
4. 변경 파일 **정확히 2개**: `src/lib/shareChart.ts` · `src/lib/shareChart.test.ts`
5. 커밋 후 **PART 2로 계속 진행**(여기서 push하고 멈춰도 되고, PART 2까지 하고 한 번에 push해도 된다)
