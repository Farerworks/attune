# BRIEF-094-FIX — AHEAD 고지 문자열 정본 교정

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `src/app/(tabs)/home/page.tsx` | AHEAD 카드 한국어 고지에서 오염된 접두 "화면 " 제거 — `'화면 힌트일 뿐, 정답표가 아니에요'` → `'힌트일 뿐, 정답표가 아니에요'` |
| `src/app/(tabs)/home/page.test.tsx` | 고지 문자열 검증을 부분 일치에서 **정확 일치**(textContent === 정본)로 강화, EN·KO 각 1건 |

## 2. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` — 338개 전체 통과 (기존 337 + 신규 1, 무회귀)
- [x] main push 완료 (커밋 해시는 §3)
- 렌더 스크린샷: 지시서에 따라 생략(문자열 교정만).

## 3. 커밋 해시

- 저장소: https://github.com/Farerworks/attune
- 커밋 해시: `d1ba6ce`
