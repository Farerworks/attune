# BRIEF-103 — Ask 답변 말풍선의 줄바꿈 표시 (1줄 스타일 수리)

## 0. 작업 브랜치

이 판의 모든 커밋은 `main`이 아니라 `fix/103-newline`에만 존재한다. `origin/main`은 시작부터 끝까지 `46439bf19894e13c068e3d1a74ad6de8f9f94a69` 그대로다.

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `docs/briefs/BRIEF-103.md` | 브리프 원문 바이트 그대로 보관 (단독 커밋, `fix/103-newline`) |
| `src/app/(tabs)/ask/page.tsx` | `MessageBubble`의 text 형태(shape 2) `<p>` style에 `whiteSpace: 'pre-line'` 1줄 추가 |
| `src/app/(tabs)/ask/page.test.tsx` | 신규 2건 |
| `docs/reports/BRIEF-103.md` | 본 보고서 |

## 2. `page.tsx` diff — 스타일 1속성뿐임

```
$ git diff --stat 46439bf19894e13c068e3d1a74ad6de8f9f94a69..783480f -- "src/app/(tabs)/ask/page.tsx"
 src/app/(tabs)/ask/page.tsx | 1 +
 1 file changed, 1 insertion(+)
```
```diff
           <p style={{
             margin: 0,
             fontFamily: "var(--font-inter,system-ui)", fontSize: 15,
             color: 'var(--c-ink)', lineHeight: 1.55,
+            whiteSpace: 'pre-line',
           }}>
             {typeof m.text === 'string' ? m.text : ''}
           </p>
```
parts용 `<p>`·followUp `<p>`·timing `<p>`·user 말풍선은 무접촉.

## 3. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` 전체 — **902개**(기존 900 + 신규 2), **898 passed + 4 expected fail**(기존 잔여 4건 그대로)
- [x] `npm run build` 성공
- [x] `docs/reports/BRIEF-103.md` 작성

## 4. 테스트 결과

| # | 케이스 | 결과 |
|---|---|---|
| 1 | text 형태 답 `"줄1\n줄2"` 렌더 시 그 `<p>`가 `white-space: pre-line`을 가짐 | PASS |
| 2 | 한 줄짜리 text 답의 렌더 결과가 기존과 동일(회귀 없음) | PASS — `pre-line`은 연속 공백만 접고 개행 없는 문장의 시각적 표시는 바꾸지 않으므로, 새 테스트로 `textContent`가 그대로임을 직접 확인했다. 이 파일의 기존 렌더 테스트들('mocked reply' 등 다수)도 단일 줄 텍스트가 그대로 나오는 것을 전제로 하고 있어 별도 확장은 하지 않았다. |
| 3 | 기존 900 테스트 전부 유지 | PASS — 900개 전부 무회귀, `it.fails` 4건도 그대로 |

## 5. 커밋 해시 (모두 `fix/103-newline`)

- 저장소: https://github.com/Farerworks/attune (브랜치: `fix/103-newline`)
- 브리프 원문 보관: `17afee0`
- 코드+테스트 커밋: `783480f`
