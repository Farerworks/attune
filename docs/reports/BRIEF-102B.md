# BRIEF-102B — 신뢰 P0 카피 정본 반영 4곳 + 전송 고지 신설 2곳

## 0. 작업 브랜치

이 판의 모든 커밋은 `main`이 아니라 `fix/102b-trust-copy`에만 존재한다. `origin/main`은 시작부터 끝까지 `e67228f9a02c79bc302485d2ec00861c692fbc14` 그대로다.

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `docs/briefs/BRIEF-102B.md` | 브리프 원문 바이트 그대로 보관 (단독 커밋) |
| `src/app/page.tsx` | 2.1 랜딩 개인정보 박스 정본 교체 |
| `src/app/onboarding/page.tsx` | 2.2 `only` 한 단어 삭제 |
| `src/app/(tabs)/settings/page.tsx` | 2.3 백업 행 라벨·설명 교체 / 2.4 백업 캡션 교체 |
| `src/app/new/page.tsx` | 2.5 전송 고지 캡션 신설 |
| `src/app/(tabs)/ask/page.tsx` | 2.6 전송 고지 캡션 신설 |
| `src/app/page.test.tsx` | 신규 — T1 |
| `src/app/onboarding/page.test.tsx` | 신규 — T2 |
| `src/app/(tabs)/settings/page.test.tsx` | T3·T4 추가 |
| `src/app/new/page.test.tsx` | 신규 — T5 |
| `docs/reports/BRIEF-102B.md` | 본 보고서 |

## 2. 6건별 diff 요약

### 2.1 [교체] 랜딩 개인정보 박스 — `src/app/page.tsx:258`
기존 4문장(`Your birth data stays on your phone.` 등)을 정본 1문단으로 교체. `<strong>`은 첫 문장에 유지.
- **특이사항**: JSX가 `</strong>` 바로 뒤의 리터럴 공백 문자를 렌더링 시 소거하는 것을 실측으로 확인(같은 줄에 있어도 발생). `{' '}` 명시적 공백 표현식을 추가해 렌더 결과가 정본 문자열과 완전히 일치하도록 수정. Playwright로 실제 DOM `textContent`를 대조해 확인함.

### 2.2 [교체] 온보딩 — `src/app/onboarding/page.tsx:83`
`only` 한 단어만 삭제. 앞 문장 무접촉.

### 2.3 [교체] 백업 행 라벨·설명 — `src/app/(tabs)/settings/page.tsx:342`
`label`을 `Back up your data`로, `description`을 정본 문구로 교체. `onClick`·컴포넌트 구조 무접촉. `:338`의 "Back up now" 행 무접촉.

### 2.4 [교체] 백업 안내 캡션 — `src/app/(tabs)/settings/page.tsx:348`
정본 문구로 교체. 감싼 `<p>` 스타일 무접촉.

### 2.5 [신설] `/new` 전송 고지
"Get my briefing" 버튼 바로 아래, `</form>` 안쪽에 캡션 `<p>` 추가. 이 저장소의 기존 캡션 패턴(`fontSize: 12`, `color: var(--c-muted)` 등) 사용, 새 토큰 없음. 조건부 렌더 없이 항상 표시.

### 2.6 [신설] Ask 전송 고지
입력 row(`{/* Input row */}`) 바로 아래에 캡션 `<p>` 추가. 동일 스타일 패턴. 모드(person/me/general)·로그인 여부와 무관하게 항상 표시(safety-flow·quota-exhausted 같은 별도 UI 상태는 애초에 입력 row 자체가 없으므로 해당 없음).

```
$ git diff --stat e67228f9a02c79bc302485d2ec00861c692fbc14..6648e9b
 docs/briefs/BRIEF-102B.md             | 127 ++++++++++++++++++++++++++++++++++
 src/app/(tabs)/ask/page.tsx           |   6 ++
 src/app/(tabs)/settings/page.test.tsx |  24 +++++++
 src/app/(tabs)/settings/page.tsx      |   4 +-
 src/app/new/page.test.tsx             |  24 +++++++
 src/app/new/page.tsx                  |   6 ++
 src/app/onboarding/page.test.tsx      |  22 ++++++
 src/app/onboarding/page.tsx           |   2 +-
 src/app/page.test.tsx                 |  46 ++++++++++++
 src/app/page.tsx                      |   2 +-
 10 files changed, 259 insertions(+), 4 deletions(-)
```

## 3. 테스트

### 3.1 기존 테스트
브리프 확인대로 이 6개 문구를 검사하는 기존 테스트는 없었음(개정 대상 0건).

### 3.2 신규 5건
- **T1** (`src/app/page.test.tsx`, 신설): 랜딩 렌더 시 정본 문단 전체(공백 포함, byte-for-byte)가 보이고 옛 문장 2개는 없음. `ScrollReveal`이 쓰는 `window.matchMedia`·`IntersectionObserver`는 jsdom에 없어 테스트 파일 안에서 최소 stub 추가.
- **T2** (`src/app/onboarding/page.test.tsx`, 신설): `saved on this device.`가 보이고 `saved on this device only.`는 없음.
- **T3** (`settings/page.test.tsx`에 추가): 로그아웃 상태에서 `Back up your data` + 새 설명이 보이고, 옛 라벨·설명은 없음.
- **T4** (`settings/page.test.tsx`에 추가): 새 백업 캡션이 보이고 `unless you turn it on`은 없음.
- **T5** (`src/app/new/page.test.tsx`, 신설): `/new` 렌더 시 전송 고지가 보이고 `Google Gemini`를 포함함.
- Ask 고지(2.6)는 브리프 지시대로 자동 테스트 대신 §4 스크린샷(⑥⑥-375)으로 검증.

### 3.3 수치

```
Test Files  45 passed (45)
     Tests  906 passed | 4 expected fail (910)
```

예상(910 = 906 passed + 4 expected fail)과 정확히 일치. `it.fails` 4건 무변경.

## 4. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 오류 0
- [x] `npm run lint`(저장소의 lint 스크립트, `eslint`) — **특이사항 있음, §7 참조**
- [x] `npx vitest run` 전체 — 910 = 906 passed + 4 expected fail
- [x] `npm run build` 성공
- [x] 렌더 스크린샷 7장(요구 6장 + 375px 2장) — §6 경로
- [x] `docs/reports/BRIEF-102B.md` 작성

## 5. 렌더 파일 경로

- `/tmp/brief-102b-landing-privacy.png` — ① 랜딩 개인정보 박스
- `/tmp/brief-102b-onboarding.png` — ② 온보딩 해당 문장
- `/tmp/brief-102b-settings-backup.png` — ③④ Settings 백업 행 + 캡션
- `/tmp/brief-102b-new-notice.png` — ⑤ `/new` 버튼+고지
- `/tmp/brief-102b-new-notice-375.png` — ⑤ 375px 폭
- `/tmp/brief-102b-ask-notice.png` — ⑥ Ask 입력 영역+고지
- `/tmp/brief-102b-ask-notice-375.png` — ⑥ 375px 폭

375px 두 장 모두 `Google Gemini`가 잘리거나 접히지 않고 보임을 육안 확인.

(Playwright는 이 판을 위해 임시 설치(`npm install --no-save --no-package-lock`) 후 촬영, 종료 후 `npm install`로 원복. `package.json`·`package-lock.json` 변경 없음.)

## 6. 커밋 해시

- 저장소: https://github.com/Farerworks/attune (브랜치: `fix/102b-trust-copy`)
- 브리프 원문 보관: `595b4ca`
- 코드+테스트 커밋: `6648e9b`

## 7. 특이사항·판단

1. **JSX 공백 소거 (2.1)**: `<strong>...</strong>` 바로 뒤 리터럴 공백이 React 렌더 시 사라지는 것을 실측(같은 물리적 줄에 있어도 발생). `{' '}`로 명시적 공백을 넣어 해결하고, 테스트(T1)에서 렌더된 `textContent`가 정본 문단과 정확히 일치함을 단언해 재발 시 즉시 잡히게 함.
2. **lint 기존 부채 (§4 완료 기준 "오류 0")**: `npm run lint` 실행 시 저장소 전체에서 **47개 문제(30 에러, 17 경고)**가 나온다. 이 판의 변경 전(`e67228f`)에서 동일한 명령을 돌려 완전히 동일한 47개 문제(30/17)가 이미 존재함을 확인했다(변경 전후 lint 출력을 전체 diff한 결과, 코드 삽입으로 인한 경고 1건의 줄번호 이동 외 차이 없음). 즉 **이번 판이 만든 lint 문제는 0건**이지만, 저장소 전체 기준 "오류 0"은 이번 판 범위 밖의 기존 부채(`ScrollReveal.tsx`·`TimeInput.tsx`·`store.ts`·`store.test.ts`·아이콘 파일들 등, react-hooks/set-state-in-effect 류)로 인해 충족되지 않는다. 이 파일들은 브리프 §6의 허용 경로 밖이라 수정하지 않았다. JSX 이스케이프(`&apos;`) 관련 경고는 0건.
