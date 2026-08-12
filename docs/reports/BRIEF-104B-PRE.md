# BRIEF-104B-PRE — 재기준선 채집 (105 이후 상태)

## 1. 실행 조건

| 항목 | 값 |
|---|---|
| 모델 (실측) | `gemini-3.5-flash-lite` (`modelGateForced: false`) |
| `generationConfig` 분기 | `new(no temperature, thinkingLevel=minimal)` |
| `LLM_PROVIDER` | `gemini` |
| 기준 커밋 (`baseCommitSha`) | `91e2e725780c959d865ed411a39954a5c221b554` |
| 실행 시각 (`executedAt`, 4개 파일 공통) | `2026-08-12T01:43:26.129Z` |
| 호출 간격 | 4000ms — RPM/RPD 대시보드 확인 불가로 브리프 지시대로 기본값 4초 사용 (104A와 동일 기준) |
| 총 호출 수 | 25 (기본 24 + 교정 1) |
| 429 발생 | 0건 (`sawRateLimit429` 미발동, 전체 완주) |

## 2. 104A(구) ↔ 104B-PRE(신) 대조표

집계 대상: `metrics-20260811-v2.tsv` (24행, BRIEF-104A-FIX 재산출본) vs `metrics-20260812.tsv` (24행, 신규).

### M1 — 재소개 위반 건수 (turn≥2만)

| | firstPass | finalPass |
|---|---|---|
| 구(104A) | 0 | 0 |
| 신(104B-PRE) | 1 | 0 |

신규 1건: KO-run1 turn3 (`reintroduction`, detail=`Yang Water`) — 교정 호출 1건으로 finalPass에서 0으로 해소됨. 이번 채집의 유일한 교정 호출이 이 건이다.

### M2 — 사주 어휘 토큰 출현 수 (탐색용, 합계)

| | firstPass 합 | finalPass 합 |
|---|---|---|
| 구(104A) | 264 | 263 |
| 신(104B-PRE) | 258 | 254 |

### M3 — 길이·shape·턴1 대비 비율

**평균 단어 수 (24턴 평균)**

| | firstPass | finalPass |
|---|---|---|
| 구(104A) | 71.92 | 72.04 |
| 신(104B-PRE) | 65.75 | 65.58 |

**턴4/5/6의 턴1 대비 비율 (finalPass, run별)**

| 턴 | 구: EN#1 | 구: EN#2 | 구: KO#1 | 구: KO#2 | 신: EN#1 | 신: EN#2 | 신: KO#1 | 신: KO#2 |
|---|---|---|---|---|---|---|---|---|
| 4 | 0.46 | 0.44 | 0.34 | 0.29 | 0.54 | 0.40 | 0.50 | 0.39 |
| 5 | 1.00 | 1.06 | 1.00 | 0.40 | 0.90 | 0.75 | 0.69 | 0.61 |
| 6 | 0.30 | 0.43 | 0.26 | 0.18 | 0.48 | 0.15 | 0.26 | 0.20 |

**shape (KO 턴5, run별 — §4에서 상술)**

| | run1 | run2 |
|---|---|---|
| 구(104A) | parts | text |
| 신(104B-PRE) | parts | parts |

### M4 — 단정형 표현 후보 건수 (합계, 사람 판정 전 후보 수)

| | firstPass | finalPass |
|---|---|---|
| 구(104A) | 4 | 4 |
| 신(104B-PRE) | 4 | 4 |

`M4_manual_first`/`M4_manual_final` 열은 공란 유지 — 판정하지 않음.

### M6 — 숨은 진실·판결식 개시 위반 (정규식 기반, 합계)

| | firstPass | finalPass |
|---|---|---|
| 구(104A) | 0 | 0 |
| 신(104B-PRE) | 0 | 0 |

`M6_manual_final`/`M6_manual_evidence` 열은 공란 유지.

### M7 — 표면 중복 (Jaccard≥0.6, 합계)

| | firstPass | finalPass |
|---|---|---|
| 구(104A) | 0 | 0 |
| 신(104B-PRE) | 0 | 0 |

`M7b_verdict`/`M7b_evidence` 열은 공란 유지.

## 3. `date_pillar_mismatch` 발생 수

이번 채집(24턴 firstPass + 24턴 finalPass, 총 48개 답변) 전체에서 **0건**.

원본 JSON `turns[].firstPass.violations`/`turns[].finalPass.violations`를 전수 조사한 결과 출현한 `type`은 `reintroduction` 1건뿐이며, `date_pillar_mismatch`는 한 건도 없었다. 답변 원문에는 날짜+간지 병기 문장이 다수 존재한다 — 예: KO-run1 turn3 firstPass "2026-08-22(토) Yang Earth / Dragon 날", "2026-08-16(일) Yang Water / Dog 날" — 즉 검증기가 실제로 대상 문장을 만났고, 그 위에서 위반이 0건이었다. **0이면 105가 실사용에서 먹혔다는 뜻**이므로 그렇게 기록한다.

(참고: §2 정합 수정 전 상태였다면 `ctx.dailyPillarLookup`이 비어 있어 `route.ts:1139` 가드에서 검증 자체가 건너뛰어지므로, 이 0건이라는 결과 자체가 성립하지 않았을 것 — 이번 0건은 "검증이 돌았고 위반이 없었다"는 뜻이지 "검증이 안 돌았다"는 뜻이 아니다.)

## 4. shape 안정성

같은 입력(KO 턴5)에 대해:

- 구(104A): run1 = `parts`, run2 = `text` — **런마다 갈렸다.**
- 신(104B-PRE): run1 = `parts`, run2 = `parts` — **두 런 모두 동일.**

다른 턴·언어 조합에서는 구/신 모두 run 간 shape 차이가 관찰되지 않았다.

## 5. ctx 대조 (route.ts 줄 번호)

- `AskValidationCtx`의 `dailyPillarLookup?`/`todayDate?` 선언: `route.ts:831-832`
- 프로덕션 `POST` 핸들러의 ctx 구성 (해당 두 필드를 채우는 지점): `route.ts:1678-1682`
- 미전달 시 검증을 건너뛰는 가드: `route.ts:1139` (`if (ctx.dailyPillarLookup)`), 최종 보정 쪽 `route.ts:1334`
- 하네스(`scripts/verify/voice-baseline.mjs`)의 `runOneTurn` ctx 구성은 이번 수정으로 위 프로덕션 코드와 필드·값 구성이 일치함을 육안 대조로 확인함.
