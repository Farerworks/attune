# BRIEF-100B-FIX3 — 완성물 요청의 분류·단위·출력 형태

## 0. 맥락 (자기완결)

Attune(github.com/Farerworks/attune, 랩 PC `~/projects/attune`). 시작 전 `git pull` — 기준 = 현 origin/main **`7525ecc`**(테스트 674).

Ask 라우트에는 사용자가 **보낼 문장/메시지를 써 달라고 요청한 턴**을 감지해 출력 형태를 강제하는 경로가 있다(`askMode === 'strict_script'`). 실사용 관측에서 이 경로가 세 군데서 새는 것이 **코드 프로브로 확정**됐다(§4.5).

1. **단위를 파싱만 하고 쓰지 않는다.** `parseScriptRequest`는 `{count, unit}`를 정확히 뽑지만 검증기는 **줄 수만** 센다. `문장 2개`를 요청했을 때 **2줄 × 각 2문장(=총 4문장)**이 위반 없이 통과한다.
2. **개수가 없으면 아예 분류되지 않는다.** `보낼 메시지 좀 써줘`는 `askMode = null`이 되어 기본 3단 카드가 나온다. 사용자는 복붙할 문장을 원했는데 해설 카드를 받는다.
3. **분류가 안 되니 출력 계약도 없다.** 카드·앞뒤 안내문·뒤따르는 질문이 그대로 붙는다.

**이 판은 이 세 가지만 닫는다.** 그 외 관측된 결함(차트 출처·미확인 상태 서술 등)은 **이 판의 범위가 아니다**(§4).

## 0.5 시작 전 1커밋 — 이 브리프 원문 보관

전달받은 이 파일을 바이트 그대로 `docs/briefs/BRIEF-100B-FIX3.md`로 저장, 단독 커밋+push(`BRIEF-100B-FIX3: 브리프 원문 보관`). 저장 직후 `sha256sum`·`wc -c`를 발행 정본과 대조해 일치를 확인한 뒤에만 완료로 보고한다.

---

## 1. 변경 사양

### 1.1 축 A — `문장` 요청을 실제 문장 단위로 판정한다

**공유 검출기 재사용**: `src/lib/hiddenTruth.ts`의 `splitSentences`에 **`export` 키워드만 붙인다.** 정규식·로직은 한 글자도 바꾸지 않는다. `ask/route.ts`는 이 함수를 import해서 쓴다. **문장 분할 규칙을 두 벌로 만들지 말 것** — 직전 판(FIX2)이 규칙 복제를 막으려고 이 모듈을 만든 것이다.

`validateAskAnswer`의 `strict_script` + `labels === null` + `request !== null` 구간에 **줄당 문장 수 검사**를 추가한다.

| `request.unit` | 규칙 | 위반 시 |
|---|---|---|
| `'sentence'` | 각 줄이 **정확히 1문장** | `{ type:'script_contract', detail:'unit' }` |
| `'message'` | 각 줄이 **최대 2문장** | 같음 |

- 기존 `detail:'count'`(줄 수) 검사는 **그대로 둔다.** 새 검사는 그와 **독립**이며, 둘 다 위반이면 둘 다 보고한다.
- 한 줄이라도 어기면 위반 1건(줄마다 누적하지 않는다).

**최종 처분은 soft 플래그만.** 문장이 넘치는 줄을 자르면 사용자가 보낼 내용이 사라지므로 **안전한 자동 수정이 없다.** 이 검사의 실질 효과는 **탐지되면 교정 재생성(correction warning)이 실제로 발동한다**는 데 있다 — 지금은 탐지 자체가 안 돼서 재생성 기회조차 없다.

교정 경고 문구(신규, `detail:'unit'`):
```
⚠ SCRIPT UNIT VIOLATION — The user asked for a count of sentences/messages, not lines. When the count is for sentences, each line must be exactly one sentence; when it is for messages, at most two short sentences per line. Regenerate respecting that unit.
```

**알려진 한계(반드시 보고서에 적을 것)**: `splitSentences`는 종결 부호 뒤 공백을 기준으로 나눈다. 따라서 `오랜만이야 잘 지내`(부호 없음)는 **1문장으로 센다.** 이는 **관대한 쪽으로 어긋나는 것**(통과시킴)이므로 그대로 둔다. **공백·어미로 문장을 추정하는 보강을 하지 말 것** — 과탐지가 훨씬 나쁘다.

### 1.2 축 B — 개수 없는 완성물 요청을 분류한다

`AskMode`에 값 `'completion'`을 추가한다.

**정의**: 사용자가 **보낼 것을 써 달라고** 했지만 **개수를 말하지 않은** 턴.

**감지 조건 — 아래를 전부 만족할 때만 발동한다.**
1. `COMPLETION_PATTERNS` 중 하나가 매치되고,
2. `COMPLETION_EXCLUSIONS` 중 어느 것도 매치되지 않는다.

두 목록 모두 `STRICT_SCRIPT_PATTERNS`와 같이 **export한 테이블**로 만든다(테스트가 함수의 종합 판정이 아니라 패턴 목록 자체를 검증할 수 있어야 한다 — BRIEF-100B §3의 방식).

```
COMPLETION_OBJECT = (?:메[시세][지제]|문자|답장|멘트|문장)
COMPLETION_VERB   = (?:써|적어|만들어|뽑아)

COMPLETION_PATTERNS
  1) `${COMPLETION_OBJECT}[^\n]{0,10}?${COMPLETION_VERB}`
  2) `뭐라고[^\n]{0,10}?(?:보낼지|답할지|말할지|쓸지)[^\n]{0,10}?${COMPLETION_VERB}`
  3) /\b(?:write|draft|give me)\b[^\n]{0,20}\b(?:message|text|reply|line)s?\b/i

COMPLETION_EXCLUSIONS
  1) /(?:안|못)\s*(?:써|적어|만들어|뽑아)/        // "답장 안 써"
  2) /(?:써|적어|만들어|뽑아)\S*\s*(?:할까|말까|될까)/  // "답장 써야 할까?"
```

**`detectAskMode`의 우선순위(이 순서로 고정)**: `strict_script` → `verdict_probe` → `completion` → `null`.
- 개수가 있으면 언제나 `strict_script`가 이긴다(개수 강제를 잃지 않기 위해).
- `verdict_probe`가 `completion`보다 앞선다. 실제로 겹치는 입력은 없지만(성격 질문에는 쓰기 동사가 없다) 순서를 결정론으로 못박는다.

**개수를 추론하지 말 것.** 사용자가 개수를 말하지 않았으므로 `completion`에서는 **개수 검사를 하지 않는다.** `parseScriptRequest`는 이 모드에서 호출하지 않는다.

**오타 허용의 범위 — 여기 한 곳뿐이다.** `메[시세][지제]`는 실사용에서 관측된 `메시제` 오타를 덮기 위한 것이다. **`STRICT_SCRIPT_PATTERNS`는 손대지 말 것** — 그쪽은 개수 파싱과 묶여 있어 문자 클래스를 넓히면 개수 오독 위험이 생긴다. 그 결과 `보낼 메시제 2개만 써줘`는 여전히 `strict_script`로는 안 잡히고 `completion`으로 떨어진다(복붙 가능한 출력은 나오되 개수 강제는 없음). **이는 부분 해소이며, 보고서에 그렇게 적는다.**

**의도적으로 제외하는 입력**(음성 테스트로 고정): `뭐라고 답할까?` · `그럼 뭐 하자고 할까?` · `어제 연락했어` · `답장 왔어`. 쓰기 동사가 없으므로 발동하지 않아야 한다. **과발동은 미발동보다 나쁘다** — 상담 턴에서 카드를 잃는다.

### 1.3 축 C — `completion`의 출력 계약

**프롬프트 블록**(신규 `COMPLETION_BLOCK`, `askMode === 'completion'`일 때만 추가). 아래 문자열을 **그대로** 쓴다:

```
COMPLETION REQUEST — the user asked you to write something they can send, without giving a count. Contract for THIS answer: respond in shape 2 ({"text": ...}) — no parts, no labels, no headings. Give only the sendable text itself, ready to copy as-is. Nothing before it, nothing after it: no leading explanation, no framing sentence, no closing remark, no commentary on why it works. One option by default; if two genuinely different directions are worth showing, put each on its own line. No numbering, no bullets, no labels, no "/" separators between alternatives. No chart talk, no archetype, no day-pillar/today talk, no followUp. This contract outranks every other block for this turn, including TODAY first-mention duty — skip it here.
```

**검증**(`validateAskAnswer`, `askMode === 'completion'`):

| 상황 | 위반 | 최종 처분 |
|---|---|---|
| `parts`가 있다(3단 카드) | `{ type:'completion_parts' }` | `downgradeToText` (기존 함수 재사용) |
| `followUp`이 있다 | `{ type:'completion_contract', detail:'followup' }` | `stripFollowUp` (기존 함수 재사용) |
| 번호·불릿·`LABEL:`·`/` 구분자 | `{ type:'completion_contract', detail:'format' }` | soft 플래그 |

- **개수 검사 없음.**
- `stageOf`는 두 신규 타입 모두 `'completion'` 스테이지로 매핑한다.
- 교정 경고 문구(신규):
```
⚠ COMPLETION CONTRACT VIOLATION — The user asked for something ready to send. Respond in shape 2 ({"text": ...}) with no parts/labels. Regenerate in that shape.
⚠ COMPLETION FOLLOWUP VIOLATION — A ready-to-send answer must not include a followUp. Regenerate without one.
⚠ COMPLETION FORMAT VIOLATION — No numbering, bullets, labels, or "/" separators. Regenerate as plain sendable lines only.
```

**정직하게 적을 한계**: "앞뒤 안내문 없음"은 **코드로 판정할 수 없다**(정상 문장과 구분할 기계적 기준이 없다). 형태(카드·followUp·마커)만 코드가 막고, 안내문 억제는 프롬프트 계약이다. 따라서 이 축의 **행동 검증은 배포 후 실사용 RECHECK가 유일한 게이트**다. 보고서에 이 문장을 그대로 남긴다.

---

## 2. 테스트 계약 (양성·음성 쌍)

### 2.1 축 A
| | 입력 / 답변 | 기대 |
|---|---|---|
| 음성 | `지금 보낼 문장 2개만 써줘` + `"오랜만이야! 잘 지내?\n요즘 바빴지. 미안해."` | `script_contract/unit` **검출**(현재는 `[]`로 통과 — 이 판의 핵심 회귀) |
| 양성 | 같은 요청 + 2줄 각 1문장 | 위반 없음 |
| 양성 | `보낼 메시지 2개만 써줘` + 2줄 각 2문장 | 위반 없음(`unit:'message'`는 2문장까지 허용) |
| 음성 | `보낼 메시지 2개만 써줘` + 2줄 중 한 줄이 3문장 | `unit` 검출 |
| 양성 | 줄 수도 틀리고 문장 수도 틀림 | `count`와 `unit` **둘 다** 보고 |
| 양성 | `unit` 위반의 최종 처분 | **본문 무변경** + soft 플래그 1개(자르지 않는다) |
| 양성 | `오랜만이야 잘 지내`(부호 없음) 1줄, `문장 1개` 요청 | 위반 없음(알려진 관대함 — 고정해 둔다) |

### 2.2 축 B
| | 입력 | 기대 `detectAskMode` |
|---|---|---|
| 양성 | `보낼 메시지 좀 써줘` · `답장 좀 써줘` · `메시지 써줘` · `멘트 좀 뽑아줘` · `보낼 문장 써줘` · `뭐라고 보낼지 써줘` · `보낼 메시제 좀 써줘` | `completion` |
| 양성 | `지금 보낼 문장 2개만 써줘` · `보낼 메시지 2개만 써줘` | `strict_script`(개수가 이긴다 — 회귀 금지) |
| 양성 | `지현이는 원래 그런 성격이야?` | `verdict_probe`(회귀 금지) |
| **음성** | `뭐라고 답할까?` · `그럼 뭐 하자고 할까?` · `어제 연락했어` · `답장 왔어` · `답장 안 써` · `답장 써야 할까?` | `null` |
| 양성 | `COMPLETION_PATTERNS`·`COMPLETION_EXCLUSIONS` 목록 자체 | export되어 테이블 단위로 단언 가능 |

### 2.3 축 C
| | 상황 | 기대 |
|---|---|---|
| 음성 | `completion` + `parts` 3개 | `completion_parts` → 최종 처분에서 **shape 2로 강등** |
| 음성 | `completion` + `followUp` 있음 | `completion_contract/followup` → **followUp 제거** |
| 음성 | `completion` + `1. `·`- `·`A: `·`가/나` | `completion_contract/format` → soft |
| 양성 | `completion` + 안내문 없는 1줄 텍스트 | 위반 없음 |
| 양성 | `completion`에서 개수 | **어떤 개수 위반도 보고하지 않는다**(`script_contract/count` 미발생) |
| 양성 | `buildAskSystem(..., askMode:'completion')` | 시스템 프롬프트에 `COMPLETION_BLOCK` **정확히 1회** 포함, `STRICT_SCRIPT_BLOCK` 미포함 |
| 양성 | `askMode: null` | `COMPLETION_BLOCK` 미포함 |

### 2.4 회귀
| | 항목 | 기대 |
|---|---|---|
| 양성 | 기존 674 테스트 | **전부 통과** |
| 양성 | `splitSentences` export 추가 | F5(`findHiddenTruthFraming`) 동작 무변경 — 기존 hiddenTruth 테스트 전건 통과 |
| 양성 | 호출 예산 | 1차 호출 + 최대 1회 추가 호출 **불변**(새 재시도 경로 없음) |
| 양성 | 502 반환 지점·status·body | 불변 |
| 양성 | F5·재소개·verdict 판정 | 무변경 |

---

## 3. 완료 기준
- [ ] `npx tsc --noEmit` / `npx vitest run` 전체(수치 보고) / `npm run build`
- [ ] 신규 테스트 수를 숫자로 보고
- [ ] `docs/reports/BRIEF-100B-FIX3.md` 커밋+push — 담을 것: ①보관 커밋 해시 ②코드 커밋 해시 ③테스트 수치(전체·신규) ④**`splitSentences` export가 순수 추가임을 보이는 근거** ⑤`completion` 우선순위가 `strict_script`를 가리지 않음을 어떤 테스트로 고정했는지 ⑥**§1.1의 「부호 없는 문장은 1문장으로 센다」 한계** ⑦**§1.2의 「`메시제`+개수는 여전히 strict_script 미검출 = 부분 해소」** ⑧**§1.3의 「앞뒤 안내문 억제는 코드 검증 불가, 프롬프트 계약」**. 보고서 자신의 해시는 넣지 않는다.
- [ ] 완료 보고(채팅)에 해시 3종 + `git diff --name-only` 결과 제출

## 4. 금지사항
- **허용 경로 한정**: `docs/briefs/BRIEF-100B-FIX3.md` · `src/lib/hiddenTruth.ts`(**`export` 키워드 1개 추가만**) · `src/lib/hiddenTruth.test.ts` · `src/app/api/ask/route.ts` · `src/app/api/ask/route.test.ts` · `docs/reports/BRIEF-100B-FIX3.md`. 그 외 전부 무접촉 — `briefing.ts`·`briefing/route.ts`·클라이언트·`llm.ts`·`store.ts`·`askQuota.ts`·`askPrompts.ts`·환경변수·package.json/lock.
- **`STRICT_SCRIPT_PATTERNS`를 수정하지 말 것**(§1.2 근거). 개수 있는 요청의 기존 동작은 한 글자도 바뀌면 안 된다.
- **F5 검출 규칙(주어·부정어·`findHiddenTruthFraming`)을 바꾸지 말 것.** `splitSentences`에 `export`를 붙이는 것 외에 `hiddenTruth.ts`를 건드리지 않는다.
- **차트 출처·미확인 상태 서술(F4)은 이 판의 범위가 아니다.** 관련 프롬프트·금칙어·검증기를 추가하지 말 것 — 별도 판에서 다룬다.
- **새 LLM 호출·재시도 경로 추가 금지.** 교정 시도는 기존의 공유 1회를 그대로 쓴다.
- **개수가 없는 요청에 개수를 추론해 강제하지 말 것.**
- 문장 분할을 공백·어미로 보강하지 말 것(§1.1 한계 항).

## 4.5 근거 (저장소 실측 — `7525ecc` 기준, 프로브 실행 결과)

```
"지금 보낼 문장 2개만 써줘"   => mode:strict_script  req:{"count":2,"unit":"sentence"}
"보낼 메시지 2개만 써줘"      => mode:strict_script  req:{"count":2,"unit":"message"}
"보낼 메시지 좀 써줘"         => mode:null           req:null
"보낼 메시제 좀 써줘"         => mode:null           req:null
"보낼 메시제 2개만 써줘"      => mode:null           req:null
"답장 좀 써줘" / "메시지 써줘" / "멘트 좀 뽑아줘" / "뭐라고 보낼지 써줘"  => 전부 mode:null
"지현이는 원래 그런 성격이야?" => mode:verdict_probe

validateAskAnswer( {text:"오랜만이야! 잘 지내?\n요즘 바빴지. 미안해."}, askMode:strict_script, "문장 2개" )
  => []            ← 4문장인데 위반 없음. 축 A가 닫으려는 구멍.
validateAskAnswer( {text:"가. 나. 다. 라."}, 같은 ctx )
  => [{"type":"script_contract","detail":"count"}]   ← 줄 수만 세고 있다는 증거

splitSentences: "오랜만이야! 잘 지내?"=2 / "잘 지냈어? 언제 한번 보자."=2 / "오랜만이야 잘 지내"=1 / "안녕!잘가?"=1
```

- `src/app/api/ask/route.ts:702~712` — `strict_script` 검증부. `splitNonEmptyLines(answer.text)` **줄 수만** 비교하고 `request.unit`을 쓰지 않는다.
- `src/app/api/ask/route.ts:211~215` — `detectAskMode`. 주석에 보수성이 **설계 의도**로 명시돼 있다(`a false trigger here is worse than missing one`). 이 판은 그 의도를 유지한 채, **쓰기 동사를 필수로 요구하는 별도 모드**를 추가하는 방식으로만 넓힌다.
- `src/lib/hiddenTruth.ts` — `splitSentences`가 **비-export**. 같은 규칙을 ask 라우트에서 쓰려면 export가 필요하다.
- `src/app/api/ask/route.ts:750~772` — `downgradeToText`·`stripFollowUp`·`truncateScriptLines`. 앞 둘을 `completion` 처분에 재사용한다.
- `src/app/api/ask/route.ts:1076~1129` — 위반 탐지 → 교정 경고 1회 재생성 → 재검증 → 최종 처분. **탐지되지 않으면 재생성 기회도 없다**는 것이 축 A의 실효성 근거다.

## 5. 배포 후 (참고 — farr02 작업 아님)

merge·배포 뒤 **새 인물·새 스레드**로 정식 RECHECK를 수행한다(`RECHECK-100B-FIX.md`). 재사용 금지 명단(은우·시우·테스트A·지현)을 지킨다. 질문지 §0-0의 기준 배포 해시는 본부가 이 판의 해시로 갱신한다. 그 회차가 100B 종결의 게이트다.
