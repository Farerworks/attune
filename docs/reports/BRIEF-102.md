# BRIEF-102 — 화면 문구·동작 정직화 4건 (카피 P0)

## 0. 작업 브랜치

이 판의 모든 커밋은 `main`이 아니라 `fix/102-copy-p0`에만 존재한다. `origin/main`은 시작부터 끝까지 `217b41647b63bed056099bdc8e22278bd4cc0e0f` 그대로다.

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `docs/briefs/BRIEF-102.md` | 브리프 원문 바이트 그대로 보관 (단독 커밋) |
| `src/app/(tabs)/settings/page.tsx` | 2.1 About 문단 삭제 / 2.3 복원 실패 문구 교체 / 2.4 Clear all data 비활성화 |
| `src/app/(tabs)/you/page.tsx` | 2.2 에러 표시 2지점을 정본 문구로 교체 |
| `src/app/(tabs)/settings/page.test.tsx` | 기존 2건 교체 + 신규 2건(T2·T3) |
| `src/app/(tabs)/you/page.test.tsx` | 신규 1건(T1) |
| `docs/reports/BRIEF-102.md` | 본 보고서 |

## 2. 4건별 diff 요약

### 2.1 [삭제] Settings > About 시트의 개인정보 문단
`AboutSheet` 안의 "All readings are stored locally on your device. Nothing is sent to a server..." `<p>` 블록 전체 삭제. 바로 위 "Attune uses Four Pillars…" 문단과 아래 "Made by farerworks" 문단은 무접촉.

### 2.2 [교체] You 탭 에러 표시 2지점
- 지점 A(`calculateSaju` catch): `setError(e instanceof Error ? e.message : 'Could not calculate chart')` → `console.error(e); setError("Attune couldn't load your chart — try again in a moment.")`
- 지점 B(Promise 체인 `.catch`): `setError(String(e))` → `console.error(e); setError("Attune couldn't load your chart — try again in a moment.")`
- 두 지점 문자열 바이트 확인: 58바이트(UTF-8), 아포스트로피 `'`(U+0027), 대시 `—`(em dash) 그대로.

### 2.3 [교체] Settings 복원 실패 문구
`handleRestore` 안 `setRestoreMsg('Backup failed — try again.')` → `setRestoreMsg('Restore failed — try again.')`. `handleBackupNow`의 동일 텍스트('Backup failed — try again.')는 무접촉.

### 2.4 [비활성화] "Clear all data" 버튼
- `RowProps`에 `disabled?: boolean;` 추가.
- `Row`의 button 분기: `disabled`를 button의 `disabled` 속성에 전달, `disabled`일 때 `opacity: 0.35`·`cursor: 'default'` 적용, `className`에서 `pressable` 제거. `href`(Link) 분기 무접촉.
- 사용부: `<Row label="Clear all data" danger disabled onClick={() => void handleClearData()} />`.
- `handleClearData` 함수 본문·`src/lib/store.ts`의 `clearAllData()`·confirm 문구 2종은 무접촉.

```
$ git diff --stat 217b41647b63bed056099bdc8e22278bd4cc0e0f..35c8543 -- "src/app/(tabs)/settings/page.tsx" "src/app/(tabs)/you/page.tsx"
 src/app/(tabs)/settings/page.tsx | 28 +++++++++++++++++-----------
 src/app/(tabs)/you/page.tsx      |  5 +++--
 2 files changed, 20 insertions(+), 13 deletions(-)
```

## 3. 테스트

### 3.1 개정 2건 (`settings/page.test.tsx`, describe `BRIEF-089`)
버튼 활성을 전제로 confirm 문구를 검증하던 기존 2건을, 버튼이 비활성화되어 클릭해도 `window.confirm`이 호출되지 않음을 검증하는 것으로 교체. describe 안에 "BRIEF-102로 버튼 비활성화 — 재활성화 판에서 BRIEF-089의 confirm 문구 검증을 복원할 것." 주석 남김.

### 3.2 신규 3건
- **T1** (`you/page.test.tsx`): `calculateSaju`가 던지는 상황을 `vi.resetModules()` + `vi.doMock('@/lib/saju', …)`로 해당 테스트 안에서만 모킹 → 정본 문구 표시 확인 + `raw internal boom` 미노출 + `console.error`가 원본 에러와 함께 호출됨을 단언. 테스트 끝에 `vi.doUnmock` + `vi.resetModules`로 해제.
- **T2** (`settings/page.test.tsx`): "About Attune" 클릭 → `Nothing is sent to a server` 문구 없음 + `Made by farerworks` 있음(시트가 실제로 열렸다는 양성 대조).
- **T3** (`settings/page.test.tsx`): signed-in + `pullBackup`이 `{ ok: false }` 반환하도록 mock 조작 → "Restore from backup" 클릭 → `Restore failed — try again.` 표시, `Backup failed — try again.`는 미표시.

### 3.3 수치

```
Test Files  42 passed (42)
     Tests  901 passed | 4 expected fail (905)
```

예상(905 = 901 passed + 4 expected fail)과 정확히 일치. `it.fails` 4건(X5-M1·E-070·E-071·E-080)은 무변경.

## 4. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 오류 0
- [x] `npx vitest run` 전체 — 905 = 901 passed + 4 expected fail, §3.3 기준과 일치
- [x] `npm run build` 성공
- [x] 렌더 스크린샷 2장: `/tmp/brief-102-about-sheet.png`(About 시트, 문단 삭제 확인) / `/tmp/brief-102-clear-all-data.png`(Settings 하단, Clear all data 흐림 상태)
- [x] `docs/reports/BRIEF-102.md` 작성

## 5. 렌더 파일 경로

- `/tmp/brief-102-about-sheet.png`
- `/tmp/brief-102-clear-all-data.png`

(Playwright는 이 판을 위해 임시 설치(`npm install --no-save --no-package-lock`) 후 스크린샷 촬영 뒤 `npm install`로 `package-lock.json` 기준 상태로 원복함. `package.json`·`package-lock.json` 변경 없음.)

## 6. 커밋 해시

- 저장소: https://github.com/Farerworks/attune (브랜치: `fix/102-copy-p0`)
- 브리프 원문 보관: `327f173`
- 코드+테스트 커밋: `35c8543`

## 7. 특이사항·판단

- 없음. 브리프 §2의 4건 외 다른 파일·문구·스타일 변경 없음.
