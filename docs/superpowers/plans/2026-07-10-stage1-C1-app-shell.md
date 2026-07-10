# Plan C1 — 앱 셸 + 핵심 세션 루프 (Stage 1, MVP 데모)

> 스펙: `docs/superpowers/specs/2026-07-05-workout-pwa-design.md` (v4.2) §2-1·2-5·2-8·3.2·3.4
> 선행: 도메인 레이어 완료(Plan A 26 + B1 73 + B2 63 = 136 tests, `src/domain/**` 전부 순수 함수).
> 목표: **"오늘의 세션을 오프라인으로 완주하고 새로고침해도 남아있다"** — 데모 가능한 최소 수직 슬라이스. 히스토리 상세·분석 대시보드·온보딩 풀버전·프로그램 라이브러리 UI·GitHub Pages 배포는 Plan C2.
> 방식: B1/B2와 달리 이 계획은 순수 숫자 오라클이 아니라 **컴포넌트 동작 계약 + vitest(jsdom·fake-indexeddb)로 검증 가능한 것은 자동, 나머지는 브라우저 프리뷰 골든패스 1회**로 닫는다.

## Global Constraints

1. `src/domain/**`는 **읽기 전용 소비만** — 이 계획에서 수정 금지. UI/스토리지는 domain의 순수 함수(foldState, buildWorkoutPlan, cyclePos, analytics 등)를 그대로 부른다.
2. **사실만 영속화**: Dexie에 저장하는 것은 SetRecord·CorrectionRecord·DecisionEvent·SessionCompleted·ProgramDefinition(전 버전)·ProgramInstanceState·라이브러리 커스텀뿐. 파생값(TM 등)은 저장하지 않고 매번 foldState로 재계산(§3.1 원칙 2).
3. **진행 중 세션 즉시 커밋**(스펙 §2-5): 세트 체크오프 = 그 즉시 Dexie에 SetRecord write. 앱 강제종료 후에도 미완료 세션이 복원되어야 함(SessionCompleted가 없는 세트들 = "진행 중"으로 간주하고 화면에 이어서 표시).
4. 새 런타임 의존성 허용(이 계획 한정): react·react-dom·vite·@vitejs/plugin-react·dexie·zustand·vite-plugin-pwa. 새 devDeps: @testing-library/react·@testing-library/jest-dom·jsdom·fake-indexeddb. **다른 패키지 추가 시 사유를 리포트에 기재.**
5. TS 규약 유지: 값 import 확장자 없음, strict, `src/domain` 규약과 동일.
6. 커밋 제목에 `(Stage1-C1 Tn)` 접미. 각 태스크: 구현 → `npx vitest run` 전체 통과 + `npm run typecheck` 0 → 커밋.
7. **테스트 전략**: 순수 로직(스토리지 어댑터 CRUD, zustand 액션)은 vitest(jsdom+fake-indexeddb)로 TDD. React 컴포넌트는 렌더·상호작용의 핵심 계약만 @testing-library/react로 검증(스냅샷 금지 — 의미 있는 assertion만). **T8에서 실제 브라우저 프리뷰로 골든패스 1회 수동 검증**(Playwright 없음 — Claude_Browser 프리뷰 도구 사용).

## 아키텍처 (스펙 §3.2 모듈 지도 구체화)

```
src/
  domain/        (기완성 — 순수 TS, 이 계획 불변)
  storage/
    db.ts              Dexie 스키마 정의 (테이블: setRecords, corrections, decisions, sessions,
                        programVersions, instanceState, library, uiState)
    eventStore.ts       Storage 포트 구현 — CRUD + FoldInput 조립(loadFoldInput)
  store/
    programStore.ts    zustand — activeProgram/instance/library 로드, TM/상태 파생(foldState 호출)
    sessionStore.ts    zustand — 오늘의 WorkoutPlan + 진행 중 세트 체크오프 상태
  screens/
    TodayScreen.tsx     오늘의 세션 — 워밍업+작업세트 체크오프, 정정, 완료
    HistoryScreen.tsx   캘린더 + 세션 리스트 (상세는 C2)
    OnboardingScreen.tsx TM 시드 폼 (최소: 4개 입력 + 저장)
  components/
    SetRow.tsx          세트 1행 (탭 체크오프 + ± 스테퍼)
    NavShell.tsx         하단 탭 네비게이션
  App.tsx               hash 라우터 (react-router-dom 없이 자체 구현 — 의존성 최소화)
  main.tsx               PWA 등록 + React 마운트
```

## Task 1: Vite+React+TS 스캐폴드 + 빈 셸 빌드·구동

**Files:** `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `package.json`(scripts 추가), `.gitignore`(dist 등)

- `npm install` 대상: react, react-dom, vite, @vitejs/plugin-react, vite-plugin-pwa (deps); @types/react, @types/react-dom, jsdom, @testing-library/react, @testing-library/jest-dom (devDeps).
- `vite.config.ts`: `base: "/workout-app/"`(GitHub Pages 서브경로 — repo명 확정 전이면 `"./"`로 relative, 리포트에 결정 기재), vite-plugin-pwa `registerType:"autoUpdate"`, manifest 최소(name/short_name/theme_color/icons placeholder 1개).
- `src/App.tsx`: `window.location.hash` 기반 최소 라우터(패키지 없이) — 3라우트: `#/today`(기본) `#/history` `#/onboarding`. 각 자리엔 이 태스크에서는 플레이스홀더 `<div>{routeName}</div>`.
- vitest 설정을 jsdom 환경으로 전환(`vite.config.ts`의 test 블록 또는 `vitest.config.ts` 분리 — 기존 node 환경 도메인 테스트는 계속 통과해야 함: **jsdom은 environment를 파일별로 오버라이드하지 말고 전역 jsdom + node 테스트가 jsdom 위에서도 그대로 통과하는지 확인**, 안 되면 `// @vitest-environment node` 주석으로 도메인 테스트만 예외 처리).
- **fake-indexeddb 전역 배선(T2가 실제로 쓰기 전에 여기서 미리 설정)**: `test.setupFiles: ["fake-indexeddb/auto"]`를 vitest 설정에 추가 — jsdom은 IndexedDB를 구현하지 않으므로 이 배선 없이는 Dexie가 T2부터 즉시 throw한다.
- **검증**: `npm run dev`로 로컬 구동 확인(브라우저 프리뷰로 3라우트 다 빈 화면이라도 뜨는지 스크린샷 1장) + `npx vitest run`(기존 136 유지, jsdom 전환으로 깨진 것 없어야 함) + `npm run typecheck` 0 + `npm run build`(vite 프로덕션 빌드 성공, dist/ 생성 확인 후 report에 기록, dist는 git 커밋 안 함).

## Task 2: Dexie 스토리지 포트 (이벤트 로그 CRUD + FoldInput 조립)

**Files:** `src/storage/db.ts`, `src/storage/eventStore.ts`, `test/storage/eventStore.test.ts`
**의존:** T1(빌드 환경). fake-indexeddb devDep 추가.

**계약:**
```typescript
// db.ts
class WorkoutDB extends Dexie {
  setRecords: Table<SetRecord, string>
  corrections: Table<CorrectionRecord, string>
  decisions: Table<DecisionEvent, string>
  sessions: Table<SessionCompleted, string>
  programVersions: Table<ProgramDefinition & {_key: string}, string>  // _key = programKey(id,version)
  instanceState: Table<ProgramInstanceState & {_id: "active"}, string>  // 단일 레코드
  library: Table<{programId: string, addedAt: string}, string>
}

// eventStore.ts
appendSet(rec: SetRecord): Promise<void>
appendCorrection(rec: CorrectionRecord): Promise<void>
appendDecision(rec: DecisionEvent): Promise<void>
appendSession(rec: SessionCompleted): Promise<void>
upsertProgramVersion(program: ProgramDefinition): Promise<void>
getProgram(id: string, version: number): Promise<ProgramDefinition | undefined>
listLibrary(): Promise<ProgramDefinition[]>   // 최신 버전만 (프로그램별 max version)
getInstanceState(): Promise<ProgramInstanceState | undefined>
setInstanceState(s: ProgramInstanceState): Promise<void>
loadFoldInput(): Promise<FoldInput>    // 전 4종 이벤트 + programVersions를 Map으로 조립 — domain.fold의 입력 그대로
```
- Dexie는 append-only 테이블에 대해서도 `put`(id 기준 upsert)을 쓴다 — 이벤트 자체가 불변이므로 같은 id 재기록은 없다는 게 호출부 책임(§3.3 "머지: id 합집합").
- id 생성은 이 모듈 책임 아님(호출부가 crypto.randomUUID() 등으로 생성) — 이 스토어는 완성된 레코드만 받는다.

**테스트(8, fake-indexeddb):** ① append 4종 각각 → loadFoldInput에 반영 ② programVersions 왕복(같은 id 다른 version 2개 저장 → 둘 다 개별 조회 가능) ③ listLibrary = 프로그램별 최신 version만 ④ instanceState 왕복(단일 레코드, 덮어쓰기) ⑤ loadFoldInput의 programs 필드가 `Map<string,ProgramDefinition>`이고 키가 `programKey(id,version)`과 일치(foldSupport 재사용) ⑥ 빈 DB → loadFoldInput 빈 배열들 ⑦ 같은 SetRecord id로 두 번 append → 마지막 값으로 upsert(정정이 아니라 실수 재호출 방어) ⑧ 대량(500개 세트) append 후 loadFoldInput 성능 허용범위(<500ms) — 느슨한 스모크.

## Task 3: programStore (zustand) — 활성 프로그램·TM·오늘의 커서

**Files:** `src/store/programStore.ts`, `test/store/programStore.test.ts`
**의존:** T2. domain의 foldState/buildWorkoutPlan/cyclePos 소비.

**계약:**
```typescript
type ProgramStoreState = {
  status: "loading" | "ready" | "empty"    // empty = 온보딩 전(라이브러리·인스턴스 없음)
  activeProgram?: ProgramDefinition
  instanceState?: ProgramInstanceState
  tm: Record<string, number>
  accessories: Record<string, AccessoryState>
  pendingProposals: Proposal[]
  todayPos?: CyclePos
  todayPlan: WorkoutPlan | null
  load(): Promise<void>          // eventStore에서 전부 읽어 foldState + rollingCyclePos(또는 calendar) 계산
  refreshAfterWrite(): Promise<void>   // 세트/결정 기록 후 재계산(간단히 load() 재호출로 구현 가능 — 재fold 비용 개인규모 무시)
}
```
- MVP는 **rolling 모드만**(calendar 모드 UI는 C2) — `mode:"rolling"`로 ProgramInstanceState 생성.
- 라이브러리·인스턴스 없음 → status "empty" → App이 온보딩으로 라우팅.
- todayPlan = `buildWorkoutPlan(activeProgram, todayPos, tm, accessories, DEFAULT_PLATES)`.

**테스트(6, fake-indexeddb + 실제 nSuns 시드):** ① 빈 DB → status "empty" ② 온보딩 완료 상태(라이브러리+인스턴스+TM seed 4개 결정) 시뮬레이션 후 load() → status "ready", todayPlan 존재 ③ 세션 완료 기록 후 refreshAfterWrite → todayPos 전진(rollingCyclePos) ④ TM 자동증량 세션 후 tm 갱신 반영 ⑤ pendingProposals가 domain fold 결과 그대로 노출 ⑥ instanceState 없이 라이브러리만 있으면 status "empty"(온보딩 미완).

## Task 4: SetRow + TodayScreen — 체크오프·즉시 커밋·정정

**Files:** `src/components/SetRow.tsx`, `src/screens/TodayScreen.tsx`, `test/screens/TodayScreen.test.tsx`
**의존:** T3.

**계약:**
- `SetRow`: 행 전체 탭(≥48px 높이) = 완료 토글. ± 버튼 = 무게/렙 조정(스텝: 무게 stepOf(cfg), 렙 1). `onComplete(weight, reps)` 콜백.
- `TodayScreen`: `programStore.todayPlan`을 렌더 — 슬롯별 워밍업(회색 처리, 체크오프 없음 — 통계 제외이므로 기록은 하되 setType:"warmup") + 작업세트(SetRow 리스트). 세트 완료 시 `eventStore.appendSet({..., completedAt: nowISO, setType:"work"|"warmup"})` 즉시 호출 → **낙관적 UI 갱신**(로컬 state 먼저 갱신, DB write는 fire-and-forget이 아니라 await하되 UI는 블로킹 안 함 — await 실패 시 토스트).
- **정정**: 완료된 세트 재탭 → 인라인 수정 모드(무게/렙 입력) → `eventStore.appendCorrection({supersedes: setId, patch:{...}, at: nowISO})`.
- 전 슬롯 작업세트 완료 → "세션 완료" 버튼 노출 → 탭 시 `SessionCompleted(status:"completed")` append + `programStore.refreshAfterWrite()` + 히스토리로 라우팅.
- **복원**: 마운트 시 오늘 세션에 해당하는 기록된 SetRecord(sessionId 매칭)를 읽어 이미 체크된 세트로 표시(sessionId는 todayPos 기반 결정론적 생성: `${programId}@${version}:${cycleIndex}-${week}-${dayOrdinal}` — rolling 모드 가정이라 재방문해도 같은 세션 id).
- **필수(fold 조인 계약)**: `SessionCompleted.sessionId` 필드(= `id`와 별개 필드)에도 이 **동일한 결정론적 문자열**을 반드시 재사용한다. `fold.ts`의 `judgingSetsForSlot(effectiveSets, sc.sessionId, slot.id)`가 그날 SetRecord.sessionId와 정확히 매치되어야 TM 자동증량·주간분석이 작동한다 — 다른 id(예: 새 UUID)를 쓰면 판정이 전부 no-op으로 조용히 실패한다. `SessionCompleted.id`는 이벤트 자체의 고유 id(uuid)로 별도 생성.
- **악세사리(tracked) 슬롯 — needsInit 처리(missingTM과 다른 UX)**: 시드 프로그램의 모든 요일에 tracked 악세사리 슬롯이 1개씩 있다(화 랫풀/수 카프/목 리어델트/금 머신이두/토 CSR — 스펙 §2-2). `AccessoryState`가 아직 없으면 `programEngine`이 `needsInit:true, weight:null`을 준다. **missingTM(체크오프 비활성)과 달리 needsInit은 자유입력 UX**: 무게·렙 입력 필드를 열어(placeholder = 스펙 spec reps) 사용자가 실제 수행값을 직접 입력하게 하고, 그 첫 SetRecord가 fold의 `applyAccessorySession` 부트스트랩 입력이 된다(`fold.ts` 참조 — 첫 세션 무게가 곧 그 악세사리의 초기 상태). 온보딩에서 악세사리는 시드하지 않는다(설계상 의도 — T5 참조).

**테스트(9, jsdom+testing-library, fake-indexeddb):** ① 렌더 시 워밍업·작업세트 전부 표시 ② 세트 탭 → appendSet 호출 확인(mock eventStore 또는 실제 fake-indexeddb로 DB 반영 확인) ③ 정정 플로우: 완료된 세트 재탭 → 값 변경 → appendCorrection ④ 전부 완료 전엔 "세션 완료" 버튼 없음 ⑤ 전부 완료 후 버튼 노출 → 탭 → SessionCompleted append(sessionId가 SetRecord들과 동일한 결정론적 문자열인지 명시 검증) + 라우팅 이벤트(mock 라우터 콜백) ⑥ 새로고침 시뮬레이션(컴포넌트 리마운트): 이미 기록된 세트가 체크됨 상태로 복원 ⑦ missingTM 슬롯은 "TM 필요" 안내 표시(체크오프 비활성) ⑧ needsInit 악세사리 슬롯은 자유입력 필드로 렌더(비활성 아님), 입력·제출 → appendSet 호출 확인 ⑨ topSet 3렙 세션 완료 후 TM이 실제로 fold를 통해 증량 반영되는지(programStore 재조회로) 확인 — critical 리뷰 지적사항, sessionId 조인이 실제로 작동함을 증명.

## Task 5: 온보딩 (TM 시드 + 최초 인스턴스 생성)

**Files:** `src/screens/OnboardingScreen.tsx`, `test/screens/OnboardingScreen.test.tsx`
**의존:** T2·T3.

**계약:**
- 4개 TM 입력(벤치105/OHP67.5/스쿼트85/데드 — 스펙 §2-8 "데드 보수 초기화": 사용자가 직접 입력, 기본값 placeholder만 제시, 강제 아님) + 나머지 T2 4종(스모/프론트/인클라인/CGBP) 초기값 입력.
- 제출 → `programVersions`에 nSuns 시드 저장(빌드에 `programs/nsuns-5day.json`을 정적 import 또는 fetch) → `library`에 등록 → `instanceState` rolling 생성 → 8개 `DecisionEvent(kind:"seed")` append → `programStore.load()` → 완료 시 오늘 화면 라우팅.
- 설치 유도 배너: `window.matchMedia('(display-mode: standalone)')` 미충족 시 상단 배너(스펙 §2-8) — 최소 텍스트 배너, iOS 감지는 UA 문자열로 분기.

**테스트(4):** ① 폼 검증(빈 값 제출 방지) ② 제출 → DB에 8개 seed 결정 + library + instanceState 생성 확인 ③ 제출 후 오늘 화면 라우팅 콜백 호출 ④ standalone 감지 배너 표시/숨김 분기.

## Task 6: HistoryScreen (최소 — 캘린더 없이 세션 리스트)

**Files:** `src/screens/HistoryScreen.tsx`, `test/screens/HistoryScreen.test.tsx`
**의존:** T2.

**계약:** `eventStore.loadFoldInput()`의 sessions를 최신순 리스트로 렌더(날짜 + programId + status). 클릭 시 그 세션의 SetRecord 요약(운동별 무게×렙) 펼침. **캘린더 뷰·TM 이력 차트·주간 분석 대시보드는 C2로 이월**(리포트에 명시).

**테스트(3):** ① 세션 없음 → 빈 상태 메시지 ② 세션 2개 → 최신순 정렬 ③ 클릭 → 세트 요약 펼침.

## Task 7: NavShell + App 라우팅 통합

**Files:** `src/components/NavShell.tsx`, `src/App.tsx`(교체), `test/App.test.tsx`
**의존:** T3·T4·T5·T6.

**계약:** hash 라우트 3개를 실제 화면에 연결. `programStore.status === "empty"`면 어느 라우트든 온보딩으로 강제. 하단 탭(오늘/히스토리) — 온보딩 완료 후에만 노출.

**테스트(3):** ① empty 상태 → 어느 해시든 온보딩 렌더 ② ready 상태 → `#/today`·`#/history` 각각 해당 화면 렌더 ③ 탭 클릭 → hash 변경.

## Task 8: 통합 골든패스 (자동 테스트 + 브라우저 프리뷰 수동 검증)

**Files:** `test/integration/goldenPath.test.tsx`

**자동(jsdom+fake-indexeddb, 실제 nSuns 시드 JSON 사용):** 온보딩 제출 → 오늘 화면 워밍업+작업세트 렌더 확인 → 전 세트 체크오프(fireEvent) → 세션 완료 → 히스토리에 반영 확인 → (컴포넌트 리마운트로 새로고침 시뮬레이션) → 오늘 화면이 다음 사이클-주로 전진했는지 확인.

**수동(Claude_Browser 프리뷰, 이 리포트에 스크린샷 근거 첨부):**
1. `npm run dev` → preview_start
2. 온보딩 폼 채우고 제출 → 오늘 화면 도달 스크린샷
3. 세트 1개 체크오프 → 낙관적 UI 갱신 스크린샷
4. 페이지 새로고침 → 체크된 세트 유지 확인 스크린샷
5. 전 세트 완료 → 세션 완료 → 히스토리에서 확인
6. `preview_console_logs` 에러 0건 확인

**완료 정의:** `npx vitest run` 전체 통과(136+새 테스트) + `npm run typecheck` 0 + `npm run build` 성공 + 위 6단계 수동 검증 스크린샷 첨부 + 콘솔 에러 0.

---

## 실행 순서·이월

순서: T1 → T2 → T3 → T4·T5·T6 (T4/T5/T6은 서로 독립, T3 완료 후 병렬 가능) → T7 → T8.
**Plan C2 이월 목록** (이 계획 완료 시 명시): 캘린더 모드, TM 이력 차트, 주간 부위별 분석 대시보드(§2-4 하체 각주 포함), 휴식 타이머, 플레이트 계산기 UI, 운동 스킵/대체 + 통증일 프리셋 UI, 세션 노트, 프로그램 편집·라이브러리·전환 UI, JSON export/import(Web Share), GitHub Pages 배포, 설치 iOS 수동 안내 상세.
