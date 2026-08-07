# BRIEF-100D v4 — 모델별 요청 파라미터 호환

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `docs/briefs/BRIEF-100D.md` | §0.5 — 브리프 원문 바이트 그대로 보관 (단독 커밋) |
| `src/lib/llm.ts` | §1 — `GeminiProvider`의 `generateJson`·`generateJsonChat` 양쪽이 공유하는 `buildGenerationConfig()` 헬퍼 신설, 모델 계열별 분기 |
| `src/lib/llm.test.ts` | 신규 9건(§2 표 4케이스×2메서드=8 + 회귀 방지 1건) |
| `docs/reports/BRIEF-100D.md` | 본 보고서 |

허용된 4개 경로 외 무접촉 확인: `git status --porcelain` 결과 위 목록과 정확히 일치(`route.ts`·`briefing.ts`·100B 파이프라인·환경변수·`package.json/lock` 전부 무변경).

## 2. 구현 요지

`GeminiProvider` 내부에 파일-로컬(비-export) 헬퍼 `buildGenerationConfig(maxTokens, thinkingBudget, temperature)`를 신설해 `generateJson`·`generateJsonChat` 양쪽이 공유하도록 했다(지시서가 허용한 "같은 분기 로직을 파일 내부에서 정리"). 이 헬퍼가 하는 일:

- `GEMINI_MODEL`이 `gemini-2.`로 시작 → **레거시 그대로**: `temperature`(호출자 값)와 `thinkingConfig: { thinkingBudget }`(호출자 값, 0도 그대로 보존 — 생략하지 않음)를 전송.
- 그 외 모델(현재 유일한 대상: `gemini-3.5-flash-lite`) → **신규 경로**: `temperature` 키 자체를 생성하지 않고, `thinkingConfig: { thinkingLevel: 'minimal' }`만 전송 — 호출자가 넘긴 `thinkingBudget`·`temperature` 값은 이 경로에서 아예 쓰이지 않는다.
- 미지원/미지정 모델명에 대한 예외 throw는 추가하지 않았다 — 지시서대로 알 수 없는 모델명은 그냥 신규 경로로 흘러간다(BRIEF-100C 테스트의 `test-model-x` 포함, 기존 테스트 무회귀 확인됨).
- `maxOutputTokens`·`responseMimeType`은 두 경로 모두 기존 그대로.
- `generateJson`의 `temperature: 0.4` 하드코딩, `generateJsonChat`의 `opts.temperature` 기본값 0.4/Ask의 0.7 전달, `thinkingBudget` 기본값 0/Ask의 1024 전달 — 이 숫자들과 route 쪽 호출 인자는 전부 그대로 두었다(값 자체는 안 바꾸는 게 이 판의 원칙).
- Ollama provider는 무접촉(`void thinkingBudget` 그대로).

## 3. 테스트

`src/lib/llm.test.ts`에 지시서 §2 표를 그대로 구현한 신규 9건을 추가했다(BRIEF-100C 방식 그대로: env 설정 → `vi.resetModules()` → 재-import → `fetch` 모킹으로 요청 body의 `generationConfig` 캡처). `captureConfigs()`라는 테스트 전용 헬퍼(테스트 파일 안에만 존재, 프로덕션 코드엔 아무것도 추가하지 않음)로 `generateJson`·`generateJsonChat` 양쪽을 한 번에 호출해 두 바디를 동시에 확보한다:

| # | GEMINI_MODEL | 호출자 budget | 확인 |
|---|---|---|---|
| a | gemini-2.5-flash | 0 | `thinkingConfig:{thinkingBudget:0}` 유지 + `temperature` 존재 — generateJson/generateJsonChat 각 1건 |
| b | gemini-2.5-flash | 1024 | `thinkingConfig:{thinkingBudget:1024}` 유지 + `temperature` 존재 — 각 1건 |
| c | gemini-3.5-flash-lite | 0 | `thinkingConfig:{thinkingLevel:'minimal'}` + `temperature` 키 부재 — 각 1건 |
| d | gemini-3.5-flash-lite | 1024 | 위와 동일(호출자 budget 무시됨) — 각 1건 |
| + | 회귀 방지 | — | 두 경로 전부 `maxOutputTokens:2048`·`responseMimeType:'application/json'` 유지 — 1건 |

기존 전체 무회귀. **전체 591개 통과**(기존 582 + 신규 9).

## 4. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` 전체 통과 — **591개**
- [x] `npm run build` 성공
- [x] main push 완료 — 해시는 §6

## 5. 모델별 `generationConfig` 실물 2종

**아래는 테스트의 `fetch` 모킹에서 캡처한 요청 body다 — 실제 Production API 호출 관측값이 아니다.** 키·URL·사용자 데이터는 포함하지 않았다(`generationConfig` 객체만). 두 경우 다 `generateJsonChat('sys', [{role:'user',text:'hi'}], { thinkingBudget: 1024, temperature: 0.7 })`로 동일하게 호출해, 3.5 경로에서 이 값들이 실제로 무시됨을 눈으로 보이게 했다.

**gemini-2.5-flash** (레거시 경로 — temperature·thinkingBudget 그대로 전달됨):
```json
{
  "maxOutputTokens": 2048,
  "responseMimeType": "application/json",
  "temperature": 0.7,
  "thinkingConfig": {
    "thinkingBudget": 1024
  }
}
```

**gemini-3.5-flash-lite** (신규 경로 — temperature 키 없음, thinkingBudget 무시되고 항상 minimal):
```json
{
  "maxOutputTokens": 2048,
  "responseMimeType": "application/json",
  "thinkingConfig": {
    "thinkingLevel": "minimal"
  }
}
```

## 6. 정직 보고

- **이 판은 진단(thinking 파라미터가 Briefing 502의 원인)이 맞다는 걸 증명하지 않는다.** 지시서가 처음부터 명시한 대로, 이건 "가설이 맞든 틀리든 가치 있는 공식 규격 정합화"다. 실제 원인 확인은 §5의 배포 후 검증(YS가 Briefing 1회 실행)을 기다려야 한다.
- **`temperature` 제거의 실동작 영향은 확인하지 않았다** — 공식 문서가 "deprecated and ignored"라고 밝힌 값이라 이 판의 수리 대상이 아니라고 지시서가 명시했고, 그대로 따랐다.
- **`buildGenerationConfig` 헬퍼는 export하지 않고 파일 로컬로 유지했다** — 지시서의 "프로덕션 코드에 테스트 전용 export·함수 분리 금지" 원칙을 지키면서도, 지시서가 명시적으로 허용한 "두 메서드가 같은 분기 로직을 공유하도록 파일 내부에서 정리"에 해당한다고 판단했다. 테스트는 이 헬퍼를 직접 부르지 않고 `createLlmProvider()`→실제 메서드 호출 경로로만 검증한다(100C와 동일 원칙).

## 7. 커밋 해시

- 저장소: https://github.com/Farerworks/attune
- §0.5 브리프 원문 보관: `aead4f5`
- 코드 커밋: `947df1f`
