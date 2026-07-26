# BRIEF-086 — 키보드 탭바 숨김 간헐 실패: 감지 이중화 (085 후속)

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `src/lib/keyboard.ts` | 순수 함수 `isTextInputElement(el)` 신규 export + `useKeyboardOpen()`에 `focusin`/`focusout` 기반 감지 경로 추가, 기존 `visualViewport` 휴리스틱과 OR 결합 |
| `src/lib/keyboard.test.ts` | `isTextInputElement` 단위 테스트 9건 |
| `src/lib/useKeyboardOpen.test.tsx` | 포커스 기반 감지 훅 테스트 2건(닫힘 지연, 입력창 간 이동 시 깜빡임 없음) — fake timers 사용 |

`src/components/TabBar.tsx`는 무변경(브리프 지시대로 — 훅 반환값을 그대로 소비).

## 2. 구현 요지

기존 `useKeyboardOpen()`의 `visualViewport` 휴리스틱(threshold 120, SSR 가드)은 한 글자도 손대지 않았다. 두 번째 독립 신호를 추가해 **OR로만** 결합했다:

```ts
return viewportOpen || focusOpen;
```

- `isTextInputElement(el)`: `contenteditable`(`isContentEditable` 또는 `contentEditable === 'true'` 둘 다 확인 — jsdom이 `isContentEditable` getter를 완전히 구현하지 않아 테스트에서 실제로 걸렸다, §4 참고) → true. `textarea` → true. `input`은 `type`이 비텍스트 목록(`checkbox`/`radio`/`range`/`button`/`submit`/`reset`/`file`/`color`/`image`)에 없으면 true(디폴트 `type` 없는 `input`도 text로 취급, 실제 HTML 스펙과 동일).
- `document`에 `focusin`/`focusout`을 구독. `focusin`이면 대상이 텍스트 입력일 때 즉시 열림. `focusout`이면 **즉시 닫지 않고 100ms 뒤** `document.activeElement`를 다시 검사해 닫는다 — 입력창 A→B로 포커스가 바로 넘어가면 그 100ms 안에 B의 `focusin`이 먼저 와서 타이머를 취소하므로, 열림 상태가 한 번도 false로 안 떨어진다(깜빡임 없음). 타이머는 언마운트 시 `clearTimeout`으로 해제.

## 3. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` — 269개 전체 통과 (BRIEF-085 완료 시점 258 + 신규 11, 무회귀)
- [x] `npm run build` 성공
- [x] main push 완료 (커밋 해시는 §5)

## 4. 정직 보고

- **iOS 실기기 재현은 이 환경에서 불가능하다.** 이 세션은 실제 iPhone/Safari에 접근할 수 없어, "왜 간헐적으로 실패했는지"(본부 가설 — `window.innerHeight`도 같이 줄어드는 경우가 있는지)는 확정도 반증도 하지 못했다. 그래서 브리프 지시대로 특정 가설에 의존하지 않고 **독립적인 두 번째 감지 경로를 더해 OR로 묶는** 처방만 적용했다 — `visualViewport` 신호가 어떤 이유로든 못 잡는 경우, 포커스 신호가 대신 잡아준다.
- 개발 서버 + Playwright(데스크톱 Chromium)로 **`visualViewport`를 전혀 흔들지 않은 상태에서 텍스트 입력창에 포커스만 주는** 시나리오를 확인했다 — 이 조건에서는 기존(085) 로직 단독으로는 절대 탭바가 숨겨지지 않지만, 이번 변경 후에는 포커스만으로 탭바가 화면 밖(`y=856.8`, 뷰포트 높이 844 밖)으로 사라졌고, blur 후 100ms 지연이 지나자 정확히 원위치(`y=780`)로 복귀했다. 이는 "새 감지 경로 자체가 작동한다"는 증거이지, "iOS 실기기의 실패 원인을 재현해서 고쳤다"는 증거는 아니다 — 그 확인은 YS 실기기 게이트로 넘긴다.
- 테스트 작성 중 실제로 걸린 문제 1건: jsdom이 `HTMLElement.isContentEditable`(스펙상 상속·레이아웃을 고려한 계산된 값)을 제대로 구현하지 않아 `contenteditable` 테스트가 처음에 실패했다. `contentEditable`(속성을 그대로 반영하는 문자열 IDL)도 함께 확인하도록 고쳐 해결했다 — 실제 브라우저에서는 `isContentEditable`만으로도 항상 true였을 것이므로 프로덕션 동작에는 영향 없는, 테스트 환경 한정 이슈였다.

## 5. 커밋 해시

- 저장소: https://github.com/Farerworks/attune
- 커밋 해시: (본 커밋 — 텔레그램 완료 보고에 함께 남긴다)
