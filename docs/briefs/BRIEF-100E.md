# BRIEF-100E v3 — `/api/briefing` 실패 단계 구조화 로그 (무PII 관측성)

> v1→v2: 결재 2건 반영(rid = **전체 UUID**, `err=<name>` **미추가**) / §1.4 문자열 판정을 **시작점 고정 패턴**으로 명시 / §2에서 **발생 불가능한 조건(같은 요청 2줄 이상)을 실행 가능한 불변식으로 교체** / **`banned_retry` 호출 실패와 `initial` 호출 실패를 각각 직접 검증**하는 케이스 추가 / 테스트는 "총 N건" 고정 대신 **필수 검증 조합**으로 기술.
> v2→v3 (이 두 곳만): §1.4에 **분류 입력 문자열을 `err instanceof Error ? err.message : String(err)`로 명시**하고 `String(err)` 일괄 사용을 금지 / §0의 "같은 폼" 표현을 **경로 동일·입력 인물 데이터 상이**로 정정.

## 0. 맥락 (자기완결)
Attune(github.com/Farerworks/attune, 랩 PC `~/projects/attune`). 시작 전 `git pull` — 기준 = 현 origin/main **`aceafd4`**(테스트 591).

배경: 새 인물 리딩 생성에서 `POST /api/briefing` → **502**가 관측됐다. Vercel 상세 패널 실측(패널이 시각 옆에 `GMT+9`를 명시):
- 실패 — Request ID `hgjjl-1786107694835-…`, **2026-08-07 22:01:34.83 GMT+9**, 실행 **24.94s**, 외부 API **호출 1회**.
- 성공 — Request ID `cc8m8-1786107233244-…`, **2026-08-07 21:53:53.24 GMT+9**, 실행 **4.07s**, 외부 API **호출 1회**. 두 요청은 **같은 배포·같은 모델·같은 `/api/briefing` 경로이며, 입력 인물 데이터는 서로 달랐다.**

**원인은 확정되지 않았다.** 관측이 **약화시킨** 가설은 ①금칙어·헤드라인 재시도 소진(그 경로면 외부 호출이 2~3회여야 하는데 실측 1회) ②앱 자체 타임아웃(`LLM_TIMEOUT = 55_000`인데 24.94s 종료). **아직 가능한 대안 가설**(순위 없음)은 ⓐ상류 호출 실패(일시 오류 포함) ⓑ응답 파싱·스키마 실패 ⓒ텍스트 미생성(`Gemini returned no text`) — 셋 다 "외부 호출 1회·수십 초"와 모순되지 않아 **현재 로그로는 서로 구분되지 않는다.** 구분이 안 되는 이유는 실측으로 확인됐다: `/api/briefing`은 실패 단서를 **응답 본문 `detail`에만** 담고 서버 콘솔에는 아무것도 남기지 않는다(route.ts에 `console.*` **0곳**).

**이 판의 목적은 원인 수정이 아니라 다음 실패를 구분 가능하게 만드는 것이다.** 502의 status·body·제어 흐름은 한 글자도 바꾸지 않고, 각 502 반환 지점에 **PII 없는 한 줄 로그**만 추가한다. 이 판으로 기존 502가 고쳐지지 않으며, 재소개·strict_script 등 **100B 품질 문제와 무관**하다(해결로 간주 금지). **100B-FIX와 별도 범위로 유지한다.**

## 0.5 시작 전 1커밋 — 이 브리프 원문 보관
전달받은 이 파일을 바이트 그대로 `docs/briefs/BRIEF-100E.md`로 저장, 단독 커밋+push(`BRIEF-100E: 브리프 원문 보관`). 보관 커밋 해시를 완료 보고에 포함.

## 1. 변경 사양 (`src/app/api/briefing/route.ts` 한정 — 구현 코드는 재량)

### 1.1 rid
요청 1건당 식별자 1개를 **핸들러 진입 직후 1회** 생성한다. **`crypto.randomUUID()` 전체를 그대로 쓴다 — 절단 금지**(`[ask]`의 8자 절단 선례를 따르지 않는다. 로그 상관 식별자로서 충돌 여유 확보 목적. UUID는 PII가 아니다).

### 1.2 로그 한 줄 형식 (정본)
```
[briefing] rid=<uuid> stage=<stage> action=<action> status=502 category=<category> upstreamStatus=<number|na>
```
- 출력 함수는 **`console.error`**(`[ask]`의 `logAsk`와 동일 — Vercel 로그에 함께 뜨게).
- **`console.error`에는 위 문자열 1개만 넘긴다** — Error 객체·추가 객체 인자를 두 번째 인자로 붙이지 않는다.
- 필드 순서·이름·`=` 표기는 위 형식 고정. 값에 공백을 넣지 않는다. **필드를 늘리지 않는다**(에러 이름·rawLen·본문 길이 등 추가 금지).
- **`status=502` 고정** — 이 판은 502 반환 지점에만 로그를 단다.
- `upstreamStatus`는 **상류 HTTP 상태 숫자**이거나 문자열 `na`. 그 외 값 금지.

### 1.3 502 반환 지점 ↔ stage/action 매핑 (5개 전부 — 실측 위치는 §4.5)
| # | 502 반환 지점 | stage | action | category |
|---|---|---|---|---|
| 1 | 초기 LLM 호출 실패 | `call` | `initial` | §1.4 판정 |
| 2 | 초기 파싱 실패 (`Briefing parsing failed`) | `parse` | `initial` | `parse_failed` |
| 3 | 금칙어 재시도 호출 실패 | `call` | `banned_retry` | §1.4 판정 |
| 4 | 재시도 파싱 실패 (`… on retry`) | `parse` | `banned_retry` | `parse_failed` |
| 5 | 재시도 후 금칙어 잔존 | `banned` | `after_retry` | `banned_after_retry` |

**구현 주의(중요)**: 1과 3은 **같은 바깥 `catch` 한 곳**으로 떨어진다 — 현재 코드로는 그 catch가 "초기 호출"인지 "재시도 호출"인지 알 수 없다. 따라서 **현재 단계를 담는 변수 1개**를 try 바깥에 두고 재시도 호출 직전에 `banned_retry`로 바꿔, catch에서 그 값을 읽어 action을 정한다. 제어 흐름·반환값은 그대로다. **이 변수의 존재 이유가 곧 §2의 필수 검증 2건**(initial 분기·banned_retry 분기)이다.

**로그는 각 502 반환 직전에 1줄, 그리고 즉시 return** — 한 요청이 502로 끝날 때 `[briefing]` 줄은 **정확히 1줄**이다(5개 지점 모두 로그 후 즉시 반환하므로 2줄 이상이 나는 경로는 없다).

### 1.4 category 판정 (바깥 catch에서 잡은 에러 → category) — **이 순서대로, 시작점 고정 패턴으로**
**분류 입력 문자열(정본)**: `err instanceof Error ? err.message : String(err)`. **`String(err)` 일괄 사용 금지** — Error 객체에 `String()`을 쓰면 `Error: ` 접두사가 붙어 아래의 시작점 고정 정규식이 전부 어긋난다. 이 정규화 문자열은 **분류에만 쓰고 로그에는 출력하지 않는다**(§1.5). (route의 바깥 catch가 응답 `detail`을 만들 때 이미 같은 형태를 쓴다 — 실측.)

판정은 **에러 메시지의 시작점에 고정된 패턴**으로만 한다. 임의 에러 본문 **중간**에 같은 문구가 우연히 들어 있어도 오분류되지 않아야 한다.

1. `/^Gemini API error (\d{3}):/` 와 일치 → `upstream_http`, **캡처된 3자리 숫자만** `upstreamStatus`에 넣는다. **나머지 메시지 전체는 폐기**(로그에 쓰지 않는다).
2. `/^(LLM call|LLM retry) timed out after \d+ms$/` — **시작·끝 모두 고정한 전체 형식 일치** → `timeout`, `upstreamStatus=na`. (세 번째 라벨 `Headline length retry`는 자체 catch에서 삼켜져 이 catch에 도달하지 않으므로 허용 목록에서 제외한다 — §1.6.)
3. `/^Gemini returned no text/` → `empty_response`, `upstreamStatus=na`. **`finishReason` 원문은 허용 목록 검토 전이므로 로그에 넣지 않는다.**
4. 위 1~3에 해당하지 않는 에러 → `llm_call_failed`, `upstreamStatus=na`. **원본 메시지를 로그에 쓰지 않는다.**

**어떤 분기에서도 에러 메시지 원문 전체를 로그에 전달하지 않는다** — 로그로 나가는 것은 §1.2의 고정 필드값뿐이고, 1번의 3자리 숫자가 유일하게 에러에서 추출되는 값이다.

`parse_failed`·`banned_after_retry`는 에러 판정이 아니라 **반환 지점으로 결정**되며 `upstreamStatus=na`다.

**범위 밖 기록(정직 기록 — 결함 아님)**: OLLAMA provider의 `Ollama error <status>: …`는 1번 패턴 대상이 아니므로 4번(`llm_call_failed`)으로 떨어진다. 운영 경로는 Gemini이므로 의도된 범위 축소다. `GEMINI_API_KEY` 미설정 오류도 같은 이유로 `llm_call_failed`다.

### 1.5 로그 안전 규칙 (전 항목 필수)
- 로그에 넣지 않는 것: **이름·생년월일·출생시간·관계·상황 텍스트·프롬프트·모델 응답 본문·API 키·URL·헤더·IP·쿠키·에러 원문**.
- 특히 **파싱 실패 경로에서 에러 객체를 로그에 쓰지 말 것.** 실측으로 `parseBriefing`은 실패 시 메시지에 **모델 출력 앞 300자를 포함**해 던진다(§4.5). 이 경로는 **category만** 남긴다.
- 재시도 후 금칙어 경로에서도 **적발된 문구를 로그에 쓰지 않는다**(category만).
- **정상 200 경로에는 로그를 추가하지 않는다**(추가 줄 수 0).
- 429·400 반환 경로도 이 판 범위 밖 — 로그 추가 금지.

### 1.6 이번 판이 건드리지 않는 것 (범위 분리)
헤드라인 길이 재시도의 실패는 **502가 아니라 원본 결과를 통과시키는 경로**이므로 이번 502 관측 범위에서 **분리**한다 — 로그를 추가하지 않는다. (그 catch가 상류 실패를 조용히 삼킬 수 있다는 점은 **알려진 관측 사각지대**로만 기록하고, 필요하면 별도 판에서 다룬다.)

## 2. 테스트 (`src/app/api/briefing/route.test.ts` 확장)
기존 하네스 재사용(`vi.mock('@/lib/llm')` + `mockGenerateJson` + `makeRequest` + `freshIp` + `_resetStore`). 로그 검증은 **`vi.spyOn(console, 'error')`** 로 캡처하고, **`[briefing]`로 시작하는 호출만** 대상으로 센다. 타임아웃 케이스는 실제 55초를 기다리지 말고 **withTimeout이 던지는 것과 같은 형식의 에러로 모킹**한다(판정이 메시지 형식 기반이므로 충분하다).

**테스트 함수 개수는 재량이다 — 아래 조합을 모두 덮으면 된다. 실제 신규 테스트 수는 완료 보고에 제출한다.**

### 2.1 stage/action/category 조합 (§1.3의 5지점 전부)
| 시나리오(모킹) | 기대 로그 필드 |
|---|---|
| 1회차 호출이 파싱 불가 문자열 반환 | `stage=parse action=initial category=parse_failed upstreamStatus=na` |
| 1회차 = 금칙어 포함 유효 JSON → 2회차가 파싱 불가 문자열 | `stage=parse action=banned_retry category=parse_failed` |
| 1회차 = 금칙어 포함 유효 JSON → 2회차도 금칙어 포함 유효 JSON | `stage=banned action=after_retry category=banned_after_retry` |
| **1회차 호출이 `Gemini API error 503: …`로 reject** | `stage=call action=initial category=upstream_http upstreamStatus=503` |
| **1회차 = 금칙어 포함 유효 JSON → 2회차가 `Gemini API error 503: CANARY-LEAK-XXXX`로 reject** | `stage=call action=banned_retry category=upstream_http upstreamStatus=503` |

**굵게 표시한 두 줄이 §1.3 단계 변수의 존재 이유를 직접 검증하는 쌍이다 — 둘 다 필수.** 두 번째 줄은 추가로 **`mockGenerateJson` 호출 횟수가 정확히 2회**이고, **로그에 `CANARY-LEAK-XXXX`가 없어야** 하며, **응답 status·body가 기존과 동일**해야 한다.

### 2.2 category 판정 (§1.4)
- 상류 오류 **400·429·503 각각** → `category=upstream_http` + `upstreamStatus`에 해당 숫자, **숫자 외 문자열 없음**.
- 타임아웃(`LLM call timed out after 55000ms`) → `category=timeout upstreamStatus=na`.
- `Gemini returned no text (finishReason: MAX_TOKENS)` → `category=empty_response`, **로그에 `finishReason`·`MAX_TOKENS` 문자열 부재**.
- 위 어디에도 안 맞는 메시지 → `category=llm_call_failed`.
- **오분류 방지**: 에러 메시지 **중간**에 `Gemini API error 400:` / `Gemini returned no text` 문자열이 들어 있고 시작점은 다른 경우 → `llm_call_failed`로 떨어지고 `upstreamStatus=na`.

### 2.3 로그 형태 불변식 (v1의 "같은 요청 2줄 이상" 조건을 대체)
- **502 응답 1건당 `[briefing]` 로그가 정확히 1줄**(0줄도 2줄도 아님) — 2.1의 각 시나리오에서 확인.
- **`console.error`가 문자열 인자 1개로만 호출됨** — Error 객체나 추가 객체 인자가 붙지 않음.
- **rid가 전체 UUID 형식**(`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/`).
- **서로 다른 두 요청의 rid가 서로 다름.**

### 2.4 누출 음성 대조 · 무회귀
- **누출 음성 대조**: 상류 에러 본문·모델 출력에 표식 문자열(`CANARY-LEAK-XXXX`)을 넣고, 요청 body에는 테스트용 이름·생년월일을 넣은 뒤, **캡처된 모든 `[briefing]` 줄에 그 문자열들이 하나도 없음**을 단언.
- **무회귀**: 2.1의 각 시나리오에서 **응답 status와 body가 기존과 동일**하고 **`mockGenerateJson` 호출 횟수가 변하지 않음**.
- **정상 200 케이스에서 `[briefing]` 로그가 0줄.**
- 기존 헤드라인 길이 계약 테스트(093B) 전부 통과 유지.

## 3. 완료 기준
- [ ] `npx tsc --noEmit` / `npx vitest run` 전체(수치 보고) / `npm run build`
- [ ] **신규 테스트 수를 완료 보고에 숫자로 제출**(총계 고정값을 브리프가 정하지 않았으므로 실제 작성 수를 보고).
- [ ] `docs/reports/BRIEF-100E.md` 커밋+push — 담을 것: ①§0.5 보관 커밋 해시 ②코드 커밋 해시 ③테스트 수치(전체·신규) ④**6개 category가 실제로 찍힌 로그 줄 예시**(테스트에서 캡처한 문자열 그대로, rid 포함 가공 금지).
- [ ] ④는 **테스트에서 캡처한 값**임을 보고서에 명시 — 실제 Production 관측값이 아니다. 보고서 자신의 해시는 자기참조라 넣지 않는다.
- [ ] 완료 보고(채팅)에 해시 3종(보관/코드/보고서) 제출. 렌더 불필요(UI 무변경).

## 4. 금지사항
- **허용 경로 4개 한정**: `docs/briefs/BRIEF-100E.md` · `src/app/api/briefing/route.ts` · `src/app/api/briefing/route.test.ts` · `docs/reports/BRIEF-100E.md`. 그 외 전부 무접촉 — **`src/lib/llm.ts`·`src/lib/briefing.ts`·Ask 라우트·100B 파이프라인 로직·환경변수·package.json/lock 손대지 말 것.**
- **`llm.ts`를 고쳐서 에러 형식을 바꾸지 말 것** — 상태 숫자 추출은 **route 안에서** 한다.
- **502 응답의 status·body(`error`/`detail` 포함)·제어 흐름·호출 횟수를 바꾸지 말 것.** 이 판은 **로그 줄 추가만** 한다.
- **로그 형식에 필드를 추가하지 말 것**(`err=<name>`·rawLen 등 — §1.2 고정). rid를 절단하지 말 것.
- 로그에 §1.5 금지 항목을 넣지 말 것(특히 에러 원문 전체·모델 출력·`finishReason` 원문).
- 이 판은 **502의 수리가 아니다** — 원인 확정·해결로 간주 금지.

## 4.5 근거 (저장소 실측 — 커밋 `aceafd4` 기준, 외부 문서 주장 없음)
- `src/app/api/briefing/route.ts` — `maxDuration = 60`, `LLM_TIMEOUT = 55_000`, `withTimeout(p, ms, label)`이 `` `${label} timed out after ${ms}ms` `` 로 reject. `status: 502` 반환 **4곳**(초기 파싱 / 재시도 파싱 / 재시도 후 금칙어 / 바깥 catch `LLM call failed`) + 바깥 catch가 초기·재시도 **양쪽 호출**을 함께 받음 → 논리적 지점 5개. 파일 내 `console.*` **0곳**.
- `src/lib/llm.ts` — `` `Gemini API error ${res.status}: ${errText}` `` (2곳, `errText`=상류 응답 본문 원문) / `` `Gemini returned no text (finishReason: ${…})` `` / `GEMINI_API_KEY environment variable is not set`.
- `src/lib/briefing.ts` — `parseBriefing`은 JSON 파싱 실패 시 `` `LLM response is not valid JSON.\nFirst 300 chars: ${raw.slice(0, 300)}` `` 로 던짐 → **에러 메시지에 모델 출력이 들어 있음**(§1.5의 근거).
- `src/app/api/ask/route.ts` — `logAsk`는 `console.error`로 `[ask] rid=… stage=… action=… status=… timeout=…` 출력(rid는 UUID 8자 절단 — **이 판은 따르지 않는다**, §1.1).

## 5. 배포 후 (참고 — farr02 작업 아님)
merge·자동 배포 후 **이 판만으로는 아무것도 재현하지 않는다.** 다음 502가 자연 발생하거나 별도 승인으로 재현할 때, Vercel 로그에서 `[briefing]`을 검색해 한 줄을 확보하면 §1.3의 5개 지점 중 어디였는지와 category가 즉시 갈린다. **그 한 줄이 나오기 전까지 502 원인은 미확정으로 유지한다.**

## 6. 결재 반영 (v1 질의 2건 — 종결)
1. **rid = `crypto.randomUUID()` 전체**(절단 금지) — §1.1·§2.3에 반영.
2. **`err=<Error name>` 미추가** — 고정 형식 유지, category·upstreamStatus만 사용. 임의 error name이 로그에 유입될 경로를 만들지 않는다 — §1.2·§4에 반영.
