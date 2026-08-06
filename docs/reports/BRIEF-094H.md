# BRIEF-094H — 출시 차단 3건: 안전 카드 가림 + muted 대비 + 허브 상단 바 잘림

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `src/app/(tabs)/ask/page.tsx` | §1 안전 카드(S1/S2/S3) 하단 패딩 확보 + §2 muted→ink-body 5곳 |
| `src/app/(tabs)/ask/page.test.tsx` | 신규 6건 |
| `src/app/(tabs)/person/[id]/page.tsx` | §3 허브 상단 헤더 safe-area 패딩 |
| `src/app/(tabs)/person/[id]/page.test.tsx` | 신규 1건 |

## 2. 구현 요지

**§1 안전 카드 가림** — S1/S2/S3을 감싸는 하단 컴포저 div(`paddingBottom`)가 기존엔 고정 `10px`뿐이라, 대화 내용이 길어 페이지 전체가 문서 스크롤로 넘어가는 상황에서는 이 div가 실제 화면 맨 아래(y=뷰포트 높이)까지 밀려 내려가고, 그 위를 `position: fixed`(z-index 50)인 실제 하단 탭바가 덮어버릴 수 있었다. `safetyCardState`가 켜져 있고 키보드가 열려있지 않을 때만 `paddingBottom`을 `calc(var(--tab-bar-height) + env(safe-area-inset-bottom, 0px) + 16px)`로 늘려, 탭바가 차지할 공간을 시트 안쪽에서 미리 비워두도록 했다(키보드 열림 상태는 탭바 자체가 `translateY(120%)`로 숨으므로 그대로 둠). 대화 영역엔 별도의 `overflow` 제약이 없어 문서 자체가 자연 스크롤되므로, 이 패딩만으로 4번째 선택지까지 스크롤 한 번으로 도달 가능해진다.

**§2 muted→ink-body** — 지시서 카탈로그 그대로 5곳(잔량 텍스트, 첫 방문 캡션 2종, quick prompt 칩, 하단 고지) 색상만 `var(--c-muted)` → `var(--c-ink-body)`로 교체했다. 폰트 크기·서체·문구·레이아웃은 전부 무변경.

**§3 허브 상단 바 잘림** — 아이덴티티 행(뒤로가기+아바타+이름)을 감싸는 div가 `padding: '16px 20px 0'` 축약형만 쓰고 있어 상태바 영역을 전혀 고려하지 않았다. `TabTopBar`와 동일한 수법(`paddingTop: calc(12px + env(safe-area-inset-top, 0px))`)을 적용했는데, 이때 기존 `padding` 축약형과 `paddingTop`을 한 스타일 객체에 같이 쓰면(축약형+개별 속성 혼용) jsdom의 cssstyle 파서가 `env()` 인자 순서를 깨뜨리는 걸 이번에 다시 확인해서(이 프로젝트에서 이미 몇 차례 발견된 한계), 아예 `paddingTop`/`Right`/`Bottom`/`Left`를 개별 속성으로 풀어 썼다 — 실제 브라우저 동작은 축약형 방식과 동일하고, 테스트도 더 안정적으로 통과한다. 뒤로가기 버튼의 44px 히트 영역은 그대로 유지.

## 3. 테스트

- **Ask (6건 신규)**: 안전 카드 하단에 `var(--tab-bar-height)`가 포함된 패딩이 실제로 걸려있는지 1건 / S1의 4번째 선택지까지 조상 트리에 `overflow: hidden`이 없는지 1건 / 잔량 텍스트 ink-body 1건 / 첫 방문 캡션 2종 ink-body 1건 / quick prompt 칩 ink-body 1건(날짜별로 로테이션되는 문구 풀 전체에 대해 검사해 어떤 날 실행해도 안정적) / 하단 고지 ink-body 1건.
- **허브 (1건 신규)**: 뒤로가기 버튼의 조상 중 `paddingTop`이 `12px`+`safe-area-inset-top`을 포함하는 요소가 존재하는지 확인(§3 참고에 적었듯 jsdom이 `env()` 인자 순서를 깨뜨려서 정확한 문자열 일치 대신 부분 문자열로 검증).

기존 전체 무회귀. **전체 461개 통과**(기존 454 + 신규 7).

## 4. 렌더 확인 — 목표 3장 중 2장 확보, S1은 본부 재현으로 이관

텔레그램으로 **전송함**(②③ 2장).

1. **390×844 S1 카드 — 선택지 4개 가시**: **미확보.** Playwright로 안전 트리거 문구(`나 진짜 죽고 싶어`)를 입력→전송했을 때, 텍스트는 정확히 입력되고 전송 버튼도 비활성 상태가 아니었지만(`disabled: false`) 클릭 후 S1 카드(`많이 힘들거나 화가 난 상태로 들려요.`)가 뜨지 않고 최초 화면(빈 대화창)에 그대로 머물렀다. 콘솔에 `500 Internal Server Error`가 두 건 찍히는 것도 확인했다(정확한 실패 요청은 특정하지 못함 — `/api/auth/session` 등 세션 체크 쪽으로 추정되지만 검증 못 함). vitest의 동일 시나리오(`fireEvent.change`+`fireEvent.click`로 React 상태를 직접 갱신)는 그대로 통과하므로, **코드 자체의 안전 로직 결함이 아니라 이 dev 서버·Playwright 조합에서의 렌더 환경 문제로 보인다.** 본부 지시에 따라 이 지점에서 디버깅을 중단했다 — S1 실주행 렌더는 본부가 검수에서 독립 재현하기로 함.
2. **빈 첫 화면 — 교체 색**: 확보. `50 QUESTIONS LEFT TODAY` / `YOU · TIMING · ANYTHING` / `ADD A PERSON` / quick prompt 칩 / 하단 고지 전부 이전보다 진한 ink-body 색으로 렌더됨을 육안으로 확인.
3. **허브 상단 — 헤더 잘림 없음**: 확보. 뒤로가기·아바타·이름 모두 화면 상단에서 잘리지 않고 온전히 보임. 다만 이 스크린샷은 390×844 평면 뷰포트라 `env(safe-area-inset-top)`이 항상 0으로 렌더되므로(노치 시뮬레이션이 아님), 실제 노치 기기에서의 최종 판정은 지시서에도 명시된 대로 YS 실기기 확인이 필요하다.

## 5. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` 전체 통과 (461개)
- [x] `npm run build` 성공
- [x] 렌더 3장 중 2장 확보(②③) — §4, 텔레그램 전송함. S1(①)은 본부 지시로 디버깅 중단, 본부 재현으로 이관.
- [x] main push 완료 (커밋 해시는 §7)

## 6. 정직 보고

- **S1 카드의 Playwright 렌더를 확보하지 못했다.** §4에 기록한 대로 dev 서버+Playwright 조합에서만 재현되는 문제로 보이며, 동일 시나리오의 vitest 테스트(§3 절의 안전 카드 하단 패딩 테스트 포함, `fireEvent`로 트리거)는 정상 통과한다. 이 결함이 실제 프로덕션 빌드에서도 재현되는지는 확인하지 못했다 — 본부 지시에 따라 원인 조사를 여기서 멈춘다.
- **허브 상단 패딩값(12px)은 지시서 문구를 그대로 따랐다** — 원래 코드의 16px에서 4px 줄어드는데, 지시서가 `paddingTop: calc(12px + env(safe-area-inset-top, 0px))`를 리터럴로 제시했고 TabTopBar도 동일 값을 쓰므로 그대로 채택했다. 노치 없는 기기에서는 이전보다 위쪽 여백이 살짝 줄어든다(4px) — 지시서 의도(TabTopBar와 "동일 수법") 그대로라고 판단했지만, 만약 16px을 유지한 채 safe-area만 더하길 원했다면 `calc(16px + env(...))`로 재조정이 필요하다.
- **jsdom의 `env()` 파싱 한계를 이번에도 재확인했다** — `calc(var(--x) + env(...))`처럼 `var()`가 섞이면 문자열이 그대로 보존되지만, `calc(12px + env(safe-area-inset-top, 0px))`처럼 리터럴 숫자만 있으면 cssstyle이 인자 순서를 깨뜨린다(`env(0px * , * safe-area-inset-top)`). 실제 브라우저 렌더·Playwright 스크린샷(§4-③)은 정상이라 프로덕션엔 영향 없고, 테스트 쪽만 부분 문자열 비교로 우회했다.

## 7. 커밋 해시

- 저장소: https://github.com/Farerworks/attune
- 커밋 해시: `592ed52`
