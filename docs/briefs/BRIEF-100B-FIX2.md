# BRIEF-100B-FIX2 — Briefing `starters`에도 F5 방향 판정 적용

## 0. 맥락 (자기완결)
Attune(github.com/Farerworks/attune, 랩 PC `~/projects/attune`). 시작 전 `git pull` — 기준 = 현 origin/main `b8d7313`(테스트 661).

`BRIEF-100B-FIX`(직전 판)가 Ask 응답에 **F5 — 숨은 진실 프레이밍 억제**를 넣었다. 답변 본문·`parts`·`followUp`을 문장 단위로 검사해, `진짜 마음`·`진짜 이유` 같은 주어가 있고 **같은 문장에 부정·한계어가 없을 때만** 위반으로 잡는 **방향 판정** 방식이다. 어휘 차단이 아니므로 `진짜 마음을 한 번의 반응으로 알 수는 없어요`는 통과한다.

**그런데 화면의 추천 칩은 `followUp`이 아니다.** 실측: `src/app/(tabs)/ask/page.tsx`는 `currentChip.briefing?.starters`가 3개면 그것을 칩으로 쓰고, 없을 때만 정적 풀(`askPrompts.getQuickPrompts`)로 떨어진다. 즉 **칩은 Briefing이 만드는 `starters`**다. 실제 SMOKE에서 `은우가 요즘 연락을 줄인 진짜 이유는 뭘까?`가 칩으로 떴던 것도 이 경로다.

직전 판은 허용 경로가 Ask 라우트로 한정돼 있어 이 경로를 덮지 못했다. **이 판은 그 한 곳만 닫는다.**

## 0.5 시작 전 1커밋 — 이 브리프 원문 보관
전달받은 이 파일을 바이트 그대로 `docs/briefs/BRIEF-100B-FIX2.md`로 저장, 단독 커밋+push(`BRIEF-100B-FIX2: 브리프 원문 보관`). 저장 직후 `sha256sum`·`wc -c`를 발행 정본과 대조해 일치를 확인한 뒤 완료로 보고한다.

## 1. 변경 사양

### 1.1 검출기를 공유 모듈로 추출한다
현재 F5 검출기(주어 정규식 + 부정·한계어 정규식 + 문장 분할 + 판정 함수)는 `src/app/api/ask/route.ts` 안에만 있다. `src/lib/briefing.ts`는 **`src/app`을 import할 수 없다**(`coreBoundary.test.ts`가 감시하는 경계). 따라서 두 곳이 같은 규칙을 쓰려면 공유 모듈이 필요하다.

- **`src/lib/hiddenTruth.ts`를 신설**하고 검출기를 **그대로 옮긴다**(정규식·판정 로직 변경 금지 — 순수 이동).
- `ask/route.ts`는 자기 안의 정의를 지우고 이 모듈을 import한다. **동작은 한 글자도 달라지지 않아야 한다.**
- **규칙을 두 벌로 복제하지 말 것.** 이 저장소에는 이미 금칙어 목록이 `briefing.ts`와 `ask/route.ts`에 갈라져 있고, 같은 실수를 반복하지 않기 위한 조치다.

### 1.2 `starters`에 F5를 적용한다
Briefing 응답의 `starters` 3개 각각에 §1.1의 방향 판정을 적용한다.

**위반이 하나라도 있으면 — `starters`를 응답에서 통째로 뺀다.**
- `starters`는 스키마상 `optional()`이므로 생략이 정상 값이다.
- 클라이언트는 `starters`가 3개가 아니면 **정적 풀로 자동 폴백**한다(`ask/page.tsx` 실측). 즉 사용자는 일반 칩을 보게 되고, 화면이 깨지지 않는다.
- **위반 칩만 골라 빼지 않는다** — 2개가 남으면 어차피 폴백이고, 부분 제거는 의미 없이 분기만 늘린다.

**하지 말 것**: 재생성 요청, 새 LLM 호출, 502 반환, `containsBannedPhrases`에 합치기(그 경로는 재시도→502로 이어져 칩 문구 하나로 리딩 전체를 실패시킨다).

### 1.3 관측
`starters`가 제거되면 서버 로그에 한 줄 남긴다. 형식은 기존 `[briefing]` 로그와 같은 계열로 하되 **PII·문구 원문을 넣지 않는다** — 몇 개가 걸렸는지 개수만.

## 2. 테스트 계약 (양성·음성 쌍)

### 2.1 추출 무회귀 (§1.1)
| | 항목 | 기대 |
|---|---|---|
| 양성 | 기존 661 테스트 | **전부 통과** — 추출은 순수 이동이므로 Ask 쪽 F5 동작이 변하지 않는다 |
| 양성 | 공유 모듈 직접 테스트 | 주어 있음+부정어 없음 → 위반 / 주어 있음+부정어 있음 → 통과 / 주어 없음 → 통과 |

### 2.2 `starters` 판정 (§1.2)
| | starters 내용 | 기대 |
|---|---|---|
| 음성 | `은우가 연락을 줄인 진짜 이유는 뭘까?` 포함 | `starters` **전체 제거**(응답에 키 없음) |
| 음성 | 3개 중 1개만 위반 | 마찬가지로 **전체 제거**(부분 제거 아님) |
| **양성** | `진짜 마음을 한 번에 알 수는 없겠지?`처럼 **부정·한계형** 포함 | **제거하지 않음** — 3개 그대로 유지 |
| 양성 | 위반 없는 정상 3개 | 그대로 유지 |
| 양성 | 위반 발생 시 | **LLM 호출 횟수 불변**, HTTP status·응답 body의 나머지 필드 불변, 502 아님 |
| 양성 | 클라이언트 | `starters` 부재 시 정적 풀로 폴백(기존 동작 — 회귀 없음) |

### 2.3 회귀
| | 항목 | 기대 |
|---|---|---|
| 양성 | `containsBannedPhrases` | 기존 금칙어 판정 **무변경**(F5를 여기에 합치지 않았음을 확인) |
| 양성 | Briefing 502 경로 | 기존 반환 지점·status·body 불변, `[briefing]` 구조화 로그 무회귀 |

## 3. 완료 기준
- [ ] `npx tsc --noEmit` / `npx vitest run` 전체(수치 보고) / `npm run build`
- [ ] 신규 테스트 수를 숫자로 보고
- [ ] `docs/reports/BRIEF-100B-FIX2.md` 커밋+push — 담을 것: ①보관 커밋 해시 ②코드 커밋 해시 ③테스트 수치(전체·신규) ④**추출이 순수 이동임을 보이는 근거**(정규식·판정 로직이 그대로임) ⑤`starters` 제거 시 호출 횟수·status가 불변임을 어떤 테스트로 고정했는지. 보고서 자신의 해시는 넣지 않는다.
- [ ] 완료 보고(채팅)에 해시 3종 + `git diff --name-only` 결과 제출

## 4. 금지사항
- **허용 경로 한정**: `docs/briefs/BRIEF-100B-FIX2.md` · `src/lib/hiddenTruth.ts`(신규) · `src/lib/hiddenTruth.test.ts`(신규) · `src/lib/briefing.ts` · `src/lib/briefing.test.ts` · `src/app/api/briefing/route.ts`(§1.2·§1.3 배선이 필요한 경우에 한함) · `src/app/api/ask/route.ts`(**§1.1의 import 교체만**) · `docs/reports/BRIEF-100B-FIX2.md`. 그 외 전부 무접촉 — 클라이언트·`llm.ts`·`store.ts`·`askQuota.ts`·`askPrompts.ts`·환경변수·package.json/lock.
- **`ask/route.ts`에서 §1.1의 import 교체 외에 아무것도 바꾸지 말 것.** 직전 판에서 검수 통과한 F1~F5 로직·검증기·최종 처분·프롬프트를 다시 손대지 않는다.
- **검출 규칙 자체를 바꾸지 말 것** — 주어 목록·부정어 목록·문장 분할 방식 전부 그대로 옮긴다. 확장은 별건.
- **새 LLM 호출·재시도 경로 추가 금지**, **Briefing의 502 반환 지점·status·body 변경 금지.**
- **`containsBannedPhrases`에 F5를 합치지 말 것**(§1.2 근거).
- 정적 칩 풀(`askPrompts.PERSON_KO` 등)과 클라이언트 폴백 로직을 바꾸지 말 것.

## 4.5 근거 (저장소 실측 — `b8d7313` 기준)
- `src/app/(tabs)/ask/page.tsx:445~450` — `currentChip.briefing?.starters`가 **length 3이면 칩으로 사용**, 아니면 `getQuickPrompts` 정적 풀로 폴백. → **칩의 출처는 `starters`이고, 부재 시 폴백은 이미 구현돼 있다.**
- `src/lib/briefing.ts:53` — `starters: z.array(z.string().min(1)).length(3).optional()` → **생략이 스키마상 정상 값.**
- `src/lib/briefing.ts:303` — starters 생성 규칙(칩 크기 3문항). `:335` — `...(briefing.starters ?? [])`가 이미 `containsBannedPhrases`의 검사 대상에 포함돼 있다. **접합점은 있으나 그 경로는 재시도→502이므로 §1.2에서 쓰지 않는다.**
- `src/app/api/ask/route.ts` — F5 검출기(`HIDDEN_TRUTH_SUBJECT`·`HIDDEN_TRUTH_NEGATION_NEARBY`·`splitSentences`·`findHiddenTruthFraming`)가 이 파일 안에만 있다.
- `src/lib/coreBoundary.test.ts` — `src/lib`이 앱 코드를 import하지 못하도록 감시한다. → **공유 모듈이 필요한 이유.**

## 5. 배포 후 (참고 — farr02 작업 아님)
직전 판(`b8d7313`)은 이미 배포돼 있다. 이 판까지 merge된 뒤 **한 번에** 배포 해시를 확인하고, 그 배포에서 **새 인물·새 스레드**로 RECHECK를 수행한다(`RECHECK-100B-FIX.md`). 그 결과가 100B 종결의 게이트다.
