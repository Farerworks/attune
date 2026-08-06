# BRIEF-094G — Ask 사람 선택을 탭형으로: 날씬하게 + 여러 명 자연 스크롤

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `src/app/(tabs)/ask/page.tsx` | `ChipButton`의 `slim` 분기를 탭형(`tab`)으로 교체, 칩 행 스크롤 페이드·`scrollIntoView` 추가, `+ Someone`의 대화-중 스타일 변경 |
| `src/app/(tabs)/ask/page.test.tsx` | 신규 3건 + 기존 094E 슬림 크기 테스트 갱신(대체) |

## 2. 구현 요지

**탭형 칩(`ChipButton`, `size='tab'`)** — 알약 상자(배경·테두리·radius)를 완전히 제거하고 `오행색 점 6px + 이름`만 남겼다. 선택 시 이름은 `var(--c-ink)` + `fontWeight 600` + 그 사람 오행색(`ELEMENT_COLORS[...].fg`, 점과 동일 색)의 2px 밑줄, 비선택 시 이름은 `var(--c-ink-body)`(지시대로 `muted` 사용 안 함)이고 점은 오행색을 유지하되 `opacity 0.55`로 낮췄다. `padding: '6px 2px'`, `minHeight: 32`는 버튼 자체 값이고, 터치 영역 보장을 위해 칩을 담는 행(`overflowX` 컨테이너) 자체에 `minHeight: 44`를 별도로 줬다. 칩 간 간격은 대화 중일 때만 `gap: 16`(첫 방문 대형 칩은 기존 `gap: 8` 그대로).

`GlyphAvatar`/아바타 원은 탭형에서 렌더하지 않는다 — 점이 정체성 표시를 대신한다는 지시를 그대로 따랐다. `+ Someone`도 대화 중에는 dashed 상자를 벗고 `ink-body` 텍스트 링크(점·밑줄 없음)로 바뀐다.

**여러 명 스크롤** — 기존 `overflowX: auto` 행은 그대로 두고, 대화 중일 때만 오른쪽 끝에 20px 폭의 `linear-gradient(to right, transparent, rgba(250,248,244,0.92))` 오버레이를 얹어 "더 스크롤할 수 있음" 신호를 준다. 선택된 칩을 담는 wrapper에 `ref`를 조건부로 걸어두고, `useEffect(() => selectedChipRef.current?.scrollIntoView({ inline: 'nearest' }), [selected, chips])`로 마운트 시 + 선택 변경 시 + 비동기로 `chips`가 나중에 채워질 때(예: `?person=` 딥링크) 모두 선택된 칩이 보이도록 했다. 인원 수 상한이나 접기는 두지 않았다.

**첫 방문(빈 상태)** — `hasAnyThread`가 false일 때는 `ChipButton`의 `default` 분기(기존 대형 필)를 그대로 쓰고, 행의 `gap`·`alignItems`·`minHeight`도 기존 값(`8`/`flex-start`/미지정)으로 되돌아간다 — 코드·픽셀 모두 무변형.

## 3. 발견·수정한 부수 문제

렌더 확인 중 jsdom의 CSSOM이 `border`(축약형)와 `borderBottom`(개별 속성)을 같은 스타일 객체에 섞어 쓰면 `border-top/left/right: none`이 스타일 문자열에서 통째로 사라지는 현상을 발견했다(BRIEF-094D-FIX가 이미 문서화한 것과 같은 종류의 함정). 탭 칩의 스타일을 `border: 'none'` 한 줄 대신 `borderTop`/`borderLeft`/`borderRight`를 개별로 `'none'`으로 풀어쓰고 `borderBottom`만 따로 지정하도록 고쳐, 실제 브라우저 렌더링에는 영향이 없었지만 코드 명확성을 높였다.

## 4. 테스트

- 빈 첫 화면: 대형 칩 `minHeight: 48px` 무변형 1건(기존 테스트 이름·범위만 좁혀 유지).
- 대화 중(사람 1명 추가): 선택 칩(`Me`)이 배경 `transparent`·`borderRadius: 0`·밑줄(`borderBottom: 2px solid ...`) / 비선택 칩(`Sam`)은 밑줄이 `transparent`이고 이름 색이 정확히 `var(--c-ink-body)`(≠`var(--c-muted)`)임을 확인 1건.
- 선택 변경 시 `Element.prototype.scrollIntoView`가 `{ inline: 'nearest' }`를 포함한 인자로 호출됨을 확인 1건.

기존 전체 무회귀(405개 전체 통과 — 기존 403 + 신규 3 − 대체된 094E 테스트 1건을 2건으로 분리했으므로 순증 2).

## 5. 렌더 확인 — 3장 (실제 브라우저, Playwright, 390×844)

텔레그램으로 **전송함**.

1. 대화 중 2명(Me="윤" + 1명) — 알약 상자 없이 점+이름만, 선택된 "윤" 아래 오행색 밑줄이 보임.
2. 12명 시드 — 가로 스크롤 발생 확인(`scrollWidth 785 > clientWidth 350`, 콘솔로 별도 검증), 화면엔 처음 6개(Me+5명)만 보이고 나머지는 스크롤 밖.
3. 빈 첫 화면 — 대형 필+아바타 원+dashed `+ Someone`+캡션 모두 기존 그대로.

## 6. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` — 405개 전체 통과 (기존 403 + 신규 2)
- [x] `npm run build` 성공
- [x] 렌더 확인 3장 — §5, 텔레그램 전송함
- [x] main push 완료 (커밋 해시는 §8)

## 7. 정직 보고

- **오른쪽 페이드가 스크린샷에서 육안으로 잘 안 보인다.** 종이색(`rgba(250,248,244,0.92)`)과 배경이 워낙 비슷한 저대비 팔레트라, 마침 그 20px 구간에 텍스트가 걸치지 않는 스크롤 위치에서는 그라데이션이 사실상 "빈 종이 위의 빈 종이"라 티가 안 난다. 오버레이 자체는 DOM에 정상적으로 존재하고, 텍스트가 실제로 그 구간에 걸쳐 있을 때는(예: 이름이 더 긴 사람) 눈에 보이는 정도로 작동할 것으로 예상하지만, 이번 스크린샷만으로는 효과가 뚜렷하다고 확답하기 어렵다 — 후속 검수에서 실기기로 다시 봐주시면 좋겠다.
- 칩 행의 `alignItems`를 대화 중엔 `center`로(기존 `flex-start`) 바꿨다 — 지시서에 명시되진 않았지만, 아바타 원이 사라지고 텍스트 한 줄만 남은 탭 행에서는 세로 중앙 정렬이 자연스럽다고 판단한 구현 판단이다. 다른 시각 요소는 건드리지 않았다.
- `?person=` 딥링크로 먼 사람이 선택된 채 로드되는 경우까지 고려해 `useEffect` 의존성에 `chips`를 추가했다(지시서는 "마운트·선택 변경 시"만 언급) — chips가 비동기로 나중에 채워지는 구조라 이렇게 해야 실제로 "마운트 시" 스크롤이 의미 있게 동작한다고 판단했다.

## 8. 커밋 해시

- 저장소: https://github.com/Farerworks/attune
- 커밋 해시: `decb763`
