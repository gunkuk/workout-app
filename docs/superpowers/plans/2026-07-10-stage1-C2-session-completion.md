# Plan C2 — 세션 UX 완성 + 제안 승인 + 통계 화면 (Stage 1)

> 스펙: `docs/superpowers/specs/2026-07-05-workout-pwa-design.md` (v4.2) §2-2·2-3·2-4·2-5·2-6·2-8
> 선행: Plan C1 완료(앱 셸+핵심 세션 루프, 170 tests, 브라우저 골든패스 검증됨).
> 목표: **Stage 1 기능 체크리스트(§2) 중 C1이 남긴 실질 갭을 메운다** — 특히 `pendingProposals`는 domain fold가 이미 계산해 programStore에 노출 중인데 **어떤 화면도 렌더링하지 않는 상태**(사용자가 승인해야 할 결정이 조용히 쌓이기만 함) — 이 계획의 최우선 항목.
> 범위 밖(Plan C3 이월): 프로그램 라이브러리·전환 UI, calendar 모드 UI, 세션 노트, GitHub Pages 배포(원격 push = 사용자 confirm 필요).

## Global Constraints

1. `src/domain/**` 읽기 전용 소비만 — 수정 금지.
2. 새 런타임 의존성 없음(react/zustand/dexie로 충분 — 차트는 스펙 §3.4 "차트 경량 SVG" 지시대로 라이브러리 없이 직접 그린다).
3. TS 규약 유지(값 import 확장자 없음), 커밋 제목 `(Stage1-C2 Tn)`.
4. 각 태스크: 구현 → `npx vitest run` 전체 통과 + `npm run typecheck` 0 → 커밋.
5. **fold 조인 계약 재확인**: 이 계획에서 쓰는 모든 새 SetRecord(대체 세트 등)도 C1에서 확립한 결정론적 sessionId 규약(`TodayScreen.tsx`의 `sessionIdFor`)을 그대로 재사용해야 한다 — 새로 발명하지 않는다.
6. 테스트 전략은 C1과 동일(jsdom+fake-indexeddb+testing-library, 실제 nSuns 시드 사용, mock 최소화).

## Task 1: 제안 승인 UI (pendingProposals → DecisionEvent)

**Files:** `src/components/ProposalCard.tsx`, `src/screens/TodayScreen.tsx`(수정 — 카드 삽입), `test/components/ProposalCard.test.tsx`
**우선순위 최고 — 이게 없으면 4+ 렙 탑세트·T2 2연속 미완수·악세사리 2연속 미달 시나리오에서 사용자가 아무 것도 볼 수 없다.**

**계약:**
- `programStore.pendingProposals: Proposal[]`(이미 존재, C1에서 배선됨)를 TodayScreen 상단(오늘 세션과 무관하게 항상 — 어제 세션에서 발생한 제안도 여기 뜬다)에 카드로 렌더.
- `ProposalCard`: `proposal.label`(한국어 설명) + `options[]` 버튼들 + "동결/보류"(아무 옵션도 선택 안 함 — 카드가 남아있음, 무시 가능) 선택지.
- 옵션 선택 → `DecisionEvent` 생성: `kind`는 `proposal.type`에서 매핑(`tmDeload`→`deloadAccepted`, `tmBonus`→`bonusAccepted`, `t2Deload`→`t2DeloadAccepted`, `accessoryRollback`→`rollbackAccepted`), `target = proposal.target`, `value = 선택한 option`, `sourceSetRecordId = proposal.sourceSetRecordId`, `at = nowISO()`. `appendDecision(...)` → `programStore.refreshAfterWrite()`(제안 소비 확인 — fold가 재계산되며 그 target의 미결 제안이 사라짐).
- 여러 제안이 동시에 있을 수 있음(다른 target) — 전부 카드로 나열.

**테스트(6):** ① 제안 없음 → 카드 미표시 ② tmDeload 제안 → label+2옵션(동결/−5) 렌더 ③ 옵션 클릭 → DecisionEvent append(kind="deloadAccepted", value=선택값) 확인 ④ 승인 후 refreshAfterWrite → 그 제안 사라짐(programStore.pendingProposals에서 제거) 확인 ⑤ 여러 제안 동시 렌더(TM 1개 + 악세사리 1개) ⑥ t2Deload/accessoryRollback도 동일 흐름(kind 매핑 표 전수 검증).

## Task 2: 휴식 타이머

**Files:** `src/components/RestTimer.tsx`, `test/components/RestTimer.test.tsx`
**의존:** 없음(독립).

**계약(스펙 §2-5):**
- `RestTimer({ onDone? }: { onDone?: () => void })` — "시작" 버튼(기본 90초, ± 15초 조정) → 카운트다운.
- **timestamp 기반**: 시작 시 `Date.now()` 저장, 매 렌더/tick마다 `목표시각 - Date.now()`로 재계산(setInterval 드리프트 누적 방지).
- `visibilitychange` 이벤트로 백그라운드 복귀 시 즉시 재계산(스펙 "잠금 중 알림 불가" — 브라우저 알림 API는 쓰지 않음, 화면 복귀 시 정확한 잔여시간만 보장).
- 0 도달 시 `onDone?.()` 호출 + 시각적 표시(진동/알림 없음 — §7 알려진 제약).
- SetRow 완료 시 타이머를 자동 시작할지는 이 태스크 범위 밖(컴포넌트만 만든다) — Task 6(App 배선)에서 TodayScreen에 삽입.

**테스트(5):** ① 시작 전 초기 표시(90초) ② ± 조정 ③ 시작 → 카운트다운(fake timer) ④ 0 도달 → onDone 호출 ⑤ visibilitychange 시뮬레이션 후 잔여시간이 실제 경과시간 기준으로 정확(드리프트 없음).

## Task 3: 플레이트 계산기 표시 + 운동 스킵/대체 + 통증일 프리셋

**Files:** `src/components/PlateBreakdown.tsx`, `src/components/ExerciseSwap.tsx`, `src/screens/TodayScreen.tsx`(수정), `test/components/PlateBreakdown.test.tsx`, `test/components/ExerciseSwap.test.tsx`
**의존:** `src/domain/plates.ts`(platesFor), `src/domain/programEngine.ts`(lightConventionalPreset).

**계약:**
- `PlateBreakdown({ weight, cfg })`: **`weight: number | null`을 받는다**(PlannedSet.weight가 null인 경우 — missingTM·needsInit 슬롯에서 실제로 발생). `weight === null`이면 `platesFor` 호출 없이 바로 "직접 계산 필요"(또는 미표시) 처리 — null을 `platesFor`에 넘기지 않는다. non-null이면 `platesFor(cfg, weight)` 호출 → 한쪽에 끼울 원판 목록을 큰 것부터 렌더(예: "25 + 15"). `platesFor`가 `null`(구성 불가) 반환 시도 동일 안내. SetRow 각 작업세트 옆에 삽입(작은 텍스트).
- `ExerciseSwap`: 각 슬롯 헤더에 "스킵" / "대체" 메뉴. **데드리프트 슬롯에 한해** "통증일(경량)" 옵션 노출 → 클릭 시 `lightConventionalPreset(tm.deadlift, cfg)`로 그 슬롯의 `PlannedSlot`을 교체해 렌더(원래 슬롯 대신).
- **substitutedFrom 배선(구체적 구현 지시 — 이 함수 시그니처를 그대로 바꾼다)**: `TodayScreen`의 `handleComplete(id, slot, planned, weight, reps)`에 5번째 파라미터 `swappedFrom?: string`를 추가해 `handleComplete(id, slot, planned, weight, reps, swappedFrom)`로 확장하고, 그 값을 `SetRecord.substitutedFrom`에 그대로 대입한다. TodayScreen이 스왑된 슬롯을 로컬 `swappedSlots: Record<string,string>`(slotId → 원래 exerciseId)로 추적해 `handleComplete` 호출 시 `swappedSlots[slot.slotId]`를 5번째 인자로 넘기는 방식을 따른다.
- **스킵 상태 영속(구현 지시)**: 스킵은 domain 이벤트가 아니다(types.ts에 대응 개념 없음 — 새로 만들지 않는다, 이 계획의 범위 밖). React state만으로는 새로고침 시 리셋되므로, **`sessionStorage`(브라우저 세션 한정 — 알려진 Stage1 제약으로 리포트에 명시)**에 `skip:${sessionId}:${slotId}` 키로 저장/복원한다. 완전한 영속(정정 가능한 이벤트화)은 C3 이월.
- "스킵"은 그 슬롯을 세션에서 제외 — `allWorkSetsComplete` 계산을 `slot.missingTM || isSkipped(slot.slotId) || slot.sets.every(...)`로 확장(기존 missingTM 제외 로직과 나란히, 대체하지 않음).
- **RDL은 옵션에 없다**(스펙 D5-⑥ — 영구 제외, exerciseLibrary에도 등록 안 됨).

**테스트(8):** ① PlateBreakdown 정상 구성 렌더 ② null weight(구성 불가가 아니라 애초에 weight가 null) → 안내문, platesFor 호출 안 됨(타입 에러 없이 컴파일되는지가 핵심) ③ platesFor가 null 반환하는 케이스 → 별도 안내 ④ 데드 슬롯에 통증일 옵션 노출 ⑤ 통증일 선택 → 슬롯이 5×5 경량 컨벤셔널로 교체 렌더 → 그 슬롯에서 기록한 SetRecord에 substitutedFrom="deadlift" 확인(handleComplete 5번째 인자 배선 검증) ⑥ 스킵 → 그 슬롯 제외하고도 "세션 완료" 버튼 활성화 가능, 새로고침(컴포넌트 리마운트) 후에도 스킵 상태 유지(sessionStorage 복원) ⑦ 데드 아닌 슬롯엔 통증일 옵션 없음(스쿼트 등 — RDL 등 다른 옵션도 없음).

## Task 4: TM 이력 + e1RM 차트 (경량 SVG)

**Files:** `src/components/LineChart.tsx`(범용 경량 SVG 라인차트), `src/screens/HistoryScreen.tsx`(수정 — 운동 선택 시 차트 표시), `test/components/LineChart.test.tsx`, `test/screens/HistoryScreen.test.tsx`(추가 케이스)
**의존:** `src/domain/e1rm.ts`(tmHistory, e1rmSeries).

**계약:**
- `LineChart({ points: {at:string, value:number}[], width?, height? })`: 순수 SVG(`<svg><polyline/></svg>`), 의존성 없음. x축 = 시간순 인덱스(날짜 라벨 몇 개만), y축 = 값 범위 자동 스케일. 데이터 0~1개 → "데이터 부족" 안내.
- HistoryScreen에 운동 선택 드롭다운(exerciseLibrary의 8개 T1/T2 리프트) 추가 → 선택 시 `tmHistory(loadFoldInput결과, exerciseId)`로 TM 추이 LineChart 렌더 + `e1rmSeries(effectiveSets)`에서 그 exerciseId의 topSet e1RM 추이(원종목/대체종목 분리 — substituted:true 시리즈는 점선 또는 라벨로 구분) 병행 표시.

**테스트(6):** ① LineChart 빈 데이터 → 안내문 ② LineChart 정상 렌더(polyline points 개수 확인) ③ HistoryScreen 운동 선택 → tmHistory 호출 결과 반영 ④ e1rmSeries 원종목/대체종목 분리 표시 확인(테스트 픽스처로 대체 세트 1건 포함) ⑤ 데이터 없는 운동 선택 → "데이터 부족" ⑥ 값 변화 압축(연속 동일값 미표시) 확인 — tmHistory 자체 계약이지만 화면 통합 확인.

## Task 5: 주간 부위별 분석 대시보드

**Files:** `src/screens/AnalyticsScreen.tsx`, `test/screens/AnalyticsScreen.test.tsx`, `src/App.tsx`(수정 — `#/analytics` 라우트 추가), `src/components/NavShell.tsx`(수정 — 3번째 탭)
**의존:** `src/domain/analytics.ts`(weeklyAnalysis).
**소유권**: `App.tsx`·`NavShell.tsx`의 라우트/탭 배선은 **이 태스크가 유일 소유**. Task 6은 이 두 파일을 건드리지 않고 통합 확인만 한다. Task 7의 설정 진입점도 이 태스크가 만든 최종 NavShell 구조 위에 추가한다(Task 5 완료 후 Task 7 실행 — 실행 순서 참조).

**계약:**
- `weeklyAnalysis({sets, corrections, sessions, programs})` 호출(externalSessions는 이 태스크 범위 밖 — 빈 배열) → 최신 WeekBucket(activeProgram·현재 cycleIndex/week 매칭, 없으면 최신 firstAt)을 표로 렌더: 부위별 유효세트·톤수·빈도.
- **하체 각주(스펙 §2-4 ⚠️)**: "nSuns 구조상 하체 유효세트는 상체보다 낮게 표시됩니다(프로그램 특성)" 고정 문구를 표 하단에 항상 표시.
- 과거 주 넘기기(이전/다음 버튼 — 같은 programId 내에서 firstAt 기준 정렬된 버킷 목록을 순회).

**테스트(5):** ① 최신 주 기본 표시 ② 부위별 수치가 domain 함수 결과와 일치(직접 호출 비교) ③ 하체 각주 항상 렌더 ④ 이전/다음 버튼으로 버킷 이동 ⑤ 세션 없음 → 빈 상태 메시지.

## Task 6: TodayScreen 통합 배선 + 스킵 반영 + App/NavShell 갱신

**Files:** `src/screens/TodayScreen.tsx`(최종 통합), `test/screens/TodayScreen.test.tsx`(추가 케이스)
**의존:** T1·T2·T3·T5 전부 완료 후.
**소유권**: `App.tsx`·`NavShell.tsx`는 Task 5가 이미 최종 형태로 배선했으므로 **이 태스크는 건드리지 않는다** — TodayScreen 내부 통합만.

**계약:**
- ProposalCard를 TodayScreen 최상단에 배선(T1 컴포넌트 삽입).
- 각 작업세트 완료 시 RestTimer를 그 슬롯 하단에 표시(간단: 세트 완료 콜백에서 `showTimer` 로컬 상태 true).
- 각 세트 행 옆에 PlateBreakdown 삽입.
- 슬롯 헤더에 ExerciseSwap 삽입, 스킵된 슬롯은 `allWorkSetsComplete` 계산에서 제외.

**테스트(4, 통합):** ① 전체 렌더 시 4개 컴포넌트(제안카드·타이머·플레이트·스왑) 모두 마운트 확인 ② 스킵한 슬롯 있어도 나머지 완료 시 세션 완료 가능 ③ Task 5가 만든 3탭 네비게이션과 통합해도 정상 동작(App.tsx/NavShell.tsx 변경 없이) ④ 기존 T4 테스트(체크오프·정정·needsInit) 전부 회귀 없음(재실행 통과).

## Task 7: JSON 내보내기/가져오기 (Web Share + 다운로드 fallback)

**Files:** `src/lib/backup.ts`, `src/screens/SettingsScreen.tsx`(신규 — 최소: 내보내기/가져오기 버튼만), `test/lib/backup.test.ts`, `src/App.tsx`(수정 — `#/settings` 라우트), `src/components/NavShell.tsx`(수정 — 설정 진입점, 4번째 탭 대신 오늘 화면 상단 아이콘으로 최소화 — 구현자 판단, 문서화), **`src/storage/eventStore.ts`(수정 — 아래 신규 함수 2개 추가)**
**의존:** `src/storage/eventStore.ts`의 `loadFoldInput`.

**주의(계획 검증에서 발견)**: `listLibrary()`는 `library`+`programVersions`를 조인해 병합된 `ProgramDefinition[]`만 반환 — `programId`/`addedAt` 원본을 버려서 무손실 왕복이 안 된다. 이 태스크에서 `eventStore.ts`에 다음 2개 함수를 **추가**한다(캡슐화 유지 — 화면이 `db`를 직접 참조하지 않게):
```typescript
getLibraryEntries(): Promise<{programId: string, addedAt: string}[]>   // db.library.toArray() 그대로
getAllProgramVersions(): Promise<ProgramDefinition[]>                    // db.programVersions.toArray() (조인 없이 전 버전)
```
`exportSnapshot`은 이 둘 + `loadFoldInput()` + `getInstanceState()`를 조합해 스냅샷을 만든다. `importSnapshot`은 각각의 upsert(`appendSet`/`appendCorrection`/`appendDecision`/`appendSession`/`upsertProgramVersion`/`addToLibrary`/`setInstanceState`)를 반복 호출해 병합(id 합집합).

**계약(스펙 §2-8):**
```typescript
exportSnapshot(): Promise<object>   // 이벤트 로그 전체 + 프로그램 정의 전 버전(fork 포함) + ProgramInstanceState + 라이브러리. 설정은 Stage1엔 없음(생략).
importSnapshot(data: object): Promise<void>   // schemaVersion 체크 후 각 테이블 upsert(put) — 기존 데이터 위에 병합(머지: id 합집합, 스펙 §3.3)
```
- 내보내기: `exportSnapshot()` → JSON.stringify → **iOS**: `navigator.share`(Web Share API, files 지원 시) 시도, 미지원 시 클립보드 fallback(`navigator.clipboard.writeText`) / **그 외**: `<a download>` blob URL.
- 가져오기: `<input type="file">` → JSON.parse → schemaVersion 불일치 시 명시 안내 후 중단(스펙 §3.3 마이그레이션 절 — 이 Stage에선 마이그레이션 함수 없이 그냥 거부) → `importSnapshot`.
- UA 분기(iOS 감지)는 OnboardingScreen에서 이미 쓴 패턴 재사용.

**테스트(6):** ① exportSnapshot이 DB 전체를 정확히 담는지(왕복 테스트: append 몇 개 → export → 새 DB에 import → loadFoldInput 결과 동일) ② schemaVersion 불일치 → 명시 에러, DB 변경 없음 ③ 가져오기 후 기존 데이터와 병합(덮어쓰지 않고 id 합집합) ④ Web Share 가능 환경 시뮬레이션(navigator.share mock) → 호출됨 ⑤ 미지원 환경 → download fallback(anchor click 시뮬레이션 또는 blob URL 생성 확인) ⑥ 잘못된 JSON(파싱 실패) → 에러 안내, 크래시 없음.

## Task 8: 통합 회귀 + 브라우저 골든패스 재검증

**Files:** 없음(검증 전용 — 코드 변경 시 발견된 결함만 해당 태스크 파일에 최소 수정, 새 파일 생성 금지)

- `npx vitest run` 전체(170 + T1~T7 신규 합계) + `npm run typecheck` 0 + `npm run build`.
- **브라우저 프리뷰 골든패스 재실행**(C1과 동일 절차: 온보딩→체크오프→세션완료→새로고침) + 신규: 제안 카드 발생 시나리오 1개(예: 탑세트 0~1렙 기록 → 다음 로드 시 tmDeload 카드 노출 확인) + 통증일 프리셋 선택 플로우 1개 + 내보내기 다운로드 1회 실측.
- 콘솔 에러 0, 실패 네트워크 0.

---

## 실행 순서

T1(최우선) → T2·T3·T4(서로 독립, 순차 실행) → T5(App.tsx·NavShell.tsx 최종 배선 — 이후 태스크는 이 두 파일을 건드리지 않는다) → T6(통합, T1·T2·T3·T5 완료 후) → T7(T5의 NavShell 구조 위에 설정 진입점 추가 — T5 이후) → T8(전부 완료 후 최종 검증).
누적 기대 테스트: 170 → T1 176 → T2 181 → T3 189(8개) → T4 195 → T5 200 → T6 204 → T7 210 (초과 허용, 실측 리포트에 기재).

## 참고(계획 검증에서 발견, minor)

`lightConventionalPreset`(programEngine.ts)은 `slotId: "lightConventionalDeadlift"`를 하드코딩 — 현재 nSuns 시드가 데드리프트 슬롯을 1개만 가지므로 문제없으나, 여러 데드리프트 슬롯이 있는 프로그램에선 충돌 가능(C3 이월 — 이 계획 범위 밖, domain 불변이므로 수정 안 함).
