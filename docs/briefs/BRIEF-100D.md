# BRIEF-100D v4 — 모델별 요청 파라미터 호환 (2.5=thinkingBudget+temperature / 3.x=thinkingLevel)

## 0. 맥락 (자기완결)
Attune(github.com/Farerworks/attune, 랩 PC `~/projects/attune`). 시작 전 `git pull`(기준 = 현 origin/main). 배경: 100C로 `GEMINI_MODEL=gemini-3.5-flash-lite` 전환 후 **Ask는 정상인데 새 인물 Briefing이 반복 502**(즉시 거절 수준의 응답 시간). **이번 100D에서 정합화할 직접 후보는 thinking 파라미터다** — Ask는 `thinkingBudget: 1024`, Briefing은 기본값 `thinkingBudget: 0`(=thinking 완전 끄기). (두 메서드는 `systemInstruction` 유무·`contents` 구성·`temperature` 출처 등 다른 차이도 있으므로 "유일한 차이"는 아니다.) 공식 문서상 **Gemini 3 계열은 thinking 완전 비활성을 지원하지 않고, 제어 파라미터가 `thinkingBudget`이 아니라 `thinkingLevel`**이다(`thinkingBudget`은 2.5 계열용). **주의: 이는 아직 검증되지 않은 가설이다 — 상류 상태 코드·응답 본문 미확인이며, `/api/briefing`은 parse·banned 단계에서도 502를 반환하므로 502만으로 호출 단계 실패를 단정할 수 없다.** 가설을 좁히는 코드 사실 하나: **두 메서드 모두 `thinkingConfig: { thinkingBudget }`을 보내는데 Ask(1024)는 성공하고 Briefing(0)만 실패했다** → 문제가 있다면 파라미터 이름이 아니라 **값 `0`**(=thinking 끄기)일 가능성이 높다. 이 판은 진단이 맞든 틀리든 **공식 규격 정합화**라는 독립 가치가 있어 그대로 진행한다. 대상: `src/lib/llm.ts`의 Gemini provider **한 파일**.

## 0.5 시작 전 1커밋 — 이 브리프 원문 보관
전달받은 이 파일을 바이트 그대로 `docs/briefs/BRIEF-100D.md`로 저장, 단독 커밋+push(`BRIEF-100D: 브리프 원문 보관`). 보관 커밋 해시를 완료 보고에 포함.

## 1. 변경 (llm.ts의 GeminiProvider 한정)
`generateJson`·`generateJsonChat` **양쪽 모두**, 요청 body의 `generationConfig`를 **모델 계열에 따라 분기**한다. 두 메서드의 시그니처·기본값·`systemInstruction`·`contents`는 **무변경**이고, `maxOutputTokens`·`responseMimeType`는 **양 경로 모두 현행 그대로 유지**한다.

**분기 규칙(정본)**
- 모델명이 **`gemini-2.` 로 시작** → **레거시 경로(현행 유지)**: `temperature`를 지금과 동일하게 전송 + `thinkingConfig: { thinkingBudget: <현재 값> }` 전송. `thinkingLevel`은 보내지 않는다. (0=thinking off, 1024=예산 지정이라는 기존 의미를 **그대로 보존** — 생략으로 대체하지 말 것. 생략은 dynamic thinking이라 의미가 달라진다.)
- **그 밖의 모델** → **신규 경로**: ① **`temperature` 미전송** ② **`thinkingBudget` 미전송** ③ `thinkingConfig: { thinkingLevel: 'minimal' }` 전송. 이 경로에서는 넘어온 `thinkingBudget`·`temperature` 값을 **사용하지 않는다**(값에 상관없이 항상 `'minimal'`).
- **이번 판의 운영·검증 대상 모델은 `gemini-3.5-flash-lite` 하나다.** 위 분기는 그 모델을 신규 경로로 보내기 위한 최소 규칙일 뿐이며, **미래 모델(4.x 등)의 호환성을 보장하지 않는다** — 새 모델을 도입할 때 그 시점의 공식 문서로 다시 판정한다.
- **미지원 모델 예외 throw를 추가하지 말 것** — 임의 모델명(예: 100C 테스트의 `test-model-x`)은 신규 경로로 처리되면 그만이고, 던지면 기존 테스트가 깨진다.
- 정본 문자열: **`minimal`** (소문자. 필드 경로는 `generationConfig.thinkingConfig.thinkingLevel`). 근거: 공식 문서에서 **3.5 Flash-Lite의 기본값이 `minimal`**로 명시돼 있고 비용·지연 최소화 목적에 부합한다. **주의(문서 판독 불일치 기록)**: `thinkingLevel`의 전체 지원값 목록은 참조한 문서 페이지마다 다르게 읽혔다(`minimal`+`low` / `minimal`·`low`·`medium`·`high` / `minimal`·`medium`·`high`). **세 판독 모두에서 공통으로 지원·기본값인 `minimal`만 이번 정본으로 채택**하고, 다른 값으로 바꾸려면 그때 문서를 재확인한다.
- OLLAMA provider는 무접촉(현행 `void thinkingBudget` 유지).

**temperature 제거의 성격(정직 기록 — 이 판의 수리 대상이 아님)**: 공식 문서는 3.x에 대해 `temperature`·`top_p`·`top_k`가 **"deprecated and ignored"**(현재는 **무시**되며, 향후 세대에서는 전송 시 HTTP 400)이고 **"Remove these parameters from all requests."**라고 안내한다. 즉 **공식 문서상 3.5 Flash-Lite에서는 `temperature`가 deprecated and ignored이므로 현재 502의 직접 원인일 가능성은 낮다.** 이 항목은 **미래 파손 예방(forward-compat)** 목적이다. **배포 후 Briefing이 복구되면 thinking 분기 가설을 지지하는 증거가 되지만, 상류 오류 원문과 대조군이 없으므로 단일 성공만으로 원인을 확정하지 않는다.**

**부수 효과(정직 기록 — 결함 아님)**: 3.x 경로에서는 현재 전송되던 `temperature`(Briefing 0.4 — `generateJson` 내부 하드코딩 / Ask 0.7 — 호출자 opts)가 더 이상 전달되지 않고 **모델 기본값**을 따른다. **`temperature` 제거 자체의 실동작 변화는 공식 문서상 예상되지 않는다. 출력 성향이 달라질 경우 모델 전환, 정상적인 생성 변동, 이번 구현의 회귀 가능성을 함께 검토하며 특정 원인으로 즉시 귀속하지 않는다.** 이후 SMOKE·재게이트 판정 시 이 전제를 유지한다(이 판에서 되돌리지 말 것).

구현 방식은 재량이되 **프로덕션 코드에 테스트 전용 export·함수 분리를 추가하지 말 것**(100C와 동일 원칙). 두 메서드가 같은 분기 로직을 공유하도록 파일 내부에서 정리하는 것은 허용.

## 2. 테스트 (`src/lib/llm.test.ts` 확장 — 요청 body 검사)
방식은 100C와 동일: `GEMINI_MODEL` 설정 → `vi.resetModules()` → 재import → `fetch` 모킹 → **요청 body의 `generationConfig`(thinkingConfig + temperature 유무) 확인.** 각 케이스를 `generateJson`·`generateJsonChat` **양쪽**에 대해 확인(4 케이스 × 2 메서드 = 8):

| # | GEMINI_MODEL | 호출자 budget | 기대 thinkingConfig | 기대 temperature |
|---|---|---|---|---|
| a | `gemini-2.5-flash` | 0 | `{ thinkingBudget: 0 }` (thinkingLevel 부재) | **존재**(현행 값 그대로) |
| b | `gemini-2.5-flash` | 1024 | `{ thinkingBudget: 1024 }` (thinkingLevel 부재) | **존재**(현행 값 그대로) |
| c | `gemini-3.5-flash-lite` | 0 | `{ thinkingLevel: 'minimal' }` (**thinkingBudget 키 부재**) | **키 부재** |
| d | `gemini-3.5-flash-lite` | 1024 | `{ thinkingLevel: 'minimal' }` (**thinkingBudget 키 부재**) | **키 부재** |

추가 1: **양 경로 모두** `maxOutputTokens`·`responseMimeType`가 기존과 동일하게 실림(회귀 방지). env는 케이스마다 원상복구.

## 3. 완료 기준
- [ ] `npx tsc --noEmit` / `npx vitest run` 전체(수치 보고) / `npm run build`
- [ ] **보고서 파일** `docs/reports/BRIEF-100D.md` 커밋+push — 담을 것: **①§0.5 브리프 보관 커밋 해시 ②코드 구현 커밋 해시 ③테스트 결과 수치 ④모델별 `generationConfig` 2종(2.5/3.5)**. (보고서 자신의 커밋 해시는 자기참조라 파일 안에 넣지 않는다.)
- [ ] **④는 테스트의 fetch mock에서 캡처한 요청 body**임을 보고서에 명시할 것 — 실제 Production API 호출 관측값이 아니다. **키·URL·실제 사용자 데이터는 포함 금지**(`generationConfig` 객체만, temperature 유무가 보이도록).
- [ ] **완료 보고 메시지(채팅)**에는 해시 **3종(보관/코드/보고서)** 전부 제출. 렌더 불필요.

## 4. 금지사항
- **허용 경로 4개 한정**: `docs/briefs/BRIEF-100D.md` · `src/lib/llm.ts` · `src/lib/llm.test.ts` · `docs/reports/BRIEF-100D.md`. 그 외 전부 무접촉 — **`route.ts`(ask·briefing)·`briefing.ts`·100B 검증 파이프라인 로직·환경변수·package.json/lock 손대지 말 것.**
- **현재 값 자체를 바꾸지 말 것** — 이 판은 **전송 여부·형식만** 바꾼다. 현행 실측: `generateJson`은 `temperature: 0.4` **하드코딩**·`thinkingBudget` 기본 0(Briefing은 인자 생략) / `generateJsonChat`은 `opts.temperature` 기본 0.4(Ask는 0.7 전달)·`opts.thinkingBudget` 기본 0(Ask는 1024 전달). 이 숫자들도, route 쪽 호출 인자도 그대로 둔다.
- `thinkingLevel` 값을 `low`·`medium`·`high`로 바꾸거나 env로 빼지 말 것(이번 정본은 `minimal` 고정).
- 이 판은 **재소개·strict_script 등 100B 품질 문제와 무관**하다(해결로 간주 금지).

## 4.5 근거 출처 (이 브리프의 사양 주장 근거 — 확인일 2026-08-07)
- `temperature`/`top_p`/`top_k` = **"deprecated and ignored"**, 향후 세대에서 전송 시 HTTP 400, **"Remove these parameters from all requests."** / `thinking_budget` → `thinking_level`(string enum) 대체 / **3.5 Flash-Lite 기본 `minimal`** — https://ai.google.dev/gemini-api/docs/latest-model
- 3.x는 `thinkingLevel` 권장·`thinkingBudget`은 2.5 계열용, **thinking 완전 비활성은 2.5 Flash 계열에서만(`thinkingBudget: 0`)** — https://ai.google.dev/gemini-api/docs/generate-content/thinking
- `thinkingLevel` **전체 지원값 목록은 문서 판독 간 불일치** → §1의 주의 참조. 공통분모 `minimal`만 사용.

## 5. 배포 후 검증 (YS 수행 — farr02 작업 아님)
merge·자동 배포 완료 후 **Briefing 1회만** 실행(새 인물 등록 1건). **정상 생성되면 운영 경로 복구로 판정하고 thinking 분기 가설을 지지하는 증거로 기록한다. 단, Briefing 1회 성공만으로 기존 502의 원인을 확증하지 않는다.** **실패 시 재시도하지 말고**, 브라우저 DevTools → Network → `briefing` → Response 탭의 `detail` 값(키처럼 보이는 문자열은 제거)을 본부에 전달. 그 전까지 추가 Briefing·SMOKE는 중단 유지.
