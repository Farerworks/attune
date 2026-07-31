# BRIEF-090 — Ask 일진 재공지 상태 기반 차단 + 아키타입 한국어명 주입

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `src/app/api/ask/route.ts` | ① `hasTodayIntroduced(history, names)` 신규 export 순수 함수 + `todayNameCandidates(dayPillar)` 내부 헬퍼(pillarLabel/friendlyPillarName 산출물에서 이름 후보 4종 조립) ② `buildAskSystem`에 옵셔널 `todayIntroduced?: boolean` 파라미터 추가, TODAY 명명 규칙 블록을 상태별 조건 분기로 교체 ③ `chartBlock`의 ME/THEM ARCHETYPE 줄에 `(KO: ...)` 병기 + KOREAN VOICE 인근에 아키타입 한국어명 사용 규칙 추가 ④ POST 핸들러에서 오늘 일주 이름 후보를 조립해 `hasTodayIntroduced`로 판정 후 `buildAskSystem`에 전달 |
| `src/app/api/ask/route.test.ts` | `hasTodayIntroduced` 단위 4건, `buildAskSystem` todayIntroduced 분기 3건(true/false/미전달), 아키타입 KO 병기 3건 |
| `scripts/verify/prompt-assembly.mjs` | 동일 취지 체크 신규 12건. 기존 084/087/088 체크는 무변경(기존 호출부가 `todayIntroduced`를 넘기지 않아 FIRST-mention 분기를 그대로 타므로 결과 동일) |

## 2. 구현 요지 — 분기 전/후 실제 프롬프트 발췌

`todayIntroduced=false` (기본값, 첫 소개 전):
```
Use ONLY the names given in TODAY — never derive or translate day names yourself.
FIRST mention of today in a conversation: Korean → 「오늘은 임인(壬寅)일 — '물 호랑이' 날이에요」 style (formal name + friendly gloss, once). English → "a Water Tiger day" (short name only; ganzhi optional in parentheses).
AFTER that: use only the short handle, woven in ("물 호랑이 기운이…" / "with this Water Tiger energy…") — never repeat the full announcement.
TODAY-MENTION RESTRAINT — ...
If today was already named earlier in this conversation, never cold-open with the announcement again — ...
```

`todayIntroduced=true` (서버가 history에서 이미 소개됐음을 판정):
```
Use ONLY the names given in TODAY — never derive or translate day names yourself.
TODAY ALREADY INTRODUCED earlier in this conversation. Do NOT announce or restate today's day name in any answer opening — never begin with "오늘은" + the day name in any form (formal, friendly, or element words). If the day genuinely matters mid-answer, weave the short handle once ("물 호랑이 기운이…"); otherwise leave it out entirely.
TODAY-MENTION RESTRAINT — ...
If today was already named earlier in this conversation, never cold-open with the announcement again — ...
```

아키타입 KO 병기 실출력(1990-06-15 남 예시):
```
ME ARCHETYPE: The Fine Edge (KO: 예리한 날)
```

`hasTodayIntroduced`는 assistant 역할 메시지에서만 이름 후보(오늘 일주 한자 조합·한글 독음 조합·친근 핸들 KO/EN)를 검사한다 — 087/088의 프롬프트 "설득"이 Flash 모델에서 3답 연속 실패한 것을 서버가 이력을 직접 검사해 지시를 갈아끼우는 방식으로 대체했다. `todayNameCandidates`는 새 간지 계산을 하지 않고 기존 `pillarLabel`/`friendlyPillarName`의 산출 문자열에서 조립한다(`pillarLabel`이 반환하는 `"丁酉(정유)"`를 괄호로 파싱해 한자/독음을 분리).

## 3. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` — 291개 전체 통과 (기존 281 + 신규 10, 무회귀)
- [x] `npm run build` 성공
- [x] `npx tsx scripts/verify/prompt-assembly.mjs` — ALL PASS (신규 12건 포함, 기존 084/087/088 체크 문구 변경 없이 그대로 통과)
- [x] main push 완료 (커밋 해시는 §4)
- [ ] YS 실사용 — 같은 스레드 연속 질문에서 두 번째 답부터 "오늘은…" 서두가 사라졌는지(최우선), KO 답변에 영어 아키타입명 혼입이 사라졌는지 (환경상 제가 직접 확인 불가, YS 게이트로 넘김)

## 4. 정직 보고

- 후처리(응답 텍스트 가공)는 지시대로 도입하지 않았다 — 이번 변경은 프롬프트에 전달되는 상태 분기까지이며, 모델이 그 지시를 실제로 지키는지는 이 환경에서 검증 불가하다.
- `hasTodayIntroduced`의 판정은 "이전 assistant 답변 텍스트에 오늘 이름 후보 문자열이 포함되는가"라는 문자열 매칭이다 — 만약 모델이 088의 FIRST-mention 지시를 어기고 이름을 전혀 다른 표현(예: 오타, 다른 언어 혼용)으로 언급했다면 서버가 "아직 소개 안 됨"으로 오판할 수 있다. 이는 087/088에서 확인된 "모델이 088 지시를 잘 안 지킨다"는 문제 자체를 서버가 우회하는 설계이므로 구조적으로 남는 리스크이며, YS 실사용에서 그런 사례가 보이면 이름 후보 매칭 범위를 넓히는 후속이 필요할 수 있다.
- `todayNameCandidates`가 `pillarLabel` 출력 문자열을 정규식으로 파싱해 한글 독음을 뽑는 방식은 "재계산 금지" 지시를 지키기 위한 선택이었지만, `pillarLabel`의 출력 포맷(`"한자(독음)"`)이 바뀌면 이 파싱도 같이 깨진다는 결합이 생겼다 — 향후 `pillarLabel` 포맷을 바꿀 일이 있다면 이 지점을 함께 확인해야 한다.

## 5. 커밋 해시

- 저장소: https://github.com/Farerworks/attune
- 커밋 해시: `57fd564`
