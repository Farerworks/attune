# BRIEF-080 — 상단 바 계정 아바타 = 설정 진입

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `src/components/AccountAvatar.tsx` (신규) | 계정 아바타 — `Link href="/settings" aria-label="Settings"`, 26~28px 원형(27px). 로그인(이니셜)/미로그인·판별전(실루엣) 3상태. 세션은 `sync.ts`의 기존 `getSyncSession()` 재사용(중복 fetch 없음), 프로필 name은 `store.ts`의 `getProfile()` 재사용 |
| `src/components/AccountAvatar.test.tsx` (신규) | Link 존재, 미로그인 실루엣, 로그인 이니셜(name 우선), email 폴백 4건 |
| `src/components/TabHeader.tsx` | `showSettings` prop과 기어 렌더링 완전 제거 — 이제 타이틀만 렌더 |
| `src/components/TabHeader.test.tsx` | 기어 관련 테스트를 "더 이상 렌더하지 않음" 확인으로 교체 |
| `src/app/(tabs)/home/page.tsx`, `people/page.tsx`, `you/page.tsx`, `ask/page.tsx` | `<TabTopBar right={<AccountAvatar />} />`로 변경(기존 bare `<TabTopBar />` 대체) |
| `src/app/(tabs)/settings/page.tsx` | `<TabHeader title="Settings" showSettings={false} />` → `<TabHeader title="Settings" />`(prop 자체가 사라졌으므로), 아바타는 추가하지 않음(자기 자신이므로 불필요, 기존 뒤로가기/탭바 동작 그대로) |
| 4개 탭 `page.test.tsx` | 기존 "Settings 링크 존재" 테스트를 "정확히 1개 + TabHeader(`<header>`) 밖에 위치" 확인으로 강화. `ask/page.test.tsx`의 기존 history 직렬화 테스트는 AccountAvatar가 추가로 `fetch`를 호출하게 되면서 `fetchMock.mock.calls[0]`이 더 이상 `/api/ask` 호출이라는 보장이 없어져, `/api/ask` 호출을 URL로 찾아 검증하도록 수정 |

## 2. 자가점검 체크

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` — 249개 전체 통과 (BRIEF-079 완료 시점 246 → TabHeader 테스트 -1(기어 삭제로 케이스 통합) + AccountAvatar 신규 +4 = 249, 무회귀)
- [x] `npm run build` 성공
- [x] **본인 렌더 확인**: 개발 서버 + Playwright로 프로필을 주입해 5개 화면을 순회하며 측정.
  - **TabTopBar 높이**: `{"home":27,"people":27,"ask":27,"you":27,"settings":19.19}` — 아바타가 붙는 4탭은 27px로 완전히 동일, 아바타가 없는 settings만 기존 그대로 19.19px(의도된 차이 — "설정 페이지는 아바타 불필요").
  - **TabHeader(`<header>`) 높이**: `{"home":61.59,"people":61.59,"ask":61.59,"you":61.59,"settings":61.59}` — 기어 제거 후에도 5탭 전부 여전히 동일(BRIEF-077의 높이 통일은 그대로 유지됨).
  - **Settings 링크 개수**: `{"home":1,"people":1,"ask":1,"you":1,"settings":0}` — 요구된 1/1/1/1/0과 정확히 일치.
  - 스크린샷으로 You·Home 탭의 우상단에 미로그인 실루엣 아바타가 렌더되고, 페이지 헤더 줄에는 더 이상 기어가 없음을 육안 확인. 검증 후 Playwright 삭제, `package.json`/`package-lock.json` 무변경 확인.

- [x] main push 완료 (커밋 해시는 §4)

## 3. 특이사항·이견·사고 정직 보고

- **로그인 상태의 브라우저 실측은 하지 못했다.** 이 개발 환경에는 실제 Google OAuth 자격 증명이 없어, 로그인된 상태(이니셜 아바타)를 실제 브라우저 세션으로 재현할 방법이 없었다. 대신 `AccountAvatar.test.tsx`에서 `getSyncSession`을 모킹해 로그인 픽스처(프로필 name 있음 / email만 있음 두 경우)로 이니셜 렌더링과 name-우선 폴백 순서를 검증했다. 실제 배포 환경에서 로그인 후 육안 확인이 필요하면 별도로 확인을 부탁드린다.
- **아바타 배경색**: "기존 요소색·포인트 토큰 중 하나"라는 지시에 따라 앱의 시그니처 액센트 색인 `var(--c-vermilion)`(CTA 버튼·YOU 라벨 등에 이미 쓰이는 톤)를 이니셜 배경으로 사용했다. 사용자 개인의 오행(일간) 색으로 동적으로 바꾸는 방식도 고려했지만, 브리프가 "신규 토큰 금지"만 명시했을 뿐 특정 색을 지정하지 않았고 상단 바는 페이지 어디서나 반복 노출되는 자리라 매번 색이 바뀌면 오히려 산만할 수 있어 고정 색으로 판단했다 — 이견이 있으면 알려달라.
- **`ask/page.test.tsx`의 기존 히스토리 직렬화 테스트가 아바타 추가로 부수적 영향을 받았다**: AccountAvatar가 마운트 시 `getSyncSession()`을 호출하면서 같은 `fetchMock`을 공유하게 되어, 기존 테스트가 가정하던 "`fetchMock.mock.calls[0]` = `/api/ask` 호출"이 더 이상 보장되지 않는 순서 의존 버그가 될 뻔했다. `/api/ask` 호출을 URL로 명시적으로 찾도록 고쳐 통과시켰다 — 로직 자체(히스토리 `at` 필드 검증)는 그대로다.
- 그 외 어긋난 기대값이나 사고는 없었다.

## 4. 커밋 해시

- 저장소: https://github.com/Farerworks/attune
- 커밋 해시: (본 커밋 — 텔레그램 완료 보고에 함께 남긴다)
