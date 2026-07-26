# BRIEF-087 — Ask 오늘 일진 언급 반복 억제 (084 후속, 078 수법 이식)

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `src/app/api/ask/route.ts` | `buildAskSystem` 반환 템플릿의 TODAY 규칙 한 줄을 두 줄로 교체 — 기존 지시("먼저 명시하라")는 유지하고 `TODAY-MENTION RESTRAINT` 억제 규칙을 그 아래에 추가 |
| `src/app/api/ask/route.test.ts` | `describe('buildAskSystem — TODAY-MENTION RESTRAINT (BRIEF-087)')` 신규 1건 — 3모드(me/person/general) 모두 시스템 프롬프트에 해당 문구 포함 확인 |
| `scripts/verify/prompt-assembly.mjs` | BRIEF-084 체크 아래에 동일 문구(`TODAY-MENTION RESTRAINT`) 존재 체크 3건(모드별) 추가 |

## 2. 구현 요지

교체 전(084):
```
When the user asks what today is, today's energy, or today's saju, first state today's pillars plainly by name (lead with the day pillar / 일진), then interpret. Never answer only in abstract element talk.
```

교체 후(087):
```
When the user asks what today is, today's energy, or today's saju, state today's pillars plainly by name (lead with the day pillar / 일진), then interpret. Never answer only in abstract element talk.
TODAY-MENTION RESTRAINT — same discipline as identity mentions: do NOT re-announce today's pillars in answer after answer. Name them when the user asks about today/timing or when a specific day genuinely drives the answer — once per day of conversation is plenty. Otherwise leave the date out or refer to it implicitly ("with today's restless energy"), and never open consecutive answers with the same "오늘은 ~일이라" formula.
```

지시서 정본 그대로 삽입했다(재창작 없음). `first`만 삭제되고("먼저 명시하라"가 아니라 "명시하라"로) 나머지 첫 줄은 원문 그대로다 — 문제가 "그 순간에 말하는 것" 자체가 아니라 "매 답변마다 반복하는 것"이므로, 최초 지시는 유지하고 반복 억제만 추가했다. TODAY 데이터 라인(`todayLine`)과 `getDailyPillars`, 다른 규칙 블록(TIMING & PREDICTION, IDENTITY_MENTIONS_RULES, 규칙 8)은 손대지 않았다.

## 3. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` — 270개 전체 통과 (기존 269 + 신규 1, 084 테스트 포함 무회귀)
- [x] `npm run build` 성공
- [x] `npx tsx scripts/verify/prompt-assembly.mjs` — ALL PASS (신규 3건 포함)
- [x] main push 완료 (커밋 해시는 §5)
- [ ] YS 실기기 확인 — 같은 스레드에서 서너 질문 연속 시 일진 언급이 1회 수준으로 줄고, 오늘을 물으면 여전히 간지가 나오는지 (환경상 제가 직접 확인 불가, YS 게이트로 넘김)

## 4. 정직 보고

이 환경에서는 실제 LLM 응답을 받아 "몇 번째 답변부터 일진 언급이 줄어드는지"를 확인할 수 없다 — 프롬프트에 억제 규칙 문구가 정확히 실려 들어가는지(코드/테스트/verify 스크립트)만 확인했고, 모델이 그 지시를 실제로 얼마나 잘 따르는지는 지시서의 완료 기준 5번대로 YS의 실사용 확인이 필요하다.

## 5. 커밋 해시

- 저장소: https://github.com/Farerworks/attune
- 커밋 해시: `8c3efc0`
