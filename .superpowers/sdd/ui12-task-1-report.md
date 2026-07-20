# UI12 Task 1 — KK 6-day 프로그램(허리 부상 대응) + linearTopSet·repLadder 규칙

> **읽는 법(cold-reader)**: 이 문서는 사전 맥락 없이도 이해되게 썼다. 용어: **TM**=트레이닝 맥스(1RM 근사 기준값, 프로그램의 %가 이 값을 기준으로 무게를 계산), **T1/T2**=메인/서브 리프트 라벨, **AMRAP**=Ask Many Reps As Possible(최대반복, 목표 이상 수행 허용), **fold**=이벤트(세션 기록·정정·결정)를 접어 현재 TM·악세사리 상태를 계산하는 순수 함수(`src/domain/fold.ts`), **capKey**=발효 상한(같은 TM이 한 사이클-주에 두 번 오르지 않도록 막는 키).

## 1. 배경·요청
사용자가 허리 부상에 대응하는 새 6일 분할 프로그램(`kk-6day`)을 확정했고, 이를 표현하려면 기존 4규칙(nsunsTopSet·t2LastSet·doubleProgression·linear[미구현])으로는 부족해 새 규칙 2개(선형 T1 증량 `linearTopSet`, T2/악세사리 렙 사다리 `repLadder`)가 필요했다. `src/domain/**`은 동결 계약이지만 스펙 §5가 "새 증량 규칙 = 규칙 파일 1개 추가"를 설계된 확장점으로 명시하므로, 이번 작업은 **가산(additive)만** 수행했다.

## 2. 가산 확장 목록 (동결 계약 내 새 분기)
| 파일 | 변경 종류 |
|---|---|
| `src/domain/rules/linearTopSet.ts` | 신규 파일 — `judgeLinearTopSet(actualReps, {increment, minReps})` |
| `src/domain/rules/repLadder.ts` | 신규 파일 — `deriveRepLadderTargets(total, params)`, `applyRepLadderSession(state, lastSets, params)` |
| `src/domain/fold.ts` | import 2줄 추가 + `else if (progressionRuleId === "linearTopSet")` 분기 + `else if (progressionRuleId === "repLadder")` 분기 (기존 nsunsTopSet/t2LastSet/doubleProgression 분기는 문자 그대로 무수정) |
| `src/domain/programEngine.ts` | `buildSet`에 선택적 파라미터 `repLadderReps?: number` 추가(기존 4개 위치 호출부는 그대로, 신규 호출부만 5번째 인자 전달), `buildSlot`에 repLadder 전용 파생 계산 3줄 추가 |
| `src/domain/types.ts` | **무수정** — `Proposal.type`은 기존 `"tmDeload"`를 재사용(신규 literal 불필요), `AccessoryState.targetReps`는 기존 필드를 "사다리 총합" 의미로 재사용(필드 추가도 불필요) |
| `lib/validationCore.mjs` | `RULES`에 `linearTopSet`·`repLadder` 키 2개 추가(기존 4개 키 무수정) |
| `schema/rules-catalog.md` | 신규 규칙 2개 문서화 + `linear`에 "⚠️ 미구현" 표기 추가 |
| `src/domain/exerciseLibrary.ts` | `dumbbellRow`·`bulgarianSplitSquat`·`oneArmRow` 3종 추가(기존 19종 무수정) |
| `src/lib/bundledPrograms.ts` | `kk6dayRaw` import + `BUNDLED_RAW` 배열에 1개 추가 |
| `programs/kk-6day.json` | 신규 프로그램(1주 반복, 5일) |

`types.ts`가 무수정이라는 점이 가장 중요한 검증 포인트다 — 두 신규 규칙 모두 **기존 스키마 필드의 재해석**만으로 표현 가능했다(Proposal.type="tmDeload" 재사용, AccessoryState.targetReps를 "목표 렙"에서 "사다리 총합"으로 의미 확장하되 타입은 그대로 `number`).

## 3. repLadder 사다리 파생 검증표
`deriveRepLadderTargets(total, {sets:4, repMin:5, repMax:7})` — 사용자 스펙의 8스텝을 총합(20~28)으로 인코딩:

| total | extra=total-20 | level=5+⌊extra/4⌋ | rem=extra%4 | per-set 목표 | 사용자 표기 |
|---|---|---|---|---|---|
| 20 | 0 | 5 | 0 | [5,5,5,5] | 5555 |
| 21 | 1 | 5 | 1 | [6,5,5,5] | 6555 |
| 22 | 2 | 5 | 2 | [6,6,5,5] | 6655 |
| 23 | 3 | 5 | 3 | [6,6,6,5] | 6665 |
| 24 | 4 | 6 | 0 | [6,6,6,6] | 6666 |
| 25 | 5 | 6 | 1 | [7,6,6,6] | 7666 |
| 26 | 6 | 6 | 2 | [7,7,6,6] | 7766 |
| 27 | 7 | 6 | 3 | [7,7,7,6] | 7776 |
| 28 | 8 | 7 | 0 | [7,7,7,7] | 7777 |

`test/domain/rules-repLadder.test.ts`가 전 구간(20~28) + 왕복(sum(derive(total))===total) + 미달 시 정지(재도전) + 최상단 이후 weight+=weightStep·리셋(20)을 오라클로 검증. 상태 저장은 `AccessoryState.targetReps`에 total을 그대로 저장 — programEngine이 렌더 시 `deriveRepLadderTargets`로 다시 풀어 세트별 reps를 채운다.

## 4. 풀업 예외 근거
가중 풀업(월 T1)은 **doubleProgression**(기존 규칙, 무수정)을 그대로 쓰고 linearTopSet 대상에서 제외했다. 근거: TM 퍼센트 방식은 체중이 부하의 대부분(예: 88kg 체중 + 가중 20kg 중 TM을 20kg로 잡으면 70%=14kg — 실제로는 "체중+14kg" vs "체중+20kg"라 강도차가 거의 없음)이라 물리적으로 무의미. 스펙에 명시된 예외를 그대로 반영했고, 프로그램 `description`과 이 리포트에 명시.

## 5. 티바로우 TM 안내 방식
`OnboardingScreen.tsx`의 TM 시드 목록(`T1_EXERCISES`)은 **무수정**(기존 4-day 사용자에게 불필요한 필드 노출 방지). 대신 `kk-6day.json`의 `description`에 "설정 → TM 수동 편집에서 입력, 데드리프트 TM의 약 60~70% 권장"을 명시. 앱 동작은 기존 `missingTM` 경로(제네릭 `tm[ref] === undefined` 체크, `programEngine.test.ts` ⑤에서 이미 오라클 검증됨)가 그대로 커버 — 티바로우 슬롯도 TM 미설정 시 무게 null·워밍업 없음으로 정상 표시되고, 수동 TM 편집 후 정상 렌더된다(코드 변경 불필요, 기존 제네릭 경로 확인만).

## 6. 게이트 결과
- `npx vitest run`: **379 passed / 380** (1 failed는 `test/screens/HomeScreen.test.tsx` ⑨ 출석 스트립 — `git stash`로 내 변경분을 전부 제거한 base 커밋(`2ff37ba`)에서도 동일하게 실패함을 확인, 내 작업과 무관한 기존 결함). 신규 3개 테스트 파일(23 tests) 전부 통과, 기존 테스트는 **단 하나도 수정하지 않고 전부 그대로 통과**.
- `npm run typecheck`: 0 errors.
- `npm run lint`: 0 errors (eslint src).
- `npm run build`: 성공.
- `node tools/validate.mjs programs/kk-6day.json`: ✅ 통과.

## 7. 확인 필요(사용자 판단)
1. **레터럴레이즈 weightStep=2.5(덤벨) vs 머신컬·카프레이즈 weightStep=5(머신)** — "바벨/덤벨 2.5, 머신 5" 스펙 원칙을 종목별 실제 장비 추정으로 배정했다(덤벨로우·불가리안·원암로우·CGBP·레터럴레이즈=2.5, 머신컬·카프레이즈=5). 사용자 짐 장비가 다르면(예: 레터럴레이즈가 머신) 조정 필요.
2. **월/토 레터럴레이즈 중 월에만 규칙 배정** — §3.3 불변식(exerciseId당 규칙 슬롯 ≤1)상 필수였지만, 토요일 레터럴레이즈는 규칙 없이 tracked만 유지(수동 기록, 자동 증량 없음) — kk-4day의 `d3-abs`(legRaise 2회 등장 중 1회만 규칙) 패턴을 그대로 따른 것. 토요일에도 진행 반영을 원하면 별도 판단 필요.
3. **repLadder 미달 시 무제한 재도전(디로드 제안 없음)** — doubleProgression의 2연속 미달 롤백 제안과 달리, repLadder는 스펙에 명시된 대로 미달 시 그냥 그 스텝을 유지만 하고 디로드 제안이 없다. 장기간 정체 시 사용자가 수동으로 무게를 낮출 수단이 필요하면 추가 설계가 필요.
