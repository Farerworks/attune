# BRIEF-103 — Ask 답변 말풍선의 줄바꿈 표시 (1줄 스타일 수리)

## 0. 맥락 (자기완결)

Attune(github.com/Farerworks/attune, 랩 PC `~/projects/attune`).

**결함**: `/api/ask`의 shape-2 답(`{"text": "줄1\n줄2"}`)은 서버에서 「한 줄에 하나씩」 계약으로 검증·저장되는데, **화면에서는 `\n`이 공백으로 뭉개져 한 문단으로 보인다.** 원인은 `src/app/(tabs)/ask/page.tsx`의 `MessageBubble`에서 text 형태 답을 그리는 `<p>`에 `whiteSpace` 스타일이 없어서다(HTML 기본 동작이 개행을 공백으로 접음). 「보낼 문장 N개」를 복사해 쓰는 사용자 경험이 깨진다.

### 0.1 기준점 확인 — `git pull` 금지
```
git status --porcelain
git fetch origin
git rev-parse HEAD
git rev-parse origin/main
```
둘 다 `46439bf19894e13c068e3d1a74ad6de8f9f94a69`(테스트 900 = 896 passed + 4 expected fail)이어야 한다. 어긋나면 `checkout`·`reset`·`merge`·`rebase` 하지 말고 그대로 보고.

### 0.2 전용 브랜치 — main에서 작업 금지
```
git checkout -b fix/103-newline 46439bf19894e13c068e3d1a74ad6de8f9f94a69
```
커밋 3개(브리프 보관 / 코드+테스트 / 보고서) 전부 이 브랜치에만. push는 `git push -u origin fix/103-newline` 한 줄로만. **main checkout·merge·push·rebase·cherry-pick·PR 생성 전면 금지.** Preview 배포는 Production과 구분 보고, PASS 근거 사용 금지.

## 0.5 시작 전 1커밋 — 브리프 원문 보관

전달받은 이 파일의 `sha256sum`·`wc -c`를 전달 메시지의 값과 대조 — 다르면 구현하지 말고 보고. 일치하면 바이트 그대로 `docs/briefs/BRIEF-103.md`로 저장, 단독 커밋(`BRIEF-103: 브리프 원문 보관`), 저장 직후 재대조.

## 1. 변경 사양 — 정확히 한 곳

`src/app/(tabs)/ask/page.tsx`의 `MessageBubble` 안, **text 형태(shape 2) 답을 그리는 `<p>`** (parts 배열이 아닐 때의 else 분기, `{typeof m.text === 'string' ? m.text : ''}`를 감싸는 그 `<p>`)의 style 객체에 다음 한 속성을 추가한다:

```
whiteSpace: 'pre-line',
```

**그 외 무변경.** 같은 컴포넌트의 parts용 `<p>` · followUp `<p>` · timing `<p>` · user 말풍선은 **관측된 결함이 없으므로 손대지 않는다.** `pre-line`은 연속 공백은 접고 `\n`만 줄바꿈으로 살리는 값이라 기존 한 줄짜리 답의 표시는 변하지 않는다.

## 2. 테스트 계약 (page.test.tsx에 추가)

1. text 형태 답 `"줄1\n줄2"` 렌더 시 그 `<p>`가 `white-space: pre-line`을 가짐(style 단언).
2. 한 줄짜리 text 답의 렌더 결과가 기존과 동일(회귀 없음 — 기존 테스트 통과로 갈음 가능하면 명시).
3. 기존 900 테스트 전부 유지(896 passed + 4 expected fail — `it.fails` 4건 무변경).

## 3. 완료 기준
- [ ] `npx tsc --noEmit` / `npx vitest run` 전체(수치 보고) / `npm run build`
- [ ] `docs/reports/BRIEF-103.md` 커밋 — 보관·코드 커밋 해시, diff(스타일 1속성 + 테스트뿐임을 제시), 테스트 수치
- [ ] 완료 보고(채팅)에 커밋 해시 3종 + 브랜치 격리 증빙 7종(BRIEF-100B-FIX5 v2 §3 양식, 기준 해시 `46439bf1…`)

## 4. 금지사항
- 허용 경로 4개뿐: `docs/briefs/BRIEF-103.md` · `src/app/(tabs)/ask/page.tsx` · `src/app/(tabs)/ask/page.test.tsx` · `docs/reports/BRIEF-103.md`.
- `page.tsx`에서 위 `<p>`의 style 한 속성 외에 아무것도 바꾸지 말 것. API·분류기·검증기·프롬프트 전부 무접촉.
- 다른 말풍선·다른 화면으로 「내친김에」 확대 금지.
- main 접촉 금지(§0.2). 여기서 멈춘다 — merge·배포·검증은 본부·YS 몫.
