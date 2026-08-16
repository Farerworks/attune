# BRIEF-109 PART 2 §3.2 긴급 정정 (v1.2) — fail-hard 판정 보강

> **PART 2 §3.2만 이 내용으로 대체한다. 그 외 §0~§8은 v1.1 그대로 유효.**
> 이미 §3.2를 구현했다면 아래대로 고치고, 아직이면 처음부터 이대로 한다.

## 왜 고치는가

v1.1의 `document.fonts.check()` **단독 판정은 fail-open이다.** MDN 확인:

> "even if the requested font isn't available or fully loaded, the method may still return `true`"
> 예시: `document.fonts.check("12px i-dont-exist")` → **`true`**

즉 **Pretendard 스타일시트가 아예 로드되지 않은 기기에서도 `check()`는 `true`를 반환**하고, 시스템 폴백 글꼴로 그려진 PNG가 「성공」으로 다운로드된다. 막으려던 상황이 그대로 통과한다.

## 대체 사양 — KO는 4조건 전부 만족해야 Canvas를 만든다

1. `document.fonts.load('500 30px "Pretendard Variable"', KO_GLYPHS)`가 **reject 없이** 완료
2. 반환된 `FontFace[]`가 **비어 있지 않음** (매칭 face 0개 = 스타일시트 미로드)
3. 반환 face가 **전부 `status === 'loaded'`**
4. 그 뒤 `document.fonts.check('500 30px "Pretendard Variable"', KO_GLYPHS) === true`

하나라도 실패하면 **`dataUrl`을 만들지 않고** 기존 오류 뷰(`Could not render card.`)로 끝낸다. 새 문구·새 뷰 금지.

## 구현 시 주의 — KO 결과를 별도로 추적할 것

현재 preload는 5개를 `Promise.all`로 묶고 **통째로 `catch`**한다. KO 로드를 그 안에 두면 **EN 폰트 하나가 실패해도 KO 실패가 묻히고**, 반대로 KO 실패가 EN 경로를 막는다.

→ **KO 로드는 기존 `Promise.all` 밖에서 별도로** 실행하고 결과(성공/실패·face 배열)를 따로 보관한다. **EN의 기존 graceful fallback은 그대로 유지**한다.

## 테스트 — v1.1의 7번을 3분기로 확장

- KO + `fonts.load` **reject** → `fillText`·`toDataURL` **0회**
- KO + `fonts.load`가 **빈 배열** resolve → `fillText`·`toDataURL` **0회**
- KO + `fonts.check` **false** → `fillText`·`toDataURL` **0회**

(EN 경로는 폰트 실패해도 기존대로 그려지는지 1건 유지)

## 그 외 변경 없음

크기·좌표·자간·문구·`MyCardModal` 무접촉·완료 기준·보고 양식 전부 v1.1 그대로.
