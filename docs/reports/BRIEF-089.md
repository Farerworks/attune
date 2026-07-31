# BRIEF-089 — 소소 정합 3건: Ask 빈 상태 예시 · Clear all data 경고 · Settings chevron

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `src/app/(tabs)/ask/page.tsx` | `FirstVisitContent`에 `hasPersonChips` prop 추가, 사람 0명이면 자기/일반용 예시 3개로 스왑(1명 이상이면 기존 상대 지향 예시 유지) |
| `src/app/(tabs)/settings/page.tsx` | `handleClearData`의 confirm 문구를 `syncSession` 유무로 분기(백업 없음/구글 백업도 삭제됨을 명시) + `Row label="Add to Home Screen"`에 `chevron` 추가 |
| `src/app/(tabs)/ask/page.test.tsx` | 사람 0명/1명 이상 케이스별 FirstVisitContent 예시 렌더 테스트 2건 |
| `src/app/(tabs)/settings/page.test.tsx` | confirm 문구 분기 테스트 2건 + chevron 유무 테스트 2건 |

## 2. 구현 요지

1. **Ask 빈 상태 예시** — 기존 `FirstVisitContent`는 `EXAMPLES`가 정적 배열이라 저장된 사람이 0명이어도 "How do I ask them out?" 같은 상대 지향 문구가 나왔다. 페이지에 이미 있던 `hasPersonChips`(사람 칩 존재 여부) 신호를 prop으로 내려보내, 0명이면 지시서 정본 3개("What's today like for me?" 등)로, 1명 이상이면 기존 3개로 렌더한다. 색상·회전각·레이아웃은 변경 없음.
2. **Clear all data 경고** — `syncSession`이 없으면 "백업이 없어 이 기기의 데이터가 영구 삭제된다"는 사실을, 있으면 "구글 백업도 함께 삭제된다"는 사실을 confirm 문구에 명시. 삭제 동작(`deleteBackup`/`clearAllData`/`router.push`) 자체는 무변경.
3. **Settings chevron** — "Add to Home Screen"은 설치 안내 시트(`setShowInstallSheet`)를 여는 행인데 chevron이 없었다. "새 표면이 열리면 chevron" 규칙에 맞춰 `chevron` prop을 추가. "Share Attune"(시스템 공유 시트 즉발)·"About Attune"(시트, 기존에 이미 chevron 있음)은 무변경.

## 3. 렌더 확인 — 사람 0명 Ask 첫 화면 (390×844)

로컬 dev 서버 + Playwright로 확인. 프로필만 있고 저장된 사람이 0명인 상태에서 자기/일반용 예시 3개가 정본 문구 그대로, 기존 레이아웃(카드 색·정렬·회전)대로 렌더됨을 확인했다. 스크린샷은 텔레그램으로 별도 전송한다.

## 4. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` — 302개 전체 통과 (기존 296 + 신규 6, 무회귀)
- [x] `npm run build` 성공
- [x] 본인 렌더 확인 — §3 (스크린샷 첨부)
- [x] main push 완료 (커밋 해시는 §6)
- [ ] YS 실물 확인 — 새 기기/시크릿 창에서 Ask 첫 화면 예시(사람 0명) + Clear 확인창 문구 두 버전 (환경상 로그인 상태의 실제 구글 백업 흐름까지는 제가 직접 확인 불가, YS 게이트로 넘김)

## 5. 정직 보고

- Clear all data confirm 문구의 "로그인 상태" 분기는 `getSyncSession()`을 모킹한 단위 테스트로만 확인했다 — 실제 구글 로그인 세션이 있는 상태에서 확인창이 정확히 그 문구로 뜨는지는 이 환경에서 실제 로그인할 수 없어 검증 불가하다.
- 그 외에는 전부 3건 각각 독립된 표면 카피/1속성 변경이라 특이사항 없음.

## 6. 커밋 해시

- 저장소: https://github.com/Farerworks/attune
- 커밋 해시: `af67e47`
