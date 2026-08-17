# BRIEF-111-FIX — 언어 지시문 열거 복원 + 재시도 결과 금지어 가드

> **`feat/111-briefing-lang` 브랜치에 이어서 커밋한다. 병합 전 수정이다.**
> 본체(BRIEF-111)는 전건 통과했다. 아래 2건만 보강한다.

## §1 왜 (본부 자인 2건)

**⒜ 지시문에서 필드 열거가 사라졌다.** 원본 LANGUAGE 절은 어떤 값이 대상인지 **열거**했다 — `(headline, every takeaway, every detail, click/clash/watch, playbook tips and whys, starters)`. `lang` 분기에서는 「ALL free-text values」만 남고 열거가 빠졌다. **이번 결함이 바로 「필드군에 따라 언어가 갈리는」 형태**였으므로(A3 실측: 본문 EN / starters KO), 열거는 유지하는 편이 안전하다. 브리프 §2가 「나머지 문장은 그대로 유지」라고 했으나 열거는 첫 문장이 아니라 **둘째 문장**에 있었다 — **본부 지시가 모호했다.**

**⒝ 재시도 결과에 금지어 가드가 안 걸린다.** `containsBannedPhrases`는 초기 응답과 금지어 재시도 결과에만 적용되고, **헤드라인 재시도·언어 재시도 결과에는 적용되지 않는다**. 헤드라인 쪽은 기존 결함이고, 언어 재시도가 그 구멍을 하나 더 넓혔다. 재시도 프롬프트는 「같은 JSON을 다시 써라」이므로 모델이 금지 표현(운명·우주 등)을 새로 넣을 수 있다. **브리프가 「재시도 결과는 검사하지 않고 채택」이라고만 쓰고 기존 가드 유지를 명시하지 않은 것이 원인 — 본부 잘못이다.**

## §2 할 일 ⒜ — 열거 복원 (`src/lib/briefing.ts`)

`lang` 분기 두 개의 첫 문장에 **원본과 같은 괄호 열거**를 넣는다:

- `ko`: `Write ALL free-text values (headline, every takeaway, every detail, click/clash/watch, playbook tips and whys, starters) in KOREAN (한국어). The user's situation is in Korean. Never mix languages in one sentence. JSON keys stay in English. Do not translate archetype names.`
- `en`: `Write ALL free-text values (headline, every takeaway, every detail, click/clash/watch, playbook tips and whys, starters) in ENGLISH. Never mix languages in one sentence. JSON keys stay in English. Do not translate archetype names.`

`lang` 미전달 분기는 **무변경**(byte-for-byte 동일 유지).

## §3 할 일 ⒝ — 재시도 결과 금지어 가드 (`src/app/api/briefing/route.ts`)

**헤드라인 재시도와 언어 재시도 둘 다**, 재시도 결과를 채택하기 **전에** `containsBannedPhrases`로 검사한다.

- 위반이 있으면 **재시도 결과를 버리고 재시도 이전 `briefing`을 유지**한다.
- **502를 내지 않는다** — 이전 briefing은 이미 금지어 검사를 통과한 것이므로 사용자에게는 정상 응답이다.
- 서버 로그만 남긴다. 기존 로그 함수 형태를 따라 새 함수 1개를 추가하되 **`status=502` 계열이 아님**을 주석에 명시:
  `[briefing] rid=<rid> stage=<headline|language> action=retry_banned_rejected`

즉 재시도는 **「더 나아지면 채택, 나빠지면 버림」**이 된다.

## §4 테스트 보강

`briefing.test.ts`:
1. `lang: 'ko'`·`'en'` 프롬프트에 **`playbook tips and whys`·`starters` 문자열이 포함**된다(열거 복원 가드)

`route.test.ts`:
2. 언어 재시도 결과에 **금지어가 들어 있으면** → 응답 briefing이 **재시도 이전 값**과 같다(재시도 결과 미채택) + 502 아님(200)
3. 헤드라인 재시도 결과에 금지어가 들어 있으면 → 동일하게 이전 값 유지 + 200
4. 재시도 결과가 정상(금지어 없음)이면 → 재시도 결과가 채택된다(기존 동작 회귀 가드)

## §5 금지 사항

1. `lang` 미전달 분기 문구 변경 금지 2. 재시도 횟수 증가 금지(각 1회 유지) 3. 언어·헤드라인 불일치를 502로 만들지 말 것 4. Ask 관련 파일 무접촉 5. `containsBannedPhrases` 자체 수정 금지 6. main 직접 push/force push/rebase/merge commit 금지

## §6 완료 기준

tsc 0 · lint 39(24E/15W) 이하 · vitest **1011 passed + 4 expected fail** 기준으로 passed 신규만큼 증가·expected fail 불변 · build 성공 · 변경은 `briefing.ts`·`briefing/route.ts` + 두 테스트 + `docs/briefs/BRIEF-111-FIX.md` 보관 · **병합 금지**

## §7 보고 양식

```
브랜치·커밋: / 변경 파일(diff --stat 원문):
tsc: / lint: / vitest: / build:
추가 테스트 목록:
재시도 결과를 버릴 때 이전 briefing이 유지되는지 어떻게 보장했는지(1~2줄):
막힌 점:
```
