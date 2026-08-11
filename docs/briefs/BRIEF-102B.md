# BRIEF-102B — 신뢰 P0 카피 정본 반영 4곳 + 전송 고지 신설 2곳

## §0 맥락 (처음 읽는 사람용 — 이 문서가 요구사항의 전부다)

- 대상: **Attune** — Next.js(App Router)+TypeScript 웹앱. 작업 폴더 `~/projects/attune`, 저장소 `github.com/Farerworks/attune`.
- 이번 판의 목적: **앱이 개인정보를 설명하는 방식이 실제 동작과 어긋나는 4곳**을 승인된 영어 정본으로 교체하고, **AI로 데이터가 나가는 시점의 고지 2곳**을 새로 넣는다. (앞선 BRIEF-102와 다른 판 — 102는 About 시트·에러·복원 문구·버튼 잠금이었다.)
- **기준 커밋**: `origin/main = e67228f9a02c79bc302485d2ec00861c692fbc14`. 작업 전 `git fetch origin && git checkout main && git pull --ff-only && git rev-parse HEAD`로 이 값과 일치 확인 — 다르면 **중단하고 보고**.
- **전용 브랜치 `fix/102b-trust-copy`에서만 작업. main 직접 push 금지. force push 금지. 병합 금지**(병합은 이후 별도 지시).
- 기준 테스트 상태: **905 = 901 passed + 4 expected fail**(`it.fails` 4건 — 이번 판이 줄이지 않는다).
- **정본 문자열은 승인된 최종본이다. 한 글자도 바꾸지 말 것**(단어 선택·구두점·대소문자 포함). 새 문구 창작 금지.

### 문자 규칙 (전 문구 공통)
- 아포스트로피 = **직선 `'`(U+0027)**, 대시 = **em dash `—`(U+2014)**.
- JSX 텍스트에 직접 쓸 때는 이 저장소 관행대로 `&apos;`로 이스케이프해도 된다(예: `page.tsx:128`, `onboarding/page.tsx:158`). **단 화면 렌더 결과가 위 문자와 같아야 한다.** lint 오류 0이어야 한다.

## §1 공정 (브랜치에 커밋 정확히 3개, 순서 고정)

1. **보관 커밋**: 수신한 이 문서를 `docs/briefs/BRIEF-102B.md`로 **바이트 그대로** 저장 → `sha256sum`·`wc -c`를 발사 메시지의 기준값과 대조(불일치 시 중단·보고) → 이 파일 하나만 단독 커밋.
2. **코드 커밋**: §2 구현 + §3 테스트.
3. **보고서 커밋**: `docs/reports/BRIEF-102B.md`(§5 양식).

푸시: `git push -u origin fix/102b-trust-copy`.

## §2 변경 사양 (정확히 이 6건만)

### 2.1 [교체] 랜딩 개인정보 박스 — `src/app/page.tsx:258`

현재 `<p>` 안의 문장 전체(=`<strong>` 포함 한 문단)를 아래 정본으로 교체한다. **`<strong>`은 첫 문장에 그대로 유지**하고, 문단을 감싼 `<div>`·`<p>`의 스타일은 무접촉.

정본(첫 문장 = `<strong>` 안, 나머지는 일반 텍스트):
> **Your Attune data is stored on this phone unless you choose backup.** Creating a reading sends your birth details and the details you enter about the other person through Attune's server to Google Gemini. No sign-up is needed. Sign in with Google to store an optional backup on Attune's server.

- 기존 문장 4개(`Your birth data stays on your phone.` / `No sign-up needed.` / `Back it up with Google only if you choose to.` / `Delete everything in one tap.`)는 **전부 사라진다**.

### 2.2 [교체] 온보딩 — `src/app/onboarding/page.tsx:83`

- 현재: `… One-time setup — saved on this device only.`
- 변경: **`only` 한 단어만 삭제** → `… One-time setup — saved on this device.`
- 같은 줄 앞 문장(`Your birth info lets Attune calibrate readings to your dynamic with others.`)은 **무접촉**.

### 2.3 [교체] 백업 행 라벨·설명 — `src/app/(tabs)/settings/page.tsx:342`

- 현재: `<BackupRow label="Back up with Google" description="Keep your readings if you switch phones." onClick={handleSignIn} />`
- 변경: `label`과 `description`만 아래로 교체(`onClick`·컴포넌트 구조 무접촉).
  - label: `Back up your data`
  - description: `Sign in with Google to back up your data to Attune's server and restore it on a new phone.`
- 같은 파일 `:338`의 `<BackupRow label="Back up now" …>`는 **무접촉**.

### 2.4 [교체] 백업 안내 캡션 — `src/app/(tabs)/settings/page.tsx:348`

- 현재: `Backup is optional. Your data stays on this phone unless you turn it on.`
- 변경: `Backup is optional. Signing in with Google starts automatic backup to Attune's server.`
- 감싼 `<p>` 스타일 무접촉.

### 2.5 [신설] `/new` 전송 고지 — `src/app/new/page.tsx`

`Get my briefing` 제출 버튼(`:288~297`) **바로 아래**, `</form>` 안쪽에 캡션 `<p>` 하나를 새로 추가한다. 항상 보인다(조건부 렌더 금지).

문구:
> When you tap Get my briefing, your birth details and the details you entered about this person are sent through Attune's server to Google Gemini to generate the reading.

- 스타일: 이 저장소의 기존 캡션 패턴을 그대로 따른다 — `fontFamily: 'var(--font-inter)'`, `fontSize: 12`, `color: 'var(--c-muted)'`, `lineHeight: 1.5`, 위쪽 여백 10~12px, `margin: 0`. **새 CSS 변수·새 디자인 토큰 생성 금지.**
- 버튼이 비활성이든 아니든 **문구는 항상 표시**된다.

### 2.6 [신설] Ask 전송 고지 — `src/app/(tabs)/ask/page.tsx`

입력 row(`{/* Input row */}` — textarea + Send 버튼, `:678` 부근)와 **같은 영역**에 캡션 `<p>` 하나를 새로 추가한다(입력 row 바로 아래 권장). 항상 보인다.

문구:
> To generate an AI answer, Attune sends your question and relevant context — such as birth details, prior messages, the briefing, and saved relationship notes — through its server to Google Gemini.

- 스타일: 2.5와 동일 패턴(`fontSize: 12` 또는 주변과 맞춰 11.5~12, `color: 'var(--c-muted)'`).
- **모드(person/me/general)·로그인 여부와 무관하게 항상 표시.** 조건부 렌더·접기(collapse)·툴팁 뒤 숨김 **금지**.

### 2.7 [금지] 이번 판에서 하지 않는 것

- `settings:257`의 clear-all confirm 문구(`… your Google backup …`)는 **건드리지 않는다.** 승인된 정본(`… This also deletes your backup on Attune's server.`)이 있으나 버튼이 비활성 상태라 **dormant canon**이며, Clear all data 재활성화 판에서 동작·실패 처리와 함께 구현한다.
- About 시트, You 탭 에러 문구, 복원 실패 문구(BRIEF-102 결과물) 무접촉.
- `src/lib/**` 전부 무접촉. API 라우트 무접촉. 실제 전송 로직·페이로드 변경 금지(이 판은 **문구와 표시**만).

## §3 테스트

### 3.1 기존 테스트
- 위 6개 문구를 검사하는 기존 테스트는 **없다**(본부 확인). 개정 대상 0건. 그럼에도 전체 스위트가 통과해야 한다.

### 3.2 신규 테스트 (정확히 5건)

- **T1** (`src/app/page.test.tsx` — 파일이 없으면 새로 만든다): 랜딩 렌더 시 `Your Attune data is stored on this phone unless you choose backup.`가 보이고, 옛 문장 `Your birth data stays on your phone.`과 `Delete everything in one tap.`은 **없다**.
- **T2** (`src/app/onboarding/page.test.tsx` — 없으면 신설): `saved on this device.`가 보이고, `saved on this device only.`는 **없다**.
- **T3** (`src/app/(tabs)/settings/page.test.tsx`에 추가): `Back up your data` 라벨과 새 설명 문구가 보이고, `Back up with Google`·`Keep your readings if you switch phones.`는 **없다**. (로그아웃 상태 기준 — 기존 하네스의 `mockGetSyncSession` 사용)
- **T4** (`src/app/(tabs)/settings/page.test.tsx`에 추가): `Signing in with Google starts automatic backup to Attune's server.`가 보이고, `unless you turn it on`은 **없다**.
- **T5** (`src/app/new/page.test.tsx` — 없으면 신설): `/new` 렌더 시 전송 고지 문구가 보이고, 그 안에 `Google Gemini`가 포함된다.

- Ask 고지(2.6)는 렌더 조건이 복잡하므로 **자동 테스트 대신 §4의 스크린샷으로 검증**한다. 무리해서 mock을 늘리지 말 것.
- 테스트가 문자열을 검사할 때는 렌더된 텍스트(아포스트로피가 직선 `'`) 기준으로 단언한다.

### 3.3 수치 기대
신규 5건 반영 예상 총 **910 = 906 passed + 4 expected fail**. 실측 수치를 보고서에 기재(예상과 다르면 사유 명기).

## §4 완료 기준 (전부 충족해야 완료)

- `npx tsc --noEmit` 오류 0
- `npx next lint`(또는 이 저장소의 lint 스크립트) 오류 0 — JSX 이스케이프 관련 경고 포함
- `npx vitest run` 전체 — §3.3 기준, `it.fails` 4건 외 실패 0
- `npm run build` 성공
- **렌더 스크린샷 5장**: ①랜딩 개인정보 박스 ②온보딩 해당 문장 ③Settings 백업 행(라벨+설명) ④Settings 백업 캡션 ⑤`/new` 버튼+고지 — 그리고 **⑥Ask 입력 영역+고지**(총 6장)
- **모바일 폭 검증**: 위 스크린샷 중 ⑤⑥은 **폭 375px** 기준으로도 1장씩 더 찍어, `Google Gemini`가 잘리거나 접히지 않고 보이는지 확인
- 보고서 `docs/reports/BRIEF-102B.md` 커밋
- 채팅 완료 보고: **커밋 해시 3종** + 보관본 `sha256`·바이트(기준값 대조 결과) + 테스트 수치 + 스크린샷 파일 경로

## §5 보고서 양식 (`docs/reports/BRIEF-102B.md`)

변경 파일·diff 요약(6건별) / 신규 테스트 5건 내용과 전체 수치 / 스크린샷 경로(모바일 폭 포함) / 보관·코드 커밋 해시 / 특이사항·판단(있으면).

## §6 금지사항 (요약)

- 위 6건 외 어떤 파일·문구·스타일도 수정 금지. **허용 경로**: `src/app/page.tsx` / `src/app/onboarding/page.tsx` / `src/app/(tabs)/settings/page.tsx` / `src/app/new/page.tsx` / `src/app/(tabs)/ask/page.tsx` / 위 테스트 파일들 / `docs/briefs/BRIEF-102B.md` / `docs/reports/BRIEF-102B.md`.
- 정본 문자열 바이트 수정 금지. 새 문구 창작 금지. 요약·축약 금지.
- 전송 고지를 조건부·접기·팝업으로 처리 금지(항상 보이는 텍스트).
- `src/lib/**`·API 라우트 무접촉. 전송 페이로드 변경 금지.
- main 직접 push 금지 / force push 금지 / 병합 금지(별도 지시 예정).

## §7 근거 출처

- 문구 5건은 **승인된 영어 정본**(본부 초안 → 조언자 2라운드 APPROVE → YS 결재, 2026-08-11). 사실 근거는 COPY-FACTS v1.6.1 §2·§4·§7.
- 삽입 위치는 `e67228f` 실측: `page.tsx:258` / `onboarding:83` / `settings:342`·`:348` / `new:288~297`(버튼 `:296`) / `ask` 입력 row `:678~700`.
- 외부 API·모델 사양 해당 없음.
