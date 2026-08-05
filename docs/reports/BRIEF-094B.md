# BRIEF-094B — 홈 마감 2건: 한글 어절 줄바꿈 + Ask 칩 프리필

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `src/app/(tabs)/home/page.tsx` | 오늘 핵심 문장·AHEAD 카드 본문에 `wordBreak: 'keep-all'` + `overflowWrap: 'break-word'` 추가. Ask 칩 `href`를 `/ask?prefill=<인코딩된 문구>`로 변경 |
| `src/app/reading/[id]/page.tsx` | 리딩 헤드라인(`h1`)에 동일하게 `wordBreak: 'keep-all'` + `overflowWrap: 'break-word'` 추가 |
| `src/app/(tabs)/ask/page.tsx` | 마운트 시 `?prefill=` 쿼리를 읽어 입력창에 채우고 포커스, 소비 후 `router.replace`로 URL에서 파라미터 제거. 자동 전송·쿼터 차감 없음 |
| `src/app/(tabs)/home/page.test.tsx` / `src/app/reading/[id]/page.test.tsx` / `src/app/(tabs)/ask/page.test.tsx` | 신규 6건 |

## 2. 구현 요지

**keep-all** — 지시된 3곳에만 정확히 적용했다. `overflowWrap: 'break-word'`를 같이 넣은 이유는 지시서에 명시된 대로 극단적으로 긴 단일 어절(예: 공백 없는 URL·숫자열)이 `keep-all`만으로는 줄바꿈되지 않아 카드 밖으로 넘칠 수 있는 경우의 폴백이다. 영문 렌더링에는 영향 없음(라틴 스크립트는 이미 공백 단위로 줄바꿈).

**Ask 칩 프리필** — 홈 칩의 `href`를 `/ask?prefill=<encodeURIComponent(문구)>`로 바꾸고, Ask 페이지에 독립된 `useEffect`(마운트 1회)를 추가해 `?prefill=` 값을 읽어 `setInput()`하고 텍스트영역에 포커스한 뒤, `router.replace()`로 URL에서 해당 파라미터만 제거한다(다른 쿼리 파라미터가 있으면 보존). 기존 `?person=` 파라미터를 읽는 로직·전송(`handleSend`)·쿼터·스레드 로직은 전혀 건드리지 않았다 — `setInput`만 호출하므로 사용자가 직접 전송 버튼을 눌러야 실제 전송된다.

**포커스 여부 판단(구현 판단 사항)** — 지시서가 "포커스는 주되 ... 생략 가능"이라 위임한 부분: 포커스를 적용했다. 이 앱은 BRIEF-085/086에서 이미 키보드 열림 감지·탭바 자동 숨김 인프라를 갖추고 있어, 포커스로 키보드가 열려도 레이아웃이 흔들릴 위험이 낮다고 판단했다.

## 3. 렌더 확인 — 2장 (실제 브라우저, Playwright, 한국어 로케일)

텔레그램으로 **전송함**.

1. 홈 핵심 문장 + AHEAD 카드가 한글 어절 단위로 줄바꿈됨. 실제로 브리프가 지적한 예시 문구 "도움도 기회도"가 AHEAD 카드에 그대로 렌더되어 "도움도 기회도 마다하지 말아요."로 어절 경계에서 자연스럽게 꺾이는 것을 확인했다.
2. 홈에서 "오늘은 어떻게 충전하지?" 칩을 탭 → Ask 입력창에 동일 문구가 그대로 채워짐. 주소창 URL도 `?prefill=...`이 남지 않고 `/ask`로 정리된 것을 확인(`page.url()`로 별도 로그 확인).

## 4. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` — 344개 전체 통과 (기존 338 + 신규 6, 무회귀)
- [x] `npm run build` 성공
- [x] 렌더 확인 2장 — §3, 텔레그램 전송함
- [x] main push 완료 (커밋 해시는 §5)

## 5. 커밋 해시

- 저장소: https://github.com/Farerworks/attune
- 커밋 해시: (본 커밋 — 텔레그램 완료 보고에 함께 남긴다)
