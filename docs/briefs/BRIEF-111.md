# BRIEF-111 — 브리핑 출력 언어를 서버가 정한다

## 0. 범위 (한 기능)

**리딩 브리핑의 출력 언어를 모델 판단에 맡기지 않고, 서버가 상황문에서 정해 지시하고 검사한다.**

- **BASE_SHA**: `7582a63477dbdf82adabeacefab3fb67d040b175` (origin/main)
- **브랜치**: `feat/111-briefing-lang`
- **근거**: 실측 — 짧은 한국어 상황문(`서먹해`)에서 `headline`·takeaway 4종·`playbook tip`이 **영어로 나옴**. 같은 응답의 `starters`만 한국어(부분 준수). 실데이터 표본과 동일 패턴. 정본 = `GATE-BRIEFING-LANG.md`.

## 1. 배경 — 왜 지금 방식이 실패하는가

`src/lib/briefing.ts` LANGUAGE 절이 모델에게 **「상황문 언어를 감지해서 그 언어로 써라」**라고 위임한다. 상황문이 짧으면 언어 신호가 약해지고, 300줄짜리 영어 프롬프트가 기본값처럼 작동한다.
**Ask는 이 방식을 이미 버렸다** — 서버가 언어를 정하고(`detectExpectedLang`), 응답을 검사한다(`checkAnswerLanguage`). 브리핑만 옛 방식이다.

## 2. 할 일 ① — 언어 판별을 서버로 (`src/lib/briefing.ts`)

`buildBriefingPrompt`에 **선택 인자** `lang?: 'ko' | 'en'`를 추가한다(기본값 없음 = 미전달 시 **현행 문구 그대로** → 기존 테스트 무영향).

`lang`이 주어지면 LANGUAGE 절의 첫 문장을 **지시형으로 교체**한다:

- `ko`: `Write ALL free-text values in KOREAN (한국어). The user's situation is in Korean.`
- `en`: `Write ALL free-text values in ENGLISH.`

**나머지 문장은 그대로 유지**(「Never mix languages in one sentence」·「JSON keys stay in English」·「Do not translate archetype names」). 「Detect the language…」 문장만 위 지시로 바뀐다.

## 3. 할 일 ② — 산출·검사·재시도 (`src/app/api/briefing/route.ts`)

1. **언어 산출**: 원본 `situation`(이름 꼬리표를 붙이기 **전** 값)에서 한글/라틴 **글자 수 비교**로 판정 — 한글>라틴이면 `ko`, 라틴>한글이면 `en`, **같거나 둘 다 0이면 `undefined`**(판정 불가 → 기존 동작). Ask의 `detectMessageLang`(`ask/route.ts:1043`)과 **같은 규칙**이되, **이 파일 안에 작은 헬퍼로 구현**한다(Ask 코드 수정·import 금지 — 순환/범위 확대 방지).
2. **프롬프트에 전달**: `buildBriefingPrompt(meChart, themChart, relationship, contextualSituation, lang)`.
3. **응답 검사**: `lang`이 있을 때만. 응답의 자유 텍스트(`headline` + `dynamic.click/clash/watch.takeaway` + `theirProfile.*.takeaway` + `playbook[].tip`)를 합쳐 자모 비율 계산. **`them.name`은 검사 문자열에서 제거**(이름이 한글이면 오탐 — Ask의 `nameAllowlist`와 같은 취지).
   - 기대와 다른 문자가 **50% 이상**이면 위반.
4. **재시도 1회**: 위반 시 프롬프트 끝에 한 줄 추가해 재호출 — `Your previous answer used the wrong language. Rewrite the SAME JSON with ALL free-text values in <Korean|English>.` 재시도 결과는 **검사하지 않고 채택**(무한 루프 금지).
5. **재시도도 실패하면**: 그 응답을 **그대로 반환**한다(사용자에게 오류를 주지 않는다 — 언어 불일치는 렌더 실패가 아니다). 서버 로그에만 남긴다.

**기존 재시도(금지어·헤드라인 길이)와 충돌하지 않게**, 언어 재시도는 **그 뒤에 한 번만** 수행한다.

## 4. 테스트

`src/lib/briefing.test.ts`(있으면 보강, 없으면 신규):
1. `lang` 미전달 → 프롬프트에 기존 `Detect the language` 문장 **그대로**(회귀 가드)
2. `lang: 'ko'` → `KOREAN` 지시 포함 + `Detect the language` 문장 **부재**
3. `lang: 'en'` → `ENGLISH` 지시 포함
4. 두 경우 모두 `JSON keys stay in English`·`Do not translate archetype names` **유지**

`src/app/api/briefing/route.test.ts`(기존 보강):
5. 한국어 상황문 → LLM 스텁이 **영어 응답** 반환 → **재시도가 1회 발생**하고, 재시도 프롬프트에 `wrong language` 문구 포함
6. 한국어 상황문 + 한국어 응답 → **재시도 없음**
7. 영어 상황문 + 영어 응답 → 재시도 없음
8. **이름 오탐 가드**: 영어 상황문 + 영어 응답 + `them.name: '하람'` → 재시도 **없음**
9. 판정 불가 상황문(예: `?!`) → `lang` 미산출 → 프롬프트 현행·검사 없음

## 5. 금지 사항

1. **`src/app/api/ask/route.ts` 및 Ask 관련 파일 무접촉** — import도 금지
2. 언어 유틸의 공용 모듈화 금지(별건)
3. `starters` 프롬프트 문구·한국어 예시 **변경 금지**
4. 빈 상황문의 영어 기본값(`No specific situation — …`) **변경 금지**(계약)
5. 재시도 2회 이상 금지 · 언어 불일치를 사용자 오류로 노출 금지
6. 프롬프트의 다른 절(CONTENT RULES·HEADLINE LENGTH 등) 변경 금지
7. main 직접 push / force push / rebase / merge commit 금지

## 6. 완료 기준

1. `npx tsc --noEmit` 0
2. `npm run lint` 39(24E/15W) 이하
3. `npx vitest run` 기준 **1002 passed + 4 expected fail** — passed 신규만큼 증가, **expected fail 4 불변**
4. `npm run build` 성공
5. 변경 파일: `src/lib/briefing.ts` · `src/app/api/briefing/route.ts` + 각 테스트(최대 4개) + `docs/briefs/BRIEF-111.md` 보관
6. push. **병합 금지** — 본부 검수 후 별도 지시

> **⚠ 실제 모델 호출로 검증하지 말 것.** 배포 API 호출은 쿼터·레이트리밋 사안이라 **본부·YS가 배포 후 수행**한다. 테스트는 LLM 스텁으로만.

## 7. 보고 양식

```
BASE_SHA 확인: / 브랜치·커밋: / 변경 파일(diff --stat 원문):
tsc: / lint: / vitest: / build:
추가 테스트 목록:
언어 판정 헬퍼를 어디에 어떻게 구현했는지(1~3줄):
막힌 점:
```
