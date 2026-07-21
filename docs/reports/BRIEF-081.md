# BRIEF-081 — 탭별 카드 규격 통일: 측정 → 정렬

## 1. 방법

코드 값 조사(4개 탭 전체 소스 정독) + Playwright 렌더 실측(`getComputedStyle`/`getBoundingClientRect`)을 병행했다. 실측은 프로필(1985-11-10 20:30)과 오행 5종(wood/fire/earth/metal/water) 각 1건씩의 더미 reading, Ask용 더미 스레드 1건을 `localStorage`에 주입한 상태로 4개 탭을 순회해 `.card` 요소·페이지 컨테이너의 `padding`/`border-radius`/좌우 margin을 측정했다. 코드 수정 **전**과 **후** 두 번 동일 스크립트로 측정해 대조했다(임시 스크립트, 커밋 대상 아님 — 결과 JSON은 `/tmp`에만 저장, 검증 후 스크린샷은 삭제).

## 2. 전(before) 측정 표

| 화면 | 요소 | border-radius | padding (실측) | 페이지 좌우 여백 | 카드 간 간격 | 비고 |
|---|---|---|---|---|---|---|
| Home | TodayCard | 16px | `16px 18px` | 20px | Do/Don't까지 20px(margin-bottom) | `.card` |
| Home | Do/Don't 박스 | 16px | `18px 20px` | 20px | 위 20px, 아래 섹션과 20px(margin) | `.card` |
| Home | Reach-out-today 카드 (×2) | 16px | `14px 16px` | 20px | 카드 간 `gap:10` | `.card pressable`, 리스트형 |
| People | (empty) 배지·스티커 | 6px | `4px 8px` / `5px 10px` | 20px | n/a | 장식용, 카드 아님 |
| People | 읽기 리스트 행 | 0px(각짐) | `16px 20px` | 20px(행 내부 패딩으로 구현) | 구분선만(margin 없음) | `.card` 미사용 — 엣지투엣지 리스트 |
| Ask | 채팅 버블(user/assistant) | `16px 16px 4px 16px` 등 비대칭 | `12~14px 16px` | **16px** (before) | `gap:12` | `.card` 미사용, 말풍선 |
| Ask | FirstVisitContent 예시 버블 | `18px 18px 4px 18px` 등 비대칭 | `12px 16px` | n/a(중앙 정렬) | `gap:10` | 버블과 유사하지만 radius 다름 |
| Ask | 상단 쿼터·칩 영역 | 20px(칩 pill) | 컨테이너 `12px 20px 0` | 20px | n/a | 카드 아님 |
| You | 일간 카드 | 16px | `20px` | 20px | 모든 카드 `gap:20` | `.card` |
| You | 여덟 글자 카드 | 16px | `18px 16px` | 20px | 〃 | `.card` |
| You | 오행 인사이트 카드 | 16px | `16px 18px` | 20px | 〃 | `.card` |
| You | 오행 분포 카드 | 16px | `20px` | 20px | 〃 | `.card` |
| You | 스펙트럼 카드 | 16px | `20px` | 20px | 〃 | `.card` |

**관찰**: `.card`를 쓰는 모든 요소는 `border-radius: 16px`로 이미 100% 일치(공용 클래스라 당연). 편차는 전부 인라인 `padding` 값과 Ask의 페이지 좌우 여백에 있었다. `20px`(전체 or 좌우) 단독 패딩이 3건(You 3곳)으로 가장 많이 쓰여 다수파로 확인 — 브리프가 예상한 "20px 계열"과 일치.

## 3. 정렬(2단계) — 실제 변경

| 파일 | 변경 |
|---|---|
| `src/components/TodayCard.tsx` | `.card` padding `16px 18px` → `20px` |
| `src/app/(tabs)/home/page.tsx` | Do/Don't 박스 padding `18px 20px` → `20px` |
| `src/components/EightCharactersCard.tsx` | `.card` padding `18px 16px` → `20px` |
| `src/app/(tabs)/you/page.tsx` | 오행 인사이트 카드 padding `16px 18px` → `20px` |
| `src/app/(tabs)/ask/page.tsx` | 채팅 영역 padding `20px 16px 8px` → `20px 20px 8px`, 입력 영역 padding `12px 16px 10px` → `12px 20px 10px` |

카피·컴포넌트 구조·색·타이포·신규 토큰 없음 — 위 5개 파일의 padding 숫자만 변경했다.

## 4. 후(after) 측정 표 — 변경분만

| 화면 | 요소 | before padding | after padding |
|---|---|---|---|
| Home | TodayCard | `16px 18px` | **`20px`** |
| Home | Do/Don't 박스 | `18px 20px` | **`20px`** |
| You | 여덟 글자 카드 | `18px 16px` | **`20px`** |
| You | 오행 인사이트 카드 | `16px 18px` | **`20px`** |
| Ask | 채팅 영역 좌우 여백 | `16px` | **`20px`** |
| Ask | 입력 영역 좌우 여백 | `16px` | **`20px`** |

수정 후 You 탭의 `.card` 5개는 전부 `padding: 20px`로 완전히 동일해졌다(실측 확인). Home의 TodayCard·Do/Don't도 `20px`로 일치. Ask의 채팅/입력 영역은 상단 쿼터·칩 영역과 동일한 `20px`가 되어 탭 내부 좌측 정렬선이 일치한다.

## 5. 예외 인정 (의도적 차이 — 변경하지 않음)

| 요소 | 사유 |
|---|---|
| Ask 채팅 버블(`MessageBubble`, `LoadingBubble`) — 비대칭 radius(`16px 16px 4px 16px` 등), user 버블 다크 배경 | 대화 말풍선 관용구(꼬리 모서리)로, `.card`의 균일한 박스 형태와 목적이 다르다. 규격을 맞추면 말풍선 정체성이 사라진다. |
| Ask 칩/버튼류(`ChipButton`, 퀵프롬프트 칩, `+ Someone` 점선 버튼, 전송 버튼) | pill/칩 UI 언어(대개 전체 원형 또는 16~24px), 정보 카드와 목적이 다른 선택 위젯. |
| `MyCardModal`/`ShareModal` (캔버스 프리뷰 모달) | 어두운 배경의 전체 화면 오버레이 + 9:16 캔버스, 탭 본문 카드와 무관한 별도 체계. |
| `IljuSheet` (바텀시트) | 시트이지 탭 본문 카드가 아님. |
| People 빈 상태의 원형 아바타 클러스터·아키타입 스티커 | 회전·장식 요소, 정보 카드가 아님. |
| People 읽기 리스트(엣지투엣지, `.card` 미사용, 구분선만) | Settings의 Row 패턴과 같은 "리스트 행" 관용구로 보임 — Home의 박스형 카드 리스트("Reach out today")와는 애초에 다른 UI 언어. 구조 개편 금지 조항에 따라 어느 쪽으로도 통일하지 않고 그대로 둠. |

## 6. 판단 요청 (본부 결정 대기 — 임의로 바꾸지 않음)

1. **Home "Reach out today" 카드의 padding(`14px 16px`)과 아이템 간 gap(`10px`)** — `.card`로 박스 처리된 컴팩트 리스트 카드다. 두 가지 정렬 후보가 있다: (a) You/TodayCard처럼 `20px` 카드 표준에 맞추기(다만 44px 아바타 + 2줄 텍스트의 컴팩트 행이 다소 커져 보일 수 있음), (b) People의 리스트 행 padding(`16px 20px`)에 맞추기(같은 "사람 리스트" 성격이라 더 자연스러울 수 있음). 근거가 갈려 임의로 정하지 않았다.
2. **Ask `FirstVisitContent`의 예시 버블 radius(`18px` 계열)와 실제 메시지 버블(`MessageBubble`/`LoadingBubble`, `16px` 계열)의 2px 차이** — 둘 다 "말풍선" 언어라 같은 규격이어야 할 수도 있고, 예시 버블만 의도적으로 더 둥글게(모형임을 구분) 만든 것일 수도 있다. 판단 근거가 없어 그대로 두었다.

## 7. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` — 249개 전체 통과 (BRIEF-080 완료 시점과 동일, 무회귀 — 이 BRIEF는 스타일 값만 바꿔 테스트 대상 로직에 영향 없음)
- [x] `npm run build` 성공
- [x] **본인 렌더 확인**: 개발 서버 + Playwright로 수정 전/후 두 번 동일 시나리오(프로필 + 오행 5종 reading + Ask 스레드 주입)를 측정해 위 3~4절 표를 만들었다. 스크린샷으로 Home(TodayCard·Do/Don't 패딩 일치), You(카드 5개 리듬 일치), Ask(상단 칩 영역과 채팅·입력 영역의 좌측 시작선 일치)를 육안으로도 확인했다. 검증 후 Playwright 삭제, `package.json`/`package-lock.json` 무변경 확인.
- [x] main push 완료 (커밋 해시는 §8)

## 8. 커밋 해시

- 저장소: https://github.com/Farerworks/attune
- 커밋 해시: (본 커밋 — 텔레그램 완료 보고에 함께 남긴다)
