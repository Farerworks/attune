# BRIEF-110B — People 목록 카운트 정합 + chevron (조언자 P0 2건)

## 0. 범위 (한 기능)

**People 목록 행의 두 가지만 고친다.** ① 우측 카운트가 리딩만 세는 문제 ② 진입 단서(chevron) 부재.

- **BASE_SHA**: `f337b6597ebf7605f586958c7b9d66af4b47f754` (origin/main)
- **브랜치**: `feat/110b-people-count`
- **대상 파일**: `src/app/(tabs)/people/page.tsx` + 그 테스트 **2개뿐**
- **참고**: 행 전체 링크·`pressable`은 **이미 구현돼 있다**(`:183~195`) — 건드리지 않는다.

## 1. 할 일 ① — 카운트 정합 (`:220`)

현재: `{person.readings.length} READ/READS` — **리딩만 집계**. 사람 허브는 「리딩 1개 · 대화 1개」를 보여주므로 목록의 `1 READ`와 모순(조언자 P0).

**바꾼다**: 집계원을 `person.events.length`로 (리딩+대화 합계 — `PersonView.events`가 이미 둘 다 담음), 라벨은 단복수 처리:

```tsx
{person.events.length} {person.events.length === 1 ? 'ACTIVITY' : 'ACTIVITIES'}
```

- **영문 모노 유지**(스타일 무변경) — 허브 섹션 라벨 `RECENT ACTIVITY`와 용어 일치.
- 한글 라벨(`기록 2` 등) 금지 — Space Mono에 한글 글리프 없음(원칙 8) + 현지화 동결.

## 2. 할 일 ② — chevron

행 `<Link>` 내부 맨 오른쪽에 `›` 추가 — muted 색·세로 중앙·`aria-hidden="true"`. 110의 허브 행 chevron과 동일한 모양. 기존 flex 구조(아바타·본문)는 무수정, chevron만 형제로 추가.

## 3. 테스트 — `page.test.tsx` 보강

1. 리딩 1 + 대화 1인 사람 → `2 ACTIVITIES` 표시(`1 READ` 부재)
2. 리딩 1만 → `1 ACTIVITY`(단수)
3. chevron `›`이 행마다 렌더
4. 행 href `/person/<anchorReadingId>` **불변**(회귀 가드)

## 4. 금지 사항

1. 이 파일 밖 무접촉 2. 행 링크·`pressable`·아바타·3줄 구조 무변경 3. 한글 라벨 금지 4. `buildPeople`·`people.ts` 무접촉 5. main 직접 push/force push/rebase/merge commit 금지

## 5. 완료 기준

tsc 0 · lint 39(24E/15W) 이하 · vitest 기준 **999+4 expected fail**(passed 신규만큼 증가·expected fail 불변) · build 성공 · 변경 **정확히 2파일** + `docs/briefs/BRIEF-110B.md` 보관 · push 후 **병합 금지**(본부 검수 후 별도 지시)

## 6. 보고 양식

```
BASE_SHA 확인: / 브랜치·커밋: / 변경 파일(diff --stat 원문):
tsc: / lint: / vitest: / build: / 추가 테스트: / 막힌 점:
```
