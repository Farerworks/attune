# BRIEF-100C v2 — LLM 모델 선택 환경변수 분리

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `docs/briefs/BRIEF-100C.md` | §0.5 — 브리프 원문 바이트 그대로 보관 (단독 커밋) |
| `src/lib/llm.ts` | §1 — `GEMINI_MODEL` 상수를 `process.env.GEMINI_MODEL?.trim() \|\| 'gemini-2.5-flash'`로 교체 (지정된 1줄만) |
| `src/lib/llm.test.ts` | 신규 3건 |
| `docs/reports/BRIEF-100C.md` | 본 보고서 |

허용된 4개 경로 외 무접촉 확인: `git status --porcelain` 결과 위 목록과 정확히 일치(`route.ts`·클라이언트·다른 `src/lib` 파일·`package.json/lock` 전부 무변경).

## 2. 구현 요지

`src/lib/llm.ts` 4행의 `const GEMINI_MODEL = 'gemini-2.5-flash';`를 `const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';`로 교체했다. 환경변수가 없거나 빈 문자열(또는 공백만)이면 `||` 연산자가 기존 기본값 `'gemini-2.5-flash'`로 자동 폴백하므로, Vercel에 `GEMINI_MODEL`을 아직 설정하지 않은 지금 시점엔 동작이 완전히 동일하다. `GeminiProvider`/`OllamaProvider` 클래스, `createLlmProvider()` 시그니처, `generateJson`/`generateJsonChat`의 다른 로직(온도·토큰 한도·`responseMimeType`·`thinkingConfig` 등)은 전부 무변경 — 요청 URL의 모델 세그먼트만 이 값을 따라간다.

`llm.ts`는 파일 최상단에 `import 'server-only';`가 있어 이 코드는 서버에서만 실행된다. `NEXT_PUBLIC_` 접두사가 없는 `process.env.GEMINI_MODEL`은 Next.js가 클라이언트 번들에 절대 포함시키지 않으므로, 이 값이 브라우저로 노출될 경로는 없다.

## 3. 테스트

지시서가 명시한 방식(프로덕션 코드에 테스트용 export/함수 분리를 추가하지 않고, `vi.resetModules()` + 재-import + `fetch` 모킹으로 실제 동작 경로를 그대로 검증) 그대로 `src/lib/llm.test.ts`를 신규 작성했다:

1. `GEMINI_MODEL` 미설정 → 요청 URL이 `/models/gemini-2.5-flash:generateContent`를 포함.
2. `GEMINI_MODEL='test-model-x'` → 요청 URL이 `/models/test-model-x:generateContent`를 포함.
3. (지시서엔 없지만 §1의 `?.trim() || ...` 로직 자체를 검증하기 위해 추가) `GEMINI_MODEL='   '`(공백만) → trim 후 빈 문자열이 되어 기본값으로 폴백.

각 테스트는 `beforeEach` 없이 개별 `it` 안에서 환경변수를 직접 설정하고, `afterEach`에서 원래 값(테스트 실행 전 `process.env`에 있던 값, 없었으면 `delete`)으로 정확히 복구한 뒤 `vi.resetModules()`로 모듈 캐시를 비운다. `server-only`는 기존 route 테스트들과 동일한 `vi.mock('server-only', () => ({}))` 수법으로 우회했다.

## 4. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` 전체 통과 — **582개**(기존 579 + 신규 3, 기존 테스트 전부 무회귀 — 지시서가 예상한 대로 대부분 provider 자체가 모킹되어 있어 이 변경의 영향을 받지 않았다)
- [x] `npm run build` 성공
- [x] main push 완료 — 해시는 §6
- 렌더 확인: 지시서대로 UI 변경이 없어 불필요.

## 5. 정직 보고

- 이 판은 **코드 배선만** 마쳤다 — 실제 모델 전환(Vercel에 `GEMINI_MODEL=gemini-3.5-flash-lite` 설정)은 지시서 §6대로 YS가 직접 수행할 몫이라 이 작업엔 포함하지 않았다.
- `[sync] PUT 502` 문제와 재소개/strict_script 재검증은 지시서가 명시한 대로 이 판의 범위 밖이라 손대지 않았다.
- 공백-only 환경변수 폴백 테스트(3번)는 지시서가 명시적으로 요구한 항목은 아니지만, §1의 정본 코드 자체가 `?.trim()`을 쓰고 있어서 그 분기도 실제로 검증해두는 게 안전하다고 판단해 추가했다 — 프로덕션 코드는 건드리지 않았다.

## 6. 커밋 해시

- 저장소: https://github.com/Farerworks/attune
- §0.5 브리프 원문 보관: `f7e3c4b`
- 코드 커밋: `9fce037`
- 보고서 해시 반영 커밋: (다음 커밋에서 반영 예정)
