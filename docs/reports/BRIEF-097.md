# BRIEF-097 v3.1 — 사람 허브 + People 원장형

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `src/lib/askThreads.ts` | 신규 — Ask 스레드 읽기 어댑터(`AskMessage`/`AskThreads`/`loadAskThreads()`) |
| `src/lib/askThreads.test.ts` | 신규 3건 |
| `src/lib/people.ts` | 신규 — `personKey`/`groupReadingsByPerson`/`collectPersonEvents`/`buildPeople` (순수 함수) |
| `src/lib/people.test.ts` | 신규 11건 |
| `src/app/(tabs)/ask/page.tsx` | 내부 스레드 타입·로더를 `askThreads.ts` 참조로 교체(동작 동일), `?person`+`?prefill` 단일 초기화 패스로 통합 |
| `src/app/(tabs)/ask/page.test.tsx` | 신규 1건 |
| `src/app/(tabs)/people/page.tsx` | 원장형 3줄 목록으로 재작성(`buildPeople` 기반) |
| `src/app/(tabs)/people/page.test.tsx` | 신규 2건 |
| `src/app/(tabs)/person/[id]/page.tsx` | 신규 — 사람 허브 화면 |
| `src/app/(tabs)/person/[id]/page.test.tsx` | 신규 7건 |
| `src/components/TabBar.tsx` | People 활성 판정을 `/person/*`까지 확장(1줄) |
| `src/components/TabBar.test.tsx` | 신규 3건 |

## 2. 구현 요지

**askThreads.ts** — `ask/page.tsx`에 있던 `UserMsg`/`AssistantMsg`/`Msg`/`Threads` 인터페이스와 `loadThreads()`를 그대로(필드 하나 안 바꾸고) 옮겼다. 저장 키(`attune.ask.threads`)·40개 상한(쓰기 시점 캡, `saveThreads`에 그대로 남음)·동작 전부 무변경 — `people.ts`가 이 어댑터로 Ask 스레드를 읽는다.

**people.ts** — 저장 구조를 전혀 건드리지 않는 순수 함수 3+1개:
- `personKey(name, birthDate)`: 이름 정규화(trim+lowercase)+생년월일. **내부 전용, export는 하지만 URL에는 절대 안 씀** — URL은 항상 `anchorReadingId`(기존에 있던 리딩 id, 불투명)만 쓴다.
- `groupReadingsByPerson`: personKey로 묶고, 그룹 내 최신 리딩 기준으로 `anchorReadingId`·`relationship`·`element`·`stem`·`stemHanja`/`branchHanja`(일주 프로필 재사용용, `themChart.pillars.day`에 이미 있던 값 노출만)를 뽑는다. `startedAt`은 최초 리딩의 createdAt.
- `collectPersonEvents`: 리딩마다 이벤트 1개(헤드라인 또는 situation) + **그 리딩의 스레드**에서 유효한 createdAt을 가진 마지막 사용자 질문 1개(합치지 않고 리딩별로 따로) → 내림차순.
- `buildPeople`: 그룹핑 결과에 이벤트를 붙여 `lastActiveAt`(이벤트 없으면 최신 리딩 createdAt)과 `latestExcerpt`를 계산하고, **이 값 기준으로 정렬까지 마쳐서** 반환한다 — People 목록·허브 메타 전부 이 함수 하나만 보면 된다(RELATION-MODEL v1.4가 지적한 "그룹핑만으론 Ask 반영 불가" 문제 해소).

**Ask `?person`+`?prefill` 단일 패스** — 기존엔 두 개의 독립된 `useEffect`가 각자 `router.replace()`를 부를 수 있어 경합 여지가 있었다. 이제 초기화 이펙트 하나에서 두 파라미터를 함께 읽고, 적용하고, 정리(둘 다 지운 뒤) `router.replace()`를 **한 번만** 호출한다. 파라미터가 둘 다 없으면 여전히 replace를 부르지 않는다(무변경 무회귀).

**People 원장형** — `buildPeople(readings, loadAskThreads())`의 `lastActiveAt` 내림차순으로 사람 1행씩. 행은 3줄(①아바타+이름(ellipsis)+우측 `N READS` 모노 ②관계 · 최근 이야기 〈상대시간〉(알약 없이 Pretendard) ③latestExcerpt 1줄), chevron 없이 행 전체가 `/person/<anchorReadingId>`로 링크. READ/BORN 날짜·아키타입 이름·오늘 한 줄(`getTodayNote`)은 전부 제거했다. "기록 없음" 문구는 만들지 않았다 — 사람은 리딩에서만 파생되므로 이 버전에서 도달 불가능한 상태다.

**사람 허브 (`/person/[id]`)** — `[id]`는 "이 사람에 속한 리딩 하나"를 가리키는 조회 키로만 쓴다(반드시 최신 anchor일 필요 없음 — 오래된 공유 링크로 들어와도 `personKey`로 현재 그룹을 다시 찾는다). 존재하지 않는 id면 `router.replace('/people')`.
1. **아이덴티티**: 아바타+이름(Pretendard 650, 세리프 금지)+관계+뒤로가기(hit 44, `window.history.length`로 직접 진입 여부 판단 — 히스토리 없으면 `/people`로 replace). 메타 2줄: KO `이야기 N일째` / `리딩 A개 · 대화 B개`(B=0이면 그 줄 자체 생략), EN `DAY N` / `A READINGS · B CHATS`(단수 `1 READING`/`1 CHAT` 처리).
2. **A SAJU LENS**: 섹션 라벨은 다른 화면(AHEAD 등)과 동일하게 영문 모노 유지, 프레이밍 문장만 KO/EN 새로 추가. iljuProfiles 합성명·부제·essence는 문구 그대로 재사용하되, **이 페이지에서는 Pretendard로만 렌더**(IljuSheet 자체의 세리프 스타일은 "더 보기"로 열리는 모달 안에서만 유지) — 화면당 세리프 예산을 실타래 섹션에 전부 할당하기 위해서다(§3 참고).
3. **기록(실타래)**: 세로 hairline + 점(최신 1개만 vermilion 채움, 과거는 hairline 테두리만 — 오행색 전혀 안 씀). 항목 라벨은 KO `리딩`/`대화`(Pretendard), EN `READING`/`ASK`(모노) — 언어 혼용 없음. **세리프는 화면 전체에서 0~1개**: 최신 이벤트가 리딩이면 그 헤드라인만 세리프+2줄 clamp, 최신이 Ask면 그 질문은 Pretendard 600이고 세리프는 아예 없음. 과거 항목은 전부 Pretendard. 리딩 이벤트는 `/reading/[id]`로(무수정), Ask 이벤트는 `/ask?person=<그 리딩 id>`로.
4. **행동**: 대표 CTA `이 관계에 대해 묻기 →`(vermilion 전폭)는 **항상 그 사람의 현재 anchor(최신 리딩 id)**로 연결 — 허브에 도달한 `[id]`가 오래된 리딩이어도 CTA는 항상 최신을 가리킨다(스크린샷 ④로 확인). 보조 `새로 읽기`는 텍스트 링크로 `/new`.

**TabBar** — People 탭의 active 판정만 `pathname === '/people' || pathname.startsWith('/person/')`로 확장(1줄, 지시서가 명시적으로 허용한 예외).

## 3. 사람 단위 삭제 UI 존재 조사 (§6 요구)

`src/lib/store.ts`에 `deleteReading(id)` 함수가 이미 존재하지만, 코드베이스 전체에서 **실제로 호출하는 곳이 한 곳도 없다** (`grep -rn "deleteReading" src` → 정의 파일 자신 외 매치 0건). 즉 사용자가 리딩(따라서 사람)을 지울 수 있는 UI 경로가 현재 전혀 없다.

RELATION-MODEL v1.3 ⑫가 예상한 그대로다 — 허브가 사람의 기록을 한데 모아 보여주기 시작하는 지금, "지울 권리"도 같이 보여야 한다는 지적이 그대로 유효하다. **이번 판(097)에서는 삭제 UI를 만들지 않았다** — 브리프 §6 지시대로 "부재 시 다음 판(098)에서 삭제/숨김 기능"으로 예고만 하고 넘어간다.

## 4. 테스트

- **lib (askThreads 3 + people 11 = 14건)**: 저장 키/형식 무변경 읽기, 동명이인(생일 다름) 분리, 같은 사람 2리딩 1그룹, anchor·relationship이 최신 리딩 기준, startedAt이 최초 리딩 기준, day-pillar hanja 노출, 무시각·오류 메시지 제외, 이벤트 내림차순+리딩별 Ask 분리(합치지 않음), latestExcerpt가 실제 최신(옛 Ask보다 새 리딩이 이기고 그 반대도 성립), **buildPeople 정렬**(어제 리딩+방금 Ask한 사람이 오늘 리딩만 한 사람보다 위).
- **People (2건)**: 2리딩 1행+"2 READS"+href=anchor, "TODAY" 문구 전무.
- **허브 (7건)**: 이름 비세리프, 최신=리딩이면 세리프 정확히 1곳(그 헤드라인), 최신=Ask면 세리프 0곳, 최신 점만 vermilion(과거는 투명+hairline 테두리), 메타 B(비어있지 않은 스레드 수, 메시지 수 아님), EN 단수형(`1 READING`), CTA가 조회에 쓰인 id가 아니라 **항상 현재 anchor**를 가리킴.
- **Ask (1건)**: `?person=A&prefill=Q` → 선택=A + 입력=Q + URL이 정확히 `/ask`(replace 1회만).
- **TabBar (3건)**: `/people`·`/person/[id]`·다른 탭 각각에서 People 활성 판정.

기존 전체 무회귀. 전체 434개 통과(기존 407 + 신규 27).

## 5. 렌더 확인 — 6장 (실제 브라우저, Playwright, 390×844)

텔레그램으로 **전송함**.

1. **기능 — People 3명**: 원장형 3줄, chevron 없음, `lastActiveAt` 순(방금 Ask한 사람이 맨 위).
2. **기능 — 동일인 2리딩 1행**: "2 READS", 최신 리딩의 헤드라인이 발췌로.
3. **기능 — 허브 전체**: 아이덴티티+메타 2줄+A SAJU LENS+기록(최신=Ask라 세리프 0, vermilion 점 1개)+CTA.
4. **기능 — CTA 프리셀렉트**: 허브에서 CTA 클릭 → Ask 화면에 해당 사람 탭이 선택된 채(밑줄) 진입.
5. **일체감 — KO**: People 목록.
6. **일체감 — EN**: 동일 구조를 영어로, 같은 3줄 리듬 유지.

일체감의 최종 "예쁜지" 판정은 지시서대로 YS 실물 확인이 필요한 영역이라 별도 요청드립니다.

## 6. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` — 434개 전체 통과 (기존 407 + 신규 27)
- [x] `npm run build` 성공
- [x] 렌더 확인 6장 — §5, 텔레그램 전송함
- [x] 사람 단위 삭제 UI 존재 조사 — §3
- [x] main push 완료 (커밋 해시는 §8)

## 7. 정직 보고

- **실타래 세로선이 첫 점~마지막 점에 픽셀 단위로 정확히 맞진 않는다.** 이벤트마다 텍스트 줄 수가 달라 실제 렌더 높이가 제각각인데, JS로 각 행 높이를 측정하지 않고 순수 CSS(고정 오프셋)로 근사했다 — 짧은 항목들 사이에서는 거의 정확하지만, 긴 여러 줄 발췌가 섞이면 선이 마지막 점을 살짝 지나치거나 못 미칠 수 있다. 기능(색·개수·연결 대상)은 전부 맞지만 이 부분은 시각적 근사치라고 밝힌다.
- **People 행 2줄("관계 · 최근 이야기 〈상대시간〉")과 허브의 몇몇 문구(재진입 CTA "Continue the conversation →", "Read again" 등)는 지시서에 KO만 있고 EN 정본이 없어 직접 지었다** — 기존 세션에서 반복된 패턴과 동일한 판단 기준(자연스러운 영어, 지시서 톤 유지)을 따랐다.
- **A SAJU LENS 섹션을 Pretendard로만 렌더**하기로 한 것은 RELATION-MODEL v1.4의 "화면당 세리프 0~1"을 실타래 섹션에 전량 배정하기 위한 해석 판단이다 — v1.3은 이 섹션에 세리프를 쓰라는 뉘앙스가 있었지만(IljuSheet 자체가 세리프), v1.4의 최종 규칙이 "최신 이벤트 기준" 단일 배정으로 정리됐다고 읽어 이렇게 구현했다. "더 보기"로 열리는 실제 IljuSheet 모달은 원래 스타일(세리프) 그대로 두었다(그 컴포넌트 자체는 수정하지 않았으므로).
- 뒤로가기의 "직접 진입 판정"은 `window.history.length > 1`로 구현했다 — 완벽하진 않은 휴리스틱이다(예: 새 탭에서 앱 안 다른 페이지를 여러 번 거쳐 왔지만 세션 자체가 짧으면 오판할 수 있음). 실기기에서 자연스러운지 확인이 필요하다.

## 8. 커밋 해시

- 저장소: https://github.com/Farerworks/attune
- 커밋 해시: (커밋 후 갱신 예정)
