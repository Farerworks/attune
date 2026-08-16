# BRIEF-108 — Ask 오류 문구 한국어 분기 (Copy STEP 6 · PART A)

## 0. 이 브리프의 범위 (한 기능)

**`/ask`에서 발생한 오류 문구를, 실패한 그 질문의 언어에 맞춰 출력한다.** 한국어로 물었으면 한국어 오류, 영어면 영어. 그 외의 것은 이 판에서 하지 않는다.

- **BASE_SHA**: `43c3804a1d90ada8e9ab93bbb58f356513318667` (origin/main)
- **브랜치**: `feat/108-error-copy-ko` (main 직접 push 금지)
- **판정 근거**: 인벤토리 `A-383`~`A-387` 5건 = 5A(사실·계약 결함). 영어 UI + 한국어 콘텐츠가 정본인데, **한국어 대화 말풍선 사이에 영어 오류 문장이 저장된다.**

## 1. 배경 — 왜 이게 결함인가

`friendlyError()`가 반환한 문자열은 화면에만 뜨는 게 아니라 **대화 말풍선으로 저장**된다(`ask/page.tsx:384` → `saveThreads`). 저장된 말풍선은 다음 턴에 `history`로 서버에 되돌아간다. 즉 한국어 대화 기록 안에 영어 문장이 섞여 남는다.

## 2. 할 일

### 2.1 `src/lib/errorCopy.ts`

① 한글 판별 헬퍼를 export한다.

```ts
export function isKoreanText(text: string): boolean {
  return /[가-힣]/.test(text);
}
```

② `friendlyError`에 **세 번째 선택 인자** `ko: boolean = false`를 추가한다. **기존 두 인자의 순서·의미는 그대로**, 기본값 `false`이므로 **인자를 안 넘기는 기존 호출부는 동작이 바뀌지 않는다.**

```ts
export function friendlyError(
  status: number | null,
  retryAfterMinutes?: number,
  ko: boolean = false,
): string
```

③ `ko === true`일 때 반환 문구 (**아래 5개는 확정 문구다. 한 글자도 바꾸지 말 것**):

| 조건 | KO 문구 |
|---|---|
| `status === null` | `Attune에 연결할 수 없어요. 인터넷 연결을 확인하고 다시 시도해 주세요.` |
| `429` + `retryAfterMinutes > 0` | `Attune도 잠시 숨을 고를게요. 약 ${retryAfterMinutes}분 후 다시 시도해 주세요.` |
| `429` + 값 없음 | `Attune이 생각하는 것보다 조금 빠르게 움직이고 있어요. 1분 후 다시 시도해 주세요.` |
| `>= 500` | `Attune이 생각을 마무리하지 못했어요. 잠시 후 다시 시도해 주세요.` |
| 그 밖 | `문제가 발생했어요. 잠시 후 다시 시도해 주세요.` |

**영어 5개 문구는 현재 코드 그대로 유지한다**(변경 금지).

### 2.2 `src/app/(tabs)/ask/page.tsx` — 호출 2곳만

언어 신호는 **실패한 그 요청의 질문 텍스트**다. `handleSend(text = input.trim())`의 매개변수 `text`가 두 지점 모두의 클로저에 이미 있다. **새 state·새 신호를 만들지 말 것.**

- `:343` → `friendlyError(res.status, data.retryAfterMinutes, isKoreanText(text))`
- `:384` → `friendlyError(null, undefined, isKoreanText(text))`

`import`에 `isKoreanText`를 추가한다.

> `:343`에서 던진 `DisplayError`의 message가 `:384`에서 그대로 말풍선 text가 된다 — **두 지점 모두 고쳐야 화면과 저장이 같은 언어**가 된다.

## 3. 테스트 (신규 파일 + 기존 파일 보강)

### 3.1 `src/lib/errorCopy.test.ts` (신규)
- `isKoreanText`: `'은우랑 어떻게 풀까'` → true / `'how do I talk to them'` → true 아님(false) / `''` → false / `'ATTUNE 123'` → false
- `friendlyError` **EN 5분기** — 3번째 인자 **미전달** 시 현재 영어 문구와 정확히 일치
- `friendlyError` **KO 5분기** — 3번째 인자 `true` 시 §2.1③ 표와 정확히 일치
- `friendlyError(429, 7, true)` → 문자열에 `7`이 포함될 것(보간 확인)
- **회귀 가드**: `friendlyError(500, undefined, false)` === `friendlyError(500)`

### 3.2 `src/app/(tabs)/ask/page.test.tsx` (보강)
- 한국어 질문 전송 → fetch 실패(reject) → **저장된 말풍선 text가 KO 문구**
- 영어 질문 전송 → 동일 실패 → **저장된 말풍선 text가 EN 문구**
- 429 응답 + 한국어 질문 → KO 429 문구

## 4. 금지 사항 (어기면 그 판은 반려)

1. **`src/app/new/page.tsx` 무접촉.** `:99`·`:105`·`:128` 3곳은 영어 폼의 정적 표시이고 `/new`에는 언어 신호가 없는 것이 **계약상 정상**이다. 신호를 새로 배선하지 말 것.
2. **`expectedLang`을 클라이언트에서 찾거나 새로 배선하지 말 것.** 서버 전용이다(`api/ask/route.ts`에만 존재).
3. **`navigator.language` 사용 금지 · 새 locale 체계/설정 화면/전역 언어 상태 도입 금지.**
4. **`ShareModal.tsx`·`MyCardModal`·`shareChart.ts` 무접촉.** 공유 이미지 13건은 PART B(별도 판)이며 폰트 승인이 선행한다.
5. **`ATTUNE`·`Attune` 브랜드명은 번역하지 않는다.**
6. **영어 문구 5개 변경 금지 · KO 문구 5개 임의 수정 금지**(조언자 확정본).
7. main 직접 push 금지 / force push 금지 / rebase 금지 / merge commit 생성 금지.

## 5. 완료 기준 (전부 충족해야 완료)

1. `npx tsc --noEmit` → **0 에러**
2. `npm run lint` → **39개(24 error / 15 warning) 이하**. 늘면 중단하고 보고
3. `npx vitest run` → 기존 **964개(960 passed + 4 expected fail)** 기준. **passed 수가 신규 테스트만큼 증가**하고, **expected fail 4건이 늘지 않을 것**. 늘면 중단하고 보고
4. `npm run build` 성공
5. `git diff --stat BASE_SHA..HEAD` 결과가 **정확히 4파일**: `src/lib/errorCopy.ts` · `src/lib/errorCopy.test.ts` · `src/app/(tabs)/ask/page.tsx` · `src/app/(tabs)/ask/page.test.tsx` (+ 아래 6의 브리프 보관본)
6. 이 브리프 원문을 `docs/briefs/BRIEF-108.md`로 보관 커밋
7. 브랜치 `feat/108-error-copy-ko`에 push. **병합은 하지 말 것** — 본부 검수 후 별도 지시(SEND-MERGE)로 한다

## 6. 보고 양식

```
BASE_SHA 확인: <실제 SHA>
브랜치: feat/108-error-copy-ko / 커밋: <SHA 목록>
변경 파일 목록 (git diff --stat 원문):
tsc: <출력>
lint: <숫자 E/W>
vitest: <passed/failed 숫자 원문>
build: <성공/실패>
추가한 테스트 목록:
막힌 점·판단이 필요했던 지점:
```
