# BRIEF-106-FIX v1.3 — 교차언어 **요청**에서의 오탐 제거

> v1.0→v1.1: ①정규식 끝 `\b` 제거 ②「처분만 변경」 표현 정정 + 한계 기록 의무 ③502 두 분기 커버리지 표 ④변경 파일 4개 고정.
> **v1.1→v1.2: 명사형 언어 지시 추가.** v1.1의 패턴은 **이 브리프 자신의 대표 시나리오 E(`라일리한테 보낼 영어 메시지 두 개 써줘`)를 매칭하지 못했다** — `영어`+`로/으로`만 잡고 `영어`+`메시지`를 못 잡았다.
> **v1.2→v1.3: 언어명 없는 `번역`·`translate` 단독 패턴 삭제.** Attune에서 「Translate their mixed signals」·「그 사람의 침묵을 번역해줘」는 **언어 번역이 아니라 행동·침묵을 해석해 달라는 비유**다. 이걸 명시적 언어 요청으로 오인하면 **일반 관계 질문에서 언어 검사가 통째로 꺼져 최초 P0(언어 전환)가 되살아난다.** 최종 패턴 **5개**, **43개 입력(참 21·거짓 22) + 코퍼스 고유 질문 12개**로 실행 검증(§1.3).

## §0 맥락 (이 문서가 요구사항의 전부다)

- 대상: **Attune** — 폴더 `~/projects/attune`, 저장소 `github.com/Farerworks/attune`.
- **BRIEF-106과 같은 브랜치 `feat/106-language`에 이어서 작업한다.** 새 브랜치를 파지 말 것.

  ```bash
  git fetch origin
  git checkout feat/106-language && git pull --ff-only
  test "$(git rev-parse HEAD)" = "a4dc51196d55ae96f0c203e18fe9bf4fff44fc99" || { echo "STOP: HEAD 불일치"; exit 1; }
  echo "베이스 확인"
  ```
- **BRIEF-106 구현 자체는 문제없다.** 본부가 8항 전건 확인했고 회귀·테스트도 통과했다. **이 FIX는 본부 사양이 빠뜨린 경우 하나를 메우는 것이다.**

### 무엇이 문제인가

BRIEF-106 §2는 「예상 언어 = 질문의 언어」로 정했다. **사용자가 다른 언어로 된 결과물을 요구하는 경우를 빠뜨렸다.**

Attune의 핵심 기능이 「이 사람한테 보낼 메시지 써줘」이고, 상대가 다른 언어를 쓰는 건 표준 상황이다. 본부가 실제 탐지기로 측정한 값:

| 질문 | 답 | 예상언어 | 비율 | 현재 결과 |
|---|---|---|---|---|
| 「라일리한테 보낼 **영어** 메시지 써줘」 | 영어 메시지 | ko | **1.000** | **drift → 502** |
| 같은 요청, 한국어 설명+영어 메시지 혼합 | 혼합 카드 | ko | **0.722** | **drift → 502** |
| 영어 대화 중 「write it **in Korean**」 | 한국어 | en | **1.000** | **drift → 502** |

**사용자가 요구한 그대로 답했는데 502가 난다.** 교정 호출까지 태워서 모델이 원하던 영어 메시지를 한국어로 번역해버리거나 그대로 502를 맞는다. **재시도해도 같은 결과라 막다른 길이다.**

### 이 판이 바꾸는 것과 안 바꾸는 것 (정확히)

| | |
|---|---|
| **안 바꾼다** | 탐지 함수 `checkAnswerLanguage`·`detectMessageLang`·`detectExpectedLang`, **문턱 0.5**, leak 처분, 회귀 스크립트 |
| **바꾼다 ①** | **호출 게이트** — 명시적 언어 지시가 있는 질문은 POST에서 `expectedLang = undefined`로 두어 **언어 검사를 통째로 건너뛴다**(fail-open). 이건 처분 변경이 아니라 **검사 자체를 안 하는 것**이다 |
| **바꾼다 ②** | **최종 처분** — 보낼 글 모드에서 drift를 hard(502) → soft(플래그)로. 탐지 결과·유형은 그대로 |

---

## §1 수정 ① — 명시적 언어 지시가 있으면 **검사를 건너뛴다**

`route.ts`에 패턴 목록과 함수를 추가하고 **둘 다 `export`** 한다(`STRICT_SCRIPT_PATTERNS`가 이미 그렇게 돼 있다 — 테스트가 패턴을 직접 대조할 수 있게).

### 1.1 패턴 (5개, 바이트 그대로 옮길 것)

```
export const EXPLICIT_LANGUAGE_PATTERNS: RegExp[] = [
  // ① 한국어 부사형 — "영어로", "한국어로 번역해줘"
  /(영어|영문|한국어|한글|일본어|일어|중국어|중문|스페인어|프랑스어|독일어)\s*(?:로|으로)/,
  // ② 한국어 명사형 — "영어 메시지", "영문 답장" (v1.1이 빠뜨려 대표 시나리오 E가 안 잡혔던 자리)
  /(영어|영문|한국어|한글|일본어|일어|중국어|중문|스페인어|프랑스어|독일어)\s*(?:메시지|메세지|문장|답장|편지|문구|대본|버전|번역|텍스트|카톡)/,
  // ③ 영어 전치사형 — "in Korean", "to Korean", "into Japanese"
  /\b(?:in|into|to)\s+(English|Korean|Japanese|Chinese|Spanish|French|German)\b/i,
  // ④ 영어 명사형 — "an English message", "a Korean reply", "an English translation"
  /\b(English|Korean|Japanese|Chinese|Spanish|French|German)\s+(?:message|messages|reply|replies|text|note|letter|script|version|translation)\b/i,
  // ⑤ 혼합 표기 — "English로". 끝에 \b 금지(§1.2)
  /\b(English|Korean|Japanese|Chinese|Spanish|French|German)\s*(?:로|으로)/i,
];

export function hasExplicitLanguageRequest(question: string): boolean
```
→ 다섯 중 **하나라도** 매칭되면 `true`.

### ⚠ 언어명 없는 `번역`·`translate` 단독 패턴을 넣지 말 것

**v1.2에서 넣었다가 반려된 자리다.** Attune에서 이런 문장은 **언어 번역 요청이 아니다**:

- `Translate their mixed signals for me.`
- `Can you translate what their silence means?`
- `그 사람의 침묵을 번역해줘`

**행동·침묵·신호를 해석해 달라는 비유**다. 이걸 명시적 언어 요청으로 오인하면 `expectedLang = undefined`가 되어 **일반 관계 질문에서 언어 검사가 통째로 꺼지고, 이 판이 지키려던 최초 P0(언어 전환)가 그대로 되살아난다.**

**대상 언어가 없으면 명시적 언어 요청이 아니다.** 진짜 번역 요청은 언어명이 반드시 붙는다 — `한국어로 번역해줘`(①) · `Translate it to Korean`(③) · `Give me an English translation`(④). 전부 위 5개 패턴이 이미 잡는다.

### ⚠ 넉넉함의 범위 (v1.2 문구 정정)

v1.2는 「오탐의 대가는 검사 생략이라 싸다」고 썼다. **그 표현은 틀렸다.** 검사 생략은 **최초 P0의 fail-open**이지 값싼 플래그 누락이 아니다.

정확한 원칙은 이것이다:

> **언어명 또는 언어 방향 표지가 확인된 범위 안에서만 recall을 우선한다.** 표지가 없으면 명시적 언어 요청으로 보지 않는다. 이 게이트를 무제한 fail-open으로 넓히지 않는다.

**알려진 잔여 구멍**: 언어명 없이 상대의 언어를 암시하는 요청(예: 「라일리는 영어권이니까 그 스타일로 써줘」)은 이 게이트에 안 걸린다. **그건 그대로 둔다** — 더 넓히면 위 원칙을 어기는 것이고, 그런 요청은 대개 보낼 글 모드라 §2의 soft 처분으로 502는 면한다.

### 1.2 ⚠ 패턴 ⑤ 끝에 `\b`를 붙이지 말 것

JS 정규식의 `\b`는 ASCII `\w` 기준이라 **한글 뒤에서 경계가 성립하지 않는다.** 이 저장소는 이미 같은 함정을 겪었다 — `VERDICT_PROBE_PATTERNS`(`route.ts:254` 부근) 주석이 정확히 이 이유로 `\b`를 뺐다고 적어놨다.

| 입력 | 끝에 `\b` 있음 | `\b` 없음(채택) |
|---|---|---|
| `English로 써줘` | **MISS** | OK |
| `Korean으로 답해줘` | **MISS** | OK |
| `English 로 써줘` | **MISS** | OK |

### 1.3 본부 실행 검증 결과 — **이 표가 테스트의 정본이다**

본부가 위 5개 패턴을 **실제로 실행**해 얻은 결과다. farr02는 같은 입력으로 돌려 **같은 결과가 나오는지 확인하고 출력을 보고에 붙일 것.**

**참이어야 하는 입력 21개 — 전건 매칭(오른쪽은 걸린 패턴 번호)**

| 입력 | 패턴 |
|---|---|
| `라일리한테 보낼 영어 메시지 두 개 써줘` | ② |
| `영문 답장 써줘` | ② |
| `한국어 문장으로 바꿔줘` | ② |
| `일본어 편지 하나 써줘` | ② |
| `영어 메세지 두 개만` | ② |
| `영어로 메시지 써줘` | ① |
| `영문으로 써줘` | ① |
| `한국어로 답해줘` | ① |
| `이거 영어로 번역해줘` | ① |
| `한국어로 번역해줘` | ① |
| `영문으로 번역해줘` | ① |
| `English로 써줘` | ⑤ |
| `Korean으로 답해줘` | ⑤ |
| `English 로 써줘` | ⑤ |
| `Write me an English message` | ④ |
| `Give me a Korean reply` | ④ |
| `Give me an English translation` | ④ |
| `Translate it to Korean` | ③ |
| `Translate this into Japanese` | ③ |
| `write it in Korean` | ③ |
| `in English please` | ③ |

**거짓이어야 하는 입력 22개 — 전건 무매칭**

*비유적 번역 (v1.3에서 추가 — 이게 bare `번역`을 반려한 이유다)*
`Can you translate what their silence means?` · `Translate their mixed signals for me.` · `Can you translate this behavior?` · `그 사람의 침묵을 번역해줘` · `그 행동이 무슨 뜻인지 번역해줘` · `이 애매한 신호 좀 해석해줘` · `번역해줘` · `translate this`

*언어를 화제로만 언급 / 일반 질문*
`영어 공부 얘기 좀 해줘` · `Should I ask again?` · `오늘 어때?` · `라일리한테 뭐라고 보낼까?` · `그 사람 원래 그래?` · `8월 18일 어때?`

*언어 지시 없는 보낼 글 요청 — §2의 send-mode 경로가 살아 있어야 한다*
`Write me two messages I could send.` · `문장 두 개 써줘` · `메시지 좀 써줘` · `답장 안 써`

*음성 기준선 6턴 픽스처의 실제 질문*
`I want to ask Riley to work on a project with me. How should I bring it up?` · `I brought it up yesterday and they just said they would think about it.` · `No reply today.` · `Why are they being so lukewarm about this?`

**추가로 본부가 기록된 8파일의 고유 질문 12개 전부에 이 패턴을 돌려 매칭 0건을 확인했다** → **§3의 회귀 12행이 그대로여야 하는 근거가 이것이다.**

### 1.4 POST 적용

```
const expectedLang = hasExplicitLanguageRequest(question)
  ? undefined
  : detectExpectedLang(question, history);
```

**⚠ 어느 언어를 요구했는지 알아내려 하지 말 것.** 「영어로 쓰되 설명은 한국어로」 같은 입력을 정확히 해석하려 들면 그게 새 오탐원이 된다. **이 판의 목표는 정당한 요청이 502로 막히고 잘못된 교정을 받는 것을 없애는 것뿐이다.** 기존 `dailyPillarLookup` 부재 시와 같은 fail-open이다.

---

## §2 수정 ② — **보낼 글 모드에서는 drift도 soft flag**

`ctx.askMode`가 `'strict_script'` 또는 `'completion'`이면, `response_language_drift`가 있어도 **502를 내지 않는다.**

그 모드의 답은 **제3자에게 보낼 내용물**이고, 그 사람의 언어를 서버는 알 수 없다. 이 모드에서 언어가 틀리면 **사용자 눈에 보이므로 다시 물으면 된다.** 502는 보이지도 않고 풀리지도 않는다.

### 구현 지점 (정확히 3곳)

1. **예산 소진 경로** (`route.ts:1867` 부근, BRIEF-106 §4.2 ⓑ가 넣은 블록)
2. **교정 후 경로** (`route.ts:1918` 부근, §4.2 ⓐ가 넣은 블록)

   두 곳 다 조건을 이렇게 좁힌다:

   ```
   const sendMode = ctx.askMode === 'strict_script' || ctx.askMode === 'completion';
   if (!sendMode && violations.some(v => v.type === 'response_language_drift')) {
     logAsk(rid, 'lang', 'fail', {});
     return errorResponse('language', 502);
   }
   ```

3. **`applyFinalDisposition`** — 이제 drift가 여기 도달할 수 있으므로 플래그를 추가한다.

   ```
   if (hasType('response_language_drift')) flags.push({ stage: 'lang', action: 'soft' });
   ```

   **BRIEF-106이 그 근처에 달아둔 「drift는 여기 절대 도달하지 않는다」는 주석을 정정할 것.** 답 문자열은 **여전히 손대지 않는다**(플래그만).

**⚠ 유형 자체를 바꾸지 말 것.** 보낼 글 모드에서도 탐지 결과는 **`response_language_drift` 그대로**다. leak으로 바꾸면 지표가 오염되고 교정 경고 문구도 틀려진다.

**교정 경고는 그대로 둔다** — 보낼 글 모드에서도 한 번은 고쳐보게 하는 게 맞다. 그 후에도 남으면 그냥 내보낸다.

---

## §3 회귀 — 12행 표 무변동, **다만 이것으로 §1이 검증되지는 않는다**

`scripts/verify/lang-regression.mjs`는 파일명으로 `expectedLang`을 정하고 탐지 함수만 돌린다. **`detectExpectedLang`도 `hasExplicitLanguageRequest`도 호출하지 않는다.**

따라서:

- **회귀 출력은 BRIEF-106 §6과 완전히 동일해야 한다: 96행 중 12행(drift 6 · leak 6), 나머지 84행 0.** 달라지면 탐지 로직을 건드린 것이다 — **중단·보고.**
- **그러나 회귀가 그대로라는 사실은 §1이 옳다는 증거가 아니다.** 회귀는 §1을 아예 지나가지 않는다. **§1·§2의 검증은 전적으로 §4의 POST 통합 테스트가 진다.**

**⚠ 회귀 스크립트를 수정하지 말 것.**

---

## §4 신규 테스트 — **아래 커버리지 표를 전부 덮을 것**

`src/app/api/ask/route.test.ts`의 BRIEF-106 describe 블록에 이어서 추가한다.

### 4.1 패턴 단위 — **§1.3의 43개 입력을 그대로 테스트로 옮길 것**

참 21개·거짓 22개 전부. **한 건도 빼지 말 것.** 특히:

- `라일리한테 보낼 영어 메시지 두 개 써줘` — **이 브리프의 대표 시나리오. v1.1이 이걸 못 잡았다.**
- `English로 써줘` · `Korean으로 답해줘` · `English 로 써줘` — `\b` 버그를 잡는 항목
- **비유적 번역 8건이 전부 거짓** — `Translate their mixed signals for me.` · `그 사람의 침묵을 번역해줘` · `번역해줘` 등. **하나라도 참이 되면 언어 검사가 일반 대화에서 꺼진다**
- **진짜 번역 요청 5건은 참** — `한국어로 번역해줘` · `Translate it to Korean` · `Give me an English translation` 등
- `Write me two messages I could send.` · `문장 두 개 써줘` · `메시지 좀 써줘` — **거짓**이어야 한다(언어 지시 없는 보낼 글 요청). 이게 참으로 뒤집히면 §2의 send-mode 경로가 아예 안 타진다

### 4.2 **502 분기 — 네 조합을 각각 실제 POST로 통과시킬 것**

하드 실패 분기가 코드상 **두 곳**이다. 한 곳만 덮고 넘어가면 다른 곳이 조용히 어긋난다.

| # | 예산 상태 | askMode | 기대 |
|---|---|---|---|
| A | **소진**(파싱 실패 재시도로 여분 사용) | `completion` 또는 `strict_script` | **502 아님** · 답 원문 유지 · `applyFinalDisposition`이 `{stage:'lang', action:'soft'}` |
| B | **교정 실행 후에도 drift** | `completion` 또는 `strict_script` | **502 아님** · 최종 교정 응답 유지 · `lang/soft` |
| C | **소진** | `null`(일반 대화) | **502**, `code:'language'` |
| D | **교정 실행 후에도 drift** | `null`(일반 대화) | **502**, `code:'language'` |

`it` 선언 개수는 자유다 — **네 조합이 각각 실제로 그 코드 경로를 지나가는 것**이 요건이다. A·C를 만들려면 BRIEF-106 테스트 ④(파싱 실패 2연속)가 쓰는 방식대로 첫 응답을 파싱 실패로 만들어 여분 호출을 태워야 한다.

### 4.3 통합 시나리오 — **200만 확인하면 부족하다**

「200이 나왔다」만으로는 **잘못된 교정이 일어났는지 알 수 없다.** 교정이 한 번 돌면 모델이 사용자가 요구한 영어 메시지를 한국어로 번역해버릴 수 있고, 그래도 최종 응답은 200이다. **호출 횟수까지 봐야 한다.**

| # | 시나리오 |
|---|---|
| **E** | 한국어 질문 **`라일리한테 보낼 영어 메시지 두 개 써줘`**(§0 대표 시나리오, **이 문자열 그대로**) + 모킹 영어 답 2줄 |
| **F** | 영어 대화 중 `Write it in Korean` + 모킹 한국어 답 |

E·F **둘 다** 아래 6개를 전부 확인할 것:

1. **선행 확인**: `hasExplicitLanguageRequest(질문) === true` — **이게 false면 그 자리에서 중단·보고.** 나머지 확인은 의미가 없다
2. `expectedLang`이 `undefined`로 계산됨
3. HTTP **200**
4. **모델 호출 정확히 1회** (`mockGenerateJsonChat` 호출 수 = 1)
5. **모델에게 전달된 turns에 언어 교정 경고(`LANGUAGE VIOLATION`·`LANGUAGE MIXING`)가 없음**
6. 답 문자열이 모킹한 것과 **완전 동일**(byte-equivalent)

| # | 시나리오 | 기대 |
|---|---|---|
| G | `validateAskAnswer`가 보낼 글 모드에서도 **`response_language_drift` 유형을 그대로 낸다** | 유형 무변경 확인 |

---

## §5 보고서에 **반드시 남길 한계**

`docs/reports/BRIEF-106.md`에 §FIX 절을 덧붙이고, 아래를 **그대로** 적을 것.

> 명시적 언어 지시가 있는 요청에서는 사용자가 요구한 언어를 서버가 추론하지 않으므로, **요청 언어를 실제로 지켰는지 서버가 검증하지 않는다.** 이번 FIX의 목적은 정당한 교차언어 결과물 요청이 502로 차단되거나 잘못된 교정을 받는 것을 막는 데 한정한다. 요청 언어 준수 검증은 이 판의 범위가 아니다.
>
> 또한 `EXPLICIT_LANGUAGE_PATTERNS`는 **언어명 또는 언어 방향 표지가 확인된 범위 안에서만** 넉넉하게 매칭한다. 표지 없는 `번역`·`translate`는 관계·행동 해석의 비유일 수 있어 제외했다 — 검사 생략은 곧 언어 전환 결함의 fail-open이므로 이 게이트를 무제한으로 넓히지 않는다. **언어명 없이 상대의 언어를 암시하는 요청(「라일리는 영어권이니까 그 스타일로」)은 이 게이트에 걸리지 않는다**(알려진 잔여 구멍, 보낼 글 모드에서는 §2의 soft 처분이 받는다). 이 게이트로 검사가 생략되는 턴의 실제 비율은 **프로덕션 로그로만 알 수 있다** — 필요해지면 별도 판에서 계측한다.

---

## §6 완료 기준

- `npx tsc --noEmit` exit 0
- lint 전체 **24E/15W 초과 금지**(신규 0). **`git status --porcelain`이 빈 상태에서 측정**하고 그 출력도 첨부
- `npx vitest run` — **기존 923 passed 전건 유지**(하나라도 깨지면 중단·보고) + §4 커버리지 전건 + **4 expected fail 불변**. `set -o pipefail` + `PIPESTATUS`.
  **최종 수치를 그대로 적을 것.** 현재 저장소 표기는 `Tests  923 passed | 4 expected fail (927)` — 괄호 안 총수에 expected fail이 포함된다(본부 실측).
  **신규 테스트 개수는 고정하지 않는다** — §4를 덮는 것이 요건이고, 숫자를 맞추려고 assertion을 억지로 묶지 말 것.
- **`node scripts/verify/lang-regression.mjs` → §3 그대로 12행 무변동, `[PASS]`**
- `node scripts/verify/voice-baseline.mjs --selftest` → `ALL PASS`
- `npm run build` 성공
- **변경 파일은 정확히 이 4개**:
  1. `docs/briefs/BRIEF-106-FIX.md` (이 문서 바이트 그대로 보관 → sha256·`wc -c` 기준값 대조)
  2. `docs/reports/BRIEF-106.md` (§FIX 절 append — **새 보고서 파일 만들지 말 것**)
  3. `src/app/api/ask/route.ts`
  4. `src/app/api/ask/route.test.ts`
- 채팅 보고: 커밋 목록 + 보관본 sha256·바이트 대조 + **§1.3 43개 입력 실제 실행 출력(참 21 전건 매칭·거짓 22 전건 무매칭)** + **코퍼스 고유 질문 12개 매칭 0건** + **§4.2 네 조합 각각의 통과 확인** + **§4.3 E·F의 6개 확인 항목 결과(특히 모델 호출 1회)** + **회귀 12행 실제 출력** + vitest 최종 수치(기존 923 / 신규 실측 / 총 passed / expected fail 4 / 괄호 총수) + 수정한 `route.ts` 줄 번호

---

## §7 금지사항

- **`lang-regression.mjs` 수정 금지.** 결과표가 달라지면 구현이 틀린 것이다.
- **탐지 로직(`checkAnswerLanguage`·`detectMessageLang`·`detectExpectedLang`) 수정 금지.** §1은 POST 바깥의 **호출 게이트**이지 탐지 로직 내부가 아니다.
- **문턱 0.5 변경 금지.**
- **어느 언어를 요구했는지 추론해 `expectedLang`을 그 언어로 세팅하지 말 것** — `undefined`로만 둔다.
- **패턴 ⑤ 끝에 `\b` 금지**(§1.2의 실행 표 참조).
- **패턴을 임의로 늘리거나 줄이지 말 것.** 5개 정확히, §1.3의 43개 입력에서 같은 결과가 나와야 한다.
- **언어명 없는 `번역`·`translate` 단독 패턴 추가 금지**(§1.1의 반려 사유).
- **leak 처분 변경 금지**(그대로 soft flag).
- **프롬프트·사용자 문구 변경 금지.**
- **기존 923 테스트의 픽스처·assertion 수정 금지.** 고쳐야 할 상황이 나오면 **중단하고 보고할 것**(BRIEF-106에서 6건을 고친 건 결과적으로 타당했으나 절차상 먼저 물었어야 한다).
- 기존 `samples/voice-baseline/*.json` 수정·삭제 금지.
- `package.json`·`package-lock.json` 수정 금지.
- main 직접 push·force push·rebase·amend·병합 금지. **새 브랜치도 만들지 말 것 — `feat/106-language`에 이어 붙인다.**

---

## §8 근거 (줄 번호는 `a4dc511` 기준)

- 예상 언어 계산: `route.ts:1783` `detectExpectedLang(question, history)`
- 탐지: `checkAnswerLanguage`(§3 판정식), `detectMessageLang`
- 502 분기 ⓑ 예산 소진: `route.ts:1867–1873`
- 502 분기 ⓐ 교정 후: `route.ts:1918–1923`
- 최종 처분: `applyFinalDisposition` 내 `foreign_language_leak` 플래그 줄 + 그 위 주석
- **`\b` 함정 선례**: `VERDICT_PROBE_PATTERNS`(`route.ts:254` 부근) 주석 — 「JS `\b`는 ASCII-`\w` 기준이라 한글 직후에서 신뢰할 수 없다」
- 보낼 글 모드 판정 패턴: `route.ts:242` `STRICT_SCRIPT_PATTERNS`(「메시지 두 개」 포함), `:281` `COMPLETION_PATTERNS`(「메시지 좀 써줘」 포함) — 본 판의 예시 질문이 실제로 이 모드로 잡히는지 본부가 패턴 대조로 확인함
- 예산 소진 경로를 테스트에서 만드는 법: BRIEF-106 테스트 ④(파싱 실패 2연속) 방식
- 회귀 게이트: `scripts/verify/lang-regression.mjs`
