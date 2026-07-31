# BRIEF-091-FIX — 상단바 위쪽 여백 12px 소실: env() 한 줄을 calc 합산형으로 교정

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `src/components/TabTopBar.tsx` | `paddingTop: 'env(safe-area-inset-top, 0px)'` → `'calc(12px + env(safe-area-inset-top, 0px))'` (한 줄만) |
| `src/components/TabTopBar.test.tsx` | 정적 스캔 기대 문자열을 새 calc 표현식으로 갱신 (배경/blur 검사 2건은 그대로) |

## 2. 원인

CSS에서 단축 속성(`padding`) 뒤에 개별 속성(`paddingTop`)이 오면, 단축 속성이 채운 값은 "더해지는" 게 아니라 그 축만 통째로 **교체**된다. 091에서 추가한 `paddingTop: 'env(safe-area-inset-top, 0px)'`은 기존 `padding` 줄이 만든 위쪽 12px을 지우고 그 자리를 `env()` 값(노치 없는 환경에서는 폴백 0px)으로 바꿔치기했다 — 그 결과 노치 없는 기기에서 위쪽 여백이 통째로 사라졌고, 노치 있는 기기에서도 "상태바 아래 12px 숨돌림"이 없어져 ATTUNE 라벨이 상태바에 바로 붙게 됐다. 이번 수정은 `calc(12px + env(...))`로 바꿔 기존 12px에 안전영역 값을 **더하는** 형태로 교정했다.

## 3. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` — 296개 전체 통과 (무회귀)
- [x] `npm run build` 성공
- [x] 4탭 실측 표 — 아래
- [x] main push 완료 (커밋 해시는 §5)
- [ ] YS 아이폰 확인 — 스크롤 시 시계 영역 비침 없음 + ATTUNE 라벨이 상태바에 붙지 않고 여백이 있음 (환경상 제가 직접 확인 불가, YS 게이트로 넘김)

## 4. 렌더 실측 (Playwright, 390×844 데스크톱 Chromium)

| 탭 | height | computed paddingTop | position |
|---|---|---|---|
| Home | 52px | 12px | sticky |
| People | 52px | 12px | sticky |
| You | 52px | 12px | sticky |
| Ask | 52px | 12px | sticky |

기대값(52px / 12px)과 정확히 일치, 4탭 동일. 091 보고서 §3의 40px/0px(교체로 인한 여백 소실 상태)에서 벌어짐이 회복됐다.

## 5. 커밋 해시

- 저장소: https://github.com/Farerworks/attune
- 커밋 해시: `8aeb135`
