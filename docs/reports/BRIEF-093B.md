# BRIEF-093B — 헤드라인 길이 계약 + 공유 카드 한글 정자 분기 (093 후속)

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `src/lib/briefing.ts` | `HEADLINE LENGTH` 하드 리밋 지시(정본) 추가 — JSON 템플릿 직후, LANGUAGE 블록 앞 |
| `src/app/api/briefing/route.ts` | `headlineTooLong()`/`headlineCharLimit()` 헬퍼 + 헤드라인 길이 초과 시 1회 축약 재요청 로직(정본 문구) 추가 |
| `src/components/ShareModal.tsx` | 인용문(`quoteText`)에 한글 포함 시 `ctx.font`를 `italic Fraunces`→`400 57px "Gowun Batang"`으로 분기, 폰트 프리로드 목록 정리(`drawShareCard` testability를 위해 export로 전환) |
| `src/components/MyCardModal.tsx` | 주석 1줄만 추가(허용 예외) — 코드 무변경 |
| `src/app/reading/[id]/page.tsx` | `headlineScale` 주석을 실측(093)에 맞게 정정 — 로직 무변경 |
| `src/lib/briefing.test.ts` | HEADLINE LENGTH 문자열 포함 정적 검사 1건 |
| `src/app/api/briefing/route.test.ts` (신규) | 61자+ 한글 헤드라인 재요청 1회 / 재시도 후 초과분 그대로 통과 / 60자 이하 무재요청 — 3케이스 + 한글·영문 상한 경계 2케이스 |
| `src/components/ShareModal.test.ts` (신규) | 한글 인용문 → Gowun Batang·이탤릭 부재 / 영문 인용문 → 이탤릭 Fraunces — 2케이스(캔버스 컨텍스트 모킹) |

## 2. 구현 요지

**§1 헤드라인 길이 계약** — 프롬프트에 하드 리밋(한글 60자·영문 90자)을 지시로 추가하고, 서버가 응답을 코드포인트 길이로 재검증한다. 초과 시 정본 재요청 문구로 **딱 1회**만 재시도하고, 그래도 초과하면 **그대로 통과**시킨다(말줄임·절단·line-clamp 없음 — UI의 길이 적응 스케일이 방어선으로 받는다). 배너드-프레이즈 재요청(기존 로직)이 끝난 뒤의 최종 `briefing`에 대해서만 검사하므로, 최악의 경우에도 총 LLM 호출은 기존 로직 대비 최대 1회만 늘어난다.

**§2 공유 카드 한글 정자 분기** — 093 조사에서 확인한 대로, Fraunces엔 한글 글리프가 없어 캔버스가 한글에 가짜 이탤릭을 합성할 수 있었다. 인용문에 한글이 1자라도 포함되면 `ctx.font`를 `400 57px "Gowun Batang"`(정자)으로, 영문 전용이면 기존 `italic 57px Fraunces`를 그대로 쓴다. 굵기는 **400**을 선택했다 — 기존 이탤릭 Fraunces가 굵기 미지정(기본값 400)이었으므로, 동일 400으로 맞춰야 시각적 무게가 보존된다(700을 썼다면 원래보다 눈에 띄게 진해졌을 것).

폰트 프리로드 목록도 정리했다: 093에서 발견한 죽은 프리로드 `italic 90px Fraunces`(실제로 쓰는 곳이 없었음)를 제거하고, 새로 필요한 `400 57px "Gowun Batang"`을 추가했다. 겸사겸사 `500 108px Fraunces`도 `500 100px Fraunces`로 고쳤다 — 실제 최대 사용 크기(`fitFontSize`의 상한 100)와 일치시키기 위해서다. 그 외 Space Mono 계열(27/30/33/24px 등)과 "×" 기호용 `500 120px Fraunces`는 기존부터 프리로드 목록에 없었지만, 이번 브리프의 범위(인용문 이탤릭/한글 문제)와 무관해 손대지 않았다 — §4에 발견 사실만 남긴다.

**MyCardModal.tsx** — 지시대로 코드는 그대로 두고, 향후 로케일 대응 태그라인으로 바뀔 경우 같은 문제가 재현될 수 있다는 주석 1줄만 추가했다.

## 3. 렌더 확인 — 공유 카드 2장 (실제 브라우저, Playwright)

한국어 리딩·영어 리딩 각 1건씩 실제 `/reading/[id]` 페이지에서 "Save our card" → 공유 카드 캔버스 렌더까지 실행해 스크린샷했다. 텔레그램으로 **전송함**.

1. 한국어 인용문("오늘은 유독 조용한 하루였지만...") — Gowun Batang 정자로 렌더, 기울임 없음.
2. 영문 인용문("A quiet resolve is forming...") — 기존 그대로 이탤릭 Fraunces로 렌더, 기울어짐 확인.

## 4. 샘플 로그 — 61자+ 한글 헤드라인 축약 재요청 1회

실제 `POST` 핸들러를 (LLM 프로바이더만 모킹해) 그대로 실행한 결과(개인정보 없는 테스트 입력):

```
--- [BRIEF-093B sample log] headline length contract demo ---
1) LLM (mocked) returns headline (66 chars, over the 60-char Korean limit):
   "민지님, 오늘은 유독 조용한 하루였지만 그 안에서 스스로도 몰랐던 단단한 결심을 세우고 있었던 것 같다는 느낌이 들어요"
2) Server detects length > 60 -> sends length-retry instruction, calls LLM again (call count: 2)
3) Retry response headline (21 chars):
   "민지님, 오늘 조용히 굳어진 결심 하나"
--- end sample log ---
```

LLM 호출은 실제 네트워크가 아니라 모킹(이 환경에 실 API 키가 없어 실제 LLM 응답은 받을 수 없음)이지만, **재요청을 트리거하는 실제 서버 로직**(`headlineTooLong`/재요청/재파싱 전체)은 그대로 실행됐다.

## 5. 완료 기준 자가점검

- [x] `npx tsc --noEmit` / `npx vitest run`(327개 전체 통과 — 기존 319 + 신규 8, 무회귀) / `npm run build` 모두 통과
- [x] 렌더 확인 — §3, 텔레그램 전송함
- [x] 샘플 보고 — §4
- [x] main push 완료 (커밋 해시는 §6)

## 6. 정직 보고

- 헤드라인 길이 재요청은 **실 LLM 호출로는 검증하지 못했다** — 이 환경에 API 키가 없어, 실제 모델이 "정본 재요청 문구"를 받았을 때 얼마나 잘 60자/90자 안으로 압축해 오는지는 확인 불가능하다. 서버 로직(검사·재요청·통과 처리) 자체는 실제 코드 경로로 확인했다(§4).
- ShareModal 폰트 프리로드 목록의 나머지 불일치(Space Mono 여러 크기, "×" 용 120px Fraunces, 아키타입 이름의 동적 52~100px Fraunces)는 이번 브리프 범위(인용문 이탤릭/한글) 밖이라 손대지 않았다 — §2에 발견만 기록.
- `drawShareCard`를 테스트 가능하도록 `export`로 바꿨다 — 지시서에 명시되진 않았지만, 캔버스 컨텍스트 모킹 테스트를 지시서가 요구했고(§4 "2케이스") 다른 캔버스 파일 수정 없이 이 방법이 유일하게 실용적이었다. `ask/route.ts`의 `buildAskSystem`/`buildAskTurns`를 테스트용으로 영구 export한 선례(078)와 같은 패턴이다.

## 7. 커밋 해시

- 저장소: https://github.com/Farerworks/attune
- 커밋 해시: (본 커밋 — 텔레그램 완료 보고에 함께 남긴다)
