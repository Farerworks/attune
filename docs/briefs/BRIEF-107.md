# BRIEF-107 **v1.1** — 서버 백업 무조건 덮어쓰기 차단 + 복원 실패·부재 문구

> **v1.0 발사 보류 → v1.1로 정정.** 조언자 지적 2건 수용(본부 누락): **①승인을 Google 계정에 귀속** ②**`AutoBackup`만 막으면 우회된다 — 쓰기 관문을 `pushBackup()`으로 옮긴다.**

> **BASE_SHA = `8b9d14c6c45e67d1dd4ea77c1cff3ec522d9672e`** (현재 `origin/main`)
> **브랜치: `feat/107-backup-guard`**
> **범위: 공개 저장소 `attune` 클라이언트만.** `attune-server`는 이 판에서 건드리지 않는다.
> 4,096자 예외 — **데이터 안전 로직과 그 결과를 알리는 문구가 같은 파일에 있어 분리하면 같은 파일을 두 번 고치게 된다.**

---

## §0 왜 하는가 (자기완결형 배경)

`attune-server`의 `PUT /sync` 조사 결과 〔확인 완료〕:

```sql
INSERT INTO snapshots (google_sub, payload, updated_at)
VALUES ($1, $2, now())
ON CONFLICT (google_sub) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()
```

**전체 교체다.** 병합 없음 · 이력 없음 · 버전 검사 없음 · **빈 객체 `{}`도 그대로 수용.**
사용자당 행이 1개뿐이라 **덮어쓰면 복구 경로가 없다.**

그런데 클라이언트에 이런 경로가 있다:

```
① RestoreFromBackup.tsx:29-31  복원 조회 실패 → setView('hidden')   문구 0, 사용자는 실패를 모른다
①' RestoreFromBackup.tsx:47-49 handleStartFresh() { setView('hidden'); }   경고 0
② 사용자가 온보딩을 마친다 → attune.profile 생성
③ AutoBackup.tsx:18  if (!snap['attune.profile']) return;   ← 「빈 기기」만 막는 가드가 통과된다
④ AutoBackup.tsx:22  pushBackup()  (최초 8초 후, 이후 60초, visibilitychange 시 즉시)
→ 서버의 기존 백업이 방금 만든 데이터로 영구 교체
```

**①'가 특히 나쁘다** — 사용자는 `Backup found / We found your backup from <날짜>`를 **보고 나서** `Start fresh`를 누른다.
「이 기기에서 새로 시작」이라고 이해하지 **「서버 백업을 지운다」고 이해하지 않는다.**

`AutoBackup.tsx:18`의 주석은 **`// empty device — never overwrite server backup`**이다.
**의도는 있었으나 가드가 그 의도를 지키지 못한다. 이 판이 그것을 고친다.**

---

## §1 무엇을 만드나 — **계정에 귀속된** 「대체 동의」 + **중앙 쓰기 관문**

### 1.0 ⚠ 두 가지를 반드시 지켜라 (v1.1 정정 사유)

> **① 승인은 boolean이 아니라 「어느 Google 계정에 대한 승인인가」다.**
> boolean이면 이런 사고가 난다 — 기기에서 **계정 A**로 승인 → 같은 기기에서 **계정 B**로 로그인 →
> 로컬엔 A의 데이터가 남아 있는데 승인만 보고 push → **B의 백업이 A의 데이터로 교체된다.**
> `getSyncSession()`은 이미 `sub`를 준다 〔`sync.ts:4 interface SyncSession { sub?: string }`, `:6-13`〕.
>
> **② 관문은 `AutoBackup`이 아니라 `pushBackup()`에 둔다.**
> `pushBackup()` 호출부는 **3곳**이다 〔`grep -rn "pushBackup(" src/` 실측〕:
> `components/AutoBackup.tsx:22` · **`app/(tabs)/person/[id]/page.tsx:210`** · `app/(tabs)/settings/page.tsx:271`.
> **`person/[id]`는 사람 기록 삭제 후 직접 호출하므로 `AutoBackup` 가드를 그냥 지나간다.**
> 관문을 `sync.ts`에 두면 **세 곳 모두와 앞으로 생길 호출부까지** 한 번에 막힌다.

### 1.1 `src/lib/sync.ts`에 신설

```
export const LS_REPLACE_ACK = 'attune.sync.replaceAck';

// 값 = 승인한 session.sub 문자열 (boolean 아님)
export function markReplaceAck(sub: string): void
export function hasReplaceAck(sub: string): boolean   // 저장값 === sub 일 때만 true
```

**의미: 「이 기기의 데이터로 **이 계정의** 서버 백업을 대체해도 된다고 확인된 상태」.**
**계정이 바뀌면 기존 승인은 자동으로 무효**가 된다(저장값과 현재 `sub`가 다르므로).

### 1.2 `pushBackup()`을 관문으로 — **이 판의 핵심**

```
export async function pushBackup(opts?: { explicitReplace?: boolean }): Promise<PushResult>
```

동작:

1. `getSyncSession()`으로 현재 세션을 얻는다. 없으면 기존대로 처리
2. **`opts?.explicitReplace !== true` 이고 `hasReplaceAck(session.sub)`가 false면 → PUT을 보내지 않고 즉시 반환한다**
3. 통과하면 기존 동작 그대로 PUT
4. **`explicitReplace: true`로 호출돼 성공하면 `markReplaceAck(session.sub)`를 기록**

**차단 시 반환값**: `PushResult`에 **`blocked?: true`만 추가**한다. `ok`는 기존대로 `false`.
**기존 호출부의 `res.ok` 검사와 `res.status === 401` 분기를 깨지 마라.**

> **⚠ 순환 문제 해결**: Settings의 수동 백업만 **`pushBackup({ explicitReplace: true })`**로 부른다.
> 사용자가 직접 누른 명시 행동이므로 승인 없이 최초 PUT이 가능하고, **성공하면 그때 승인이 기록된다.**
> **이 옵션을 다른 어디에서도 쓰지 마라.**

### 1.3 승인이 기록되는 지점 — **정확히 이 넷. 다른 곳에서 기록하지 마라**

| # | 지점 | 순서·조건 |
|---|---|---|
| 1 | 복원 **성공** | **`applySnapshot(payload)`가 끝난 뒤**, `/you` 이동 **전**에 `markReplaceAck(sub)` — **적용 전에 승인하면 안 된다** |
| 2 | `pullBackup()`이 **`null`(404)** 반환 | 그 시점의 `session.sub`로 기록. 덮어쓸 것이 없다 |
| 3 | `Start fresh` 확인창에서 **「백업 대체」 선택** | 사용자가 알고 선택했다 |
| 4 | Settings **수동 백업이 성공**했을 때 | `§1.2`의 4번. `explicitReplace` 경로 |

### 1.4 `AutoBackup` — 가드를 **추가하지 마라**

`pushBackup()`이 이미 막으므로 **`AutoBackup.tsx`의 기존 `attune.profile` 가드는 그대로 두고 아무것도 더하지 않는다.**
`res.blocked`가 와도 **`intervalId`를 멈추지 마라**(401만 멈춘다). 다음 tick에서 다시 시도하면 된다.

**⚠ 기존 사용자는 자동 백업이 조용히 멈춘다.** 온보딩을 다시 지나거나 Settings에서 수동 백업을 한 번 누르면 재개된다.
**이 트레이드오프는 본부·YS가 알고 채택한 것이다** — **데이터 파괴보다 자동 백업 중단이 낫다.**
Wave 1은 신규 사용자 5명이라 실제 영향 대상이 사실상 없다.

---

## §2 `RestoreFromBackup` — 세 상태를 갈라라

`pullBackup()`은 이미 셋을 구분해 돌려준다 〔`sync.ts:58-69`〕:

| 반환 | 뜻 | 새 뷰 |
|---|---|---|
| `null` | **404 · 백업 없음** | `none` (신설) — **`markReplaceAck()` 호출** |
| `{ok:false, status}` | 서버·인증·네트워크·파싱 실패(네트워크는 `status:0`) | `error` (신설) — **플래그 세우지 말 것** |
| `{ok:true, …}` | 백업 발견 | `banner` (기존) |

**지금은 앞의 둘이 모두 `hidden`으로 사라진다. 그것이 이 판의 표적이다.**

### 2.1 문구 — **아래 문자열을 한 글자도 바꾸지 마라**

**`none` (404) — EN**
```
No backup found
We couldn't find a backup for this account. You can continue below to start fresh.
```
**`none` — KO**
```
백업을 찾지 못했어요
이 계정에 저장된 백업이 없어요. 아래에서 새로 시작할 수 있어요.
```
> 장애가 아니다. **`Try again` 버튼을 두지 마라.** 사용자는 온보딩을 그대로 이어갈 수 있어야 한다.

**`error` (실패) — EN**
```
Couldn't load your backup
Check your connection and try again. Your existing backup hasn't been restored.
Try again
```
**`error` — KO**
```
백업을 불러오지 못했어요
연결을 확인한 뒤 다시 시도해 주세요. 기존 백업은 아직 복원되지 않았어요.
다시 시도
```
> **`Your existing backup hasn't been restored` / `기존 백업은 아직 복원되지 않았어요`가 이 판의 핵심 문장이다.** 빼지 마라.
> `Try again`은 `pullBackup()`을 다시 호출한다. **UI가 사라지면 안 된다.**

### 2.2 `Start fresh` — 확인 단계를 넣어라

현재 `handleStartFresh()`는 `setView('hidden')` 한 줄이다. **확인창을 앞에 둔다.**

**EN**
```
Start fresh on this device?
Your existing Google backup will be replaced with this device's data. This can't be undone.
Replace backup
Cancel
```
**KO**
```
이 기기에서 새로 시작할까요?
Google 계정에 저장된 기존 백업이 이 기기의 데이터로 대체됩니다. 되돌릴 수 없어요.
백업 대체
취소
```
> **「Google 계정에 저장된」/「Google backup」을 빼지 마라**(조언자 지적) — 무엇이 대체되는지 대상이 분명해야 한다.

- **`Replace backup` / `백업 대체`를 누른 경우에만** `markReplaceAck()` → `setView('hidden')`
- **`Cancel` / `취소`는 배너로 되돌아간다.** 플래그를 세우지 않는다

### 2.3 Settings — 자동 백업 일시중지 표시 (신설)

승인이 없어 자동 백업이 멈춘 동안, Settings의 기존 문구
**`Signing in with Google starts automatic backup to Attune's server.`**가 **사실과 달라진다.**
백업 섹션에 **한 줄**을 추가한다. **`hasReplaceAck(현재 sub)`가 false이고 로그인 상태일 때만 표시.**

**EN**
```
Automatic backup is paused. Back up now to resume.
```
**KO**
```
자동 백업이 일시 중지됐어요. 지금 백업하면 다시 시작돼요.
```

### 2.4 언어 선택 기준

**이 화면의 문구는 `navigator.language.startsWith('ko')`를 쓴다.**
`/onboarding`은 모델 출력이 없는 정적 화면이고, 저장소의 기존 UI 분기와 같은 신호다.
**`isKo(질문)` 방식은 여기 해당 없다** — 그건 Ask 대화 채널 전용이다(BRIEF-108 예정).

---

## §3 변경 파일 — **정확히 이 4개. 그 밖의 파일을 건드리면 반려**

```
src/lib/sync.ts                        LS_REPLACE_ACK · markReplaceAck(sub) · hasReplaceAck(sub)
                                       + pushBackup(opts) 관문화 + PushResult.blocked
src/components/RestoreFromBackup.tsx   none/error 뷰 · Start fresh 확인창 · 승인 기록 3곳
src/app/(tabs)/settings/page.tsx       pushBackup({explicitReplace:true}) + 일시중지 문구
```

**⚠ `src/components/AutoBackup.tsx`와 `src/app/(tabs)/person/[id]/page.tsx`는 건드리지 않는다.**
관문이 `sync.ts`에 있으므로 **두 파일 모두 자동으로 보호된다.** 이것이 관문 방식을 택한 이유다.
테스트 파일은 §4에서 신설·수정하는 것만 추가로 허용한다.

---

## §4 완료 기준 — 전부 충족해야 완료다

1. `npx tsc --noEmit` **exit 0**
2. `npx vitest run` **exit 0** — 기존 **946**(942 passed + 4 expected fail)에서 **줄어들면 안 된다**
3. `npm run build` **exit 0**
4. **lint 39(24 errors / 15 warnings) 불변** — `git status --porcelain`이 빈 상태에서 측정할 것
5. **`grep -R "pushBackup(" src/` 전건 검토 결과를 보고서에 적을 것.**
   완료 기준은 **「`AutoBackup`이 막혔다」가 아니라 「승인 없는 모든 PUT 경로가 막혔다」**이다
6. **신규 테스트 최소 9건**
   - **계정 귀속**: 계정 A로 승인 → 계정 B 세션 → **`pushBackup()`이 PUT을 보내지 않는다**
   - **우회 방지**: 승인 없음 → **`person/[id]`처럼 `pushBackup()`을 직접 호출** → **`fetch('/api/sync', PUT)` 0회**
   - `pullBackup` → `null` → `none` 뷰 + **그 `sub`로 승인 기록됨**
   - `pullBackup` → `{ok:false}` → `error` 뷰 + **승인 기록 안 됨** + 이후 자동 PUT 0회
   - `error` 뷰의 `Try again`이 `pullBackup`을 다시 부르고 **UI가 사라지지 않는다**
   - `Start fresh` → 확인창 → **`Cancel`이면 배너 복귀 + 승인 없음 + PUT 0회**
   - `Start fresh` → **`Replace backup`이면 그 `sub`로 승인 기록**
   - 복원 성공: **`applySnapshot` 성공 뒤에** 승인이 기록된다(순서 검증)
   - **Settings 수동 백업**: 승인 없음 → `explicitReplace` 경로로 **PUT 성공** → 그 `sub`로 승인 기록 → 이후 자동 백업 재개
6. **회귀 2종 무변동** — `node scripts/verify/trait-regression.mjs` **12/32·오탐 0 `[PASS]`**, `node scripts/verify/lang-regression.mjs` **12행 `[PASS]`**
7. `samples/voice-baseline/*run*.json` **8파일 diff 0**

---

## §5 하지 말 것

- **`attune-server`·`schema.sql`을 건드리지 마라.** 서버 방어는 별건이다
- **`/api/sync`의 `DELETE`를 어떤 이유로도 호출·추가하지 마라**
- `SNAPSHOT_KEYS`를 **바꾸지 마라** — 백업 형식이 깨진다
- `pushBackup`·`pullBackup`·`applySnapshot`·`collectSnapshot`의 **시그니처를 바꾸지 마라**
- `PUSH_INTERVAL`·`SESSION_CHECK_DELAY` **값을 바꾸지 마라**
- **`explicitReplace` 옵션을 Settings 수동 백업 외 어디에서도 쓰지 마라**
- **`AutoBackup.tsx`·`person/[id]/page.tsx`를 수정하지 마라** — 관문이 대신 막는다
- `res.blocked`를 이유로 **`AutoBackup`의 인터벌을 중지하지 마라**(401만 중지)
- **문구를 「더 낫게」 고치지 마라.** §2의 문자열은 확정본이다
- **`main` 직접 push 금지 / force push 금지 / rebase 금지 / merge commit 생성 금지**
- 저장소 루트 `CLAUDE.md`(11바이트 `@AGENTS.md` 포인터)를 **덮어쓰지 마라**

---

## §6 ⚠ 이 판이 **해결하지 않는 것** — 보고서에 그대로 적을 것

BRIEF-107은 **「복원 상태를 확인하지 않은 기기가 서버 백업을 무조건 덮어쓰는 문제」**를 막는다.

**막지 못하는 것**: 서버는 여전히 **last-write-wins**다. **승인된 두 기기**가 서로 다른 오래된 snapshot을 갖고 있으면
**나중 PUT이 앞선 PUT을 덮어쓴다.** 서버측 revision·ETag·compare-and-swap은 **`attune-server` 별건 과제**로 남는다.

> **보고서에 「백업 동기화 안전성 전체 해결」이라고 쓰지 마라.**
> **「미승인 초기 덮어쓰기를 막았다」까지가 이 판의 성과다.**

---

## §7 보고 양식

- 브랜치명 + 커밋 **전체 SHA**(보관 커밋 + 구현 커밋)
- **변경 파일 목록** — §3 허용 목록과 정확히 일치함을 보일 것
- `tsc_exit` / `vitest_exit` / `build_exit` 세 값 + **vitest 수치**
- **lint 수치**(청정 상태 측정임을 명시)
- **신규 테스트 7건의 이름과 결과**
- **회귀 2종 `[PASS]` 줄**
- `samples/*run*.json` 8파일 무변동 확인 출력
- **본부 사양과 다르게 구현한 것이 있으면 그 사실과 이유** — 없으면 「없음」
