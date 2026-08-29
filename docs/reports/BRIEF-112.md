# BRIEF-112 — 데이터 삭제 3종 정비

## 1. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `src/lib/store.ts` | `clearAllData()`를 나열식 4줄 제거에서 `attune.` 접두사 전수 수집 후 제거(2단계)로 교체. 향후 키도 자동 포함. |
| `src/lib/sync.ts` | `deleteBackup()`을 `Promise<void>`에서 `Promise<boolean>`으로 변경. `res.ok \|\| res.status === 404` → true, 예외 → false. |
| `src/lib/askQuota.ts` | `resetConversations()` 신설. `LS_THREADS_KEY`·`LS_MEMORY_KEY`만 제거, `LS_QUOTA_KEY`는 보존. |
| `src/app/(tabs)/settings/page.tsx` | ①`handleClearData()`: 로그인 상태에서 `deleteBackup()`이 false면 로컬을 지우지 않고 중단, `clearMsg` 상태로 실패 문구 표시. ②「Clear all data」행의 `disabled` 제거(`danger` 유지). ③`handleResetConversations()` 신설 + 「Reset conversations」행을 「Clear all data」바로 위에 추가, `resetMsg` 상태로 결과 문구 표시. |
| `src/lib/store.test.ts` | `clearAllData` 신규 테스트 1건(§4-1). |
| `src/lib/sync.test.ts` | `deleteBackup` 신규 테스트 4건(§4-2: 200/404/500/reject). |
| `src/lib/askQuota.test.ts` | `resetConversations` 신규 테스트 1건(§4-4). jsdom 환경으로 전환(`@vitest-environment jsdom` 추가 — `localStorage` 사용을 위해 필요). |
| `src/app/(tabs)/settings/page.test.tsx` | 기존 "Clear all data disabled" 단언 2건을 BRIEF-089 원본 confirm 문구 검증으로 교체(§4-3⑴, 아래 §3 갱신 사유 참고) + 신규 4건(§4-3⑵⑶, §4-5 3건 중 2건은 이 describe에) + Reset 행 4건(§4-5, confirm 취소/로그인 성공/push 실패/비로그인 성공). `@/lib/store`를 신규 모킹(`clearAllData` 스파이 목적). |

## 2. 자가점검 체크 (§4 신규 테스트 항목 대조)

1. `clearAllData`: 7개 키 + `attune.future.x` + `otherapp.k` 시드 → `attune.*` 0개·`otherapp.k` 생존 — `store.test.ts` `describe('clearAllData (BRIEF-112 §1)')` 1건, PASS.
2. `deleteBackup`: 200→true / 404→true / 500→false / reject→false — `sync.test.ts` `describe('deleteBackup (BRIEF-112 §2)')` 4건, PASS.
3. Settings: ⑴ 행 disabled 아님 ⑵ 로그인+`deleteBackup` false 목 → localStorage 무손상+§2 문구+`clearAllData` 미호출 ⑶ 성공 목 → 호출됨 — `page.test.tsx`에 각각 반영, PASS. (⑴은 재활성화된 BRIEF-089 confirm-copy 테스트 2건에 내장: `button?.disabled`를 `false`로 재단언)
4. `resetConversations`: threads·memory만 삭제, quota·readings·profile 보존 — `askQuota.test.ts` 1건, PASS.
5. Reset 행: ⑴ confirm 취소 → 무변경 ⑵ 확인+로그인 목 → `resetConversations` 후 `pushBackup` ⑶ push 실패 목 → threads 삭제됨+실패 문구 — `page.test.tsx` `describe('SettingsPage — Reset conversations (BRIEF-112 §3)')` 4건(⑴⑵⑶ + 비로그인 성공 경로 1건 추가), PASS.

## 3. 기존 테스트 갱신 사유

`page.test.tsx`의 `describe('SettingsPage — Clear all data confirm copy by backup state (BRIEF-089)')`가 BRIEF-102에서 `disabled`로 잠기면서 "클릭해도 confirm이 안 뜬다"만 검증하도록 축소돼 있었다(주석: "재활성화 판에서 BRIEF-089의 confirm 문구 검증을 복원할 것"). §1의 결함(`clearAllData`가 `attune.ask.memory`를 안 지움)이 이번에 해소되어 `disabled`를 제거했으므로, 그 주석이 예고한 대로 BRIEF-089 원본의 confirm 문구 단언(로그인/비로그인 2분기)을 그대로 복원했다. 단언 내용은 브리프가 수정한 적 없는 기존 정본 문구이므로 자구 변경은 없다.

## 4. 검증 결과

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run` | **1027 passed \| 4 expected fail (1031)** — 기준 1015+4 대비 passed +12, expected fail 불변 |
| `npm run build` | 성공 (`BUILD_EXIT=0`) |
| lint (청정 상태 — 미추적 74개 대피 후 측정) | **39개 (24E/15W)** — 기준과 동일, 신규 0 |
| 변경 파일 범위 | `store.ts`·`askQuota.ts`·`sync.ts`·`settings/page.tsx` + 각 테스트 4쌍, 그 밖 무접촉 확인(`git diff --stat` §1 표와 일치) |

신규 테스트 12건 내역: `clearAllData` 1 + `deleteBackup` 4 + `resetConversations` 1 + Settings 6(confirm 문구 교체 2 net-zero는 카운트에서 제외, 실질 신규는 클리어 실패/성공 2 + Reset 행 4) = 12.

## 5. 특이사항·이견·사고 정직 보고

- §2 금지 사항 "정본 문구 5건 자구 수정 금지"를 그대로 지켰다 — 브리프에 명시된 5개 문구(백업 삭제 실패, Reset 확인×2, Reset 결과×2)를 원문 그대로 사용했다.
- §5 "`/api/sync` DELETE 신규 호출 금지(기존 clear-all 경로 1회만)"를 지켰다 — `deleteBackup()` 호출부는 `handleClearData()` 1곳뿐이며 새 호출부를 추가하지 않았다.
- `askQuota.ts`의 기존 `clearAskData()`(BRIEF-100B-FIX 도입, 현재도 미사용 상태였음)는 이번에도 아무 곳에서 호출되지 않는다 — 브리프 수정 대상이 아니므로 손대지 않았다.
- 그 외 이견·사고 없음.

## 6. 커밋 해시

- 저장소: https://github.com/Farerworks/attune (브랜치: `brief/112-data-deletion`)
- 브리프 원문 보관: `b2288fb`
- 코드+테스트+보고서 커밋: (본 커밋 자신)
- **병합 금지 — 본부 검수 대기.**
