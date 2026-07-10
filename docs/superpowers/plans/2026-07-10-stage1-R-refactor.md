# Plan R — 유지보수성 리팩토링 (행동 보존, Plan C3 선행)

> 근거: 4렌즈 유지보수성 감사(2026-07-10, 구조·중복·경계·견고성 병렬 감사 — findings 17건).
> 대원칙: **행동 보존(behavior-preserving)** — 210개 테스트가 안전망. 도메인(`src/domain/**`)은 동결 유지(수정 금지).
> 목표: Plan C3(라이브러리·calendar UI)가 얹힐 깨끗한 베이스 — 특히 TodayScreen 신(326줄) 해체와 스토어 경유 쓰기 경로 확립.

## Global Constraints

1. `src/domain/**` 수정 금지(불변). 이월 확정 2건(lightConventionalPreset slotId 하드코딩, 외부세션-only 주 빈도)은 이 계획에서도 손대지 않는다.
2. **테스트 개수는 감소 금지**(210 → 210 이상). 기존 테스트 수정은 "헬퍼 호출로 치환"만 허용 — assertion 변경 금지. 각 태스크 완료 시 `npx vitest run` 전체 green + `npm run typecheck` 0.
3. 기존 data-testid·aria-label·클릭 시맨틱은 byte-for-byte 보존(테스트가 DOM 레벨로 가드).
4. `test/screens/TodayScreen.test.tsx`가 `sessionIdFor`를 TodayScreen에서 직접 import — 이 export는 유지(또는 re-export).
5. 커밋 제목 `(Stage1-R Tn)`.

## Task 1: 공용 유틸 추출 — time·platform + 클립보드 가드

**Files:** Create `src/lib/time.ts`, `src/lib/platform.ts`. Modify `src/components/ProposalCard.tsx`, `src/screens/OnboardingScreen.tsx`, `src/screens/TodayScreen.tsx`(nowISO 3중복 제거), `src/lib/backup.ts`(isIOS 통합 + clipboard 가드).

- `src/lib/time.ts`: `export function nowISO(): string` — 기존 3개 파일의 private 복사본 삭제 후 import.
- `src/lib/platform.ts`: `export function isIOS(): boolean` — OnboardingScreen(43-45)·backup.ts(105-108)의 중복 UA sniff 통합.
- backup.ts 클립보드 fallback: `typeof navigator.clipboard?.writeText === "function"` 가드 추가 — false면 기존 blob+anchor 다운로드 분기로 폴스루(죽은 끝 제거). 신규 테스트 1개(iOS + share 불가 + clipboard 부재 → 다운로드 폴스루).

**검증:** 기존 210 + 1 green. ProposalCard/Onboarding/Today/backup 테스트가 타임스탬프·배너·share 경로를 가드.

## Task 2: 테스트 헬퍼 통합 (프로덕션 코드 무변경)

**Files:** Create `test/helpers/db.ts`, `test/helpers/seed.ts`, `test/helpers/todayScreenInteractions.ts`, `test/helpers/dom.ts`. Modify 해당 테스트 파일들(치환만).

- `db.ts`: `resetDb()` = `Promise.all(db.tables.map(t => t.clear()))` — 9개 파일의 byte-identical 7-table clear 블록 치환. **Analytics/History 테스트의 부분 clear(5/4-table)는 이번엔 그대로 둔다**(의도 여부 불명 — 조용히 확장하지 않음).
- `seed.ts`: `loadSeedProgram(): ProgramDefinition`(12개 .ts/.tsx 파일의 JSON.parse(readFileSync...) 치환 — seed.test.mjs는 제외) + `seedOnboarded(opts?)`(5개 파일의 온보딩 시뮬레이션 헬퍼 통합 — 각 파일의 addedAt·extra decisions 파라미터로 보존).
- `todayScreenInteractions.ts`: `completeAllRows(container, { exclude? })`(3개 파일 통합, ExerciseSwap의 except 변형은 옵션 파라미터로) + `waitForWarmupSettled()`.
- `dom.ts`: `mockMatchMedia(matches)`(3개 파일 치환).

**검증:** 테스트 파일만 변경, src/ diff 없음. 210+ green(개수 불변).

## Task 3: 스토어 쓰기·읽기 경로 확립 (additive — 소비자 재배선은 T4·T5)

**Files:** Modify `src/storage/eventStore.ts`(seedOnboarding 트랜잭션 추가), `src/store/programStore.ts`(mutation 메서드 추가). Create `src/store/queries.ts`, `test/store/mutations.test.ts`.

- `eventStore.seedOnboarding(program, entry, instanceState, decisions)`: 기존 upsertProgramVersion→addToLibrary→setInstanceState→appendDecision×N을 **`db.transaction('rw', [programVersions, library, instanceState, decisions], ...)`** 안에서 실행(중간 사망 시 부분쓰기·중복 seed 오염 제거 — 감사 robustness-high). Dexie ambient transaction이 기존 함수들에 전파되므로 내부는 기존 함수 호출 그대로.
- `programStore`에 mutation 메서드: `recordSet(rec)`, `recordCorrection(rec)`, `completeSession(rec)`, `seedProgram(...)→eventStore.seedOnboarding`, `acceptProposal(decision)` — 각각 해당 eventStore 함수 호출 후 `refreshAfterWrite()`. (단, `recordSet`/`recordCorrection`은 **refreshAfterWrite를 호출하지 않는다** — 현행 TodayScreen이 세트 기록 시 재fold하지 않는 낙관적 UI 시맨틱을 그대로 보존. completeSession/seedProgram/acceptProposal만 refresh.)
- `src/store/queries.ts`: `loadEventLog(): Promise<FoldInput>` — loadFoldInput 1:1 위임(스토리지 캡슐화 지점). 화면들의 직접 storage 접근을 끊는 단일 창구.
- 신규 테스트: ① seedOnboarding 원자성(트랜잭션 중간 실패 시뮬레이션 → 4테이블 전부 빈 상태) ② mutation 메서드가 대응 eventStore 함수와 동일 결과 + refresh 시맨틱(recordSet은 no-refresh, completeSession은 refresh) 확인.

**검증:** additive만 — 기존 소비자 무변경, 210 + 신규 green.

## Task 4: 소비자 재배선 — Onboarding·ProposalCard·History·Analytics (+에러 상태)

**Files:** Modify `src/screens/OnboardingScreen.tsx`, `src/components/ProposalCard.tsx`, `src/screens/HistoryScreen.tsx`, `src/screens/AnalyticsScreen.tsx`, 해당 테스트(치환 수준).

- OnboardingScreen: 4단계 개별 write → `programStore.seedProgram(...)` 1콜(내부 트랜잭션). 동일 `at` 재사용 시맨틱 보존.
- ProposalCard: `appendDecision`+`refreshAfterWrite` → `programStore.acceptProposal(decision)`.
- HistoryScreen·AnalyticsScreen: `loadFoldInput` 직접 import → `queries.loadEventLog()`. **+ 에러 처리 추가**(감사 robustness-medium): 두 화면의 로딩 effect에 try/catch + 기존 3개 화면과 동일한 `{error && <div role="alert">{error}</div>}` 관용구(신규 훅 만들지 않음 — 관용구 복제). 각 화면 에러 분기 테스트 1개씩 추가(loadEventLog reject mock).
- storage/eventStore를 import하는 화면·컴포넌트가 **TodayScreen 하나만 남는지** grep으로 확인해 리포트에 기재(T5에서 제거 예정).

**검증:** 210+2 이상 green. 기존 화면 테스트는 DOM/DB 레벨 assertion이라 무수정 통과해야 함(어느 모듈이 write했는지 검사 안 함 — 감사에서 확인됨).

## Task 5: TodayScreen 해체 + SetRow 분리 + 통증일 복원 정리

**Files:** Create `src/screens/today/useTodaySession.ts`, `src/screens/today/derive.ts`, `src/components/SetRowShell.tsx`(또는 FreeInput/Stepped 분리 — 구현자 선택, 리포트에 기재). Modify `src/screens/TodayScreen.tsx`(JSX+훅 호출만 남김), `src/components/SetRow.tsx`, 테스트(추가만).

- `useTodaySession(...)`: 현 54-268줄의 모든 state/effect/callback을 **기계적으로 이동**(effect deps·상태 shape 불변). 쓰기는 T3의 store mutation(`recordSet`/`recordCorrection`/`completeSession`) 경유로 치환 — eventStore 직접 import 제거. 반환: recorded·error·completing·effectiveSlots·allWorkSetsComplete·handleComplete·handleCorrect·skip 핸들러·swap 핸들러·handleSessionComplete.
- `derive.ts`: `deriveEffectiveSlots(slots, swappedSlots, tm)` + `isSessionComplete(effectiveSlots, sessionId, recorded, isSkipped)` 순수 함수 추출 — 렌더 없이 단위 테스트 가능(신규 단위 테스트 2~4개).
- `sessionIdFor`·`setIdFor`: TodayScreen에서 export 유지(테스트 의존) — 구현은 today/ 밑으로 이동해도 re-export.
- SetRow: 두 분기(자유입력 51-105 vs 스테퍼 107-156)의 공통 셸(role/tabIndex/testid/style) 추출 또는 두 leaf 컴포넌트 분리. **testid·aria-label·클릭 시맨틱 byte-for-byte 보존**(간접 커버리지뿐이므로 최고 주의 — Global Constraint 3).
- **통증일 "원래대로" 정리**(감사 robustness-medium): handleRestoreOriginal에서 swappedSlots 클리어 시, 그 세션·경량 슬롯에 이미 기록된 SetRecord들에 `CorrectionRecord{revoked:true}`를 append(기존 handleCorrect와 동일 이벤트 패턴 — UI 레이어의 기존 domain 이벤트 사용, 도메인 무변경). 신규 테스트 1개: 경량 세트 기록→원래대로→revoke 확인(analytics 이중집계 차단).

**검증:** 210+α green(기존 TodayScreen 12개 + ExerciseSwap 6개 무수정 통과 = 추출 무결성 증명). typecheck 0.

## Task 6: ESLint 레이어 경계 도입 + 최종 검증

**Files:** Create `eslint.config.js`. Modify `package.json`(devDeps: eslint, @typescript-eslint/parser, @typescript-eslint/eslint-plugin, eslint-plugin-import + `"lint"` script).

- `import/no-restricted-paths` zones(감사 boundaries-high의 최소 규칙셋):
  (a) `src/screens/**`+`src/components/**` ← `src/storage/**` 금지(store 경유 강제)
  (b) `src/store/**` ← `src/screens/**`+`src/components/**` 금지(상향 import 금지)
  (c) `src/domain/**` ← screens/components/store/storage 금지(도메인 순수성 잠금)
  - **screens→domain 직접 import는 허용**(순수 함수·타입뿐 — 감사에서 I/O 0 확인, 셀렉터 층 강제는 과잉).
- `npm run lint` 0 violations (T4·T5가 위반을 제거했으므로 통과해야 정상 — 남은 위반 발견 시 이 태스크에서 수정).
- **최종 검증**: `npx vitest run` 전체 + `npm run typecheck` + `npm run build` + `npm run lint` 전부 clean.

**검증:** lint 0 + 210+α green + build 성공.

---

## 실행 순서
T1 → T2(독립, 병행 가능하나 순차 유지) → T3 → T4 → T5 → T6.
행동 보존 확인의 핵심: T4·T5에서 **기존 테스트를 수정 없이**(헬퍼 치환 제외) 통과시키는 것 자체가 증명.

## 감사에서 기각·이월한 항목 (기록)
- useFoldInput 공용 훅: 소비자 3곳의 후처리가 제각각 — 조기 추상화 함정, 4번째 소비자 등장 시 재검토.
- lightConventionalPreset slotId 하드코딩·외부세션-only 주 빈도: 도메인 동결 — 의도적 해제 시점에 별도 처리.
- Analytics/History 테스트의 부분 테이블 clear: 의도 불명 — 조용히 확장하지 않고 유지.
