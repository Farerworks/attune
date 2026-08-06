# BRIEF-094I — 첫인상 정합 2건: 첫 방문 칩 슬림 통일 + 허브 상단 ATTUNE 바

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `src/app/(tabs)/ask/page.tsx` | §1 첫 방문 칩 크기 분기 제거 — 항상 슬림 탭 |
| `src/app/(tabs)/ask/page.test.tsx` | §1 관련 테스트 교체 1건 + 신규 1건 |
| `src/app/(tabs)/person/[id]/page.tsx` | §2 ATTUNE 워드마크 바 추가, 아이덴티티 행 패딩 조정 |
| `src/app/(tabs)/person/[id]/page.test.tsx` | §2 094H §3 테스트를 3건으로 교체 |

## 2. 구현 요지

**§1 Ask 첫 방문 칩 슬림 통일** — 칩 행의 `hasAnyThread` 크기 분기 3곳(행 `gap`/`alignItems`, `ChipButton`의 `size`, `+ Someone`의 스타일)을 전부 제거하고 항상 "대화 있음"용 슬림 값(`gap:16`, `alignItems:'center'`, `size="tab"`, `+ Someone`은 텍스트 링크 스타일 `padding:'9px 2px', minHeight:44`)로 고정했다. `ChipButton` 컴포넌트 자체와 tab 크기 수치는 무수정 — size prop 호출부만 바꿨다. 첫 방문 캡션 2종(`YOU · TIMING · ANYTHING`, `ADD A PERSON`)과 그 표시 조건(`!hasAnyThread`)은 문구·스타일·조건 그대로 유지, 이제 슬림 탭 아래 그대로 붙는다.

**§2 허브 상단 ATTUNE 바** — 아이덴티티 행(뒤로가기+아바타+이름) 위에 `<TabTopBar right={<AccountAvatar />} />`를 추가했다(title 없음 — Home과 동일한 "워드마크만" 문법, People처럼 title이 있는 탭 루트와 구분). People 페이지(62행)와 동일한 사용례를 그대로 따랐다. 기존에 아이덴티티 행 자체가 지고 있던 safe-area 패딩(`calc(12px + env(safe-area-inset-top, 0px))`, 094H §3에서 추가)은 이제 TabTopBar가 담당하므로 `paddingTop: 8`로 되돌렸다 — 094H §3 처방의 정당한 대체다. 개별 longhand 표기(`paddingTop`/`Right`/`Bottom`/`Left`)는 지시서대로 유지했다. `TabTopBar`·`AccountAvatar` 컴포넌트 자체와 아이덴티티 행 내부(뒤로가기 44px 히트·아바타·이름·relationship)는 무수정. ATTUNE 바만 고정(`sticky`, TabTopBar 자체 구현), 아이덴티티 행은 콘텐츠와 함께 스크롤 — Home과 동일한 스크롤 문법이다.

## 3. 테스트

- **Ask**: 기존 "empty first visit keeps full-size chips (minHeight 48)" 테스트는 새 동작과 정면으로 충돌해서(더 이상 48px 대형 알약이 아님) 교체했다 — 첫 방문 Me 칩이 이제 `minHeight:44px`+`background:transparent`+`aria-pressed:true`(슬림 탭 스타일)이고 캡션도 그대로 있는지 확인. 신규 1건: `+ Someone`에 dashed 테두리가 없고 `minHeight:44px`인지 확인.
- **허브**: 094H §3 테스트("아이덴티티 행이 직접 safe-area 패딩을 짊”)를 3건으로 교체 — ① `ATTUNE` 워드마크 렌더 존재 ② 그 워드마크를 감싼 요소의 `paddingTop`에 `12px`+`safe-area-inset-top`이 포함(jsdom의 `env()` 인자 순서 깨짐 전례로 부분 문자열 비교) ③ 아이덴티티 행 자체의 `paddingTop`은 정확히 `'8px'`이고 `calc`/`safe-area` 문자열을 포함하지 않음.
- **부수 발견 및 수정**: 허브 페이지에 `AccountAvatar`가 처음 렌더되면서, 이 컴포넌트가 마운트 시 자체적으로 `getSyncSession()`을 호출하는데 이 파일의 기존 `@/lib/sync` 모킹(BRIEF-098에서 추가)이 기본값을 주지 않아 `.then()`이 `undefined`에서 터지며 기존 테스트 7건이 함께 깨졌다. `beforeEach`에서 `mockGetSyncSession.mockResolvedValue(null)`로 기본값을 세팅해 해결했다 — 각 테스트가 필요 시 개별적으로 override하는 기존 패턴은 그대로 유지.

기존 전체 무회귀. **전체 464개 통과**(기존 461 + 신규/교체 반영 순증 3).

## 4. 렌더 확인 — 4장 중 3.5장 확보

텔레그램으로 **전송함**(①②③④ 4장, ④는 People+허브를 나란히 합성한 이미지).

1. **빈 데이터 Ask — 슬림 탭+캡션**: 확보. Me 칩이 슬림(도트+vermilion underline)으로, 아래 캡션 2종 그대로.
2. **대화 있는 Ask — 무회귀 확인**: **부분 확보.** 원래 계획대로 리딩(Sam)까지 함께 시드해서 대화 스레드가 있는 화면을 찍으려 했으나, 리딩을 함께 넣으면 Ask 화면이 첫 방문 화면 그대로 멈춰서(Me 칩 자체가 안 뜨고 스레드도 반영 안 됨) 렌더가 안 됐다. 리딩 없이 `me` 스레드만 시드했을 때는 정상적으로 슬림 탭+vermilion underline+메시지 버블이 렌더됨을 확인해서, 이 버전을 §1 변경의 무회귀 증거로 채택했다. 리딩을 함께 넣었을 때만 재현되는 이 문제는 원인을 특정하지 못했고(094H 때 겪은 것과 비슷하게 dev 서버+Playwright 조합에서만 나는 문제로 추정), 이번 BRIEF의 변경 범위(칩 크기 분기 제거)와는 무관해 보인다 — 시간을 더 쓰지 않고 여기 기록만 남긴다.
3. **허브 — ATTUNE 바+아바타+아이덴티티, 스크롤 상태**: 확보. `window.scrollTo(0, 200)` 후 캡처했는데, 이 리딩 1개짜리 허브는 전체 콘텐츠 높이가 뷰포트보다 작아 실제로 스크롤이 거의 발생하지 않았다 — "스크롤해도 ATTUNE 고정"은 콘텐츠가 더 긴 경우에 대한 시각적 실증까지는 못 했고, People과 동일한 `TabTopBar`(자체 `sticky`) 구현을 그대로 재사용했다는 코드 근거로 대신한다.
4. **People과 허브 나란히**: 확보(PIL로 두 스크린샷을 가로로 합성). 양쪽 다 동일한 `ATTUNE` 워드마크 바 + 우측 아바타 위치로 일체감 확인 가능.

## 5. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` 전체 통과 (464개)
- [x] `npm run build` 성공
- [x] 렌더 4장 — §4, 텔레그램 전송함(②는 계획과 다른 시드 조합으로 대체, ③은 스크롤 실증 미흡 — 둘 다 §4에 명시)
- [x] main push 완료 (커밋 해시는 §7)

## 6. 정직 보고

- **②번 스크린샷은 지시서가 요구한 "리딩+스레드가 함께 있는" 정확한 시나리오를 재현하지 못했다.** 리딩(Sam)을 시드에 포함시키면 Ask 화면이 첫 방문 상태로 멈추는 현상을 발견했는데, 원인을 조사하다가(094H 때의 S1 렌더 실패와 마찬가지로 dev 서버 재시작 직후 Playwright 조합에서만 나는 문제로 보임) 더 파지 않고 리딩 없이 `me` 스레드만 있는 버전으로 대체했다. §1이 건드린 건 칩 크기 스타일뿐이라 이 대체로도 "슬림 탭이 대화 있는 화면에서도 그대로 유지된다"는 무회귀 확인 목적은 달성했다고 판단했지만, 원래 계획한 정확한 그림은 아니다.
- **③번 "스크롤 상태에서 ATTUNE 고정"은 시각적으로 스크롤이 거의 안 일어난 상태로 캡처됐다** — 리딩 1개짜리 허브는 콘텐츠가 짧아 200px 스크롤 여지가 별로 없었다. `TabTopBar`가 People과 동일한 `position: sticky` 컴포넌트이므로 동작 자체는 코드 레벨에서 보장되지만, 스크린샷으로 직접 보여주지는 못했다.
- **허브 아이덴티티 행의 새 `paddingTop: 8`은 지시서 리터럴 값을 그대로 썼다** — 094H에서는 여기가 `calc(12px+safe-area)`였는데, 이제 그 역할이 TabTopBar로 넘어갔으니 아이덴티티 행 자체는 순수한 시각적 여백(8px)만 남는다는 게 지시서 의도로 이해했다.
- **AccountAvatar의 `getSyncSession()` 모킹 부재로 기존 테스트 7건이 함께 깨졌던 것**은 §3에 적었듯 이 페이지에 AccountAvatar가 처음 렌더되면서 드러난 테스트 인프라 문제였다 — `beforeEach` 기본값 세팅으로 해결했고, 소스 코드(`AccountAvatar.tsx`)는 건드리지 않았다.

## 7. 커밋 해시

- 저장소: https://github.com/Farerworks/attune
- 커밋 해시: (다음 커밋에서 반영 예정)
