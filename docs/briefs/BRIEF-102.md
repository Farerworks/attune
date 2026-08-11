# BRIEF-102 — 화면 문구·동작 정직화 4건 (카피 P0)

## §0 맥락 (처음 읽는 사람용 — 이 문서가 요구사항의 전부다)

- 대상: **Attune** — Next.js(App Router)+TypeScript 웹앱. 작업 폴더 `~/projects/attune`, 저장소 `github.com/Farerworks/attune`.
- 이번 판의 목적: **앱이 말하는 것과 실제 동작이 다른 4곳**을 바로잡는다. ①사실과 다른 개인정보 안내문 삭제 ②raw 에러 노출 2지점을 사용자 문구로 교체 ③복원 실패 오라벨 교체 ④"Clear all data" 버튼 비활성화(뒤의 삭제 함수에 알려진 결함이 있어 수리 전까지 잠근다 — 수리는 별도 판).
- **기준 커밋**: `origin/main = 217b41647b63bed056099bdc8e22278bd4cc0e0f`. 작업 전 `git fetch origin && git checkout main && git pull --ff-only && git rev-parse HEAD`로 이 값과 일치 확인 — 다르면 **중단하고 보고**.
- **전용 브랜치 `fix/102-copy-p0`에서만 작업. main 직접 push 금지. force push 금지. 병합 금지**(병합은 이후 별도 지시로 진행).
- 기준 테스트 상태: **902 = 898 passed + 4 expected fail**(`it.fails` 4건 — 이번 판이 늘리지도 줄이지도 않는다).

## §1 공정 (브랜치에 커밋 정확히 3개, 순서 고정)

1. **보관 커밋**: 수신한 이 문서를 `docs/briefs/BRIEF-102.md`로 **바이트 그대로** 저장 → `sha256sum`·`wc -c`를 발사 메시지의 기준값과 대조(불일치 시 중단·보고) → 이 파일 하나만 단독 커밋.
2. **코드 커밋**: §2 구현 + §3 테스트.
3. **보고서 커밋**: `docs/reports/BRIEF-102.md`(§5 양식).

푸시: `git push -u origin fix/102-copy-p0`.

## §2 변경 사양 (정확히 이 4건만)

### 2.1 [삭제] Settings > About 시트의 개인정보 문단

파일 `src/app/(tabs)/settings/page.tsx`, `AboutSheet` 컴포넌트 내부. 아래 문자열을 담은 `<p>` 블록(스타일 포함) **전체를 삭제**한다:

> All readings are stored locally on your device. Nothing is sent to a server except the birth dates needed to generate a briefing. No account required. Free to use.

- 바로 위 "Attune uses Four Pillars…" 문단과 아래 "Made by farerworks" 문단은 **무접촉**.
- 사유(참고): 위 문장은 실제 동작과 불일치(FALSE)로 판정되어 삭제가 결정됨. **대체 문구 없음 — 새 문구 추가 금지.**

### 2.2 [교체] You 탭 에러 표시 2지점

파일 `src/app/(tabs)/you/page.tsx`, `useEffect` 내부.

- 지점 A — `calculateSaju` try의 catch:
  - 현재: `setError(e instanceof Error ? e.message : 'Could not calculate chart');`
  - 변경: `console.error(e);` 후 `setError(<정본 문자열>);`
- 지점 B — Promise 체인 말미:
  - 현재: `.catch(e => setError(String(e)));`
  - 변경: `.catch(e => { console.error(e); setError(<정본 문자열>); });`

**정본 문자열(두 지점 동일, 아래 바이트 그대로 — 아포스트로피는 직선 `'`, 대시는 em dash `—`)**:

> Attune couldn't load your chart — try again in a moment.

- 문자열은 파일 내 상수로 빼도 되고 리터럴 2회도 된다(동일 바이트일 것).
- **원문 에러는 화면에 노출 금지** — `console.error`로만 남긴다.

### 2.3 [교체] Settings 복원 실패 문구

파일 `src/app/(tabs)/settings/page.tsx`, `handleRestore` 내부.

- 현재: `setRestoreMsg('Backup failed — try again.');`
- 변경: `setRestoreMsg('Restore failed — try again.');`

**주의**: `handleBackupNow` 안의 `'Backup failed — try again.'`(백업 실패 문구)는 정상이므로 **무접촉**. `'No backup found.'`·`"Backup isn't available right now."` 등 다른 문구도 무접촉.

### 2.4 [비활성화] "Clear all data" 버튼

배경(참고): `clearAllData()`가 `attune.ask.memory` 키를 지우지 않는 결함이 확인됨. **수리는 별도 판**으로 가고, 그때까지 버튼을 잠근다.

파일 `src/app/(tabs)/settings/page.tsx`:

- (a) `RowProps`에 `disabled?: boolean;` 추가.
- (b) `Row`의 button 분기: `disabled` prop을 button의 `disabled` 속성으로 전달. disabled일 때 스타일에 `opacity: 0.35`·`cursor: 'default'` 적용, `className`의 `pressable` 제거(눌림 효과 방지). 색상 변경 없음(기존 danger 색 유지). `href`(Link) 분기는 무접촉.
- (c) 사용부: `<Row label="Clear all data" danger disabled onClick={() => void handleClearData()} />` — onClick은 유지(재활성화 대비), 네이티브 `disabled`가 클릭을 차단한다.
- (d) **금지: `handleClearData` 함수 본문 / `src/lib/store.ts`의 `clearAllData()` / confirm 문구 2종 — 전부 무접촉. `attune.ask.memory` 삭제 추가 금지(별도 판).**
- (e) 라벨 `Clear all data` 그대로. 새 안내 문구 추가 금지.

## §3 테스트

### 3.1 기존 테스트 개정 (정확히 2건)

`src/app/(tabs)/settings/page.test.tsx`의 describe `'SettingsPage — Clear all data confirm copy by backup state (BRIEF-089)'` 2건은 **버튼 활성을 전제로** confirm 문구를 검증한다. 이번 판으로 버튼이 잠기므로 이 2건을 다음으로 교체한다:

- (signed-out) "Clear all data" 버튼이 `disabled`이고, 클릭해도 `window.confirm`이 호출되지 않는다.
- (signed-in) 동일 단언(세션 상태 커버 유지).

describe 제목 또는 주석에 남길 것: **"BRIEF-102로 버튼 비활성화 — 재활성화 판에서 BRIEF-089의 confirm 문구 검증을 복원할 것."**

### 3.2 신규 테스트 (정확히 3건)

- **T1** (`you/page.test.tsx`): `calculateSaju`가 `throw new Error('raw internal boom')` 하는 상황에서 → 화면에 정본 문구가 보이고, `raw internal boom`은 화면에 없다. `console.error`가 해당 에러와 함께 호출됨을 단언(원문은 콘솔로만).
  - 구현 주의: 파일 상단 `vi.mock('@/lib/saju', …)`은 같은 파일의 실계산 테스트를 깨뜨린다. **해당 테스트 안에서 `vi.resetModules()` + `vi.doMock('@/lib/saju', …)` 후 페이지를 다시 import**하고, 테스트 끝에 mock을 해제할 것.
- **T2** (`settings/page.test.tsx`): "About Attune" 클릭으로 시트 오픈 → `Nothing is sent to a server`를 포함하는 텍스트가 화면에 **없다** + `Made by farerworks`는 **있다**(시트가 실제로 열렸다는 양성 대조).
- **T3** (`settings/page.test.tsx`): signed-in 세션 + `pullBackup`이 `{ ok: false }` 형태를 반환하게 mock → "Restore from backup" 클릭 → `Restore failed — try again.` 표시. 이 흐름에서 `Backup failed — try again.`는 미표시. (기존 mock 하네스의 `pullBackup`을 `mockGetSyncSession` 방식처럼 테스트에서 조작 가능하게 바꿔도 된다 — 테스트 파일 내 한정.)

### 3.3 수치 기대

신규 3 반영 예상 총 **905 = 901 passed + 4 expected fail**. 실측 수치를 보고서에 기재(예상과 다르면 사유 명기). `it.fails` 4건(X5-M1·E-070·E-071·E-080)은 무변경.

## §4 완료 기준 (전부 충족해야 완료)

- `npx tsc --noEmit` 오류 0
- `npx vitest run` 전체 — §3.3 기준, `it.fails` 4건 외 실패 0
- `npm run build` 성공
- 렌더 스크린샷 2장: ①About 시트(문단 삭제 후) ②Settings 하단("Clear all data" 흐림 상태)
- 보고서 `docs/reports/BRIEF-102.md` 커밋
- 채팅 완료 보고: **커밋 해시 3종**(보관/코드/보고서=HEAD) + 보관본 `sha256`·바이트(기준값 대조 결과) + 테스트 수치

## §5 보고서 양식 (`docs/reports/BRIEF-102.md`)

변경 파일·diff 요약(4건별) / 테스트: 개정 2·신규 3 내용과 전체 수치 / 렌더 파일 경로 / 보관 커밋·코드 커밋 해시(보고서 자신의 해시는 파일에 넣지 않는다) / 특이사항·판단(있으면).

## §6 금지사항 (요약)

- 위 4건 외 어떤 파일·문구·스타일도 수정 금지. **허용 경로 6개**: `src/app/(tabs)/settings/page.tsx` / `src/app/(tabs)/you/page.tsx` / 같은 폴더의 두 테스트 파일 / `docs/briefs/BRIEF-102.md` / `docs/reports/BRIEF-102.md`.
- `src/lib/store.ts` 무접촉. `src/lib`의 llm·safety 계열 무접촉. API 라우트 무접촉.
- 정본 문자열 바이트 수정 금지(따옴표·대시 포함). 새 문구 창작 금지.
- main 직접 push 금지 / force push 금지 / 병합 금지(별도 지시 예정).

## §7 근거 출처

- 외부 API·모델 사양 해당 없음. 전 사양은 저장소 `217b416` 실측(2026-08-09, 본부)으로 확정: AboutSheet 문단 / you 에러 2지점(에러 렌더는 148행 부근 `<div>`) / `handleRestore` 문구 / `Row`·`RowProps` 구조 / BRIEF-089 테스트 2건 영향.
