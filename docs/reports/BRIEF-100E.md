# BRIEF-100E v3 — `/api/briefing` 실패 단계 구조화 로그

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `docs/briefs/BRIEF-100E.md` | §0.5 — 브리프 원문 바이트 그대로 보관 (단독 커밋) |
| `src/app/api/briefing/route.ts` | §1 — rid 생성, `callStage` 상태 변수, `classifyBriefingError()`, `logBriefingFailure()`, 5개 502 반환 지점 전부에 로그 연결 |
| `src/app/api/briefing/route.test.ts` | 신규 19건(§2.1 5 + §2.2 7 + §2.3 4 + §2.4 3) |
| `docs/reports/BRIEF-100E.md` | 본 보고서 |

허용된 4개 경로 외 무접촉 확인: `git status --porcelain` 결과 위 4개 경로(및 그 외 관련 없는 기존 미추적 파일들)만 존재 — `src/lib/llm.ts`·`src/lib/briefing.ts`·`/api/ask` 등은 전부 무변경.

## 2. 구현 요지

- **rid**: 요청 진입 시 `crypto.randomUUID()`를 잘라내지 않고 그대로 사용(`[ask]`의 8자 절단 rid와 다름 — 로그 상관관계용 내부 ID일 뿐 사용자에게 노출되지 않음).
- **callStage**: 바깥쪽 `catch`가 "1차 호출 실패"와 "banned-phrase 재시도 호출 실패"를 구분하지 못하는 문제를, 재시도 직전에 `'banned_retry'`로 바뀌는 `let callStage` 변수 하나로 해결. 제어 흐름·응답값·타이밍은 전혀 바꾸지 않았다.
- **classifyBriefingError()**: `err instanceof Error ? err.message : String(err)`(Error 객체에 `String()`을 그냥 씌우면 `"Error: "`가 붙어 앵커 정규식이 깨지므로 이 형태 고정)를 시작-고정 정규식 3종으로 분류 → `upstream_http`(3자리 상태코드 추출)/`timeout`/`empty_response`, 나머지는 `llm_call_failed`.
- **logBriefingFailure()**: `console.error`로 고정 포맷 한 줄만 출력 — `[briefing] rid=<uuid> stage=<stage> action=<action> status=502 category=<category> upstreamStatus=<3자리|na>`. 원본 에러 메시지·모델 응답·이름·생년월일 등 PII는 절대 로그에 넣지 않는다(응답 바디의 `detail` 필드는 기존 그대로 유지, 로그와는 별개).
- 5개 논리적 502 지점: ①1차 파싱 실패 ②banned 재시도 파싱 실패 ③재시도 후에도 banned 지속 ④1차 호출 자체 실패(catch, callStage='initial') ⑤banned 재시도 호출 자체 실패(catch, callStage='banned_retry') — ④⑤는 같은 catch 블록이라 `callStage`로만 구분됨.

## 3. 테스트

`src/app/api/briefing/route.test.ts`에 지시서 §2를 그대로 구현한 신규 19건 추가(기존 5건 무변경, 전체 24건 통과):

- **§2.1 — 5개 지점 전부(2건은 [REQUIRED] callStage 증명용)**: 1차 파싱 실패, banned 재시도 파싱 실패, 재시도 후 banned 지속, **1차 호출 자체 실패(Gemini API error 503)**, **banned 재시도 호출 자체 실패(Gemini API error 503, mockGenerateJson 정확히 2회 호출 확인)** — 각각 stage/action/category가 정확히 매칭되는지 확인.
- **§2.2 — 카테고리 분류 7건**: HTTP 400/429/503 → upstream_http(각 상태코드 정확 추출), timeout 리터럴, `Gemini returned no text(...)` → empty_response, 미분류 메시지 → llm_call_failed, 그리고 **오분류 방지 가드**(패턴이 메시지 중간에 나타나는 경우 upstream_http/empty_response로 잘못 분류되지 않고 llm_call_failed로 떨어지는지).
- **§2.3 — 로그 형태 불변식 4건**: 502마다 정확히 1줄(0줄도 2줄도 아님), `console.error` 인자가 문자열 하나뿐(Error 객체·추가 객체 없음), rid가 전체 UUID 형식, 서로 다른 요청은 서로 다른 rid.
- **§2.4 — 유출 음성 대조군 + 회귀 3건**: 요청 body에 캐너리 문자열(`PII-NAME-CANARY-1234`/`PII-SITUATION-CANARY-5678`)과 모델 응답에 캐너리(`CANARY-LEAK-XXXX`)를 심어도 로그 어디에도 나타나지 않음(파싱 실패 시 에러 메시지에 모델 원문이 포함되는 경로 특별 확인), banned-after-retry 시나리오 응답/상태/호출횟수 무회귀, 정상 200 응답 시 로그 0줄.

전체 무회귀. **전체 610개 통과**(기존 591 + 신규 19).

## 4. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 통과 (테스트 파일 타입 에러 2건 발견·수정 후 클린)
- [x] `npx vitest run` 전체 통과 — **610개**
- [x] `npm run build` 성공
- [x] `git status --porcelain` — 허용된 4개 경로만 변경/신규
- [x] main push 완료 — 해시는 §6
- [x] 렌더 불필요(UI 무변경) — 스크린샷 없음

## 5. 6개 category 실제 로그 예시

**아래는 테스트 실행 중 console.error 스파이로 캡처한 문자열 그대로다 — 실제 Production 관측값이 아니다.** rid는 매 요청마다 랜덤 UUID라 매번 다르게 찍힌다(가공 없이 그대로 옮김).

```
upstream_http: [briefing] rid=7d48f4c1-018a-4d38-b98f-ec2477583a92 stage=call action=initial status=502 category=upstream_http upstreamStatus=503
timeout: [briefing] rid=0c2c6183-7a1c-4920-bc95-a2b7f5b1f140 stage=call action=initial status=502 category=timeout upstreamStatus=na
empty_response: [briefing] rid=9735eec7-579f-4b9c-82ce-80fbf6b2db59 stage=call action=initial status=502 category=empty_response upstreamStatus=na
llm_call_failed: [briefing] rid=edd1d680-2453-4181-b226-fccbdd7e4803 stage=call action=initial status=502 category=llm_call_failed upstreamStatus=na
parse_failed: [briefing] rid=babd363d-d394-409a-86fe-834581c53a15 stage=parse action=initial status=502 category=parse_failed upstreamStatus=na
banned_after_retry: [briefing] rid=b63000d2-48bb-44a2-8d64-7a9043c9fdf4 stage=banned action=after_retry status=502 category=banned_after_retry upstreamStatus=na
```

## 6. 정직 보고

- `npx tsc --noEmit`이 테스트 파일 헬퍼(`briefingLogLines`)에서 암묵적 `any` 타입 에러 2건을 잡아냈다 — `spy.mock.calls`의 콜백 매개변수에 명시적 타입(`unknown[]`, `unknown`)을 붙여 해결했다. 프로덕션 코드(`route.ts`)는 무관.
- §5의 6개 로그 예시는 이 보고서 작성을 위해 임시로 만든 캡처 스크립트(`src/app/api/briefing/_capture.test.ts`, 커밋 전 삭제됨)로 뽑았다 — `route.test.ts`에 커밋된 19개 테스트와 동일한 모킹 방식을 그대로 재사용했을 뿐, 프로덕션 코드나 커밋된 테스트 파일에는 아무 흔적도 남지 않는다.
- 이 판은 502의 "원인"을 고치는 게 아니라 "진단 가능하게" 만드는 것만 목표로 한다 — BRIEF-100D의 파라미터 호환 조치와 마찬가지로, 실제 502 원인 확인은 배포 후 로그 관측을 기다려야 한다.

## 7. 커밋 해시

- 저장소: https://github.com/Farerworks/attune
- §0.5 브리프 원문 보관: `123b3f1`
- 코드 커밋: `79d4220`

## 8. 정정 기록 (BRIEF-100E-FIX)

- 최초 보관 커밋 `123b3f1`의 `docs/briefs/BRIEF-100E.md` 말미에 정본에 없는 6바이트(`ㅌ₩`, §6 마지막 줄 뒤)가 붙어 있었다.
- 판정: 요구 문장이 아니고 §1의 구현·테스트 어디에도 영향을 주지 않았다 — byte-exact 보관 요구 위반만 존재했다.
- 정정 후 `docs/briefs/BRIEF-100E.md`의 sha256은 `4e636b719da396463eaa914a211bd600c06aaa4e626008f2c256d2574d848c8e`, 크기는 16394바이트로 목표값과 정확히 일치한다.
