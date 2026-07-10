# Plan C3 — 프로그램 라이브러리·전환 + calendar 모드 + 잔여 §2 항목 + 배포 준비 (Stage 1 마감)

> 스펙 §2-4(외부 세션)·§2-5(Wake Lock)·§2-7(라이브러리·전환·가져오기 2종)·§2-8(persist·설치 배너)·§3.7(validate 동일 로직). 선행: Plan R 완료(228 tests, lint 게이트).
> 이 계획 완료 = Stage 1 기능 체크리스트 전건 충족. **GitHub Pages 실제 push/배포는 사용자 확인 필요** — 이 계획은 준비까지만.

## Global Constraints
1. `src/domain/**` 동결 유지. 레이어 경계 lint 게이트 준수(화면→storage 직접 금지 — store mutation/queries 경유).
2. 각 태스크: `npx vitest run` green + `npm run typecheck` 0 + `npm run lint` 0. 커밋 `(Stage1-C3 Tn)`.
3. 새 런타임 deps 금지(ajv는 이미 dependencies에 있음 — lib/validation.mjs가 사용).

## Task 1: 프로그램 가져오기 파이프라인 (validate 동일 로직 — §3.7)

**⚠️ 사전 검증에서 확인된 blocking 제약**: `lib/validation.mjs`는 **import 시점에 `readFileSync`(node:fs)로 스키마를 읽음** → 브라우저 번들 불가. 직접 import 금지. 아래 분리 설계를 따른다.

**Files:** Create `lib/validationCore.mjs`, `lib/validationCore.d.mts`(TS 선언), `src/lib/programImport.ts`, `test/lib/programImport.test.ts`. Modify `lib/validation.mjs`(코어 위임으로 축소 — 기존 export 시그니처·동작 완전 보존).

- **`lib/validationCore.mjs`**: fs 없는 순수 코어 — `validateProgramWithSchema(program, schemaObject): string[]`(기존 validateSchema+validateSemantics 로직 이동, ajv는 파라미터로 받은 스키마 객체로 compile). 기존 `RULES`도 여기로 이동 후 validation.mjs가 re-export.
- **`lib/validation.mjs`**: 기존 export(validateSchema/validateSemantics/validateProgram/RULES) 전부 유지 — readFileSync로 스키마 읽고 코어에 위임. **tools/validate.mjs·기존 .mjs 테스트(schema/semantics/seed) 무수정 통과 = 동작 보존 증명.**
- **`src/lib/programImport.ts`**: `parseAndValidateProgram(jsonText: string): { ok: true, program: ProgramDefinition } | { ok: false, errors: string[] }` — JSON.parse(실패 시 ok:false) → validationCore의 `validateProgramWithSchema(parsed, schema)` 호출. **주의: 코어 반환은 `string[]`(빈 배열 = 통과)이지 {ok,errors} 객체가 아님** — 래핑은 이 함수의 몫. 스키마는 `schema/program.schema.json`을 `?raw` import + JSON.parse(OnboardingScreen의 기존 패턴 — tsconfig에 resolveJsonModule 없음).
- `fetchProgramFromUrl(url: string): Promise<string>` — fetch 후 text 반환(CORS 실패 시 명시 에러 — "raw URL이 CORS를 허용해야 합니다(GitHub raw 등)" 안내 포함).
- **테스트(5):** ① 정상 시드 JSON 통과 ② 스키마 위반(slots 누락 등) → errors ③ 의미 위반(사이클-주 TM 규칙 2개) → errors — RULES가 실제로 발화하는지 ④ JSON 파싱 실패 → ok:false ⑤ fetch 실패 mock → 명시 에러. **+ 기존 .mjs 테스트 21개 무수정 통과 확인(분리 무결성).**

## Task 2: 라이브러리 UI — 목록·전환·가져오기 (설정 화면 확장)

**Files:** Modify `src/screens/SettingsScreen.tssx→tsx`, `src/store/programStore.ts`(mutation 2개 추가), `src/storage/eventStore.ts`(추가 없음 — 기존 upsertProgramVersion/addToLibrary/setInstanceState로 충분). Create `src/components/ProgramLibrary.tsx`, `test/components/ProgramLibrary.test.tsx`.

- store mutation 추가: `importProgram(program)` = upsertProgramVersion + addToLibrary + load() / `switchProgram(instanceState)` = setInstanceState + load() (**과거 이력 불변** — 전환은 새 InstanceState 생성일 뿐, 스펙 §2-7).
- `ProgramLibrary`(SettingsScreen에 섹션으로 삽입 — NavShell 변경 없음): `listLibrary()`… 아님 — lint 경계상 화면은 storage 직접 불가. **queries에 `listPrograms()` 추가**(listLibrary 위임). 목록 렌더(이름·버전·활성 표시), "이 프로그램으로 전환" 버튼(rolling 모드 기본) — 전환 확인 다이얼로그(간단 confirm 텍스트) 포함.
- 가져오기 2종: ① 파일 `<input type="file">` → parseAndValidateProgram → 실패 시 errors 나열, 성공 시 importProgram ② URL 입력 + 버튼 → fetchProgramFromUrl → 동일 경로.
- **테스트(6):** ① 목록 렌더+활성 표시 ② 전환 → instanceState 교체 + 기존 세션 이력 불변(fold 결과 동일) ③ 파일 가져오기 성공 → 라이브러리 등록 ④ validate 실패 파일 → 에러 나열·미등록 ⑤ URL 가져오기(fetch mock) 성공 ⑥ 활성 프로그램 재전환(같은 프로그램) no-op 아님 — 새 InstanceState 생성 확인.

## Task 3: calendar 모드 — 스토어 분기 + 휴식일 UI + 모드 설정

**Files:** Modify `src/store/programStore.ts`(load()의 cyclePos 분기), `src/screens/TodayScreen.tsx`+`src/screens/today/useTodaySession.ts`(휴식일 상태), `src/components/ProgramLibrary.tsx` 또는 SettingsScreen(모드 전환 UI), tests.

- **상태 계약(사전 검증 반영)**: `calendarCyclePos` 반환은 `{cycleIndex, week, candidateDayOrdinal: number|null} | {notStarted: true}` — **CyclePos가 아님**(dayOrdinal 없음). ProgramStoreState에 `restDay?: "rest" | "notStarted"` 필드 추가. rest/notStarted 경로에서는 **`todayPos`를 undefined로 남긴다**(useTodaySession의 sessionId 파생이 `activeProgram && todayPos` 가드라 자연히 비활성 — 낡은 ordinal로 잘못된 sessionId가 만들어지는 것을 차단). 정상 경로만 `{cycleIndex, week, dayOrdinal: candidateDayOrdinal}`로 CyclePos 구성 → buildWorkoutPlan. rolling 경로는 기존 그대로(restDay 항상 undefined).
- `programStore.load()`: `instanceState.mode === "calendar"`면 `calendarCyclePos(program, state, todayISO)`(todayISO = `new Date().toISOString().slice(0,10)` — store는 순수성 제약 없음).
- **TodayScreen 가드 순서 함정(사전 검증 반영)**: 현행 `if (status !== "ready" || !todayPlan || !sessionId) return 로딩중` 가드가 rest/notStarted(합법적 todayPlan null)를 영원한 "로딩 중"으로 삼킨다 — **restDay 분기를 이 가드보다 먼저** 배치: restDay면 "오늘은 휴식일입니다"(rest) / "프로그램 시작 전입니다(시작일: …)"(notStarted) 렌더, 세트 UI 없음.
- 모드 전환 UI(설정): rolling↔calendar 선택 + calendar 선택 시 startDate 입력 → **`validateAnchor` 통과 필수**(불일치 시 에러: "시작일은 프로그램 첫 훈련 요일(화)이어야 합니다") → switchProgram으로 새 InstanceState.
- **테스트(6):** ① calendar+오늘=화(시드 기준) → day1 플랜 ② 오늘=월 → 휴식일 렌더 ③ startDate 미래 → notStarted 렌더 ④ validateAnchor 불일치 startDate → 에러·전환 안 됨 ⑤ rolling 기존 동작 무회귀(기존 테스트 통과로 증명) ⑥ 모드 전환 후 과거 SessionCompleted.cyclePos 불변(fold 재확인).

## Task 4: TM 수동 편집 + 외부 세션(크로스핏) 기록

**Files:** Modify `src/storage/db.ts`(**Dexie version(2)**: `externalSessions` 테이블 추가 — `{id, at, groups, programId, cyclePos}`), `src/storage/eventStore.ts`(appendExternalSession/listExternalSessions), `src/store/programStore.ts` 또는 queries(위임), `src/screens/SettingsScreen.tsx`(TM 편집 섹션), `src/screens/AnalyticsScreen.tsx`(외부 세션 연동+추가 UI), tests.

- **TM 수동 편집**(스펙 §2-7 "TM 수동(=DecisionEvent)"): 설정에 현재 TM 목록(programStore.tm) + 인라인 수정 → `DecisionEvent{kind:"manual", target:{kind:"tm",exerciseId}, value, at, schemaVersion:1}` → 기존 `acceptProposal` mutation 재사용(본질이 appendDecision+refresh — 이름과 달리 임의 결정에도 적합, 리포트에 기재).
- **외부 세션**: Dexie v2 마이그레이션(기존 데이터 무손실 — version(1) 선언 유지 + version(2).stores엔 신규 테이블만 명시하면 기존 테이블 자동 승계, WorkoutDB 클래스에 `externalSessions!: Table<...>` 필드 추가). Analytics 화면에 "외부 세션 추가"(날짜=오늘, 부위 multi-select 간단 체크박스) → 현재 activeProgram.id + 현재 주 cyclePos로 저장 → `weeklyAnalysis(..., externalSessions)`에 실데이터 전달(기존 하드코딩 `[]` 제거). 빈도만 가산(도메인 동작 그대로).
- 백업(exportSnapshot/importSnapshot)에 externalSessions **포함**(무손실 왕복 유지 — backup.ts 확장 + 왕복 테스트 갱신).
- **테스트(6):** ① TM 수동 편집 → fold 반영(tm 변경) ② manual 결정이 이력(tmHistory)에 나타남 ③ Dexie v2 업그레이드 후 기존 테이블 데이터 보존 ④ 외부 세션 추가 → 그 주 빈도 +1(validSets·톤수 불변) ⑤ 백업 왕복에 externalSessions 포함 ⑥ 외부 세션만 있고 실세트 0인 주는 버킷 부재로 미표시(도메인 동결 — 알려진 제약을 테스트로 박제+문서화).

## Task 5: Wake Lock + persist() + 설치 배너 상시 + PWA 아이콘 실물

**Files:** Create `src/lib/wakeLock.ts`, `public/icons/icon-192.png`+`icon-512.png`(스크립트 생성 — 단색 배경+덤벨 유니코드 텍스트 수준이면 충분, 생성 스크립트는 스크래치에서 실행 후 산출물만 커밋), Modify `src/screens/TodayScreen.tsx`(세션 중 wake lock), `src/screens/OnboardingScreen.tsx`(persist 시도), `src/components/NavShell.tsx` 또는 App(standalone 미감지 상시 배너 — 온보딩에만 있던 것을 전역으로), `vite.config.ts`(manifest 아이콘 실경로), tests.

- `wakeLock.ts`: `acquireWakeLock(): Promise<() => void>` — `navigator.wakeLock?.request("screen")`, visibilitychange 시 재획득, 미지원(iOS<18.4 등)이면 **silent + 1회 안내 문자열 반환용 플래그**(스펙 §7: 감지 불가 — UA 버전 사전 안내: iOS이고 버전 파싱 <18.4면 "iOS 18.4 미만은 화면 유지가 지원되지 않습니다" 안내).
- TodayScreen: 마운트 시 획득, 언마운트 시 해제.
- OnboardingScreen 제출 성공 시 `navigator.storage?.persist?.()` 시도(결과 무시 — 보장 아님, 스펙 §2-8).
- 설치 배너: 기존 온보딩 배너 로직을 App 레벨로 승격(standalone 미감지 시 상시 얇은 배너 — 닫기 버튼 + sessionStorage로 세션 내 재표시 억제).
- **테스트(5):** ① wakeLock 미지원 환경 크래시 없음 ② visibilitychange 재획득 호출 ③ persist 호출 확인(mock) ④ 배너 standalone 감지 분기 ⑤ 배너 닫기 → 세션 내 미재표시.

## Task 6: 배포 준비 + 최종 게이트 + 브라우저 골든패스

**Files:** Create `docs/deploy.md`, `.github/workflows/deploy.yml`(수동 트리거 workflow_dispatch — push 트리거 아님), Modify `vite.config.ts`(base를 env `VITE_BASE`로 오버라이드 가능하게, 기본 "./" 유지), `package.json`(`build:pages` 스크립트).

- deploy.md: GitHub repo 생성 → base path(`/저장소명/`) → workflow 수동 실행 순서 문서화. **실제 원격 push·Pages 활성화는 사용자 몫**(문서에 명시).
- 최종 게이트: vitest 전체 + typecheck + build + lint 4게이트 → **컨트롤러 브라우저 골든패스**(신규: 라이브러리 전환·calendar 휴식일·TM 수동 편집·외부 세션 추가·Wake Lock 콘솔 확인).

## 실행 순서
T1 → T2 → T3 → T4 → T5 → T6. (T2·T3이 같은 SettingsScreen/ProgramLibrary를 만지므로 순차 필수.)
