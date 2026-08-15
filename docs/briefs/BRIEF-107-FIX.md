# BRIEF-107-FIX **v1.1** — 관문 fail-closed 전환 + Settings 복원 경로 승인

> **BASE_SHA = `1d77fcbc06e3245c285bbe745202b952db0cc2ad`** (`feat/107-backup-guard` 최신)
> **같은 브랜치 `feat/107-backup-guard`에 이어서 커밋한다. 새 브랜치를 만들지 마라.**
> **원인은 본부 사양 결함 2건이다. 구현은 지시대로였다.**

---

## §0 왜 고치나

### 결함 ⑴ — 관문이 fail-open이다 (**차단**)

```ts
const session = await getSyncSession();
if (session?.sub && opts?.explicitReplace !== true && !hasReplaceAck(session.sub)) { … }
```

**`session?.sub`가 없으면 조건 전체가 false가 되어 관문이 열린다.**
`getSyncSession()`은 `/api/auth/session` fetch 실패 시 `catch { return null }` 한다 〔`sync.ts:6-13`〕.
그런데 **실제 PUT은 브라우저가 쿠키를 자동으로 실어 성공할 수 있다.**

> **세션 조회만 일시 실패하면 승인 없이 PUT이 나간다.**
> **이 판이 막으려는 상황이 바로 네트워크가 불안정한 때다 — 가장 위험한 순간에 관문이 열린다.**

본부가 `BRIEF-107 §1.2`에 「세션이 없으면 기존대로 처리」라고 쓴 것이 원인이다. **fail-closed로 바꾼다.**

### 결함 ⑵ — Settings 복원 경로에 승인이 없다 (**차단 아님**)

`settings/page.tsx:281-296 handleRestore()`가 `applySnapshot(res.payload)` 뒤에 **`markReplaceAck`를 부르지 않는다.**
`BRIEF-107 §1.3`이 승인 지점을 넷으로 못박으면서 **이 경로를 빠뜨렸다 — 본부 누락이다.**
결과: Settings에서만 복원한 사용자는 **로컬 = 서버가 됐는데 자동 백업이 계속 멈춘다.**

---

## §1 고칠 것 — 정확히 셋

### 1.1 `src/lib/sync.ts` — 관문을 fail-closed로

```ts
if (opts?.explicitReplace !== true && !(session?.sub && hasReplaceAck(session.sub))) {
  return { ok: false, status: 0, blocked: true };
}
```

**의미: 「승인된 계정임이 확인될 때만 통과」.** 세션을 못 얻으면 **막는다.**
비로그인 사용자의 push가 막히지만 **손실 0** — 그 PUT은 어차피 서버에서 401이다.
**`explicitReplace: true`의 우선순위는 그대로 유지한다**(Settings 수동 백업의 최초 PUT 경로).

### 1.2 `src/lib/sync.test.ts` — 기대값을 뒤집어라

현재 `:57` 「세션이 없으면(비로그인) 기존대로 처리한다 — 게이트 없이 PUT을 시도한다」가
**fail-open을 고정하고 있다.** 이 테스트를 다음으로 **교체**한다:

> **세션을 얻지 못하면(비로그인·세션 조회 실패) PUT을 보내지 않는다** —
> `fetch('/api/sync', {method:'PUT'})` **호출 0회**, 반환값 `{ok:false, blocked:true}`

### 1.3 `src/app/(tabs)/settings/page.tsx` — 복원 성공 시 승인

`handleRestore()`에서 **`applySnapshot(res.payload)`가 끝난 뒤, `window.location.href` 이동 전에**
현재 세션의 `sub`로 `markReplaceAck(sub)`를 부른다.

- `sub`는 이미 화면이 들고 있는 `syncSession.sub`를 쓴다. **`getSyncSession()`을 새로 호출하지 마라**
- `window.confirm`이 **취소되면 아무것도 하지 마라**(현재 동작 유지)
- **`applySnapshot`보다 먼저 승인하지 마라**

---

## §2 변경 파일 — 정확히 이 4개

```
src/lib/sync.ts
src/lib/sync.test.ts
src/app/(tabs)/settings/page.tsx
src/app/(tabs)/settings/page.test.tsx
```

**`RestoreFromBackup.tsx`·`AutoBackup.tsx`·`person/[id]/page.tsx`는 건드리지 마라.**

---

## §3 완료 기준

1. `npx tsc --noEmit` **exit 0**
2. `npx vitest run` **exit 0** — **960 이상**(현재 956 passed + 4 expected fail). 줄어들면 안 된다
3. `npm run build` **exit 0**
4. **lint 39(24E/15W) 불변** — `git status --porcelain` 빈 상태에서 측정
5. **신규·수정 테스트 3건 — 아래 재현 방식을 그대로 지켜라**

   **⑴ 세션 조회 실패 → PUT 0회** (기존 `sync.test.ts:57` 교체)
   > **`/api/auth/session` fetch 자체가 reject되는 경우를 재현할 것.**
   > 기존 스텁은 `{ok:true, json: () => null}`을 돌려주는데, 그건 **「로그아웃 상태」**이지 **「조회 실패」**가 아니다.
   > 이 판이 막으려는 건 **네트워크 실패**이므로 `fetch`가 **throw/reject**하는 경로(`getSyncSession`의 `catch`)를 태워야 한다.
   > 확인: **`fetch('/api/sync', {method:'PUT'})` 호출 0회** + 반환값 `{ok:false, blocked:true}`
   > (로그아웃 상태도 같은 결과여야 하므로 두 경우를 각각 확인하면 더 좋다)

   **⑵ 세션 있고 승인 없음 → PUT 0회** (기존 유지 확인)

   **⑶ Settings 복원 후 통과**
   > `Restore from backup` 성공 → `applySnapshot` **뒤** 그 `sub`로 승인 기록 →
   > **그 다음 일반 `pushBackup()`(옵션 없이)이 `blocked` 없이 `PUT` 1회를 보내는 것**으로 검증할 것.
   > 「승인이 기록됐다」만 확인하지 말고 **관문을 실제로 통과하는지**까지 볼 것
6. 회귀 2종 `[PASS]` — `trait-regression.mjs` **12/32·오탐 0**, `lang-regression.mjs` **12행**
7. `samples/voice-baseline/*run*.json` **8파일 diff 0**

---

## §4 하지 말 것

- **새 브랜치를 만들지 마라.** `feat/107-backup-guard`에 이어 커밋한다
- **`explicitReplace`를 Settings 수동 백업 외 어디에도 쓰지 마라**
- `markReplaceAck`를 **`applySnapshot` 이전에 부르지 마라**
- `SNAPSHOT_KEYS`·`PUSH_INTERVAL`·`SESSION_CHECK_DELAY`를 **바꾸지 마라**
- `/api/sync` **DELETE를 호출·추가하지 마라**
- **`main` 직접 push 금지 / force push 금지 / rebase 금지 / merge commit 생성 금지**
- 저장소 루트 `CLAUDE.md`(11바이트)를 **덮어쓰지 마라**

---

## §5 보고 양식

- 커밋 **전체 SHA** + 변경 파일 목록(§2와 일치함을 보일 것)
- `tsc_exit` / `vitest_exit` / `build_exit` + **vitest 수치**
- **lint 수치**(청정 상태 측정 명시)
- **테스트 3건의 이름과 결과**
- **회귀 2종 `[PASS]` 줄** + `samples` 8파일 무변동
- 본부 사양과 다르게 구현한 것 — 없으면 「없음」
