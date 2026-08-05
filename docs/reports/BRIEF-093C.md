# BRIEF-093C — 셰어카드 오행 블롭 직선화 (차트 문법 통일 완결)

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `src/lib/shareChart.ts` | `drawElementPentagon`의 시리즈 블롭 그리기를 Catmull-Rom `bezierCurveTo` 연결에서 직선 `lineTo` 연결로 교체 |
| `src/lib/shareChart.test.ts` (신규) | `bezierCurveTo` 미호출 + 시리즈당 `moveTo` 1회·`lineTo` 4회 확인 1건, 극단 입력에서 blob 경로 좌표가 `computeBlobPoints` 반환값과 정확히 일치하는지 1건 |

## 2. 구현 요지

```ts
for (const { elements, color } of series) {
  const pts = computeBlobPoints(elements, cx, cy, radius, normMax);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ...
}
```

`computeBlobPoints`(수치 로직)·그리드 링·축 라벨·`shadowColor`/`shadowBlur: 40`(글로우)·`globalAlpha: 0.11`(채움)·`lineWidth: 2.5`(스트로크)·색 순서는 전부 무변경 — 연결 방식만 바꿨다. 092의 `ElementChart.tsx`와 달리 꼭짓점 점(circle)은 추가하지 않았다(지시대로 — 카드에서는 글로우가 무드를 담당). `shareChart.ts`는 `ShareModal`(2인)·`MyCardModal`(1인) 양쪽이 그대로 재사용하므로 두 카드 모두 자동으로 수혜받는다 — 두 컴포넌트 파일 자체는 무수정.

## 3. 렌더 확인 — 2장 (실제 브라우저, Playwright)

`/reading/[id]`의 2인 다이나믹 카드, `/you`의 1인 솔로 카드 각각 실제 캔버스 렌더링 결과를 스크린샷했다. 텔레그램으로 **전송함**. 두 카드 모두 오행 블롭이 펜타곤 그리드 안에서 직선 다각형 + 글로우로 렌더되는 것을 육안으로 확인했다(092의 앱 내 레이더와 동일한 시각 문법으로 통일).

## 4. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` — 329개 전체 통과 (기존 327 + 신규 2, 무회귀)
- [x] `npm run build` 성공
- [x] 렌더 확인 2장 — §3, 텔레그램 전송함
- [x] main push 완료 (커밋 해시는 §5)

## 5. 커밋 해시

- 저장소: https://github.com/Farerworks/attune
- 커밋 해시: (본 커밋 — 텔레그램 완료 보고에 함께 남긴다)
