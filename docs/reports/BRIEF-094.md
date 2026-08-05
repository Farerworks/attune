# BRIEF-094 — 홈 「오늘의 판」 1단계

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `src/app/(tabs)/home/page.tsx` | 전면 재구성 — TabHeader/큰 헤드라인/DAY N/TODAY 카드 틀/대형 CTA/DO·DON'T 카드/14일 스트립 제거, 아이브로+오늘 핵심 문장(유일한 대형 요소)+DO/DON'T 한 줄+사람 원장 행(또는 빈 상태 CTA)+AHEAD 미리보기+Ask 진입 칩으로 교체 |
| `src/app/(tabs)/home/page.test.tsx` | BRIEF-080 테스트를 새 구조(TabHeader 없음)에 맞게 갱신 + 신규 8건 |

`src/lib/`은 전혀 수정하지 않았다 — 홈은 기존 `getMyTodayCard`/`getDailyDoDont`/`getFlowDays`/`getTodayNote`/`getQuickPrompts`/`ELEMENT_COLORS`를 소비만 한다. `getDaysIn`은 여전히 존재하지만 홈에서 더 이상 호출하지 않는다(You 탭 통계는 무변경).

## 2. 구현 요지

**상단부(PART 1)** — 아이브로 "TODAY'S EDITION · AUG 5 TUE"(항상 영문 3자, 로케일 무관) → 오늘 핵심 문장(`getMyTodayCard`의 `note.line`, 카드 없이 배경 위에 직접, 한글 31px/영문 34px, line-height 1.22 — 화면에서 유일한 대형 텍스트) → DO/DON'T 한 줄(`getDailyDoDont`의 `dos[0]`/`donts[0]`만, 카드 없음, DO=wood 토큰, DON'T=vermilion).

**사람 원장 행(PART 2 §5)** — `readings`를 이름 기준 최신 1건으로 중복 제거(배열이 이미 최신순이라 첫 발견 항목을 채택), `themChart` 없는 사람은 건너뛰고 최대 3명 표시. 각 행: 오행색 점 8px · 이름 · 관계 라벨 · chevron(1줄), `getTodayNote(el, 'them', date, name)`의 한 줄을 말줄임(2줄). 헤어라인 구분, 카드 아님. 4명 이상이면 "See everyone ›" 행 추가.

**빈 상태(§7b)** — 사람 0명이면 같은 자리에 원장형 CTA 1행("＋ Add someone on your mind" / "You can start without a birth time", `/new`로 연결). 이때도 아이브로·핵심 문장·Do/Don't·AHEAD·Ask 칩은 정상 노출(스크린샷으로 확인).

**AHEAD(§6)** — `getFlowDays`에서 오늘(index 0) 제외, tone이 'good'인 날 중 가장 가까운 2일. 카드 본문은 `ME`/`ME_KO` 정본 풀에서 `pickVariant`(14일 스트립이 쓰던 것과 동일한 시드 패턴)로 재사용, 신규 카피 없음. 하단 고지("A hint, not an answer key" / "화면 힌트일 뿐, 정답표가 아니에요")는 정본 그대로. 0일이면 AHEAD 섹션 전체 숨김.

**Ask 진입 칩(§7a)** — `getQuickPrompts('general', isKorean)` 최대 3~4개, 탭 시 `/ask`.

## 3. 구현 중 발견한 문제와 처리 — 동시 dynamic import 레이스

두 개의 `useEffect`가 각각 `import('@/lib/today')`를 호출하는데(하나는 프로필-차트 이펙트의 `Promise.all` 안에서, 하나는 사람-행 이펙트에서 단독으로), 컴포넌트 마운트 시 두 이펙트가 거의 동시에 실행되면서 같은 모듈 스펙시파이어에 대한 **동시(concurrent) dynamic import 2건**이 발생한다. 실제 프로덕션(Next.js/브라우저)에서는 문제 없지만, Vitest의 모듈 목킹 러너에서 이 패턴이 두 번째 import를 목이 아닌 **실제 모듈**로 잘못 해석하는 레이스를 확인했다(재현: 별도 리포에서 최소 재현 스크립트로 확인, 최종 보고서에서는 재현 과정 생략). 해결: 모듈 스코프에 `loadTodayModule()`(promise 메모이제이션) 헬퍼를 추가해 두 이펙트가 실제로는 **단 한 번의 `import('@/lib/today')` 호출**만 공유하도록 했다 — 계산·저장 로직 변경이 아니라 순수 내부 구현 정리이며, 부작용으로 실제 프로덕션에서도 중복 모듈 페치를 줄이는 이점이 있다.

## 4. 렌더 확인 — 4장 (실제 브라우저, Playwright, 390×844)

텔레그램으로 **전송함**.

1. 사람 3명 홈 전체(아이브로/핵심 문장/Do·Don't/사람 3행/AHEAD 2장/Ask 칩 3개까지 전부).
2. 사람 0명 빈 상태(원장형 CTA + 다른 섹션 정상 노출).
3. AHEAD 2장 구간(카드 2장 + 고지 문구).
4. 첫 화면(스크롤 없이) — 대형 텍스트가 핵심 문장 "Momentum favors the one who starts. That's you." 하나뿐임을 육안 확인.

## 5. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` — 337개 전체 통과 (기존 329 + 신규 8, 무회귀 — 기존 BRIEF-080 테스트 1건은 TabHeader 제거에 맞춰 갱신)
- [x] `npm run build` 성공
- [x] 렌더 확인 4장 — §4, 텔레그램 전송함
- [x] 첫 화면 대형 텍스트 단일 요소 확인 — §4-4
- [x] main push 완료 (커밋 해시는 §6)

## 6. 커밋 해시

- 저장소: https://github.com/Farerworks/attune
- 커밋 해시: (본 커밋 — 텔레그램 완료 보고에 함께 남긴다)
