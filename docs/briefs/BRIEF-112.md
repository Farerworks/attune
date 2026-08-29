# BRIEF-112 — 데이터 삭제 3종 정비

## 0. 맥락·기준
- 저장소 github.com/Farerworks/attune / **BASE_SHA = `400cb5342259591fbf151b39271ad2f1c7487530`** (여기서 브랜치 생성. 다르면 중단·보고)
- 브랜치 `brief/112-data-deletion`. main 직접 push·force push·rebase·merge commit 금지. **병합 금지** — 본부 검수 후 별도 지시.
- 착수 전: 브리프 원문을 `docs/briefs/BRIEF-112.md`로 바이트 그대로 단독 커밋+push, `sha256sum`·`wc -c` 보고.
- 배경: ①`clearAllData()`(store.ts:225)가 `attune.ask.memory`를 안 지움 — 이 결함으로 102 판이 「Clear all data」 행을 `disabled`(settings/page.tsx:366) ②`deleteBackup()`(sync.ts:104)은 실패를 삼킴(`void`) — 서버 삭제 실패에도 로컬만 지워짐 ③Ask 대화를 지울 수단 없음.

## 1. clearAllData 전면화 — src/lib/store.ts
나열식 제거 4줄을 **접두사 일소**로 교체:
```ts
export function clearAllData(): void {
  if (typeof window === 'undefined') return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('attune.')) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch {}
}
```
- 순회 중 제거는 인덱스가 밀린다 — **수집 후 제거 2단계** 필수.
- 현재 `attune.*` 전수(08-28 실측 7개): `attune.profile` `attune.readings` `attune.ask.threads` `attune.ask.quota` `attune.ask.memory` `attune.sync.lastBackupAt` `attune.sync.replaceAck`. 접두사 방식이라 향후 키도 자동 포함.
- `attune.sync.replaceAck` 삭제는 의도: 전체 삭제 뒤엔 새 기기 — 다음 백업은 승인 관문(107) 재통과.

## 2. Clear all data 실패 시 중단 — src/lib/sync.ts + settings/page.tsx
- `deleteBackup()` → `Promise<boolean>`: `res.ok || res.status === 404` 반환(404 = 지울 것 없음 = 성공 동치), 예외 `false`. 호출처는 settings 한 곳뿐(실측).
- `handleClearData()`: 로그인 상태에서 `deleteBackup()`이 `false`면 **로컬을 지우지 않고 중단** + 행 아래 문구 표시(신규 상태 `clearMsg`, `restoreMsg` 표시 패턴과 동일).
  - 정본(EN, 수정 금지): `Couldn't delete your backup — nothing was cleared. Try again.`
- 성공·비로그인 경로 현행 유지(`clearAllData()` → `router.push('/')`).
- :366의 `disabled` 제거(`danger` 유지) — 잠금 사유가 §1로 해소.

## 3. Reset conversations 신설 — src/lib/askQuota.ts + settings/page.tsx
- 신규 `resetConversations()`: `LS_THREADS_KEY`·`LS_MEMORY_KEY` **둘만** 제거. **`LS_QUOTA_KEY` 유지**(초기화로 일일 쿼터가 리셋되면 우회 수단).
- 「Clear all data」 **바로 위**에 `<Row label="Reset conversations" danger onClick={…} />` (destructive 3번째 용처 — 08-28 YS 결재. `disabled` 아님)
- onClick은 `window.confirm`(기존 페이지 패턴, 새 확인 UI 금지). 정본(EN, 수정 금지):
  - 로그인: `Delete all Ask conversations and their remembered facts? Readings stay. This also updates your backup. This cannot be undone.`
  - 비로그인: `Delete all Ask conversations and their remembered facts? Readings stay. This cannot be undone.`
- 확인 시: `resetConversations()` → 로그인이면 `pushBackup()`(인자 없이 — **`explicitReplace` 금지**, 승인 관문 경유).
  - push 실패·차단이어도 **로컬 초기화는 유지**(다음 백업이 따라잡음). 결과 문구 정본(EN, 수정 금지): 실패 `Conversations were reset on this phone, but the backup couldn't be updated yet.` / 성공·비로그인 `Conversations reset.` — 별도 상태로 같은 표시 패턴.
- readings·profile·quota 무접촉. **저장 구조 변경 금지**(threads 스키마 그대로).

## 4. 테스트 (신규 — BASE에선 실패해야 정상)
1. `clearAllData`: 7개 키+가상 `attune.future.x`+비대상 `otherapp.k` 시드 → `attune.*` 0개·`otherapp.k` 생존.
2. `deleteBackup`: 200→true / 404→true / 500→false / reject→false.
3. Settings: ⑴행 disabled 아님 ⑵로그인+deleteBackup false 목 → localStorage 무손상+§2 문구+`clearAllData` 미호출 ⑶성공 목 → 호출됨.
4. `resetConversations`: threads·memory만 삭제, quota·readings·profile 보존.
5. Reset 행: ⑴confirm 취소 → 무변경 ⑵확인+로그인 목 → `resetConversations` 후 `pushBackup` ⑶push 실패 목 → threads 삭제됨+실패 문구.
- 기존 테스트 갱신 필요 시(disabled 단언, `attune.lastBackup` 픽스처 등) 갱신하되 **사유 보고**.

## 5. 금지
- `SNAPSHOT_KEYS`(sync.ts:1) 변경 금지 — 백업 스키마 불변.
- `/api/sync` DELETE 신규 호출 금지(기존 clear-all 경로 1회만). **사람 삭제에 DELETE 절대 금지.**
- `pushBackup` 관문(107)·`markReplaceAck`·AutoBackup 무접촉.
- 정본 문구 5건 자구 수정 금지. KO 분기 추가 금지(Settings는 영어 전용 층).
- 수정 파일 한정: store.ts·askQuota.ts·sync.ts·settings/page.tsx + 각 테스트. 그 밖 무접촉.

## 6. 완료 기준
`npx tsc --noEmit` 0 / `npx vitest run` 전체 — 기준 **1015+4** 대비 passed 증가만·expected fail 불변 / `npm run build` 성공 / lint **39(24E/15W)** 초과 금지(청정 트리) / 보고서 `docs/reports/BRIEF-112.md`(§4 결과·갱신 사유) 커밋 / 완료 보고에 커밋 해시 목록.
