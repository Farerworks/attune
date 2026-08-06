# BRIEF-101 v1.2 — Wave 1 전 마감 번들 5건

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `docs/briefs/BRIEF-101.md` | §0.5 — 브리프 원문 바이트 그대로 보관 (단독 커밋) |
| `src/components/TabBar.tsx` | §1 — 비활성 탭 색 muted→ink-body 2곳 |
| `src/components/TabBar.test.tsx` | §1 — 기존 기대값 갱신 1곳 + 신규 1건 |
| `src/lib/homeCopy.ts` | §2 — `pickAheadLines()` 신규(export) |
| `src/lib/homeCopy.test.ts` | §2 — 신규 7건 |
| `src/app/(tabs)/home/page.tsx` | §2 — AHEAD 픽 블록을 `pickAheadLines()` 1호출로 교체 |
| `src/app/(tabs)/home/page.test.tsx` | §2 — 모킹 방식 전환(`importActual`) + 픽스처 확장 + 가드 테스트 교체 |
| `src/components/TabHeader.tsx`, `src/components/TabHeader.test.tsx` | §3(a) — 삭제(`git rm`, 참조 0 확인 후) |
| `src/app/(tabs)/person/[id]/page.tsx` | §4 — 아이덴티티 행 `paddingTop` 8→16 / §4.5 — `TabTopBar`에 `title="People"` 추가 + 주석 갱신 |
| `src/app/(tabs)/person/[id]/page.test.tsx` | §4 — 기존 기대값 갱신 1곳 / §4.5 — 신규 1건 |
| `docs/reports/BRIEF-101.md` | 본 보고서 |

## 2. 구현 요지

**§1 탭바 비활성 색** — `TabBar.tsx`의 두 탭 블록(첫 두 탭·마지막 두 탭) 모두 `color: active ? 'var(--c-ink)' : 'var(--c-muted)'` → `'var(--c-ink-body)'`로 교체. 아이콘·라벨이 `currentColor`를 공유하므로 자동으로 함께 바뀐다.

**§2 AHEAD 로테이션** — `homeCopy.ts`에 순수 함수 `pickAheadLines(dates, pools, avoid)`를 신설했다. 각 날짜의 `dayIndex = Math.floor(Date.parse(date+'T00:00:00Z')/86400000)`을 시작 인덱스로 삼고, 후보가 `avoid` 또는 이번 호출에서 이미 고른 문장과 겹치면 `(idx+1)%len`으로 최대 `len-1`회 전진한다. `home/page.tsx`의 AHEAD 픽 블록(구 `pickVariant` 호출+인라인 상호 충돌 가드)을 `pickAheadLines(goodAhead.map(d=>d.date), pools, [myToday.note.line])` 1호출로 교체했고, `pickVariant`는 이 파일에서 더 이상 쓰이지 않아 destructure에서 제거했다.

**§3 파일 위생** — (a) `grep -rn "TabHeader" src/`로 실제 import 참조가 `TabHeader.test.tsx` 자신뿐임을 확인한 뒤(다른 파일들의 매치는 전부 주석·테스트명 텍스트) `git rm`으로 컴포넌트+테스트 둘 다 제거했다. (b) 미추적 브리프 인벤토리는 §3 하단에 기록만 하고 삭제·이동·커밋 전혀 하지 않았다.

**§4/§4.5 허브 상단** — 아이덴티티 행의 `paddingTop`을 8→16으로 복원(개별 longhand 유지). 같은 파일에서 `<TabTopBar right={<AccountAvatar />} />`에 `title="People"`을 추가해 People 탭과 완전히 같은 문법으로 위계(ATTUNE > People > 사람 이름)를 드러냈다. `TabTopBar.tsx` 자체는 무접촉 — 기존에 있던 `title` 분기(제목 줄 렌더 + `hasBelow`로 하단 패딩 자동 0 처리)가 그대로 작동한다. 상충하던 주석("hub isn't a tab root, so it doesn't get a title row")은 이번 결정(YS 결재, 위계 표시)에 맞춰 갱신했다.

## 3(b). 미추적 브리프 인벤토리 (기록만 — 삭제·이동 0건)

`git status --porcelain`의 미추적(`??`) 중 `BRIEF*.md` 류:

| 파일 | 크기(bytes) |
|---|---|
| BRIEF-094C-FIX.md | 3790 |
| BRIEF-094C-FIX2.md | 2459 |
| BRIEF-094D-FIX.md | 2335 |
| BRIEF-094D.md | 3356 |
| BRIEF-094E.md | 3317 |
| BRIEF-094F.md | 2775 |
| BRIEF-094G-v2.md | 3978 |
| BRIEF-095.md | 4002 |
| BRIEF-096.md | 4080 |
| BRIEF-097-v3.1.md | 5701 |
| BRIEF100v2.md | 10996 |
| BRIEF101.md | 10073 |

(`ILJU-PROFILES.md`·`RELATION-MODEL.md`·`SAFETY-SPEC(1).md`·`SAFETY-SPEC.md`는 `BRIEF*.md` 패턴이 아니라 이 인벤토리에서 제외했다 — 이들도 미추적이지만 지시서 §3(b)의 대상은 명시적으로 "브리프 md" 한정.)

## 4. 홈 표시 문자열 3개 (실측, 비중복 문자로 확인)

프로필 1990-06-15 14:30(일간: metal), en-US 로케일, 실제 렌더 기준:

- **TODAY**: `An expression day. Say the thing, start the thing.`
- **AHEAD①** (2026-08-12, WED): `Tailwind day — support finds you if you let it.`
- **AHEAD②** (2026-08-13, THU): `Energy flows toward you today. Receive it.`

세 문장 전부 상이함을 육안+문자열로 확인. `src/lib/today.ts`(무접촉)의 `getMyTodayCard`/`getFlowDays`/`ME` 실물 데이터로 `pickAheadLines`를 직접 호출해 재확인했다(스크립트 결과와 스크린샷 문구 일치).

## 5. 테스트

- **§1(2건)**: 기존 "비활성 People 탭" 기대값을 ink-body로 갱신 / 신규 — 비활성 Home 탭이 ink-body(무-muted)임을 명시.
- **§2 `homeCopy.test.ts`(7건 신규)**: ①동일 입력 2회=동일 출력 ②같은 rel 연속 2날짜=상이 ③avoid 충돌 시 회피 ④같은 rel 2일의 시작 인덱스 충돌 시 상호 상이 ⑤worst case(오늘+AHEAD 2일 모두 같은 rel·같은 시작 인덱스) — avoid+픽 2 = 그 풀의 3문장 전부 소진, 상호 상이 ⑥전제 고정 — `ME`·`ME_KO`의 5개 rel 풀 각각 길이 3·문장 전원 상이 + 순수성 확인 1건(반복 호출 안정).
- **§2 `home/page.test.tsx`**: `@/lib/homeCopy` 모킹을 `importActual` 스프레드로 전환(`getDailyDoDont`/`getFlowDays`만 오버라이드, `pickAheadLines`는 실물) / `@/lib/saju` 모킹에 `getDailyPillars` 더미 추가, `@/lib/today` 모킹에 `getRelation`/`TONE` 더미 추가(둘 다 import 해소용, 실행 안 됨) / 픽스처 `ME.same`을 3문장으로 확장(그중 첫 문장을 TODAY mock 문장과 동일하게 둠) / 기존 가드 테스트(254행 부근)를 새 메커니즘 기준으로 교체 — 같은 rel 2일의 AHEAD 카드 2장이 서로도, TODAY 문장과도 상이함을 확인. 기존 AHEAD 테스트(159·173·187·217행)는 문구·구조 무변경이라 그대로 통과.
- **§4(기존 갱신 1건)**: 아이덴티티 행 `paddingTop` 기대값 `'8px'`→`'16px'`, calc/safe-area 부재 확인은 유지.
- **§4.5(신규 1건)**: `getByRole('heading', { name: 'People' })`로 특정해 존재 확인 + 사람 이름 h1("Sam")과 공존 확인.

기존 전체 무회귀(§3(a)로 TabHeader 자체 테스트 2건이 파일째 삭제됨). **전체 508개 통과**(501 − 2(TabHeader 삭제) + 9(§1 1 + §2 homeCopy 7 + §4.5 1) = 509가 아니라 508인 이유: §2의 home/page.test.tsx는 기존 테스트 1건을 "신규 추가"가 아니라 "교체"했으므로 순증 0. 정확한 증감: 501 − 2(TabHeader) + 1(§1) + 7(§2 homeCopy) + 0(§2 page.test.tsx, 교체) + 1(§4.5) = 508. 지시서 예상치 "≈507"과 거의 일치 — 차이 1은 §1에 신규 1건을 추가로 넣은 것.

## 6. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` 전체 통과 (508개)
- [x] `npm run build` 성공
- [x] 렌더 ① 홈(TODAY+AHEAD 2장, full-page) ② 허브(360×640, ATTUNE 바+People 제목+아이덴티티 행 한 장) — §4, 텔레그램 전송함
- [x] main push 완료 — 해시는 §7(§0.5 보관 커밋은 이미 이번 대화 초반에 완료·푸시됨)

## 7. 커밋 해시

- 저장소: https://github.com/Farerworks/attune
- §0.5 브리프 보관 커밋: `17e3deb`
- 코드 커밋: `be27d37`
- 보고서 해시 반영 커밋: (다음 커밋에서 반영 예정)
