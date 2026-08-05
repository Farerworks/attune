# BRIEF-092 — 시각 정합 3건: 오행 레이더 직선화 · 통계 단복수 · Share 버튼 이모지 제거

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `src/components/ElementChart.tsx` | `smoothPath()`(Catmull-Rom 큐빅 곡선) 삭제, `polygonPath()`(직선 `L` 연결)로 교체 + 시리즈별 꼭짓점에 반지름 3 circle 추가. `radarPts`/`normMax`/그리드/라벨/`fillOpacity`/색/`minR`은 무변경 |
| `src/app/(tabs)/you/page.tsx` | `plural(n, singular)` 헬퍼 신설, 통계 줄(READS/DAYS IN/STRONG CURRENTS)을 값 1일 때 단수로 표기 + "Share my card ↗️" 이모지를 `ShareIcon`으로 교체(라벨 오른쪽, 17px, currentColor) |
| `src/components/ElementChart.test.tsx` (신규) | 경로에 `C` 명령 부재 확인, 시리즈 수×5 circle 개수 확인(1/2시리즈), 극단 입력에서 모든 좌표가 반경 R(68) 이내인지 수치 검증 |
| `src/app/(tabs)/you/page.test.tsx` | 단복수 3케이스(1 READ/2 READS/1 DAY IN) + Share 버튼 이모지 부재·아이콘 렌더 확인 1건 |

## 2. 구현 요지

1. **레이더 직선화** — 곡선 보간(`smoothPath`)은 인접 값 차이가 크면 제어점이 꼭짓점 밖으로 나가 그리드를 뚫는 문제가 있었다. `radarPts()`가 반환한 점을 `M x0 y0 L x1 y1 … Z`로 그대로 잇는 직선 폴리곤으로 바꿔 원천 차단했다 — 직선은 수학적으로 두 끝점(그리드 안쪽) 사이에서만 그려지므로 그리드를 넘을 수 없다. 셰어카드(`shareChart.ts`, 무변경)의 직선 폴리곤 문법과도 통일됐다. 사용처 3곳(You/reading detail/CastingRitual) 모두 이 컴포넌트를 그대로 재사용하므로 자동 반영.
2. **단복수** — `plural(n, singular)`은 `n === 1`이면 원형, 아니면 `${singular}S`를 반환하는 순수 함수. "DAY IN"은 "DAY"만 단복수 처리 후 " IN"을 붙이고("1 DAY IN"/"2 DAYS IN"), "STRONG CURRENT(S)"는 "STRONG CURRENT" 전체를 단위로 넘겨 끝에 S만 붙는 형태를 재사용했다.
3. **Share 버튼** — 버튼의 `onClick`·외곽 스타일은 그대로 두고, 내부 콘텐츠만 `<span style={{display:'inline-flex', alignItems:'center', gap:6}}>Share my card<ShareIcon .../></span>`로 바꿔 텍스트 오른쪽에 아이콘을 세로 중앙 정렬로 배치했다.

## 3. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` — 310개 전체 통과 (기존 302 + 신규 8, 무회귀)
- [x] `npm run build` 성공
- [x] `scripts/verify/prompt-assembly.mjs`, `scripts/verify/engine-check.mjs` — 둘 다 ALL PASS (이 BRIEF와 무관한 영역이라 그대로 통과, 회귀 없음 확인 차 실행)
- [x] 본인 렌더 확인 — You 탭 레이더가 그리드 안에서 직선 폴리곤 + 꼭짓점 점으로 보이는 스크린샷 2장, 텔레그램으로 **전송함**
- [x] main push 완료 (커밋 해시는 §5)

## 4. 정직 보고

- `scripts/verify/render-smoke.mjs`는 실행하지 않았다 — 이 BRIEF의 렌더 확인은 Playwright로 직접 수행했고(§3), render-smoke.mjs가 검사하는 항목(DateInput/헤더 높이/Ilju 시트)은 이번 변경과 무관해 실행 실익이 없다고 판단했다. 필요하시면 별도로 돌려 보고할 수 있다.
- 극단 입력 검증(테스트 4번째 케이스)은 "모든 좌표가 반경 68 이내"만 수치로 확인했다 — 실제 시각적으로 "펜타곤을 안 뚫는지"는 위 스크린샷으로 육안 확인했다.

## 5. 커밋 해시

- 저장소: https://github.com/Farerworks/attune
- 커밋 해시: `4307d37`
