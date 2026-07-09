# Plan B2 — 도메인 완성: 엔진·워밍업·cyclePos·분석·e1RM (Stage 1)

> 스펙: `docs/superpowers/specs/2026-07-05-workout-pwa-design.md` (v4.2) §2-1·2-4·2-5·3.2·3.3·3.6
> 선행: Plan A(스키마·도구, 26 tests) + Plan B1(fold 코어, 73 tests) 완료. 이 계획 후 도메인 레이어 완성 → Plan C(UI)로.
> 방식: B1의 verbatim 전사와 달리, 이 계획은 **계약 + 열거된 테스트 케이스(오라클 수치)**를 준다. implementer가 코드·테스트를 작성하고, 리뷰어가 계약 대비 검증한다.

## Global Constraints (전 태스크 공통)

1. **fold 계약 불가침**: `src/domain/fold.ts`·`corrections.ts`·`order.ts`·`rules/*`·`foldSupport.ts`는 수정 금지. 새 모듈은 이들을 소비만 한다.
2. **순수성**: `src/domain/**`는 부수효과 금지 — `Date.now()`·`Math.random()`·IO 금지. 시각·오늘 날짜는 전부 파라미터로 받는다.
3. **반올림 정본**: `roundToStep(w, step) = Math.round(w/step)*step` — `lib/render.mjs`와 **동일 semantics** (같은 프로그램·TM이면 앱과 render 도구가 같은 수치). TS 쪽에 동일 함수를 두되 이름·동작 일치.
4. **Import 규약**: 값 import는 `.ts` 확장자 제거, type-only import는 `.ts` 유지 가능.
5. **의존성 동결**: devDeps = typescript·@types/node·vitest만. 런타임 deps 없음.
6. TDD: 실패 테스트 먼저 → 구현 → `npx vitest run` 전체 + `npm run typecheck` 0 errors → 커밋. 커밋 제목에 `(Stage1-B2 Tn)` 접미.
7. 각 태스크의 테스트 케이스는 아래 열거 목록이 **전수** — 추가 케이스는 자유(초과 허용), 누락은 불가. 기대 카운트는 "최소" 기준.

## 공유 타입 (이 계획에서 추가)

- `types.ts`에 추가 (T4): `ProgramInstanceState { programId, programVersion, mode: "calendar"|"rolling", anchor: { startDate?: string }, schemaVersion }` — calendar면 startDate(YYYY-MM-DD) 필수.
- `programEngine.ts` 내 (T5): `PlannedSet { weight: number|null, reps: number, amrapRole?, setType: "work"|"warmup" }`, `WorkoutPlan { pos, dayName, slots: PlannedSlot[] }`, `PlannedSlot { slotId, exerciseId, label, warmups: PlannedSet[], sets: PlannedSet[], missingTM: boolean, needsInit: boolean }`.

---

### Task 1: exerciseLibrary — 운동 메타데이터 (부위·힌지)

**Files:** Create `src/domain/exerciseLibrary.ts`, `test/domain/exerciseLibrary.test.ts`

**계약:**
```
MuscleGroup = "chest"|"back"|"shoulders"|"quads"|"hamstrings"|"glutes"|"calves"|"biceps"|"triceps"|"core"
ExerciseInfo = { id: string, name: string /*한글*/, groups: MuscleGroup[] /*primary 1~3*/, hinge?: true }
EXERCISES: Record<string, ExerciseInfo>  // 아래 13종 정확히
exerciseInfo(id: string): ExerciseInfo | undefined
```
매핑(고정 데이터 — 이대로):
| id | name | groups | hinge |
|---|---|---|---|
| bench | 벤치프레스 | chest, triceps | |
| inclineBench | 인클라인 벤치 | chest, shoulders | |
| cgbp | 클로즈그립 벤치 | triceps, chest | |
| ohp | 오버헤드프레스 | shoulders, triceps | |
| squat | 스쿼트 | quads, glutes | |
| frontSquat | 프론트 스쿼트 | quads, core | |
| deadlift | 데드리프트 | hamstrings, back, glutes | ✓ |
| sumoDeadlift | 스모 데드리프트 | glutes, hamstrings, quads | ✓ |
| latPulldown | 랫풀다운 | back, biceps | |
| chestSupportedRow | 체스트서포티드 로우 | back | |
| machineCurl | 머신 컬 | biceps | |
| calfRaise | 카프 레이즈 | calves | |
| rearDeltFly | 리어델트 플라이 | shoulders | |
(RDL은 **등록하지 않는다** — 사용자 명시 확정("절대 안 함", D5-⑥). 임시 대체로 RDL을 치는 시나리오는 Stage 1 범위 밖 — 라이브러리 밖 운동의 hinge 기본값은 false로 문서화.)

**테스트 (3):** ① nSuns 시드 JSON의 모든 exerciseId가 라이브러리에 존재 ② hinge = {deadlift, sumoDeadlift} 정확히 ③ 모든 항목 groups 1~3개·유효 MuscleGroup.

---

### Task 2: plates — 플레이트 계산기 (반올림 단위·힌지 하한의 원천)

**Files:** Create `src/domain/plates.ts`, `test/domain/plates.test.ts`

**계약:**
```
PlateConfig = { barWeight: number, plates: { weight: number, pairs: number, fullDiameter?: true }[] }
stepOf(cfg): number                    // = 2 × 최소 plate weight (보유 원판에서 파생 — 스펙 §2-1)
roundToStep(w: number, step: number): number   // Math.round(w/step)*step
platesFor(cfg, target): number[] | null // 한쪽 구성 (내림차순 greedy, pairs 재고 준수). target < barWeight → null.
                                        // 정확 도달 불가면 도달 가능한 최근접 하위 구성 반환 아님 — null 아님:
                                        // greedy 잔여>0이면 null (정확 조합만). UI는 roundToStep 값으로 호출하므로 실전 null 드묾.
achievableBelow(cfg, target): number    // bar + 2×(greedy 최대 합 ≤ (target−bar)/2) — 워밍업 내림용
minHingeLoad(cfg): number               // barWeight + 2×min(fullDiameter plate weight). fullDiameter 없으면 barWeight.
DEFAULT_PLATES: PlateConfig             // bar 20, [{25,pairs:4,fullDiameter},{20,2,fullDiameter},{15,2},{10,2},{5,2},{2.5,2},{1.25,2}]
```

**테스트 (6, DEFAULT_PLATES 기준):**
① `stepOf` = 2.5 ② `roundToStep(78.75,2.5)` = 80 · `roundToStep(73.5,2.5)` = 72.5 (half-up 확인)
③ `platesFor(100)` = [25,15] (한쪽 40) ④ `platesFor(19)` = null (bar 미만)
⑤ `minHingeLoad` = 60 (bar20+2×20) ⑥ `achievableBelow(107.4)` = 105 이하 최대 정확 구성 = 105.

---

### Task 3: warmup — 워밍업 자동 생성 (상대 %·불변식)

**Files:** Create `src/domain/warmup.ts`, `test/domain/warmup.test.ts`
**의존:** T2 (plates).

**계약 (스펙 §2-5):**
```
generateWarmup(firstWorkWeight: number, opts: { hinge: boolean, cfg: PlateConfig }): PlannedWarmup[]
PlannedWarmup = { weight: number, reps: number }
```
알고리즘(이대로 — fold급 확정 계약. **연산 순서가 불변식의 일부**):
1. `floor` = 힌지면 `minHingeLoad(cfg)`, 비힌지면 `cfg.barWeight`. `cap = firstWorkWeight − stepOf(cfg)`.
2. **floor > cap이면 즉시 [] 반환**(램프 생략 — 힌지·비힌지 공통 가드. 비힌지에서 bar < base < bar+step 구간이 불변식을 깨는 것을 여기서 차단).
3. 램프 템플릿: 빈바×10 → 50%×5 → 70%×3 → 88%×1 (% = firstWorkWeight 대비, 빈바 = cfg.barWeight). 힌지는 빈바 스텝 **제거**.
4. %스텝을 `roundToStep(w, stepOf(cfg))`로 반올림(빈바 스텝은 반올림 없음) → **floor로 하한 클램프** → 그 다음 **cap 초과 스텝 제거**(이 순서 고정: 클램프가 cap 검사보다 먼저).
5. 무게 중복은 첫 스텝만 유지(dedupe), 오름차순 보장.

**테스트 (8, DEFAULT_PLATES):**
① base 80 비힌지 → [{20,10},{40,5},{55,3},{70,1}] (56→55, 70.4→70 반올림 확인)
② base 105 힌지 → [{60,5},{72.5,3},{92.5,1}] (52.5→60 클램프, 빈바 없음)
③ base 25 비힌지 → cap 22.5 → [{20,10},{22.5,1}] (50%=12.5·70%=17.5는 bar 클램프→20 dedupe, 88%=22→반올림 22.5 = cap과 동률이라 생존)
④ base 55 힌지(floor 60 > cap 52.5) → []
⑤ 불변식 property: base ∈ {40,60,80,100,120,140} 전부에서 모든 스텝 ≤ base−2.5
⑥ 오름차순·중복 없음 property (같은 집합)
⑦ base = bar+step(22.5) 비힌지 → [{20,10}] (cap=20=floor → 빈바만 생존)
⑧ base 21 비힌지 → [] (floor 20 > cap 18.5 — 공통 가드 발동, 불변식 위반 무게가 나오지 않음)

---

### Task 4: cyclePos — calendar/rolling 커서 (ProgramInstanceState)

**Files:** Create `src/domain/cyclePos.ts`, `test/domain/cyclePos.test.ts`; `types.ts`에 `ProgramInstanceState` 추가 (기존 타입 수정 금지, 추가만)

**계약 (스펙 §3.3 ProgramInstanceState):**
```
nextCyclePos(program, pos): CyclePos      // 그 주 days 배열 순서상 다음 ordinal → 없으면 week+1 첫 day → 없으면 cycleIndex+1, week0 첫 day
rollingCyclePos(program, sessions: SessionCompleted[]): CyclePos
  // **program.id와 programId 일치하는 세션만 사용(내부 필터 — 프로그램 전환 후 이전 프로그램 세션의 cyclePos 오적용 차단, 스펙 §2-7)**.
  // completed·skipped 불문 (at,id) 최대 세션의 cyclePos 다음. 없으면 {cycleIndex:0, week:0, dayOrdinal: 첫 day ordinal}
calendarCyclePos(program, state: ProgramInstanceState, todayISO: string):
  { cycleIndex, week, candidateDayOrdinal: number|null } | { notStarted: true }
  // diffDays = floor((today − startDate)/일). 음수 → notStarted.
  // wkIdx = floor(diffDays/7); week = wkIdx % program.weeks.length; cycleIndex = floor(wkIdx / weeks.length)
  // candidateDayOrdinal = 오늘 요일(로컬)과 weekdayHint 일치하는 day의 ordinal, 없으면 null (휴식일)
  // 요일 매핑: getDay() 0~6 → ["일","월","화","수","목","금","토"]
validateAnchor(program, state): boolean
  // 스펙 §3.3 제약 "startDate = 사이클-주 첫 훈련일": startDate 요일 == 첫 week 첫 day의 weekdayHint.
  // 힌트 없는 프로그램이면 true. 생성 시 강제는 UI(Plan C) 몫 — 여기선 판정 함수만 제공.
```
과거 불변성(스펙 §3.6 "anchor 변경 후 과거 cyclePos 불변"): **구조적 보장** — fold 입력(§3.3)에 ProgramInstanceState가 없고, calendar 계산은 세션 이력을 입력으로 받지 않는다. (B1이 테스트한 것이 아님 — 이 개념은 이 계획에서 처음 도입.) 미래 리팩터가 이 by-construction 보장을 깨는 것을 잡기 위해 회귀 테스트 ⑩을 둔다.

**테스트 (10, nSuns 시드(1주 5day) 기준):**
① rolling: 세션 없음 → {0,0,1} ② rolling: 마지막 완료 {0,0,3} → {0,0,4} ③ rolling: {0,0,5}(주 마지막) → {1,0,1} (1주 프로그램: week wrap = cycle++) ④ rolling: skipped도 커서 전진 ⑤ calendar: startDate 2026-07-07(화)·today 2026-07-09(목) → {cycleIndex:0, week:0, candidateDayOrdinal:3} ⑥ calendar: today 2026-07-13(월) → diffDays 6 → {cycleIndex:0, week:0, candidateDayOrdinal:null}(월 = 힌트 불일치 휴식일) / today 2026-07-14(화) → diffDays 7 → {cycleIndex:1, week:0, candidateDayOrdinal:1} (1주 프로그램 wrap) ⑦ calendar: today < startDate → notStarted ⑧ validateAnchor: startDate 2026-07-07(화)=첫 day 힌트 화 → true / 2026-07-08(수) → false ⑨ rolling: 다른 programId 세션만 있으면 무시하고 {0,0,1} (전환 시나리오) ⑩ anchor 회귀: 세션 기록 후 startDate를 바꿔도 ①~④(rolling)·기록된 SessionCompleted.cyclePos·foldState 결과가 동일 (calendar 계산만 변함).

---

### Task 5: programEngine — 오늘의 WorkoutPlan (작업세트+워밍업+통증일 프리셋)

**Files:** Create `src/domain/programEngine.ts`, `test/domain/programEngine.test.ts`
**의존:** T1·T2·T3.

**계약 (스펙 §2-1·2-5, 타입은 "공유 타입" 절):**
```
buildWorkoutPlan(program, pos: CyclePos, tm: Record<string,number>,
                 accessories: Record<string,AccessoryState>, cfg: PlateConfig): WorkoutPlan | null  // day 없으면 null
```
- pctOfTM 세트: ref = load.ref ?? slot.exerciseId; weight = `roundToStep(tm[ref]×pct, stepOf(cfg))`; tm[ref] 없으면 slot.missingTM=true·해당 세트 weight null.
- tracked 세트: `accessories[slot.id]` → weight = state.weight, reps = state.targetReps (스펙 §2-2: 더블 프로그레션 목표는 세트 공통). 상태 없으면 needsInit=true·weight null·reps = spec reps.
- 워밍업: **첫 세트 load.kind === "pctOfTM"인 슬롯만** `generateWarmup(첫 작업세트 weight, { hinge: exerciseInfo(slot.exerciseId)?.hinge === true, cfg })`. tracked(악세사리) 슬롯은 []. missingTM 슬롯도 [].
- `setType:"warmup"`은 판정·통계 제외 대상(이미 fold가 setType 안 봄 — SetRecord 생성 시 UI가 명시, §2-5).
- **통증일 프리셋**: `lightConventionalPreset(tmDeadlift: number, cfg): PlannedSlot` — exerciseId "deadlift", label "T1(경량)", 5세트×5렙 @ `roundToStep(0.55×TM)`, amrapRole 없음, 워밍업은 힌지 규칙 그대로. **이 프리셋으로 기록되는 SetRecord는 `substitutedFrom:"deadlift"`를 반드시 달아 TM 판정에서 제외**(fold 계약) — 함수 JSDoc에 명시. (0.55 = 스펙 50~60% 범위의 중앙값, 컨트롤러 확정 2026-07-09. 그날 통증 정도에 따른 범위 내 조정은 세션 UI의 ± 스테퍼/세트 수정으로 — 프리셋은 기본값일 뿐.)

**테스트 (7, 시드+TM {bench:105, ohp:67.5, squat:85, deadlift:140}, DEFAULT_PLATES):**
① day5 벤치 T1 9세트 무게 = [80,90,100,95,90,85,80,72.5,67.5] (오라클 — half-up 포함)
② day5 벤치 워밍업 = [{20,10},{40,5},{55,3},{70,1}]
③ day4 데드 T1 = [105,120,132.5,125,120,112.5,105,97.5,90] · 워밍업 = [{60,5},{72.5,3},{92.5,1}] (힌지)
④ day1 랫풀 악세사리: accessories 상태 {weight:40, targetReps:10} → 3세트 40kg×10 · warmups [] / 상태 없으면 needsInit
⑤ TM 없는 ref (frontSquat TM 미시드) → missingTM=true, weight null
⑥ 존재하지 않는 pos → null
⑦ lightConventionalPreset(140) → 5×5 @77.5 (0.55×140=77 → 77/2.5=30.8→31→77.5), 워밍업 hinge 하한 60 적용, JSDoc의 substitutedFrom 규약 존재(코드 리뷰 항목)

---

### Task 6: analytics — 주간 부위별 유효세트·톤수·빈도

**Files:** Create `src/domain/analytics.ts`, `test/domain/analytics.test.ts`
**의존:** T1.

**계약 (스펙 §2-4 — 전 규칙 그대로):**
```
weeklyAnalysis(input: {
  sets: SetRecord[], corrections: CorrectionRecord[],   // applyCorrections 재사용 (fold와 동일 유효세트 뷰)
  sessions: SessionCompleted[], programs: Map<string, ProgramDefinition>,
  externalSessions?: { cyclePos: {cycleIndex, week}, groups: MuscleGroup[] }[]   // 크로스핏 등 — 빈도만
}): WeekBucket[]
WeekBucket = { programId, cycleIndex, week, firstAt: string, groups: Partial<Record<MuscleGroup, GroupStats>> }
  // programId가 키에 포함 — 프로그램 전환 후 새 인스턴스가 week0부터 재시작해도 이전 프로그램 버킷과 충돌하지 않음(스펙 §2-7 "통계는 경계를 넘어 연속" = UI가 firstAt 시간순으로 이어 보여줌)
GroupStats = { validSets: number, tonnage: number, frequency: number }
```
규칙(전수):
- **버킷팅**: 세트 → sessionId로 SessionCompleted 조인 → (programId, cyclePos.{cycleIndex,week}). (cyclePos 정정은 `sessionCyclePosOverride` 재사용.) **고아 세트(매칭 세션 없음) 제외. skipped 세션의 세트는 포함**(규칙 발효만 completed 한정 — 통계는 사실). firstAt = 버킷 내 최소 세션 at.
- **워밍업 제외**: setType==="warmup" 전부 제외. revoked 세트 제외(applyCorrections가 처리).
- **티어 판별**: slot.label이 정확히 "T1"|"T2"|"accessory"면 그것을 사용(시드 전 슬롯 해당). 아니면 구조적 fallback: spec에 amrapRole 세트 존재 → T1형 / pctOfTM인데 amrapRole 없음 → T2형 / tracked → 악세사리형. 슬롯 spec은 세션의 programId@Version으로 조회, slotId 매칭. **스펙 조회 실패(슬롯 없음·프로그램 없음) 세트는 rir 규칙만 적용.**
  (주의 — volume day: day1 벤치는 label T1 + amrap backoff 1개뿐 → T1 규칙상 유효 = amrap 1 + pct≥0.9 0 = **1세트**. 이것이 스펙 §2-4의 의도된 결과이며 §2-4 ⚠️ 각주("nSuns 구조상 낮게 표시")가 이 특성을 문서화함.)
- **유효 세트**: T1형 = amrapRole 있는 세트 전부 + spec pct ≥ 0.9 세트 (세트↔spec 매핑 = 해당 세션·슬롯 내 completedAt 순서 k번째 ↔ sets[k]; spec 초과분은 매핑 없음) / T2형 = 해당 세션·슬롯의 **후반 4세트** (completedAt 순) / 악세사리형 = 전 세트. **+ 티어 무관: rir ≤ 4 입력 세트는 유효.** (중복 카운트 없음 — set 단위 OR.)
- **톤수**: 전 워크 세트 actualWeight×actualReps (유효 여부 무관).
- **빈도**: 그룹별 distinct sessionId 수 + externalSessions(해당 버킷·그룹) 수.
- **부위 귀속**: exerciseLibrary groups 전부에 가산(1세트가 2그룹이면 양쪽 +1 — 문서화된 per-group 관점). 라이브러리 밖 exerciseId → 무시(0 그룹).
- 대체 세트(substitutedFrom): **실제 수행 exerciseId 기준으로 포함**(TM 판정만 제외지 통계는 사실).
- 하체 각주(§2-4 ⚠️)는 UI 몫 — analytics는 데이터만.

**테스트 (10):** 시드 프로그램 + 손수 만든 세션들로:
① day5 벤치 T1: 시드 day5 벤치 spec = topSet(0.95)+backoff(마지막) 2개 amrap + pct≥0.9 = 0.9 1개 → 유효 3 (chest·triceps 각각 +3) ② 톤수 = Σ전세트 ③ T2형 8세트 → 유효 4 ④ 악세사리 3세트 전부 유효 ⑤ rir≤4 세트는 T2형 앞세트라도 유효(OR·중복 없음) ⑥ 고아 세트 제외 / skipped 세션 세트 포함 ⑦ warmup setType 제외 ⑧ externalSessions 빈도만 가산(validSets·tonnage 불변) ⑨ **day1 벤치 volume 9세트 완주 → chest 유효 정확히 1** (amrap backoff만 — 티어 판별 주의 절의 오라클) ⑩ 프로그램 전환: programId 다른 두 세션이 같은 {0,0}이어도 **버킷 2개 분리**(programId 키), firstAt으로 시간순 정렬 가능.

---

### Task 7: e1RM + TM 이력

**Files:** Create `src/domain/e1rm.ts`, `test/domain/e1rm.test.ts`

**계약 (스펙 §2-6):**
```
epley(w, reps) = w × (1 + reps/30)            // reps≥1, 소수1자리 반올림
e1rmSeries(sets: EffectiveSet[]): { exerciseId, substituted: boolean, points: {at, value}[] }[]
  // amrapRole==="topSet"만 · actualReps>10 제외 · actualReps<1 제외 · substitutedFrom 유무로 시리즈 분리(§2-6 분리 표시)
tmHistory(input: FoldInput, exerciseId): { at, value }[]
  // 타임라인 prefix 재fold — O(n²) 문서화(개인 규모). 값 변화 시점만 기록(연속 중복 압축).
```

**테스트 (5):** ① epley(100,3)=110 ② reps 11 제외·reps 0 제외 ③ topSet 아닌 세트 제외 ④ substituted 분리 ⑤ tmHistory: seed 100 → 세션(+2.5) → manual 110 → [100, 102.5, 110] (at 오름차순).

---

### Task 8: nSuns 통합 오라클 (엔진×fold×분석 접합)

**Files:** Create `test/domain/engine-integration.test.ts`

**테스트 (4, 시드+TM 위와 동일):**
① "금요일 세션 풀 시나리오": buildWorkoutPlan(day4) → 데드 9세트+워밍업 3개 → 전 세트 SetRecord로 기록(계획 무게 그대로)+SessionCompleted → foldState → 데드 TM 140→145 (topSet 3렙 가정, increment 5) → **다음 주 plan의 데드 무게가 145 기준으로 재계산** (예: 첫 세트 0.75×145=108.75→108.75/2.5=43.5→44→110)
② 같은 시나리오에서 워밍업 세트(setType warmup)는 fold 판정에 무영향 (동일 TM 결과)
③ 벤치 day1(volume) 완주 → TM 불변 (topSet 없음 — B1 검증의 엔진 경유 재확인)
④ analytics: ①의 세션 → hamstrings validSets ≥ 3 (topSet+backoff+0.9)·warmup 톤수 미포함.

**주의**: ①의 "topSet 3렙"은 계획 reps(1+)가 아니라 실제 기록 actualReps=3으로 만든다.

---

## 실행 순서·검증

순서: T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 (T4는 T2와 독립이나 순차 유지).
누적 기대 테스트: 73 → T1 76 → T2 82 → T3 90 → T4 100 → T5 107 → T6 117 → T7 122 → T8 126 (각 태스크 열거 케이스 = 최소치, 초과 허용 — 리포트에 실측 기재).

> 검증 이력: 초안 커밋 57f5967 → 3렌즈 적대 검증(2026-07-09, 산수 클린 / 코드정합 2건 / 스펙 4건 반영: 워밍업 연산순서 가드 통일·validateAnchor·rolling programId 필터·anchor 회귀 테스트·WeekBucket programId 키·volume day 오라클. RDL 등록 제안은 사용자 확정 우선으로 기각, 0.55 프리셋은 UI 조정 여지 명시로 종결).
완료 정의: `npx vitest run` 전체 통과 + `npm run typecheck` 0 + 레저 기록.
