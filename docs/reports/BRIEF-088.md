# BRIEF-088 v2 — Ask 오늘 이름 체계 확정(정식+친근 핸들) + 연속 동일 서두 제거

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `src/lib/saju.ts` | `STEM_NAMES`(10천간: hanja/ko독음/element)·`BRANCH_NAMES`(12지지: hanja/ko독음/animalKo) 신규 export 상수 + `pillarLabel(p)`(예: `丁酉(정유)`)·`friendlyPillarName(p)`(예: `{en:'Fire Rooster', ko:'불 닭'}`) 신규 export 함수. 새 사주 계산 없음 — 기존 STEM_MAP/BRANCH_MAP의 역방향 데이터에 한글 독음·동물명·원소어만 얹었다. |
| `src/app/api/ask/route.ts` | `buildAskSystem`의 `todayLine`을 `pillarLabel`/`friendlyPillarName` 기반으로 교체 + TODAY 규칙 블록에 명명 규칙(정식명/친근 핸들 사용법)과 대화-맥락 참조 억제 문구 추가 |
| `src/app/api/ask/route.test.ts` | 084 테스트를 새 포맷(`丁酉(정유)`)에 맞게 갱신 + 신규 `describe` 2건(친근 핸들 포함 확인, 명명 규칙·맥락 참조 억제 포함 확인) |
| `src/lib/saju.test.ts` | `STEM_NAMES`/`BRANCH_NAMES` 전체 키 존재 + 지시서 표본 4건(`Yang Water`→壬/임, `Yin Fire`→丁/정, `Tiger`→寅/인/호랑이, `Rooster`→酉/유/닭) + `pillarLabel`/`friendlyPillarName` 단위 테스트 |
| `scripts/verify/prompt-assembly.mjs` | BRIEF-084 체크를 새 포맷으로 갱신 + BRIEF-088 신규 체크 6건(모드별 丁酉/정유/Fire Rooster/불 닭/명명 규칙/맥락 억제) |

## 2. 실출력 발췌

2026-07-22 실제 `buildAskSystem` 출력에서 TODAY 라인 그대로:

```
TODAY — 2026-07-22: 丙午(병오) year · 乙未(을미) month · 丁酉(정유) day. Friendly day name: Fire Rooster (불 닭). Hour is unknown.
```

새로 추가된 규칙 블록 전체(교체 후):

```
When the user asks what today is, today's energy, or today's saju, state today's pillars plainly by name (lead with the day pillar / 일진), then interpret. Never answer only in abstract element talk.
Use ONLY the names given in TODAY — never derive or translate day names yourself.
FIRST mention of today in a conversation: Korean → 「오늘은 임인(壬寅)일 — '물 호랑이' 날이에요」 style (formal name + friendly gloss, once). English → "a Water Tiger day" (short name only; ganzhi optional in parentheses).
AFTER that: use only the short handle, woven in ("물 호랑이 기운이…" / "with this Water Tiger energy…") — never repeat the full announcement.
TODAY-MENTION RESTRAINT — same discipline as identity mentions: do NOT re-announce today's pillars in answer after answer. Name them when the user asks about today/timing or when a specific day genuinely drives the answer — once per day of conversation is plenty. Otherwise leave the date out or refer to it implicitly ("with today's restless energy"), and never open consecutive answers with the same "오늘은 ~일이라" formula.
If today was already named earlier in this conversation, never cold-open with the announcement again — acknowledge briefly ("아까 말한 물 호랑이 날 흐름대로 —") and move straight to the answer. Two consecutive answers must never begin with the same sentence.
```

## 3. 12지지 동물 한글명 전체 목록 (본부 어감 검수용)

| 지지(EN) | 한자(독음) | 동물명 |
|---|---|---|
| Rat | 子(자) | 쥐 |
| Ox | 丑(축) | 소 |
| Tiger | 寅(인) | 호랑이 |
| Rabbit | 卯(묘) | 토끼 |
| Dragon | 辰(진) | 용 |
| Snake | 巳(사) | 뱀 |
| Horse | 午(오) | 말 |
| Goat | 未(미) | 양 |
| Monkey | 申(신) | 원숭이 |
| Rooster | 酉(유) | 닭 |
| Dog | 戌(술) | 개 |
| Pig | 亥(해) | 돼지 |

원소어(EN/KO): Wood/나무, Fire/불, Earth/흙, Metal/쇠, Water/물. 지시서 표본 조합(丁酉=Yin Fire/Rooster → "Fire Rooster (불 닭)")은 헬퍼가 그대로 산출하며, 어감 조정 필요 여부는 본부 카피 검수로 넘긴다.

## 4. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` — 281개 전체 통과 (기존 270 + 신규 11, 084/087 테스트 갱신 후 포함 무회귀)
- [x] `npm run build` 성공
- [x] `npx tsx scripts/verify/prompt-assembly.mjs` — ALL PASS (신규 6건 포함, 084 체크는 새 포맷 기준으로 갱신)
- [x] main push 완료 (커밋 해시는 §6)
- [ ] YS 실사용 확인 — KO 첫 답이 "임인(壬寅)일 — '물 호랑이' 날" 형으로 나오는지, 이후 답은 짧은 핸들만 쓰는지, 연속 답 동일 서두가 사라졌는지 (환경상 제가 직접 확인 불가, YS 게이트로 넘김)

## 5. 정직 보고

- 084 테스트/verify 체크의 원문 그대로는 새 TODAY 포맷과 맞지 않아 통과할 수 없었다(예: 기존 체크가 `daily[0].stem`인 `"Yin Fire"` 문자열이 라인에 그대로 있는지 봤는데, 새 포맷은 원소만 `"Fire"`로 축약해 적기 때문에 `"Yin Fire"`는 더 이상 등장하지 않는다). "084/087 체크 무회귀"의 취지를 "그 체크가 검증하려던 내용(오늘 일주가 정확히 표시되는가)이 새 포맷에서도 성립"으로 해석해, 검증 로직만 `pillarLabel` 기준으로 갱신했다 — 검증 대상 자체(TODAY 라인에 오늘 일주가 정확히 실리는가)는 바뀌지 않았다.
- 모델이 실제로 "정식명은 최초 1회, 이후엔 짧은 핸들만"이라는 지시를 얼마나 잘 따르는지는 이 환경에서 확인할 수 없다 — 프롬프트에 지시서 정본 문구가 정확히 실리는지(코드/테스트/verify)만 확인했다. 완료 기준 5번대로 YS의 실사용 확인이 필요하다.

## 6. 커밋 해시

- 저장소: https://github.com/Farerworks/attune
- 커밋 해시: (본 커밋 — 텔레그램 완료 보고에 함께 남긴다)
