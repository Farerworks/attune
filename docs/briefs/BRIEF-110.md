# BRIEF-110 v1.1 — 사람 허브 활동 행 어포던스 통일 (조언자 확정안)

## 0. 범위 (한 기능)

**사람 허브(`/person/[id]`)에서 기록으로 들어가는 길을 보이게 만든다.** 세 가지:
① 리딩·대화 **두 행 모두** 전체 행 링크화(chevron·눌림·터치 영역 통일) ② RECORD 섹션을 A SAJU LENS 위로 ③ 섹션 라벨 `RECORD` → `RECENT ACTIVITY`.

- **BASE_SHA**: `f35db153d1b5f84feaebaa6bbd2c4be8b4d17ba9` (origin/main)
- **브랜치**: `feat/110-record-affordance`
- **대상 파일**: `src/app/(tabs)/person/[id]/page.tsx` + 그 테스트 **2개뿐**
- **근거**: 오너 실사용에서 리딩 진입로 미발견(269신) · `DESIGN-DIRECTION` 원칙 10 위반 시정 · 조언자 확정(Q1⒟ 확장: 두 행 통일, 270~271신).

## 1. 할 일 ① — 활동 행 공통 인터랙션 (`:383~440` 부근)

**리딩 행**: 행 전체(날짜 줄+제목+보조 문구)를 하나의 `<Link href={/reading/${event.readingId}}>`로 감싼다. **제목만 감싸던 기존 Link 제거**(중첩 금지).
**대화 행**: 행 전체를 하나의 `<Link href={/ask?person=${event.readingId}}>`로 감싼다. **기존 「대화 이어가기 →」 Link는 비링크 `<span>`으로 바꾼다**(문구 유지, **화살표 `→` 제거** — 진입 단서는 chevron이 담당).

**두 행 공통**:
1. 행 컨테이너 `minHeight: 56` + `className="pressable"`
2. **우측 chevron `›`** — muted 색·세로 중앙
3. 리딩 행 보조 문구(제목 아래, 대화와 같은 자리·스타일): `korean ? '리딩 보기' : 'Open reading'` — 비링크 `<span>`, 화살표 없음
4. `<Link>` `aria-label` = 보조 문구와 동일
5. **focus 시 기본 outline 제거 금지**(키보드 접근 유지)
6. 타임라인 점(●)·연결선·행 간격·날짜/제목 텍스트 스타일은 무접촉. **행 사이 divider는 추가하지 않는다**(연결선이 구분 역할 — 구조 재편은 별도 판)

## 2. 할 일 ② — 섹션 순서 + 라벨

1. **RECORD 블록을 A SAJU LENS 블록 위로 이동** — JSX 블록 위치 교환만, 내부 코드·스타일·조건 무수정.
2. 섹션 라벨 텍스트 `RECORD` → **`RECENT ACTIVITY`** (`:366` 한 곳). 근거: 이 목록은 전체 타임라인이 아니라 요약 활동(리딩 전체 + 리딩별 최근 질문 1개)이라 `RECORD`는 과약속. **영문 모노 유지**(스타일 무변경). `A SAJU LENS` 라벨은 그대로.

## 3. 테스트 — `page.test.tsx` 보강·수정

1. 리딩 행: **행 전체가 `/reading/<id>` 링크**(날짜·제목·보조 문구가 같은 링크 내부)
2. 대화 행: **행 전체가 `/ask?person=<id>` 링크** + 내부에 **중첩 `<a>` 없음**
3. `aria-label`: `리딩 보기`/`대화 이어가기`(korean) — EN 분기도 1건
4. chevron `›`이 행마다 렌더
5. 섹션 순서: `RECENT ACTIVITY`가 `A SAJU LENS`보다 먼저 등장
6. 기존 테스트 중 「대화 이어가기 →」 링크를 단언하던 것이 있으면 **새 구조로 갱신**(삭제 아님)

## 4. 금지 사항

1. 이 파일 밖 무접촉 2. **KO 라벨화 금지**(`최근 활동` 등 — 현지화 동결, 별도 판) 3. `collectPersonEvents` 로직 무변경 4. 신규 문구는 `리딩 보기`/`Open reading` + 라벨 `RECENT ACTIVITY` — 그 외 창작 금지(대화 문구는 기존 재사용, 화살표만 제거) 5. divider·카드화·색상 추가 금지 6. CTA 위치 이동 금지(별도 판) 7. main 직접 push/force push/rebase/merge commit 금지

## 5. 완료 기준

1. tsc 0 2. lint 39(24E/15W) 이하 3. vitest 기준 **993+4 expected fail** — passed 신규만큼 증가·expected fail 불변 4. build 성공 5. 변경 파일 **정확히 2개** + `docs/briefs/BRIEF-110.md` 보관 6. push. **병합 금지** — 본부 검수 후 별도 지시

## 6. 보고 양식

```
BASE_SHA 확인: / 브랜치·커밋:
변경 파일(git diff --stat 원문):
tsc: / lint: / vitest: / build:
추가·수정 테스트 목록:
중첩 링크 없음 확인 방법:
막힌 점:
```
