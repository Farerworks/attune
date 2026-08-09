# BRIEF-100B-FIX6 (v1.1 — 검수 대기, 발사 금지) — Ask 응답 파싱 실패(502) 결정적 복구

> **v1은 조언자 필수 수정 4건 + 보강 2문장을 반영한 재제출본이다. 검수 통과 전에는 farr02에게 보내지 않는다.**
> v1.1 추가 변경(조언자 3건): D4 수리 성공에 `shape=object_repaired` 신설(§1·§2.5·§5 성공 기준 동일 반영) / §2.4 이스케이프를 「소스=백슬래시 2개+n, 런타임=백슬래시 1개+n」으로 정밀화 / §3에 CR·TAB 복구(⑭c)·호출 횟수 단언(⑭d·⑭e)·로그 계약(⑭f) 추가.
> v0.9 → v1 변경: §0.2 복구 범위 3분법 명시 / §1 S5·S6·S9를 `object-like invalid` 한 상태로 통합(판별 중복 해소) / §2.3 호출 예산 의미 명확화 + 기존 검사 대응표 신설 / §2.4 소스 `\\n` 이스케이프 명시 + 조립 프롬프트 검사 테스트 / §5 Production 성공 기준 신설. 범위 확대 없음.

## 0. 맥락 (자기완결)

Attune(github.com/Farerworks/attune, 랩 PC `~/projects/attune`).

### 0.1 확정 사실 (Vercel 로그 + 코드 실측)

2026-08-09, Production(`e7fc088`)의 `/api/ask`에서 502가 반복 발생했다. 로그 서명은 5건 전부 동일하다:

```
[ask] rid=... stage=parse action=fail status=- timeout=n rawLen=35~99 err=SyntaxError
```

- 상류 Gemini 호출은 성공했다(call 실패·timeout·상류 status 없음).
- **모델이 돌려준 35~99자 원문이 `JSON.parse`에서 SyntaxError** — 1차와 재시도 모두 같은 지점에서 실패해 502가 됐다.
- `llm.ts`는 `responseMimeType: 'application/json'`을 두 shape 모두에 보내고 있고 maxTokens 4096이라 설정 절단이 아니다.
- 실패한 사용자 입력은 실사용 관측상 전부 「(지금 보낼) 문장/메시지 N개만 써줘」류였다 — 이 입력은 `detectAskMode`에서 **`strict_script`**(개수 명시)로 분류된다. 개수 없는 쌍둥이는 `completion`이다. 두 모드 모두 shape 2(`{"text": ...}`) 계약 턴이다.

### 0.2 가설 (확정 아님 — 원문은 프라이버시 설계상 로깅하지 않으므로)

35~99자 원문이 정확히 어떤 형태로 깨져 있는지는 미확정이다. 후보:
- (a) JSON 봉투 없는 순수 텍스트 (프롬프트의 "nothing before it, nothing after it"을 봉투까지 빼라는 뜻으로 오해)
- (b) 봉투는 있으나 `"text"` 문자열 안에 **리터럴 줄바꿈**(one per line 지시의 부작용 — JSON 문자열 안 리터럴 개행은 불법)
- (c) 닫힘 누락·중간 절단

이 판의 복구 범위는 다음 3분법이다: **(a) 일반 텍스트와 (b) 문자열 내부 리터럴 제어문자는 제한적으로 복구하고, (c) 닫힘 누락·중간 절단 및 그 밖의 object-like 오류는 안전하게 fail closed 한다.** "모든 형태를 복구"하는 판이 아니다 — (c)는 원문 없이 안전하게 복구할 수 없으므로 복구하지 않는 것이 설계다. 실제 어떤 형태가 나오는지는 §2.5의 로그로 이후 관측한다.

### 0.3 기준점·브랜치 (FIX5 v2와 동일한 작업 방식)

기준: `origin/main = e7fc088d3b94a18459e161c457486007c3eb5f6f`(테스트 868 = 864 passed + 4 expected fail). `git pull` 금지. 기준 확인 후 전용 브랜치 **`fix/100b-fix6`**를 이 커밋에서 생성, 커밋 3개(브리프 보관/코드+테스트/보고서) 전부 브랜치에만, push는 `git push -u origin fix/100b-fix6` 한 줄로만. **main checkout·merge·push·rebase·cherry-pick·PR 생성 전면 금지.** Preview 배포는 Production과 구분 보고, PASS 근거 사용 금지.

---

## 1. 상태공간표 — 모델 원문(raw)의 10상태와 처리

판별은 전부 결정적(추가 API 호출 0)이다. 판별 순서 = 표의 위에서 아래.

| D | 상태 | 결정적 판별 | 처리 | 로그 shape |
|---|---|---|---|---|
| D1 | 유효 JSON | 기존 `extractJson` 직접 성공(펜스·둘러싼 설명 없음) | 기존 그대로 | (로그 없음 — 정상) |
| D2 | 펜스로 감싼 JSON | 펜스 내부 파싱 성공 | 기존 그대로(`extractJson`이 이미 처리) | (정상) |
| D3 | JSON 앞뒤 설명 포함 | 중괄호 스팬 파싱 성공 | 기존 그대로(스팬 슬라이스가 이미 처리) | (정상) |
| D4 | 문자열 내부 실제 줄바꿈 | 1차 실패 → **§2.1 수리 1회** 후 성공 | 수리된 값으로 기존 파이프라인 계속 | `shape=object_repaired repair=ctrl_fixed` |
| D5 | **object-like invalid** (통합 상태) | **수리 후에도 실패 + JSON object 흔적(`{`) 존재** | **fallback 금지, fail closed** — 기존 재시도·502 경로 그대로 | `shape=object_invalid` |
| D6 | 완전한 일반 텍스트 | (펜스 제거 후) `{` 없음 | askMode ∈ {`strict_script`,`completion`} 이면 **§2.3 fallback**, 그 외 모드는 fail closed | `shape=plain` |
| D7 | 코드펜스만 있는 출력 | 펜스 있음 + 내부에 `{` 없음 | 펜스 내부 텍스트를 D6과 동일 규칙으로 | `shape=fence_plain` |
| D8 | 금지어·계약 위반 텍스트 | D6/D7 fallback 후보가 §2.3 기존 검사표에서 검출 | **fallback 폐기** → fail closed(502) | `fallback=rejected` |

**D5 통합의 근거(명시)**: 개념상으로는 「닫는 따옴표·중괄호 누락」·「중간에서 잘린 JSON」·「JSON처럼 보이는 불법 텍스트」가 서로 다른 상태지만, **원문을 저장하지 않는 현재 설계에서 이 셋을 안전하게 구분할 수 없고 처분도 전부 동일(fail closed)하므로 하나의 상태 `object-like invalid`로 통합한다.** (v0.9의 S5/S9 판별이 겹쳐 S9가 도달 불가능했던 결함의 수정이기도 하다.) object-like 원문을 텍스트로 오인해 사용자에게 내보내는 사고(깨진 JSON 조각 노출)가 fallback 실패보다 훨씬 나쁘다 — **애매하면 fail closed.**

조언자 10상태와의 대응: ①valid→D1 ②fenced→D2 ③앞뒤 설명→D3 ④내부 줄바꿈→D4 ⑤닫힘 누락·⑥중간 절단·⑨JSON처럼 보이는 텍스트→**D5 통합** ⑦일반 텍스트→D6 ⑧펜스만→D7 ⑩금지어·안전 위반→D8.

## 2. 구현 사양 (`src/app/api/ask/route.ts` 한 파일)

### 2.1 수리 함수 — 딱 1회, 결정적

```
repairControlCharsInStrings(raw: string): string
```
- **정규식 금지.** 문자 단위 스캔으로 `inString`(따옴표 안인지)과 `escaped`(직전이 `\`인지) 상태를 추적한다.
- 문자열 **안**의 리터럴 LF/CR/TAB만 `\n`/`\r`/`\t` 텍스트로 치환한다. 문자열 밖은 한 글자도 바꾸지 않는다.
- `\"`(escaped quote)와 `\\`(backslash)를 문자열 경계로 오인하지 않아야 한다(테스트 ⑥).
- 호출은 파싱 실패 시 **딱 1회**. 수리 후에도 실패하면 더 시도하지 않는다.

### 2.2 `tryParse` 확장

순서: ① 기존 `extractJson` → ② 실패 시 `repairControlCharsInStrings` 적용 후 `extractJson` 1회 → ③ 그래도 실패면 실패 반환 + 특징 분류(shape: `object_invalid`/`plain`/`fence_plain` · firstChar · brace · fence). 함수 밖 호출부의 **호출 예산(1차 + 공유 추가 1회)은 무변경** — 수리는 호출이 아니라 문자열 처리다(예산 의미의 정본은 §2.3 말미).

### 2.3 plain-text fallback — 좁게, 특혜 없이

- **발동 조건(전부 충족)**: ②까지 실패 AND shape ∈ {D6, D7} AND `askMode ∈ {strict_script, completion}`. 그 외(다른 모드·D5)는 절대 발동하지 않는다.
- 동작: 펜스 제거·trim한 원문 텍스트 T를 `{ text: T }`로 감싸 `normalizeAnswer`부터 기존 파이프라인에 태운다.
- **특혜 금지**: fallback 후보는 **아래 「기존 검사 대응표」의 검사 전부를 통과했을 때만 채택**한다. 하나라도 위반이면 — soft 처분·교정 호출 없이 — **fallback을 폐기하고 원래의 parse 실패 경로로 돌아간다.** 이 지점이 기존 파이프라인과 다른 유일한 처분 차이이며, 이유는 fallback 텍스트가 이미 「모델이 계약을 어긴 산출물」이기 때문이다.
- object-like 원문을 사용자에게 그대로 반환하는 것 금지(§1 D5 근거).

**기존 검사 대응표 — "기존 검사"는 아래 실재 함수·조건이 전부다. 존재하지 않는 검사를 가정하지 않는다.**

| 검사 | 실제 코드 | fallback 채택 조건 |
|---|---|---|
| 답 형태(스키마) | `normalizeAnswer(mode, value)` | `null`이 아닐 것 |
| 금지어 | `findBanned(JSON.stringify(answer))` | 검출 0건 |
| strict_script 계약 | `validateAskAnswer` → `strict_script_parts` · `script_contract`(detail: `count`/`format`/`unit`/`followup`) | 위반 0건 |
| completion 계약 | `validateAskAnswer` → `completion_parts` · `completion_contract`(detail: `format`/`followup`) | 위반 0건 |
| 재언급 금지 | `validateAskAnswer` → `reintroduction` | 위반 0건 |
| 숨은 진심 프레이밍 | `validateAskAnswer` → `hidden_truth_framing` | 위반 0건 |
| 라벨 규칙(parts 형태일 때만) | `validateAskAnswer` → `label_set` · `label_order` | fallback은 text 형태이므로 통상 해당 없음 — 발생 시 위반으로 처리 |

**호출 예산 의미(명확화)**: 첫 번째 호출에서 parse·repair·fallback이 모두 실패하면 **신규 호출을 추가하지 않고 기존 공유 재시도 1회로 진행**한다. 두 번째 호출에서도 parse·repair·fallback이 모두 실패하면 **기존 502로 종료**한다. **기존 호출 예산(1차 + 공유 추가 1회)을 늘리지도 줄이지도 않는다** — 수리와 fallback은 각 호출의 응답 문자열 처리일 뿐이다.

### 2.4 프롬프트 보조책 — 두 블록에 한 문장씩

`STRICT_SCRIPT_BLOCK`과 `COMPLETION_BLOCK` **끝에** 아래 문장을 추가한다(두 블록 외 무변경).

**이스케이프 정확 규정**:
- **TypeScript 소스 파일에 타이핑할 것**: 백슬래시 **2개** + `n` (소스 텍스트상 3문자, `\\n`). 백틱/따옴표 문자열 안에서 `\\`가 백슬래시 1개로 해석되기 때문이다.
- **조립된 런타임 프롬프트에 실제로 존재해야 하는 것**: 백슬래시 **1개** + `n` (2문자). **실제 개행 문자가 아니다.**

소스에 넣을 문장(그대로 타이핑):
```
Output format reminder: your entire reply must still be exactly one JSON object {"text": "..."} — every rule above describes the VALUE of "text", not the reply envelope. Newlines inside "text" must be written as \\n, never as a raw line break.
```

**전용 테스트 필수**: 조립된 시스템 프롬프트(또는 두 블록 상수의 런타임 값)가 해당 문장 안에 (a) **백슬래시 1개+`n`의 2문자 시퀀스**를 포함하고 (b) 그 자리에 **raw line break가 없음**을 단언한다.

기존 테스트 중 이 두 블록의 원문을 단언하는 것이 있으면 **이 추가 문장만큼만** 기대값을 갱신한다(다른 블록·다른 문구 무변경).

### 2.5 로그 — 무PII 유지

parse 실패·수리 성공·fallback 발동/폐기 시 기존 `[ask]` 라인에 필드 추가:
`shape=<object_repaired|object_invalid|plain|fence_plain> firstChar=<brace|quote|fence|hangul|latin|space|other> brace=<y|n> fence=<y|n> repair=<none|ctrl_fixed|failed> fallback=<none|used|rejected>`
(수리 성공은 `shape=object_repaired repair=ctrl_fixed`로 기록한다 — 수리 성공 로그에도 shape가 반드시 있다.)
**원문 내용·대화 내용·개인정보는 절대 기록하지 않는다**(기존 원칙 유지). rawLen은 기존대로.

## 3. 테스트 계약 (전부 신규 추가 — 기존 스위트에 더한다)

| # | 케이스 | 기대 |
|---|---|---|
| ① | 정상 JSON | 무변경 통과 (S1) |
| ② | 펜스 JSON | 정상 파싱 (S2) |
| ③ | 앞뒤 설명 포함 JSON | 정상 파싱 (S3) |
| ④ | `{"text":"a<실제LF>b"}` | 수리 후 `a\nb`로 파싱 (S4) |
| ⑤ | 문자열 **밖** 개행(pretty-printed JSON) | 수리기가 훼손하지 않음 |
| ⑥ | `\"`·`\\` 포함 문자열 + 내부 실제 개행 | 경계 오인 없이 정확 수리 |
| ⑦ | 잘린 JSON(`{"text":"...` 끝) | 수리 거부 → 실패 반환, `shape=object_invalid` (D5) |
| ⑧ | object-like 텍스트(`{` 있으나 불법) | fallback 발동 안 함, `shape=object_invalid` (D5) |
| ⑨ | 명백한 일반 텍스트 2줄, askMode=strict_script(요청 2개) | fallback 채택 → 정상 응답 (D6) |
| ⑩ | 같은 텍스트, askMode=completion | fallback 채택 (D6) |
| ⑪ | 일반 텍스트인데 문안 수 불일치(요청 2, 텍스트 3줄) | fallback 폐기 → 실패 (특혜 금지) |
| ⑫ | 금지어 포함 일반 텍스트 | fallback 폐기 → 실패 (D8) |
| ⑬ | askMode=null(일반 턴)의 일반 텍스트 | fallback 발동 안 함 → 기존 실패 경로 |
| ⑭ | 펜스만 있고 내부 일반 텍스트 | D7 → D6 규칙 적용 |
| ⑭b | 프롬프트 이스케이프(§2.4) | 두 블록의 런타임 값에 백슬래시 1개+`n` 2문자 시퀀스 존재, 그 자리에 raw line break 없음 |
| ⑭c | CR·TAB 복구 | 문자열 내부 실제 CR(`\r`)·TAB(`\t`)도 ④와 동일하게 수리 (D4) |
| ⑭d | 호출 횟수 — fallback 성공 | 1차 호출이 D6 텍스트 → fallback 채택 시 **API 호출 총 1회**(mock 호출 수 단언) |
| ⑭e | 호출 횟수 — fallback 폐기 후 재시도 | 1차 fallback 폐기 → 공유 재시도 1회 → 성공 시 **총 2회**, 2차도 전부 실패 시 **총 2회 + 502** |
| ⑭f | 로그 계약 | 실패·수리·fallback 로그에 §2.5 필수 필드가 전부 있고, **원문 내용(raw 문자열)이 로그에 포함되지 않음**을 단언 |
| ⑮ | **분류 무변경**: TESTSET v1.2 115건의 `detectAskMode` 결과가 FIX5 시점과 동일 | 전건 동일 |
| ⑯ | 전체 스위트 | 기존 868(864+4) 전부 유지 + 신규 테스트 수를 숫자로 보고 |

## 4. 금지사항

- **분류 로직 무접촉**: `COMPLETION_PATTERNS`·`COMPLETION_EXCLUSIONS`·`STRICT_SCRIPT_PATTERNS`·`VERDICT_PROBE_PATTERNS`·`detectAskMode`·`detectCompletionRequest`·`splitCompletionParts`·우선순위 — 전부 한 글자도 바꾸지 않는다. FIX5의 판정 결과(112건 match 108/FP 0/FN 4)가 그대로여야 한다.
- **추가 Gemini API 호출 신설 금지.** 호출 예산(1차+공유 1회) 무변경. 수리·fallback은 문자열 처리다.
- 허용 경로 4개뿐: `docs/briefs/BRIEF-100B-FIX6.md` · `src/app/api/ask/route.ts` · `src/app/api/ask/route.test.ts` · `docs/reports/BRIEF-100B-FIX6.md`. `llm.ts` 포함 그 외 전부 무접촉.
- 502 응답의 status·body 형식 무변경(원인이 해소되면 발생 빈도만 줄어든다).
- **원문·개인정보 로깅 금지**(§2.5의 열거 필드만).
- `main` 접촉 금지(§0.3). TESTSET v1.2 기대값 무변경.
- 애매한 상태는 전부 fail closed — "복구를 넓히는 개선"을 임의로 하지 않는다.

## 5. 완료 기준

- [ ] `npx tsc --noEmit` / `npx vitest run` 전체(수치 보고) / `npm run build`
- [ ] §3 ①~⑯ 전부 구현·통과, 신규 테스트 수 보고
- [ ] `docs/reports/BRIEF-100B-FIX6.md` — 보관·코드 커밋 해시 / diff 요약 / §3 결과표 / §2.5 로그 필드 예시 1줄(합성 데이터로)
- [ ] 브랜치 격리 증빙 7종(FIX5 v2 §3과 동일 양식, 기준 해시만 `e7fc088d…`로)
- [ ] farr02는 여기서 멈춘다 — main merge·Production 배포·RECHECK 재개 선언은 본부·YS 몫

**Production 성공 기준(merge·배포 후 본부·YS가 판정)**: 같은 rid에서 **`shape=object_repaired`+`repair=ctrl_fixed` 또는 `shape=plain/fence_plain`+`fallback=used`가 HTTP 200과 함께 확인**되어야 해결 PASS다. **`shape=object_invalid`로 502가 계속되면 그것은 안전한 fail-closed일 뿐 해결 PASS가 아니며, RECHECK를 재개하지 않는다** — 그 경우 로그의 shape·firstChar 분포를 근거로 다음 판을 설계한다.

## 6. 이 판이 하지 않는 것

말투·F4 원칙·RECHECK 판정 기준·FIX5 분류 성적·유료 전환 결정은 범위 밖. 이번 502들은 FIX5의 FP/FN에 집계하지 않는다(별도 운영 오류 — 조언자 판정 채택).
