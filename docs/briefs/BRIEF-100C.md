# BRIEF-100C v2 — LLM 모델 선택 환경변수 분리 (gemini-3.5-flash-lite 전환 준비)

## 0. 맥락 (자기완결)
Attune(github.com/Farerworks/attune, 랩 PC `~/projects/attune`). 시작 전 `git pull`(기준 = 현 origin/main). 배경: Gemini 2.5 Flash 무료 등급 실한도가 **RPD 20/일**로 실측돼(8/6 소진 사고) 개발·테스트 용량이 부족 — **현재 해당 AI Studio 프로젝트에서 무료 등급 RPD 500으로 표시된 모델**인 `gemini-3.5-flash-lite`로 전환하기로 결정됨. 이 판은 **모델명 하드코딩을 환경변수로 분리하는 코드 1줄**만 다룬다. 실제 모델 전환은 YS가 Vercel 환경변수로 수행(§6 — farr02 작업 아님). **100B-FIX와 완전 별개의 판.**

## 0.5 시작 전 1커밋 — 이 브리프 원문 보관
전달받은 이 파일을 바이트 그대로 `docs/briefs/BRIEF-100C.md`로 저장, 단독 커밋+push(메시지: `BRIEF-100C: 브리프 원문 보관`). 보관 커밋 해시를 완료 보고에 포함.

## 1. 변경 (유일한 코드 수정)
`src/lib/llm.ts` 4행:
- 현재: `const GEMINI_MODEL = 'gemini-2.5-flash';`
- 변경: `const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';`

환경변수 **부재·빈 문자열이면 기존 `gemini-2.5-flash` 기본값 유지**(하위 호환 — Vercel 설정 전까지 동작 완전 동일). API 키 로직·provider 클래스·시그니처·OLLAMA 경로·그 외 상수 전부 무변경. llm.ts는 `server-only`라 env는 서버에서만 읽힘(NEXT_PUBLIC 아님 — 클라 노출 없음).

## 2. 영향 범위 (명시)
- `generateJson`·`generateJsonChat`의 요청 URL 모델 세그먼트만 바뀔 수 있음.
- **Ask와 Briefing이 같은 provider를 쓰므로 전환 시 둘 다 새 모델로 감** — RPD 절약 목적상 의도된 동작.
- `generationConfig`(temperature·maxOutputTokens·responseMimeType·thinkingConfig)는 **무변경** — 신모델의 thinkingConfig 수용 여부는 배포 후 canary가 검증(이 판 범위 밖. 거부 시 별도 후속 판).

## 3. 테스트 (소형 2 + 무회귀 — 프로덕션 코드 무접촉 방식)
- 신규 `src/lib/llm.test.ts`(또는 기존 해당 테스트 파일 확장): ① `GEMINI_MODEL` 미설정 → 요청 URL의 모델 세그먼트가 `gemini-2.5-flash` ② 설정(예: `test-model-x`) → 해당 값.
- 방식 고정: **env 설정 → 모듈 재로딩(`vi.resetModules` 후 재import) → `fetch` 모킹으로 요청 URL의 모델 세그먼트 확인.** 프로덕션 코드는 검증을 위해 변경하지 않는다 — **함수 분리·export 추가 금지**(§1의 1줄이 전부). `server-only` 우회는 기존 테스트 수법 사용. 각 케이스 후 env 원상복구.
- 기존 테스트 전체 통과(대부분 provider 모킹이라 무영향 예상 — 어긋나면 정직 보고).

## 4. 완료 기준
- [ ] `npx tsc --noEmit` / `npx vitest run` 전체(수치 보고) / `npm run build`
- [ ] `docs/reports/BRIEF-100C.md` 커밋+push — 해시 3종(보관/코드/보고서) 보고. 렌더 불필요(UI 무변경).

## 5. 금지사항
- **허용 경로 4개 한정**: `docs/briefs/BRIEF-100C.md`(§0.5) · `src/lib/llm.ts`(**§1의 지정 1줄만**) · 해당 테스트 파일(`src/lib/llm.test.ts` 신규 또는 기존 확장 — **테스트 파일 추가·수정은 예외적으로 허용**) · `docs/reports/BRIEF-100C.md`. 이 4개 외 전부 무접촉 — route.ts·클라이언트·다른 src/lib 파일·package.json/lock.
- llm.ts 안에서도 §1의 1줄 외 금지(OLLAMA 경로·다른 상수·함수 구조 변경 금지).
- `[sync] PUT 502`(Cloud Backup 실패)는 **별개 운영 결함** — 이 판 범위 아님, 손대지 말 것.
- **이 판은 재소개·strict_script 문제의 해결이 아니다** — 그 재검증은 모델 전환 후 새 모델 기준 SMOKE에서 별도 수행(간주 금지).

## 6. 배포 절차 (참고 — farr02 작업 아님, YS가 수행)
merge 후: Vercel → Settings → Environment Variables → `GEMINI_MODEL` = `gemini-3.5-flash-lite` (Production+Preview, **Sensitive 체크 금지** — 비밀 아님·재열람 필요) → Redeploy → canary(리딩 1+Ask 1 정상 확인) → AI Studio "모델당 요청 수" 차트에 `gemini-3.5-flash-lite` 등장 확인 → 새 모델 기준 SMOKE 4입력 처음부터.
