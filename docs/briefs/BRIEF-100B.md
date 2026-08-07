# BRIEF-100B v3 — Ask 응답 검증·회복 파이프라인 (결정론 검출 · 제한 재생성 · 재검증)

## 0. 맥락 (자기완결)
Attune(github.com/Farerworks/attune, 랩 PC `~/projects/attune`). 시작 전 `git pull` — 기준은 **현 origin/main 최신**(BRIEF-101이 먼저 병합돼 있어도 무관: 대상 파일 비중첩). 배경: BRIEF-100의 프롬프트 지시가 실사용 게이트에서 미준수 확인(아키타입 재소개 6/7턴·성격 단정·라벨 세트 혼합·502 에러 2/8). 처방 = **프롬프트 추가가 아니라 서버 검증 파이프라인**: 결정론적 검출 → correction 재생성 최대 1회 → **2차 결과 재검증** → 유형별 안전한 최종 처리(무한 재생성 금지·무검증 통과 금지). 대상: `src/app/api/ask/route.ts`(+테스트·verify)만. **클라이언트·응답 JSON 구조는 무변경.**
**v2 변경**: ①§5 확장 — 후보 0회 기준을 아키타입 라인 1줄이 아니라 조립 재료로(천간 EN 표시명 포함) ②live golden 삭제 — 실모델 판정은 **YS 고정 4입력 smoke 게이트**가 담당(테스트 전용 키 기반 자동화는 별도 후속 판) ③verdict 선두 확언 검출을 **보조 신호로 격하**+한계 문서화 테스트 ④명칭 정정. **v3 변경(외부 검수 2라운드 — 이 문서가 정본, v1·v2 폐기)**: §5 정밀화 — 0회 **검사 범위를 system prompt 재료·지시 영역으로 한정**(history·현재 입력·내부 후보 목록 제외 — 소개 기록이 history에 남아야 ALREADY가 성립), 치환은 공용 formatChart 무접촉의 **전용 projection**으로 격리, 예외 2건 표로 정밀 열거, 보존 테스트 5종(me/general 바이트 동일 포함) 명문화, 표기 치환=확률 저감 장치·보장은 출력 검증기임을 명시.

## 0.5 시작 전 1커밋 — 이 브리프 원문 보관
전달받은 이 파일을 **바이트 그대로** `docs/briefs/BRIEF-100B.md`로 저장, 단독 커밋+push(메시지: `BRIEF-100B: 브리프 원문 보관`). 보관 커밋 해시를 완료 보고에 포함.

## 1. 응답 파이프라인 6단계 (정본 흐름)
모든 person/me/general Ask 요청(안전 게이트 통과분)에 대해:
① 상태 결정 — 기존 todayIntroduced·personIntroduced + **신규 askMode 감지(§3)** ② 모델 생성(1차) ③ **서버 검증기 실행(§6·§7)** — parse→schema→banned(기존)+labels+strict_script+reintroduction+verdict_opening ④ 위반 시 **위반 종류·문구를 구체 명시한 correction 재생성 최대 1회**(기존 재시도 경로에 통합 — **요청당 추가 모델 호출 총 1회 상한**, 어떤 조합이든) ⑤ **2차 결과도 동일 검증** ⑥ 최종 처리는 위반 유형별 결정론 표:

| 2차에도 남은 위반 | 최종 처리 |
|---|---|
| 호출 실패(재시도 불가 유형 포함) | 502 + `code:'call'` |
| JSON 파싱 실패 | 502 + `code:'parse'` |
| 스키마 무효 | 502 + `code:'schema'` (현행 유지) |
| 금칙어 | 502 + `code:'banned'` (현행 유지) |
| 라벨 세트 위반 | **정규화 서빙**: 다수 일치 세트의 정본 3라벨을 정본 순서로 덮어쓰기 + flag 로그 |
| 라벨 순서만 위반(세트는 정확) | 재생성 없이 **parts를 정본 라벨 순서로 재배열** + flag (1차에서 즉시, 재생성 예산 소모 없음) |
| strict_script인데 parts 카드 | **강등 서빙**: parts[].text를 빈 줄 2개로 병합해 `{ text }` shape 2로 + flag |
| 재소개(후보 문자열) | 소프트 서빙 + flag (문자열 절제는 문장 파손 위험 — 빈도는 flag로 계측) |
| verdict 선두 확언 | 소프트 서빙 + flag |

## 2. 호출 실패 분류·시간 예산·로깅 위생
**유형별 재시도** — 분류는 우리 코드가 던지는 메시지 리터럴로(외부 라이브러리 무접촉): `Gemini API error <status>:` → 429·5xx만 1회 재시도, 그 외 4xx 즉시 실패 / `returned no text`(빈 응답) → 재시도 / withTimeout 거부 리터럴 → 재시도 / 그 외 네트워크성 예외 → 재시도 / `GEMINI_API_KEY` 부재 → 즉시 실패. **호출 재시도와 correction 재생성은 같은 1회 예산을 공유.**
**시간 예산**: `maxDuration = 60` 기존재(10행). 현 `LLM_TIMEOUT = 55_000` 단일을 **1차 30_000 / 재시도·재생성 20_000**으로 교체(합 50s < 60s).
**로깅(프라이버시 결함 수정 포함)**: 요청 시작에 `rid = crypto.randomUUID().slice(0,8)`. 실패·재생성·정규화·강등·플래그 시 1줄: `[ask] rid=<rid> stage=<call|parse|schema|banned|labels|script|reintro|verdict> action=<retry|regen|reorder|normalize|downgrade|soft|fail> status=<숫자|-> timeout=<y|n>`. **raw 응답 본문·대화·이름·사주 데이터는 로그 절대 금지** — 현 514·544행의 `rawAnswer.slice(0, 300)` 로깅을 제거하고 `rawLen=<길이> err=<err.name>`만 남길 것(대화 파생 텍스트의 로그 유출 = 프라이버시 결함). 성공 경로 무로그(현행).
**에러 응답**: 기존 `{ error: <문구 그대로> }`에 `code` 필드만 추가(additive — 클라 무변경, 문구 무변경).

## 3. askMode 감지기 (보수적 — 확신 없으면 null=현행 동작)
`export function detectAskMode(latestUserText: string): 'strict_script' | 'verdict_probe' | null` + `export function detectContinuationHint(latestUserText: string): boolean`. 표 기반 패턴 상수 export(테스트 직접 대조). 최신 사용자 메시지(question 필드)만 검사.
- **strict_script** (개수 명시 필수): KO `문장 N개`(숫자·한/두/세/네)·`N문장(만) 써/만들/뽑`·`멘트 N개` / EN `write|give|draft (me) N lines|sentences|messages`·`exactly N lines|sentences`. 음성 보장: 개수 없는 "뭐라고 답할까?"·"보낼 문장 써줘"는 **null**(오탐이 강제보다 해로움).
- **verdict_probe**: KO `원래 그런|그렇|이런 (성격|사람|스타일)`·`원래 그래|그런가`·`항상 그래|이래`·`원래 ~형/타입이야` / EN `is he/she/that always like`·`just how/who he/she is`. 음성: "성격이 어때?"류는 null.
- **continuation hint**: KO `그래서 내가`·`그러자 <이름>이/가`·`아니, 사실은`·`~라고 했어` 등 — **힌트만, 검증·강제 없음**(의미 분류의 오탐 위험 — 조언자 8항의 fallback 조항 이행).

## 4. 상태 블록 정본 3종 (감지 시에만 시스템 프롬프트에 추가 — 기존 블록 무변경)
[strict_script 정본]
`SCRIPT REQUEST — the user asked for message lines to send, with an explicit count. Contract for THIS answer: respond in shape 2 ({"text": ...}) — no parts, no labels, no headings. Give exactly the requested number of lines, each ready to send as-is, plus at most one short sentence of framing. No chart talk, no archetype, no day-pillar/today talk, no followUp. This contract outranks every other block for this turn, including TODAY first-mention duty — skip it here.`

[verdict_probe 정본]
`CHARACTER QUESTION — the user is asking whether this is the other person's fixed personality. Contract for THIS answer: (1) never open with a confirmation ("네", "맞아요", "Yes") and never confirm a fixed trait; (2) start with one short line of honest uncertainty — a few moments aren't enough to define someone; (3) offer at least two different situational readings of the same behavior; (4) give one concrete thing to watch next time that would tell the readings apart; (5) the chart may color a tendency but must never serve as proof of character. Keep it compact.`

[continuation hint 정본]
`CONTINUATION HINT — the latest message reads as a continuation of the same scene (added facts, their reaction, or a correction), not a new question. Shape 2 (short {"text"}) is almost certainly right here; do not restart the 3-part card unless it is clearly a new independent question.`

## 5. ALREADY 상태의 재소개 미끼 제거 (전용 projection — 검사 범위 정밀 정의)
실측 확증: ALREADY 상태 조립에 이름 재료가 남는다 — ①152행 `THEM ARCHETYPE: <EN명> (KO: <KO명>)` ②THEM 차트 표·ELEMENT AXIS의 EN 천간 표시명(`Yang Wood` — 일간 후보와 동일 문자열). `personIntroduced === true`일 때 **route 측 전용 projection**으로 처리(공용 `formatChart`·src/lib **무접촉** — 기본 동작·다른 호출처 불변, 조립 직전 THEM 파트 문자열만 가공):
- (a) 아키타입 라인을 아래 정본으로 교체(Drive/Communication/Under stress 3줄 유지):
`THEM ARCHETYPE: (name withheld — it was already introduced earlier in this conversation; never re-name or re-explain it. The trait notes below are your private reasoning only.)`
- (b) **THEM 파트 문자열**(THEM 차트 표 + THEM ARCHETYPE 이하 + ELEMENT AXIS + BRIEFING SUMMARY — **RELATIONSHIP NOTES는 제외**)에서 십간 EN 표시명을 `한자 (오행, 음양)` 표기로 치환 — 예: `Yang Wood (甲)` → `甲 (wood, yang)`. 추론 재료(한자·오행·음양·지지) 전량 유지. **ME 파트·NOT-YET 상태 무가공.**
- **0회 검사 범위 정본(조언자 정정 채택)**: 대상은 **ALREADY 상태에서 새로 조립되는 system prompt의 차트·persona·instruction 재료 영역**이다. **검사 제외**: 이전 user/assistant history(이전 소개 기록이 남아 있어야 ALREADY가 성립 — LLM request 전체 0회는 불가능하고 바람직하지도 않음) · 현재 사용자 입력(사용자가 "첫 새벽이라 그런 거야?"라고 물을 수 있음) · IDENTITY 판정용 내부 후보 목록 · 테스트 메타데이터. **출력 검증기(§7)는 별도로 새 assistant 응답만 검사.**
- **스캔 제외 예외 2 (정밀 열거)**:

| 예외 영역 | 남는 문자열 | 잔존 이유 | 0회 검사 | 누출 위험·방어 |
|---|---|---|---|---|
| ME 파트(ME 차트 표+ME ARCHETYPE) | 사용자 자신의 천간 EN 표시명·아키타입명 — THEM 일간과 **우연히 같은 십간일 때만** 후보와 동일 문자열 | 사용자 본인 재료 무가공 원칙(THEM 억제 목적과 무관) | 제외 | 낮음(우연 일치 시에만 존재) — §7 출력 검증기가 방어 |
| RELATIONSHIP NOTES(memory 원문) | 과거 대화에서 저장된 사실 문자열(이론상 차트 라벨 포함 가능 — 추출 규칙상 확률 낮음) | 사용자 유래 데이터 무가공(가공=기록 왜곡) | 제외 | 낮음 — §7이 방어 |

- **한계 명시(정직 기록)**: `甲 (wood, yang)` 표기는 모델이 `갑목/Yang Wood`로 복원할 수 있다 — 이 치환은 재소개 **확률을 낮추는 장치이지 보장이 아니다. 보장 층은 §7 출력 검증기+correction**이다.
- **보존 테스트 5 (조언자 정본 — §9에 편입)**: ①ALREADY system prompt 스캔(제외 예외 빼고) 후보 **0회** ②NOT-YET system prompt는 기존 소개 재료 그대로 유지 ③me/general system prompt는 변경 전과 **바이트 동일**(픽스처 전후 비교) ④TODAY·SAFETY·PREDICTION 블록 문자열 무변경 ⑤history(turns)는 무변형·무삭제로 전달됨.
- **기록 의무**: 이름 제거 후에도 남는 기질 서술 재료(Drive·Communication·Stress·BRIEFING 요약)의 분량·강조를 보고서에 기록 — 동일 기질 요약 반복이 재게이트에서 지속되면 이 재료의 축소가 다음 후보.

## 6. 라벨 allowlist 검증기
`export const UNDERSTAND_LABELS / DECIDE_LABELS` — outputSpec의 두 세트와 **바이트 동일** 상수. `export function validateAskAnswer(answer, ctx)` (순수 함수, ctx = { askMode, personIntroduced, candidates, latestUserText }) → 위반 목록. 검사: ①3파트 응답의 라벨이 두 세트 중 **정확히 한 세트의 3종 전부**인지(혼입·누락·초과 금지) ②순서 이탈은 별도 위반(§1 표 — 재배열로 처리) ③strict_script인데 parts 존재 ④§7 재소개 ⑤verdict_probe의 **선두 확언 — 보조 신호**: trim 후 `네`·`맞아`·`Yes` 시작, 또는 첫 문장에 `원래 그런 (편|성격|사람)` 확언 패턴. **한계 명시(보고서 의무)**: 이 신호 없이도 단정 문장은 가능하고(예: "그런 성향이 강하다고 볼 수 있어요"), 신호가 있어도 단정이 아닐 수 있다 — 의미 판정은 기계 범위 밖. 핵심 방어는 §4 verdict 모드 계약이고 이 검출은 재생성 1회를 촉발하는 보조일 뿐. 외부 JSON 스키마(파트 구조·키·글자수)는 무변경 — 검증기는 읽기만.
strict_script 응답의 `followUp`은 서버가 제거(소프트 — 위반 아님). shape 2 `{ text }` 응답은 라벨 검사 면제.

## 7. 재소개 검사 (상태별)
기존 `themNameCandidates`·정규화 매처 재사용(신설 금지). person 모드에서만: `NOT YET` 상태 → 검사 없음(1회 소개는 허용 동작) / `ALREADY` 상태 → **assistant 산출 JSON의 전체 문자열**에 후보 등장 시 위반. 예외: **사용자 최신 메시지에 등장한 후보는 제외**(사용자가 이름을 물으면 답할 수 있어야 함). correction 후에도 재검사(§1 ⑤). bare 한자 1글자·`목`·`목 기운` 제외 규칙 유지.
**알려진 한계(보고서 정직 기록 의무)**: 이름 없이 같은 기질을 새 표현으로 반복하는 우회는 문자열 검증기가 못 잡는다 — 재게이트(실앱)에서 측정.

## 8. 정본 프롬프트 미세 수정 2 (교체 아님 — 각 블록에 1문장 추가)
- BASIS PRIORITY 블록 말미에 추가: `When the user has given you no concrete facts yet, say so briefly and offer possibilities — do not let the chart fill the gap as if it were evidence.`
- KOREAN VOICE 블록에 항목 추가(번호 이어서): `Mirror the user's way of naming the other person (e.g., "지현이" stays "지현이", "지현님" stays "지현님") — never upgrade or downgrade the honorific on your own. If the user's term for them is an insult, use the plain name.`

## 9. 테스트 (unit — 합성 불량 출력 주입 / live golden 분리)
- 감지기 표 기반: strict_script 양성 5+·음성 5+(개수 없는 "뭐라고 답할까"·"선물 두 개 중 뭐가 나아" → null), verdict 양성 4+·음성 2+, hint 양성 3.
- 검증기: 두 세트 정상 통과 / 혼합 라벨 → 위반 / 순서만 이탈 → 재배열 결과 검증 / strict에 parts → 위반 / ALREADY+후보 → 위반, 사용자 최신 메시지 언급 후보 → 통과, NOT-YET → 통과 / verdict 선두 `네,` → 위반.
- 파이프라인(모킹 provider 시퀀스, **필수 음성 대조 6**): ①ALREADY에서 `첫 새벽`류 출력 → 1차 거부·correction 프롬프트에 위반 사유 문자열 포함 ②혼합 라벨 → 거부→재생성 ③strict에 WHY 라벨 카드 → 거부 ④파싱 실패 → 정해진 경로로 1회만 복구, 2연속 → 502 `code:'parse'` ⑤correction 결과도 위반 → 유형별 최종 처리(정규화/강등/소프트+flag) 각 1케이스 ⑥정상 출력 → 재생성 0회·호출 정확 1회. + 호출 분류: 429→재시도, 400→무재시도, timeout 리터럴→재시도, **어떤 조합에도 추가 호출 ≤1**.
- 로깅: 파싱 실패 경로의 console 인자에 raw 본문 부재(`rawLen`만) — spy 검증. / 안전 게이트: 트리거 입력 → LLM 호출 0회(기존 테스트 존치 확인).
- 조립: 블록 3종 감지 시 존재·미감지 시 부재 / **§5 보존 테스트 5 전부**(ALREADY 스캔 0회·NOT-YET 유지·me/general 바이트 동일·TODAY/SAFETY/PREDICTION 무변경·history 무변형) / §8 두 문장 존재. verify 킷 동수 추가.
- **한계 문서화 테스트 2(알려진 한계의 명시적 고정)**: ①verdict 모드에서 『원래 그런 편이에요』형(선두 신호 없는 단정) 합성 응답이 검증기에 **검출되지 않음**을 확인 — 미래 독자가 이 한계를 테스트로 발견하게 ②선두 `네`지만 단정 아닌 합성 응답도 correction 1회를 소모함(보조 신호의 오탐 비용) 확인.
- **실모델 검증은 이 판의 범위 밖(보안 결정 — 키 미투입)**: 검수 합격·배포 직후 **YS 고정 4입력 smoke 게이트(SMOKE-100B.md, 본부 제공·5분)**가 실모델 판정을 담당. 자동 실모델 게이트는 **테스트 전용 키**(Gemini 한정·저한도·운영 분리·폐기 가능·.env.local만·Git/로그 비노출) 준비 후 별도 판 — 백로그 등재.

## 10. 완료 기준
- [ ] `npx tsc --noEmit` / `npx vitest run` 전체(신규 +25~35 예상 — 정확 수치 보고) / `npm run build`
- [ ] 보고서 `docs/reports/BRIEF-100B.md`: **비용·지연 영향**(추가 호출은 위반 시에만 최대 1회 — worst-case 지연 30s+20s+오버헤드 산식 포함) · 커밋 해시 3종(보관/코드/보고서) · **§5 기록 의무(잔존 기질 재료)** · §6·§7 한계 기록 · ALREADY/NOT-YET 조립 실물 2상태 첨부.
- [ ] 커밋+push, 해시 보고.

## 11. 금지사항
- SAFETY_RULES·safetyAck·detectSafetyTrigger·BANNED 목록·quota·memory·RequestSchema **무접촉**(검증 파이프라인은 LLM 산출층에만 — 안전 게이트는 그 앞단).
- 응답 JSON 구조(파트 스키마·키·글자수) 무변경 — 에러 `code` 추가만. 클라이언트 파일 전체 무접촉.
- src/lib 전체 무접촉(**llm.ts 포함** — 오류 분류는 route 측 리터럴 매칭으로). IDENTITY·TODAY 기존 블록 문구 무변경(§4 추가·§5 교체·§8 추가만).
- **BRIEF-101 대상 파일 무접촉**(TabBar·home·homeCopy·person 허브 — 병렬 판 충돌 방지).
- 정본 문구(§4·§5·§8·라벨 상수)는 바이트 그대로. 문구 수정 금지.
