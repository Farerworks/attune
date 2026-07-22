# BRIEF-082 — 카드 규격 판단 요청 2건 판정 반영

BRIEF-081 §6의 판단 요청 2건에 대한 본부 판정을 반영했다. 값 2줄만 변경.

## 변경 전/후

| 위치 | 전 | 후 |
|---|---|---|
| `src/app/(tabs)/home/page.tsx` — "Reach out today" 카드 padding | `14px 16px` | `16px 20px` (People 리스트 행과 동일 리듬, gap 10px 유지) |
| `src/app/(tabs)/ask/page.tsx` — `FirstVisitContent` 예시 버블 radius | `18px 18px 4px 18px` / `18px 18px 18px 4px` | `16px 16px 4px 16px` / `16px 16px 16px 4px` (실제 `MessageBubble`/`LoadingBubble`과 동일 규격) |

## 완료 기준 자가점검

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` — 251개 전체 통과 (무회귀 — 스타일 값 2건만 변경)
- [x] `npm run build` 성공
- [x] main push 완료 (커밋 해시는 아래)

위 2개 값 외 변경 없음.

## 커밋 해시

- 저장소: https://github.com/Farerworks/attune
- 커밋 해시: (본 커밋 — 텔레그램 완료 보고에 함께 남긴다)
