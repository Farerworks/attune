# BRIEF-101 v1.2 — Wave 1 전 마감 번들 5건 (탭바 대비 · AHEAD 로테이션 · 파일 위생 · 허브 여백 · 허브 People 제목)

## 0. 맥락 (자기완결)
Attune(github.com/Farerworks/attune, 랩 PC `~/projects/attune`). 기준 커밋 **ebb24d1**(vitest 501). 외부 테스터 공개 전 마지막 마감 판 — 아래 5건이 승인된 전부이며 **이 5건 외 어떤 변경도 금지.** 5건은 서로 독립: 하나가 막히면 그 항목만 정직 보고하고 나머지는 완성할 것.
**v1.1 변경(발사 전 외부 검수 반영)**: ①§0.5 브리프 보관 커밋 신설 ②§2 비중복 보장 전제 명문화+풀 전제 테스트 ③§5 홈 렌더 캡처 방식 완화. **v1.2 변경(이 문서가 정본, v1·v1.1 폐기)**: §4.5 허브 People 제목 1건을 YS 결재로 추가 편입(4건 캡의 결정권자 개정).

## 0.5 시작 전 1커밋 — 이 브리프 원문 보관 (신규 공정, 이번 판부터)
구현에 손대기 전에, 전달받은 이 파일을 **바이트 그대로** `docs/briefs/BRIEF-101.md`로 저장하고 **단독 커밋+push**할 것(커밋 메시지: `BRIEF-101: 브리프 원문 보관`). 수정·재포맷·개행 변환 금지 — 본부가 발행 정본과 바이트 대조로 검수한다. 이 **보관 커밋 해시**도 완료 보고에 포함.

## 1. 탭바 비활성 색 muted → ink-body
디자인 정본 "muted(대비 3.94:1)는 읽는 텍스트 금지"의 마지막 잔존. `src/components/TabBar.tsx` Link style 2곳(첫 두 탭 블록 ≈86행, 마지막 두 탭 블록 ≈143행):
- `color: active ? 'var(--c-ink)' : 'var(--c-muted)'` → `color: active ? 'var(--c-ink)' : 'var(--c-ink-body)'`
- 아이콘·라벨이 currentColor로 함께 바뀜 — 의도된 것(짝 유지). 활성 구분은 ink 색+filled 아이콘으로 충분.
- **동반 테스트 필수**: `TabBar.test.tsx` 34행 기대값 `'var(--c-muted)'` → `'var(--c-ink-body)'`(방치 시 적색). 비활성 탭=ink-body를 명시하는 테스트 1개 추가.
- 참고: 같은 관찰의 다른 한 곳(`+ Someone`)은 094I에서 이미 ink-body로 해소됨 — **ask 파일 수정 금지.**

## 2. AHEAD 문장 — 날짜 로테이션 + 한 화면 중복 제거
현상(본부 실측, ebb24d1): TODAY 문장과 AHEAD 카드가 같은 풀(`ME[rel]`)·같은 해시 픽 방식이라 **한 화면에 같은 문장이 2번** 나올 수 있다(5원소×45일 스캔에서 21회, 최초 사례 2026-08-08 wood). 같은 rel의 AHEAD 픽이 이웃 날짜에 같은 변주를 반복하는 경우도 14회. 094D 가드는 AHEAD 2장 상호·같은 rel일 때만 커버.

`src/lib/homeCopy.ts`에 순수 함수 신설:
```ts
export function pickAheadLines(dates: string[], pools: string[][], avoid: string[]): string[]
```
- `dayIndex = Math.floor(Date.parse(dates[i] + 'T00:00:00Z') / 86400000)`, 시작 인덱스 = `dayIndex % pool.length`.
- 후보가 `avoid`의 문장 또는 이번 호출에서 이미 고른 문장과 같으면 `(idx+1) % len` 전진, 최대 `len-1`회. "전부 소진 시 마지막 후보 수용"은 **방어적 폴백** — 아래 생산 전제에서는 도달 불가.
- `Math.random`·`Date.now()`·인자 없는 `new Date()` 사용 금지 — 인자만으로 결정되는 순수 함수.

**비중복 보장의 전제(명시)**: 생산 경로의 `ME`·`ME_KO` 각 rel 풀은 **서로 다른 3문장**이다. 이 전제에서 이 앱의 호출(avoid=오늘 문장 1개, AHEAD ≤2장)은 한 풀 안의 차단 후보가 최대 2개 → `len-1`(=2)회 전진 안에 자유 후보가 항상 존재하므로 **TODAY+AHEAD 2장 전부 비중복이 보장**된다. 전제 자체를 아래 테스트 ⑥으로 고정한다.

`src/app/(tabs)/home/page.tsx`: AHEAD 픽 블록(≈114~120행) 교체 — `pools` 계산은 그대로, `pickVariant` 호출+인라인 가드(116~120행)를 `pickAheadLines(goodAhead.map(d => d.date), pools, [myToday.note.line])` 1호출로 대체. homeCopy 동적 import destructure에 `pickAheadLines` 추가, today destructure에서 `pickVariant` 제거(이 파일에 잔여 사용 없음).

**수용 기준(YS 정본 — 각각 테스트로 증명):**
1. **같은 화면 문장 중복 없음** — AHEAD 2장 상호 + TODAY 문장 대비 전부.
2. **같은 날짜 재렌더 안정성** — 동일 입력 재호출 = 동일 출력.
3. **다음 날짜 로테이션** — 연속한 날짜는 같은 rel에서 다음 변주(상이).
4. **랜덤·hydration 불일치 없음** — 순수 함수 + 기존처럼 useEffect 안에서만 호출(SSR 경로 신설 금지).

테스트:
- `homeCopy.test.ts` 단위 6+(실제 `ME` 풀 사용): ①동일 입력 2회=동일 출력 ②같은 rel 연속 2날짜=상이 ③avoid 문장과 충돌 시 회피 ④같은 rel 2일의 시작 인덱스 충돌 시 상호 상이 ⑤worst case — 오늘 rel=AHEAD 2일 rel 모두 동일하고 avoid가 그 풀의 문장일 때 3문장(avoid+픽 2) 전부 상이 ⑥**전제 고정** — `ME`·`ME_KO`의 5개 rel 풀 각각 길이 3·문장 전원 상이.
- `home/page.test.tsx`: ⓐ`@/lib/homeCopy` mock을 `importActual` 스프레드로 전환(기존 getDailyDoDont·getFlowDays 오버라이드 유지, `pickAheadLines`는 실물 통과) ⓑ homeCopy 실모듈이 로드되도록 `@/lib/saju` mock에 `getDailyPillars`, `@/lib/today` mock에 `getRelation`·`TONE` 더미 export 추가(실행되지 않음 — import 해소용) ⓒ픽스처 mock `ME.same`을 3문장으로 확장(실풀과 동일 길이) ⓓ254행 가드 테스트를 새 메커니즘 기준으로 갱신: TODAY mock 문장을 `ME.same`의 한 문장과 동일하게 두고, 같은 rel 2일 → 카드 2장이 서로도 TODAY와도 상이함을 확인.
- 기존 AHEAD 테스트(159·173·187·217행)는 통과 유지되어야 함(문구·구조 무변경이므로).

**문구 무변경(정본 문자열)**: `ME`·`ME_KO`·`DO_*`·`DONT_*`·`THEM_*` 풀 전체와 AHEAD 고지("A hint, not an answer key" / "힌트일 뿐, 정답표가 아니에요")는 **바이트 그대로** — 이 표면의 문구 사고 전례 있음. KO/EN 풀의 인덱스 정렬이 정본 — 순서 재배열 금지.

## 3. 파일 위생 2건 (동작 무변경)
**(a) 미사용 TabHeader 제거 — 참조 0 확인 후**: `grep -rn "TabHeader" src/`로 import 참조가 자기 테스트(`TabHeader.test.tsx`)뿐임을 확인(다른 테스트의 주석·테스트명 언급은 import 아님 — 무시) → `git rm src/components/TabHeader.tsx src/components/TabHeader.test.tsx`(테스트 2개 감소).
**(b) 미추적 브리프 — 이번 판은 인벤토리 보고만(삭제 0건 고정)**: `git status --porcelain`의 미추적(`??`) 중 브리프 md(`BRIEF*.md` 류) 목록(파일명·크기)을 보고서에 **기록만** 할 것. 삭제·이동·커밋 전부 하지 않는다 — `docs/briefs/`로의 이관은 별도 후속 판이다.
**금지**: `git clean` 절대 금지 / `.env*` 등 다른 미추적 파일 무접촉 / 이 판에서 저장소에 커밋하는 브리프는 **§0.5의 BRIEF-101.md 1건뿐** — 기존 미추적 브리프를 커밋·삭제·이동하지 말 것.

## 4. 허브 상단 여백 16px 복원 (YS 결재)
`src/app/(tabs)/person/[id]/page.tsx` 아이덴티티 행(≈266행) `paddingTop: 8` → `paddingTop: 16`.
- longhand 유지(해당 주석의 jsdom shorthand+env() 전례 — `padding` 축약형으로 합치지 말 것). ATTUNE 바(`TabTopBar.tsx`)는 전 탭 공유 — **무접촉.**
- **동반 테스트 필수**: `person/[id]/page.test.tsx` 194행 `toBe('8px')` → `toBe('16px')`(방치 시 적색). calc/safe-area 부재 확인(195~196행)은 그대로 유지.

## 4.5 허브 상단 People 제목 (v1.2 — YS 결재)
허브에 들어가도 위계(ATTUNE > People > 사람)가 보이게 한다. 같은 파일 `src/app/(tabs)/person/[id]/page.tsx`:
- `<TabTopBar right={<AccountAvatar />} />`(≈257행) → `<TabTopBar right={<AccountAvatar />} title="People" />` — People 탭(people/page.tsx 62행)과 **완전 동일 문법.** `TabTopBar.tsx` 컴포넌트 자체는 무접촉(분기 기존재 — title 있으면 제목 줄+하단 패딩 0 처리 자동).
- 정본 문자열: 제목은 정확히 `People`(EN 고정 — People 탭과 동일, KO 로케일에서도 그대로).
- 효과: 제목 줄까지 sticky 바에 포함되어 스크롤 시 함께 고정(People 탭과 동일). 현 257행 주석("hub isn't a tab root, so it doesn't get a title row")은 이번 결정과 상충 — **주석을 이번 정본(YS 결재, 위계 표시)으로 갱신**할 것.
- 동반 테스트: 허브 렌더에 제목 존재 확인 1개 — `getByRole('heading', { name: 'People' })`로 특정(실앱 DOM엔 하단 탭 라벨 'People'도 있으므로 텍스트 쿼리 금지). 기존 이름 h1(사람 이름)과 공존 확인.

## 5. 완료 기준
- [ ] `npx tsc --noEmit` / `npx vitest run` 전체(예상 ≈507: 501−2+신규 — 정확 수치 보고) / `npm run build`
- [ ] 렌더: ①홈 — TODAY 문장+AHEAD 카드 2장, **full-page 스크린샷 1장 또는 연속 캡처 2장** 허용(한 viewport 강제 아님). **실제 표시된 문자열 3개(TODAY·AHEAD①·AHEAD②)를 보고서에 그대로 기록**해 비중복을 문자로도 확인 ②허브 상단 — **360×640 작은 화면**(ATTUNE 바+**People 제목**+아이덴티티 행이 한 장에). 확보 실패 시 시도 내용 정직 기록(본부가 검수에서 확보).
- [ ] `docs/reports/BRIEF-101.md` 커밋+push, **커밋 해시 보고**. 보고서에: 해시(§0.5 보관/코드/보고서) · 전체 테스트 수치 · 변경 파일 목록 · §3(b) 미추적 인벤토리 · 홈 표시 문자열 3개.

## 6. 금지사항
- 위 5건+§0.5 보관 커밋 외 전부. 특히: `getTodayNote`·`pickVariant`·`getFlowDays`·`getDailyDoDont`의 시그니처·동작(You·People·reveal·ArchetypeCard 공유), TODAY 문장 선택 로직, `TabTopBar.tsx`, ask 화면 전체, route.ts·API·스키마, src/lib의 다른 파일, package.json/lock, 다른 화면.
- **사용자 대면 문구 변경 0인 판** — 어떤 카피도 바꾸지 말 것.
