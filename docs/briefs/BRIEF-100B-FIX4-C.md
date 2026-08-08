# BRIEF-100B-FIX4-C v3 — completion 판정을 「인용 분리 + 마지막 유효 의도」 구조로 교체

## 0. 맥락 (자기완결)

Attune(github.com/Farerworks/attune, 랩 PC `~/projects/attune`).

**시작 전 기준점 확인 — `git pull` 하지 말 것.** pull은 기준점을 *확인*하는 게 아니라 *바꾼다*.
```
git status --porcelain     # 출력이 없어야 한다(작업 트리 청결)
git fetch origin
git rev-parse HEAD
git rev-parse origin/main
```
`HEAD`와 `origin/main`이 **둘 다** `5c3d693a6839595ed5d92c6f8040cf5d4d019ff0`(테스트 718)이어야 한다. **어긋나면 `checkout`·`reset`·`merge`·`rebase` 하지 말고 그 상태 그대로 보고**한다 — 기준점은 본부와 YS가 판단한다.

`src/app/api/ask/route.ts`에는 사용자가 **보낼 것을 써 달라고** 한 턴을 잡는 `askMode === 'completion'`이 있다(직전 판 `BRIEF-100B-FIX3`). 현재 판정은 **문장 단위 루프 + 첫 성립 시 즉시 반환**이라 두 가지를 구조적으로 표현하지 못한다.

1. **문장 간 순서** — 첫 문장이 요청이면 뒤 문장의 취소를 읽지 않는다. `메시지 써줘. 아, 아니다.` → 지금은 요청으로 처리된다.
2. **발화 주체** — 요청 어미가 사용자의 것인지 **인용된 제3자**의 것인지 구분할 자리가 없다. `걔가 답장 써달래` → 지금은 사용자의 요청으로 처리된다.

여기에 후치 부정(`메시지 써주지 마`)이 제외 목록에 없다.

**이 판은 판정부를 아래 구조로 교체한다. 어미를 하나 더 추가하는 판이 아니다.**

```
1. 문장·절 경계를 보존한다.
2. 인용·전달·보고 영역과 사용자 직접 발화 영역을 구분한다.
3. 각 영역에서 요청·부정·취소·수정을 판정한다.
4. 사용자 직접 요청 후보만 남긴다.
5. 입력 순서에 따라 마지막 유효 사용자 의도를 결정한다.
6. 후치 부정·금지도 이 판의 필수 항목이다.
```

**판정 원칙**: 인용·전달·보고된 요청과 사용자가 앱에 직접 하는 요청을 **먼저 분리**한 뒤, 사용자 직접 요청 후보들 사이에서 부정·취소·수정과 **입력 순서**를 적용해 마지막 유효 의도를 결정한다. **문장의 화자 하나를 찾는 방식으로 구현하지 말 것** — 한 입력 안에 상대의 인용과 사용자의 실제 요청이 **함께** 있을 수 있다.

## 0.5 시작 전 1커밋 — 이 브리프 원문 보관

**먼저 해시를 대조한다.** 전달받은 두 파일의 `sha256sum`·`wc -c`를 **전달 메시지에 적힌 값**과 대조한다. **하나라도 다르면 구현하지 말고 즉시 보고**한다.

일치하면 이 파일을 바이트 그대로 `docs/briefs/BRIEF-100B-FIX4-C.md`로 저장, 단독 커밋+push(`BRIEF-100B-FIX4-C: 브리프 원문 보관`). 저장 직후 다시 `sha256sum`·`wc -c`로 대조해 일치를 확인한 뒤에만 다음으로 넘어간다.

함께 전달되는 `TESTSET-100B-FIX4.md`는 **저장소에 커밋하지 않는다**(§4 허용 경로 밖). 테스트 계약으로 읽기만 한다.

---

## 1. 변경 사양 (`src/app/api/ask/route.ts` 한 파일)

### 1.1 유지되는 것 (건드리지 말 것)

`COMPLETION_PATTERNS` **무변경**. `splitSentences`(이미 `@/lib/hiddenTruth`에서 import 중) **무변경**.
`COMPLETION_EXCLUSIONS`는 **이름과 내용을 그대로 두되 역할이 바뀐다** — 이제 「입력 전체를 막는 제외」가 아니라 **「이 절이 요청이 아님을 뜻하는 표지」**로 쓰인다(§1.3의 `NON_REQUEST`). 배열 내용은 한 글자도 바꾸지 않는다.

### 1.2 신규 테이블 (전부 export — 테이블 단위 테스트를 위해)

```ts
/** 절 경계. 인용·취소가 한 문장 안에 섞여 있을 때 나눈다. */
export const COMPLETION_SEGMENT_SPLIT: RegExp =
  /(?<=(?:는데|지만|다만|니까|라서|말고))\s+|(?<=[,;])\s*|(?<=아니다|아니야|아니|됐어|그만)\s+|\s+(?=그래도|그런데|근데|하지만|아니|아니다|그럼|대신|일단)/;

/** 직접 인용 — 따옴표로 묶인 구간. */
export const COMPLETION_QUOTE_SPAN: RegExp = /["'“”][^"'“”]*["'“”]/;

/** 간접·전달 인용 표지. 이 표지까지가 인용 영역이고, 표지 뒤는 사용자 영역이다.
 *  `줄래`의 `래`, `있대/없대`의 `대`는 요청·서술이므로 부정 후방탐색으로 제외한다.
 *  `라고`는 뒤에 전달 동사가 올 때만 표지다 — 그러지 않으면 `뭐라고 보낼지 써줘`가 죽는다. */
export const COMPLETION_REPORT_MARKER: RegExp =
  /(?:달라고|달라는데|달래(?![가-힣])|라고\s*(?:했|하|해|한|보냈|왔|들었|그러|말)|다고\s*(?:했|하|해|한)|라는데|라며|라더라|(?<![줄을])래(?![가-힣])|(?<![있없])대(?![가-힣]))/;

/** 후치 부정·금지 — 현재 생성 행위를 막는 형태. `지 마`와 `지 말고` 둘 다 덮는다. */
export const COMPLETION_FORBID: RegExp =
  /(?:(?:써|적어|만들어|뽑아)(?:주)?지\s*(?:마|말)|(?:쓰|적|만들|뽑)지\s*(?:마|말)|(?:안|못)\s*(?:써|적어|만들어|뽑아))/;

/** 취소·철회. 목적어가 함께 있는 절은 취소가 아니라 수정 요청이므로 §1.3에서 제외된다. */
export const COMPLETION_CANCEL: RegExp =
  /(?:아니|됐어|됐다|관두|놔둬|놔둘|취소|잠깐|기다려|그만)/;
```

`COMPLETION_REQUEST_ENDINGS`(요청 어미)는 **직전 판 v3.2 초안과 동일한 값**을 신설한다:

```ts
export const COMPLETION_REQUEST_ENDINGS: RegExp =
  /(?:써|적어|만들어|뽑아)\s*(?:줘(?!서)|주라|줘라|줄래|주세요|주실래|주면|줬으면|주시면|달라|다오)/;
```

### 1.3 판정 함수 — `detectCompletionRequest`

```ts
type CompletionPart = { kind: 'quote' | 'user'; text: string };

/** 한 문장을 절로 나누고, 각 절에서 인용 영역과 사용자 영역을 가른다. */
export function splitCompletionParts(sentence: string): CompletionPart[] {
  const out: CompletionPart[] = [];
  for (const raw of sentence.split(COMPLETION_SEGMENT_SPLIT)) {
    const s = raw.trim();
    if (!s) continue;
    const q = s.match(COMPLETION_QUOTE_SPAN);
    const from = q && q.index !== undefined ? q.index + q[0].length : 0;
    const rm = s.slice(from).match(COMPLETION_REPORT_MARKER);
    if (rm && rm.index !== undefined) {
      const cut = from + rm.index + rm[0].length;
      out.push({ kind: 'quote', text: s.slice(0, cut) });
      const tail = s.slice(cut).trim();
      if (tail) out.push({ kind: 'user', text: tail });
    } else if (q && q.index !== undefined && !s.slice(from).trim()) {
      out.push({ kind: 'quote', text: s });
    } else {
      out.push({ kind: 'user', text: s });
    }
  }
  return out;
}

export function detectCompletionRequest(text: string): boolean {
  let sawObject = false;                 // 앞 절에서 목적어 명사가 이미 나왔는가
  let last: 'request' | 'cancel' | 'forbid' | null = null;

  for (const sentence of splitSentences(text)) {
    for (const part of splitCompletionParts(sentence)) {
      if (part.kind === 'quote') continue;              // 인용·보고는 사용자의 요청이 아니다
      const t = part.text;

      if (COMPLETION_FORBID.test(t)) { last = 'forbid'; continue; }

      const hasObject = COMPLETION_PATTERNS.some(p => p.test(t));
      const nonRequest = COMPLETION_EXCLUSIONS.some(p => p.test(t));
      if (hasObject) sawObject = true;

      // 요청: 이 절에 목적어가 있거나(정상), 앞 절에서 목적어가 나온 뒤의 대용 요청이거나.
      if ((hasObject && !nonRequest) ||
          (sawObject && COMPLETION_REQUEST_ENDINGS.test(t) && !nonRequest)) {
        last = 'request'; continue;
      }
      // 취소: 목적어가 없는 절에서만. 목적어가 있으면 수정 요청이다("아니 문자로 써줘").
      if (COMPLETION_CANCEL.test(t) && !hasObject) { last = 'cancel'; continue; }
    }
  }
  return last === 'request';
}
```

`detectAskMode`는 completion 판정 자리를 `detectCompletionRequest(latestUserText)` 한 줄로 바꾼다. **우선순위 `strict_script > verdict_probe > completion > null`은 그대로다.**

### 1.4 설계 근거 — 구현 시 바꾸지 말 것

1. **인용 표지 뒤의 잔여는 사용자 영역이다.** 이게 없으면 `걔한테 "잘 지내?"라고 보낼 메시지 써줘`(사용자의 요청)가 통째로 인용으로 먹힌다.
2. **`라고`는 전달 동사가 뒤따를 때만 표지다.** 그러지 않으면 `뭐라고 보낼지 써줘`가 죽는다.
3. **`(?<![줄을])래`·`(?<![있없])대`의 부정 후방탐색**이 없으면 `답장 써줄래?`가 인용으로 분류된다.
4. **`sawObject` 이월(carry)**은 대용 요청(`아니다. 그냥 짧게 하나만 써줘`)을 살리기 위한 것이다. **앞 절에 목적어가 나온 입력에서만** 동작하므로, 목적어 없는 단독 요청은 여전히 발동하지 않는다(§4.5 잔여 참조).
5. **취소는 목적어가 없는 절에서만 인정한다.** `아니 문자로 써줘`는 취소가 아니라 수정 요청이다.
6. **`지\s*(?:마|말)`** — `써주지 마`와 `써주지 말고`를 함께 덮는다. 한쪽만 넣으면 다른 쪽이 샌다.
7. **관찰되지 않은 표지를 추측으로 넣지 말 것.** 확장은 실사용 관측 후 별건.

---

## 2. 테스트 계약

**정본은 별도 파일 `TESTSET-100B-FIX4.md`(v1.1, sha256 `e5154111a567697e6a5d942ea1ae7667652d14e1c1ef2da2a52f9aed213e459e`)다.** 이 브리프와 **함께 전달**된다. 기대값은 구현 전에 동결됐고, **실행 결과가 다르다는 이유로 기대값을 바꾸지 않는다.**

### 2.1 반드시 테스트로 고정할 것

- `TESTSET` §2의 **X군 38건 전건** — 기대값 그대로. **범위 표기(`X1-…`~`X5-…` 같은 축약)로 축을 생략하지 말고, 문서에 기록된 모든 X ID를 그대로 쓴다.** X1부터 X8까지 여덟 축이 전부 들어 있다.
- `TESTSET` §3의 **L군 18건 전건**(`L-01`~`L-18`).
- `TESTSET` §4의 **E군 81건 전건**(`E-001`~`E-081`) — 기존 판정 회귀 감시.
- **테스트 설명에 ID를 그대로 쓴다**(예: `X4-P2 걔가 답장 써달래 -> null`).
- **ID 없는 분류 사례를 임의로 추가하지 않는다.** 이 금지는 **분류 사례 테스트에만** 적용된다 — §2.2의 정규식·함수 단위 테스트는 ID 없이 작성한다.

### 2.2 테이블·함수 단위

신규 export는 **총 8개**다 — **정규식 상수 6개 + 함수 2개.** 테스트 요구가 서로 다르다.

**정규식 export 6개** — `COMPLETION_SEGMENT_SPLIT`·`COMPLETION_QUOTE_SPAN`·`COMPLETION_REPORT_MARKER`·`COMPLETION_FORBID`·`COMPLETION_CANCEL`·`COMPLETION_REQUEST_ENDINGS`. 각각 **최소 1개의 양성·음성 단언**을 갖는다.

**함수 export 2개** — `detectCompletionRequest`는 §2.1의 분류 사례로 갈음한다. `splitCompletionParts`는 다음 3사례를 고정한다:
  - `걔가 "메시지 써줘"라고 보냈어` → `quote` 1개, `user`에 요청 없음
  - `걔한테 "잘 지내?"라고 보낼 메시지 써줘` → `quote` + **`user` 꼬리 존재**
  - `메시지 써줘. 아니다 걔가 먼저 쓴대.` → 두 번째 문장이 `아니다`(user) + `걔가 먼저 쓴대`(quote)로 갈린다

### 2.3 구조 회귀

- 기존 **718 테스트 전부 통과**.
- `COMPLETION_PATTERNS`·`COMPLETION_EXCLUSIONS`(길이 2)·`STRICT_SCRIPT_PATTERNS`·`VERDICT_PROBE_PATTERNS` **무변경** 단언.
- `validateAskAnswer`·최종 처분·프롬프트 블록·`src/lib/hiddenTruth.ts` **무변경**.
- 호출 예산(1차 + 최대 1회 추가) 불변, 502 반환 지점·status·body 불변.

---

## 3. 완료 기준
- [ ] `npx tsc --noEmit` / `npx vitest run` 전체(수치 보고) / `npm run build`
- [ ] 신규 테스트 수를 숫자로 보고
- [ ] `docs/reports/BRIEF-100B-FIX4-C.md` 커밋+push — 담을 것: ①보관 커밋 해시 ②코드 커밋 해시 ③테스트 수치(전체·신규) ④**`route.ts` diff가 §1.2~§1.3 범위뿐임**을 `git diff`로 제시 ⑤`TESTSET` 115건에 대한 **match / mismatch / FP / FN** 4수치 — **반드시 측정 범위(판정 대상 112건)를 함께** 적을 것. 「FP 0」 단독 표기 금지 ⑥**§4.5 잔여 4건을 그대로 옮겨 적을 것**(FP·FN을 합산해 「불일치 N」으로만 적지 말 것) ⑦`splitCompletionParts`의 세 고정 사례(§2.2)를 어떤 테스트로 잡았는지. 보고서 자신의 해시는 넣지 않는다.
- [ ] 변경 경로 검증은 **`git diff --name-only 5c3d693a6839595ed5d92c6f8040cf5d4d019ff0..HEAD`**와 **`git status --porcelain`**으로 한다. 맨 `git diff --name-only`는 커밋 뒤 빈 결과가 나오므로 쓰지 않는다.
- [ ] 완료 보고(채팅)에 커밋 해시 3종 + 위 두 명령의 출력을 **그대로** 제출

## 4. 금지사항
- **허용 경로 한정**: `docs/briefs/BRIEF-100B-FIX4-C.md` · `src/app/api/ask/route.ts` · `src/app/api/ask/route.test.ts` · `docs/reports/BRIEF-100B-FIX4-C.md`. 그 외 전부 무접촉 — `src/lib/hiddenTruth.ts` 포함 · `briefing.ts` · `briefing/route.ts` · 클라이언트 · `llm.ts` · `store.ts` · `askQuota.ts` · `askPrompts.ts` · 환경변수 · package.json/lock.
- **`COMPLETION_PATTERNS`·`COMPLETION_EXCLUSIONS`의 내용을 바꾸지 말 것.** 후자는 역할만 바뀌고 값은 그대로다.
- **§1.2의 정규식을 「개선」하지 말 것** — 부정 후방탐색 제거·`라고` 단독 표지화·`마/말` 한쪽만 남기기 전부 금지(§1.4 근거).
- **§1에 없는 표지·어미를 추가하지 말 것.**
- **`TESTSET` 기대값을 바꾸지 말 것.** 실행 결과가 다르면 그대로 보고한다.
- **잔여 FN 4건을 지원 범위 밖으로 삭제하거나 「정상 동작」으로 바꾸지 말 것.** 알려진 사용자 불편으로 남긴다.
- **`FP 0`·`회귀 없음`·`전부 통과`를 측정 범위 없이 단독으로 쓰지 말 것.**
- 새 LLM 호출·재시도 경로 추가 금지. 502 반환 지점·status·body 변경 금지.
- **말투·F4(차트 출처·단정) 원칙·사주 노출 수준·호칭·Copy 원칙·제품 포지셔닝은 이 판의 범위가 아니다.** 어떤 이유로도 함께 바꾸지 않는다.
- **`G2-STRUCTURE-100B-FIX4.md`는 참고자료다.** 그 문서의 §5(B→C 분리 권고)는 폐기됐고 실행 지시가 아니다.

## 4.5 근거 (본부 사전 실측 — 동결 테스트셋 v1.1 기준)

§1의 사양을 그대로 옮긴 스크립트를 `TESTSET` 115건에 적용했다 〔프로브 실행〕.

| 항목 | 수 |
|---|---|
| 고유 입력 | 115 |
| ㄴ 상위 우선순위(`strict_script` 2 · `verdict_probe` 1, 판정부 미도달) | 3 |
| ㄴ **판정 대상** | **112** |
| match | **108** |
| mismatch | **4** |
| ㄴ **FP** | **0** — *이 112건에서 FP가 관찰되지 않았다는 뜻이며, 전체 자연어 입력에서 FP가 없다는 뜻이 아니다* |
| ㄴ **FN** | **4** |

**현행 v3.2 대비**: 같은 112건에서 v3.2는 match 93 / FP 14 / FN 5였다. 이 112건 범위에서 **FP 14 → 0**, FN 5 → 4. **「FP 0」을 측정 범위 없이 단독으로 쓰지 말 것** — 보고서·완료 보고 전부에 적용된다.

**잔여 FN 4건 — 이 판에서 해결하지 않는다. 보고서에도 그대로 적을 것.**

네 건은 **알려진 사용자 불편**이다. 사용자가 실제로 완성물을 요청했는데 코칭 답변이 나간다. **「다시 말하면 복구된다」는 이유로 정당화하지 않는다** — 이번 판의 범위에서 **수용한 한계**로만 기록한다.

| ID | 입력 | 왜 놓치나 | 이번 범위에서 수용한 이유 |
|---|---|---|---|
| `E-080` | `오늘 보낼 메시지 좀 써줘 어제 건 써봤어` | `splitSentences`가 **종결 부호** 기준이라 한 문장으로 묶이고, 그 절 안에서 완료 표지가 요청 뒤에 온다 | 고치려면 공백·어미로 절 경계를 **추정**해야 하는데, 과분할은 곧 과발동이다. 부호가 있으면 정상 분류된다. **불편이 사라지는 것은 아니다** |
| `E-070` `E-071` `X5-M1` | `하나만 더 써줘` · `참고할 거 하나 만들어줘` · `써주지 마. 아니, 하나만 써줘.` | `COMPLETION_PATTERNS`가 **목적어 명사**를 요구하는데 앞 절에도 목적어가 없다(`sawObject` 이월 불가) | 목적어 없는 `써줘`를 전역 허용하면 일상 대화 상당수가 발동한다. 그 교환 비용이 더 크다고 판단해 **이번 범위에서 수용**한다 |

**직전 판 대비 개선 1건**: `E-081`(`답장 써줘서 고마워. 하나만 더 써줘.`)은 v3.2에서 미지원이었으나 `sawObject` 이월로 **해결된다.** 미지원 4건의 구성이 바뀌었다(E-081 해소, X5-M1 편입).

**측정 범위**: 현재 정의된 테스트 계약에서 중복 제거된 고유 입력은 **115건**이며 그중 판정 대상은 **112건**이다. 자연어 전체 입력 공간은 정의할 수 없으므로, **이 115건 이외의 조합과 표현은 미측정**이다. 위 수치를 이 범위 밖으로 일반화하지 않는다.

**검증 수준**: 본부 자체 검토 + 스크립트 실행 확인. **독립 검수 미수행.**

## 5. 여기서 멈춘다 · 배포 후 (farr02 작업 아님)

**구현과 자체 검증까지만 한다. Production 배포·100B 종결·RECHECK PASS 선언을 하지 않는다.** 배포와 실사용 검증은 본부와 YS가 따로 진행한다.


merge·배포되면 그 해시가 **100B 종결 게이트의 기준 빌드**다. 본부가 `RECHECK-100B-FIX.md` §0-0의 기준 해시를 갱신하고, YS가 **새 인물·새 스레드**로 정식 RECHECK를 수행한다(재사용 금지: 은우·시우·테스트A·지현).

RECHECK 관찰 항목(이월): `completion`의 최종 처분 `downgradeToText`는 3단 카드를 **형태만** shape 2로 합칠 뿐, 내용이 실제로 복붙 가능한 문장인지는 보장하지 않는다. 코드로 판정할 수 없으므로 실사용 관찰로만 확인한다.
