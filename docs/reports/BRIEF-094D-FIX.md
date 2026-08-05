# BRIEF-094D-FIX — Do/Don't 아이콘 줄바꿈 교정 (초소형)

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `src/app/(tabs)/home/page.tsx` | `DoIcon`·`DontIcon`의 인라인 style에 `display: 'inline-block'` 추가(2곳) |
| `src/app/(tabs)/home/page.test.tsx` | 기존 Do/Don't 아이콘 테스트에 `display: inline-block` 검증 보강 |

## 2. 구현 요지

원인은 Tailwind preflight의 전역 `svg { display: block }` — 새로 넣은 `DoIcon`/`DontIcon`이 블록 요소가 되어 각각 줄을 통째로 차지하며 Do/Don't 한 줄 문장이 3~4줄로 갈라졌다. jsdom 테스트는 전역 CSS(Tailwind preflight)를 로드하지 않아 이 문제를 검출하지 못했다(무과실 — 렌더 확인에서만 드러나는 종류의 문제).

두 아이콘의 style 객체에 `display: 'inline-block'`만 추가해 preflight를 인라인 스타일로 오버라이드했다. `verticalAlign: -2` 등 기존 정렬 값은 그대로 유지. 다른 코드·구조·globals.css는 건드리지 않았다.

## 3. 렌더 확인 — 1장 (실제 브라우저, Playwright, 430px 폭)

텔레그램으로 **전송함**.

한국어 홈에서 "✓ DO 쉬고 나서 챙겨요. · ✗ DON'T 새 부탁 떠안기."가 아이콘 포함 한 줄로 자연스럽게 흐르는 것을 확인.

## 4. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` — 352개 전체 통과 (기존 테스트 보강, 무회귀)
- [x] `npm run build` 성공
- [x] 렌더 확인 1장 — §3, 텔레그램 전송함
- [x] main push 완료 (커밋 해시는 §6)

## 5. 비고 — Playwright 상설 설치

§5 지시대로 레포 밖 `~/tools/pw`에 Playwright를 1회 설치해뒀다(`npm init -y` + `npm install playwright` + `npx playwright install chromium`). 이번 렌더 스크립트는 `~/tools/pw`에서 실행 후 삭제했다. 프로젝트 `package.json`/`package-lock.json`은 무변경 확인함. 앞으로 렌더 검증은 이 상설 설치를 재사용해 임시 설치·제거 왕복 없이 진행한다.

## 6. 커밋 해시

- 저장소: https://github.com/Farerworks/attune
- 커밋 해시: `6dc5238`
