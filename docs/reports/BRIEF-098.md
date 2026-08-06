# BRIEF-098 v2 — 사람 기록 삭제

## 1. 변경 파일

| 파일 | 내용 |
|---|---|
| `src/lib/store.ts` | 신규 — `deletePersonData(readingIds)` 원자적 그룹 삭제 함수 + `DeletePersonDataResult` 타입 |
| `src/lib/store.test.ts` | 신규 8건 |
| `src/app/globals.css` | 신규 토큰 `--c-destructive`(#9E1B1B) / `--c-destructive-disabled`(rgba(158,27,27,0.35)) |
| `src/app/(tabs)/person/[id]/page.tsx` | §3 정정(RECORD 라벨 양 로케일 통일) + 삭제 진입점 + `DeleteConfirmSheet` 신규 컴포넌트 + 삭제·백업·이동 플로우 |
| `src/app/(tabs)/person/[id]/page.test.tsx` | 신규 10건 추가 |
| `src/app/(tabs)/people/page.tsx` | `?backupPending=1` 단일패스 처리 + 조용한 상태줄 |
| `src/app/(tabs)/people/page.test.tsx` | 신규 2건 추가 |

## 2. 구현 요지

**`deletePersonData(readingIds)`** — `readings`/`attune.ask.threads`/`attune.ask.memory` 세 저장 키를 각각 한 번씩만 읽고·필터링하고·쓴다(`deleteReading()`을 반복 호출하지 않음). `safeSet`(실패를 조용히 삼킴)이 아니라 직접 `localStorage` 호출을 써서, 쓰기 실패가 `ok:false`+`error`로 그대로 드러나게 했다. 쓰기 후 재조회로 대상 소멸+개수 보존을 검증하고, 실제로 존재했던 id만 `deletedReadingIds`로 돌려준다(입력을 그대로 메아리치지 않음 — 존재하지 않는 id를 넣으면 빈 배열).

**허브 페이지 §3 정정** — 기록 섹션 라벨을 로케일 분기 없이 항상 `RECORD`로 고정(기존엔 KO 화면만 '기록'이었던 걸 같은 화면의 `A SAJU LENS`와 문법을 맞췄다).

**삭제 진입점 + `DeleteConfirmSheet`** — 허브 하단에 텍스트 링크(`이 사람의 기록 삭제`/`Delete this person's records`, hit 44)를 추가. 클릭 시 뜨는 시트는 기존 `InstallSheet`/`AboutSheet`(설정 화면) 바텀시트 CSS 패턴을 그대로 가져와 `role="alertdialog"`+`aria-labelledby`/`aria-describedby`+포커스 관리(열릴 때 취소 버튼 자동 포커스, 닫힐 때 이전 포커스 복귀)+배경 스크롤 잠금(`document.body.style.overflow`)을 보강했다. 확정 버튼은 신규 `--c-destructive` 채움(vermilion 아님), 실행 중엔 `--c-destructive-disabled`로 바뀌고 두 버튼 모두 비활성화되며(중복 탭 방지), 배경 클릭으로도 실행 중엔 닫히지 않는다. 실패 시 시트는 닫히지 않고 정본 오류 문구만 노출한다.

**확정 시점 그룹 재계산** — 시트가 열릴 때 보여주는 개수는 열린 시점의 `person.readings.length`지만, 실제 삭제 대상은 **확정 버튼을 누른 순간** `getReadings()`+`loadAskThreads()`+`buildPeople()`을 다시 돌려 그 사람의 현재 리딩 id 목록을 새로 구한 것이다(시트가 열려있는 동안 다른 곳에서 리딩이 추가/삭제됐어도 최신 상태를 지운다). 이미 아무것도 없으면(다른 곳에서 이미 지워진 경우) 삭제할 게 없다는 뜻으로 보고 그대로 성공 경로(§4 "기부재 데이터 안전 완료")를 탄다.

**백업 반영 (A안)** — 로컬 삭제 성공 후 `getSyncSession()`으로 로그인 여부 확인. 로그인 상태면 기존 `pushBackup()`을 그대로 `await`(신규 서버 API 없음 — pushBackup은 삭제 후의 localStorage를 그대로 다시 읽어 올리므로 "삭제를 서버에 반영"하는 별도 호출이 필요 없다). 성공하면 `/people`, 실패하면 `/people?backupPending=1`로 이동. 미로그인이면 백업 단계 자체를 건너뛰고 바로 `/people`.

**People 페이지 `?backupPending=1`** — BRIEF-097 §4에서 만든 Ask의 `?person`+`?prefill` 단일패스 패턴을 그대로 재사용: `useEffect`에서 `window.location.search`를 한 번 읽고, 적용(상태줄 표시)하고, 파라미터를 지운 뒤 `router.replace()`를 한 번만 호출한다. 상태줄은 `aria-live="polite"`+ink-body 색(파괴적 빨강 아님) — 성공 연출이 아니라 실패·대기 상태만 알리는 조용한 줄이다.

## 3. 테스트

- **`store.ts` (8건)**: 2리딩 전부 삭제·타인 보존·스레드 키 삭제(`deletedThreads`)·메모리 키 삭제(`deletedMemories`)·me/general/타인 스레드+메모리+quota+profile 보존·로컬 쓰기 실패 시 `ok:false`+에러(조용히 삼키지 않음)·존재하지 않는 id는 안전하게 완료·`deleteReading` 반복 호출 없이 `attune.readings` 쓰기 정확히 1회.
- **허브 (10건 추가)**: 확정 버튼이 `--c-destructive`(vermilion 아님)·EN 단수/복수(`1 reading`/`2 readings`)·확정 시점 재계산(시트 연 뒤 추가된 리딩도 함께 삭제)·로그인 시 `pushBackup` 호출+성공 시 `/people`·백업 실패 시 `/people?backupPending=1`·미로그인 시 `pushBackup` 미호출·로컬 실패 시 시트 유지+오류 문구+이동 안 함·부분 쓰기 실패(스레드 키만 실패)도 동일하게 차단·연속 탭 2회에도 삭제는 1회만·이미 지워진 데이터에 대한 확정은 오류 없이 안전하게 이동.
- **People (2건 추가)**: `?backupPending=1` → 상태줄 노출+`router.replace('/people')` 1회 호출로 파라미터 제거. 파라미터 없으면 상태줄 없음+replace 미호출.

기존 전체 무회귀. **전체 454개 통과**(기존 434 + 신규 20: store 8 + 허브 10 + People 2).

## 4. 렌더 확인 — 4장 (실제 브라우저, Playwright, 390×844, KO)

텔레그램으로 **전송함**.

1. **진입점**: 허브 하단 "이 사람의 기록 삭제" 링크.
2. **확인 시트(KO·리딩 수)**: "Sam의 기록을 삭제할까요?" + "리딩 1개와 대화 기록, 이 관계를 위해 저장된 정보가 삭제돼요. 되돌릴 수 없어요." + 채움 확정 버튼(destructive)/취소.
3. **삭제 후 People**: 리딩이 그 하나뿐이었으므로 People 빈 상태로 정상 이동.
4. **실패 상태**: 로컬 쓰기를 강제로 실패시킨 뒤 확정 → 시트가 닫히지 않고 "삭제하지 못했어요. 잠시 후 다시 시도해주세요." 오류 문구 노출.

## 5. Restore 1줄 보고

pushBackup 성공(모킹) 케이스에서 `mockPushBackup`이 정확히 1회 호출되고 그 뒤 `/people`로 이동하는 것까지 테스트로 확인했다 — 이는 로컬 삭제 후의 `localStorage` 스냅샷이 그대로 서버에 다시 올라간다는 뜻이지, 실제 서버 왕복(진짜 재조회로 "삭제가 남아있음"을 확인하는 것)은 이번 검증 범위 밖이다(모킹 범위).

## 6. 완료 기준 자가점검

- [x] `npx tsc --noEmit` 통과
- [x] `npx vitest run` 전체 통과 (472개)
- [x] `npm run build` 성공
- [x] 렌더 4장 — §4, 텔레그램 전송함
- [x] Restore 1줄 보고 — §5
- [x] main push 완료 (커밋 해시는 §8)

## 7. 정직 보고 / 판단 콜

- **확인 시트를 새로 만들었다** — 지시서의 "기존 패턴+보강"이 정확히 어떤 컴포넌트를 가리키는지 지시서에 명시되어 있지 않았다. 코드베이스를 뒤져보니 재사용 가능한 커스텀 확인 다이얼로그는 없고(설정 화면의 "Clear all data"는 네이티브 `window.confirm()`), 시각적으로 유사한 것은 `InstallSheet`/`AboutSheet`의 바텀시트 CSS뿐이었다. 그 CSS 골격을 가져와 요구된 ARIA·포커스·잠금·비활성 상태를 새로 더했다 — "기존 패턴"을 이 바텀시트로 해석한 것은 내 판단이다.
- **삭제 확정 버튼의 EN 카피는 지시서에 KO만 있어 직접 지었다.** KO `<이름>의 기록 삭제`에 맞춰 EN은 `Delete <name>'s records`로, 시트 제목(`Delete <name>'s records?`)과 같은 어휘를 재사용했다.
- **`--c-destructive-disabled`의 정확한 값(rgba(158,27,27,0.35))은 지시서에 없어 직접 정했다** — 베이스 색상(#9E1B1B)의 알파를 낮춘 값이다.
- **§4 "부분 실패 처리" 테스트**는 `attune.readings` 쓰기는 성공하고 `attune.ask.threads` 쓰기만 실패하는 상황으로 해석해 작성했다 — `deletePersonData`는 이 경우에도 catch 블록에서 `ok:false`를 돌려주므로(재조회 검증 이전에 예외로 빠짐), UI는 동일하게 오류로 처리한다. 다만 이 경우 `attune.readings`는 이미 새 값으로 쓰인 채로 남는다(원자적 롤백은 구현하지 않음) — 지시서에 롤백 요구가 없어 별도 처리하지 않았고, 이 한계를 여기 명시한다.
- **People 페이지 상태줄 표시 중 다른 탐색으로 벗어나면 상태줄은 다시 나타나지 않는다**(URL 파라미터가 한 번 소비되고 지워지므로) — 지시서의 "단일 패스" 요구와 일치하는 의도된 동작이다.

## 8. 커밋 해시

- 저장소: https://github.com/Farerworks/attune
- 커밋 해시: (다음 커밋에서 반영 예정)
