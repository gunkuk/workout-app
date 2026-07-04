# 운동 추적 PWA — 설계 스펙 (v4.2)

> v4.2 (2026-07-05): 사용자 핵심 요구 3건 반영 — ①프로그램 라이브러리·전환을 명시 기능으로 승격 ②배포 채널(GitHub 라이브러리 + 파일 가져오기, Drive CORS 제약 명시) ③표준 양식(JSON Schema)+검증기/렌더러+자연어 변환 규약 신설(§3.7, Stage 1 첫 태스크).

> v4 (2026-07-05): 3라운드 집중 검토 21건(fold 모델 12·도메인 9) 반영. **방침 = 패치가 아니라 단순화**: SessionCompleted 이벤트 승격, 증량 지연 발효 제거, lookahead 제거, "TM당 증량 규칙 사이클-주 1개" 불변식 신설, OHP T2 이중 증량 차단, 워밍업 상대 %화, 롤백 데드존 제거, 스모 프리셋 강등.
> v3: 2R 33건 반영 (파생 fold·T2·커서). v2: 1R 35건 반영.

> **용어 정의 (cold reader용)**
> - **PWA**: 홈화면 설치형 웹앱. 앱스토어 없이 Android·iPhone, 오프라인 작동.
> - **nSuns 5-day**: 사용자의 프로그램. 주 5일(화~토) = T1(메인 9세트)+T2(보조 8세트)+악세사리 1개. **화요일 T2는 OHP**(T1 리프트의 재등장 — §2-3 불변식의 이유), 벤치는 주 2회(화 volume/토 heavy).
> - **TM** (Training Max): 계산 기준 무게. T1 리프트(벤치·스쿼트·OHP·데드)와 **독립 T2 리프트(스모·프론트·인클라인·CGBP)는 각자 TM**. 화요일 OHP처럼 T1 리프트가 T2 슬롯에 오면 자기 T1 TM 참조.
> - **탑 세트**: `amrapRole:"topSet"` 세트(heavy 스킴의 95%×1+). T1 TM 판정의 유일한 입력. volume day 스킴에는 탑 세트가 **없음**(정본 시트 기준) — 그날 판정 없음이 정상.
> - **AMRAP** / **RIR**: 최대 반복 세트 / 실패까지 남긴 반복 수(악세사리 처방 = RIR 2~3 정지).
> - **fold**: 이벤트 로그를 (at,id) 순으로 접어 현재 상태(TM 등)를 계산하는 순수 함수.
> - **사이클-주**: 프로그램 구조상의 주(달력 주 아님). `cyclePos = {cycleIndex, week, dayOrdinal}`.
> - **Boostcamp**: 시중 앱. 유료 기능 대체가 1차 목표. **LLM-wiki/볼트**: 사용자의 Obsidian 시스템(OneDrive 동기화, Claude Code가 파일로 읽고 씀).

---

## 0. BLUF

**Boostcamp 유료 기능을 완전 대체하는 오프라인 우선 PWA 운동 추적기.** Stage 1 = 순수 로컬(비용 0), Stage 2 = OneDrive로 볼트 연결, Stage 3 = Claude API Q&A. 미래 단계는 Stage 1에 앵커(§5).

- 사용자: 본인 + 친구 몇 명 (URL 설치, 계정 없음, 기기별 독립 데이터)
- 신뢰 모델: 코드·URL 공개(GitHub Pages), 데이터는 기기 로컬(S2부터 본인 OneDrive). MSAL client ID 공개 정상.

## 1. Stage 로드맵

| Stage | 내용 | 리스크 게이트 |
|---|---|---|
| **1. 추적기 코어** | §2 패리티 8항목 (완전 오프라인 + JSON 내보내기) | 없음 |
| **2. 볼트 연동** | OneDrive: 로그 쓰기·프로그램/티어 읽기·질문 아웃박스 | 첫 작업 = 실기기 iPhone standalone **MSAL 스파이크**: ① redirect standalone 이탈 ② 라우터의 응답 hash 소거(§3.4 전용 페이지로 회피) 검증 |
| **3. 지능 레이어** | 앱 내 Claude API Q&A + 프로그램 빌더 UI | API 키 (질문당 ~0.3원) |

## 2. Stage 1 기능 스펙 (8항목 체크리스트 = 완료 정의, §6 = 검증 방법)

1. **프로그램 엔진** — 프로그램 = 선언적 JSON(§3.3). 오늘의 작업세트 자동 생성. 반올림 단위 = 보유 원판에서 파생. 시드 %테이블(벤치 volume/heavy 구분)은 **nSuns 공식 스프레드시트 정본** [착수 태스크].
2. **악세사리** — 요일별 배정(화 랫풀/수 카프/목 리어델트/금 머신이두/토 CSR). 슬롯별 규칙:
   - 더블 프로그레션(RIR 양립형): 세트 2~3, 목표 rep 8~12. **마지막 세트 상한 도달 && (rir 입력 시 rir≥2) → 다음 세션 +1 스텝, rep 하한 리셋.**
   - 운동별 `weightStep`(머신 5 / 덤벨 2 / 바벨 2.5).
   - **롤백(데드존 없음)**: **2세션 연속 마지막 세트 하한 미달 → 이전 무게 롤백 제안. 단 증량 직후 첫 세션은 카운트 제외**(적응 유예). — 증량·롤백 게이트가 같은 세트(마지막)를 보므로 "첫 세트는 되는데 마지막은 안 되는" 정체 구간에서도 신호가 남.
   - 시드 파라미터 확정 [§8-1].
3. **TM 자동 증량** —
   - **불변식: 하나의 TM에 증량을 쓸 수 있는 규칙은 사이클-주당 정확히 1개.** (벤치 주2회·화요일 OHP T2 같은 재등장 슬롯의 이중 증량을 구조적으로 차단.)
   - **(a) T1 판정**: **`nsunsTopSet` 규칙 보유 슬롯**의 topSet 세트를 포함한 세션의 `SessionCompleted`(status "completed"만 — skipped는 발효 없음) 시점에 판정·즉시 발효. rule 없는 슬롯의 topSet은 판정을 낳지 않음. topSet 세션 스킵 주 = 동결.
   - **발효 상한(모든 progressionRule 공통)**: **TM당 사이클-주 발효 ≤1** — 같은 사이클-주의 후속 발효는 no-op(첫 것만 유효, lookahead 없는 left-fold). T1·T2·머지로 생긴 중복 세션 전부에 적용.
   - T1 진리표(`progressionParams`):
     | 탑세트 reps | 동작 |
     |---|---|
     | 0~1 | 제안: 동결(기본) / −5kg |
     | 2~3 | 자동(파생): 벤치/OHP +2.5, 스쿼트 +5, 데드 +2.5* |
     | 4+ | 제안: 추가 증량(+5/+10) |
     *데드 +2.5 = 의도적 보수 설정(디스크) — **T1 진리표 내에서** 공식 시트와 다른 유일한 지점 [§8-4].
   - **(b) 독립 T2 리프트(스모·프론트·인클라인·CGBP)**: 자기 TM + 규칙(제안): "T2 마지막 세트 목표 완수 시 SessionCompleted에서 즉시 +스텝" — 증량폭 리프트별: 인클라인/CGBP +2.5, **프론트 +5(하체)**, 스모 +2.5(디스크 각주). **실패 경로**: 2사이클-주 연속 마지막 세트 미완수 → 디로드 제안(−5% 또는 직전 TM) [§8-5].
   - **(c) T1 리프트가 T2 슬롯에 재등장(화 OHP 등) → 그 슬롯은 `progressionRule` 없음(볼륨 노출 전용).** TM 변경은 T1 topSet 판정 경로만. [§3.6 테스트: "화 OHP T2 완수 + 목 topSet 3회 → OHP 주 +2.5 정확히 1회"]
   - **자동 증량은 이벤트로 기록하지 않음** — fold가 도출(§3.3). 사용자 결정만 `DecisionEvent`.
   - **대체 세트(`substitutedFrom`)는 모든 TM 판정에서 제외.**
4. **주간 부위별 분석** (사이클-주 버킷): 부위별 ① 유효 세트 ② 톤수(전 세트) ③ 빈도. 유효 세트 = 역할 기반:
   - T1: **amrapRole 부여 세트 전부** + **≥90%TM** 세트(탑세트 인접 — 85%는 RIR 5~7의 쉬운 세트라 제외)
   - T2: **후반 4세트**(피로 누적 하 실질 고노력 — "마지막 1세트만"은 하체가 만성 볼륨부족 오신호)
   - 악세사리: 전 세트(RIR 2~3 처방 전제) / `rir≤4` 입력 세트는 티어 무관 유효
   - ⚠️ 이 기본값에서도 nSuns 구조상 하체 유효세트는 상체보다 낮게 표시됨(프로그램의 문서화된 특성) — 대시보드에 각주 표기 [§8-2].
   - 크로스핏(일) = 외부 세션: 빈도만.
   - **버킷팅 규칙**: 세트→사이클-주 매핑은 SessionCompleted.cyclePos 조인. **SessionCompleted가 없는 고아 세션의 세트는 통계 제외**(복원 UI가 완료/스킵 확정을 강제하므로 일시 상태). skipped 세션의 수행된 세트는 통계 **포함**(사실), 규칙 발효만 completed 한정.
5. **세션 UX** —
   - **워밍업 자동 생성(상대 %)**: 기준 = **그날 첫 작업세트 무게**. 램프 예: 빈바 → 50% → 70% → 88%×1. **불변식: 워밍업 ≤ 첫 작업세트 − 1스텝** (T2 50%TM 같은 가벼운 시작에서 역전 방지 — 갭이 작으면 램프 자동 축소). **힌지 계열(데드·스모·RDL)은 빈바 스텝 제외, 하한 = 바닥 높이 원판 구성 최소 하중** — 플레이트 설정에 **`fullDiameter` 플래그**를 두어 파생. **하한 > (첫 작업세트 −1스텝)이면 램프 생략.** `setType:"warmup"` — 통계·판정 전부 제외.
   - 세트 체크오프: 행 전체 탭(≥48px), ± 스테퍼. 직전 세션 동일 슬롯 실적 인라인.
   - 세트 정정: 탭 → 수정(원본 불변, CorrectionRecord).
   - 휴식 타이머: timestamp + visibilitychange 재계산. 잠금 중 알림 불가(§7).
   - Wake Lock: 요청 + iOS 18.4 미만 설치형은 silent failure — UA 버전 사전 안내(§7).
   - 플레이트 계산기(반올림·워밍업 하한의 원천).
   - 운동 스킵/대체 + **데드 안전 대체 = RDL 경량(데드 TM 50~60% × 3×6~10)** — 볼트 수칙("즉시 RDL·경량화") 그대로. **스모는 일반 대체로 강등**(동일 TM 금지 — 강도 캡 ≤85%·AMRAP 제거 부착): 통증 신호 날 95% AMRAP을 당기게 하지 않음. 대체 세트는 이력·e1RM에서 분리 표시(§2-6).
   - 진행 중 세션 복원(즉시 커밋).
6. **히스토리·통계** — 캘린더, 운동별 이력(**대체 세트 분리 표시** — 스모 T2와 데드→스모 대체가 섞이지 않게), TM 이력, e1RM(topSet만, reps>10 제외).
7. **프로그램 편집·라이브러리·전환** —
   - 편집: TM 수동(=DecisionEvent), 악세사리 교체(=새 slotId), rep 조정. **모든 편집 = 새 version(in-place 금지), 전 버전 immutable 보존.** 로컬 편집 = fork 버전 — S2 pull 충돌 안내(§4). 빌더 UI는 S3.
   - **라이브러리**: 여러 ProgramDefinition 보관. **활성 전환 = 새 ProgramInstanceState 생성** — 과거 이력은 당시 programVersion 스냅샷으로 불변, 통계는 프로그램 경계를 넘어 연속.
   - **가져오기 경로 2종**: ① JSON 파일(§2-8 가져오기와 동일 — Drive/카톡 등 아무 채널로 전달받아 주입) ② **URL에서 가져오기**(CORS 허용 origin — GitHub raw 등). 가져온 프로그램은 validate(§3.7) 통과해야 라이브러리 등록.
8. **온보딩·데이터 안전** — TM 시드(벤치105/OHP67.5/스쿼트85, 데드 보수 초기화, T2 4종 초기화). 설치 유도(standalone 미감지 오버레이 + iOS 수동 안내 + 상시 배너), persist() 시도(보장 아님). **JSON 내보내기/가져오기**: iOS = Web Share files(제스처 필수) → 클립보드 fallback / Android·데스크톱 = a[download]. **범위: 이벤트 로그 전체 + 프로그램 정의 전 버전(fork 포함) + ProgramInstanceState + 설정 + 라이브러리 커스텀.**

**비목표**: 계정/서버, 소셜, 폼 분석, 유산소, 식단.

## 3. 아키텍처

### 3.1 원칙
1. **프로그램 = 데이터, 엔진 = 해석기.**
2. **사실만 기록, 나머지는 파생.** 사실 = 세트·정정·사용자 결정·**세션 완료/스킵**. 자동 계산(TM 증량)은 기록하지 않고 fold가 도출.
3. **부수효과는 포트 뒤로.**

### 3.2 모듈 지도 (의존 위→아래만, 전 레이어 쌍 ESLint boundaries)

```
[UI] screens/ → [상태] store/ → [도메인] domain/ (순수 TS)
  ├ programEngine.ts   (정의+InstanceState+fold결과) → WorkoutPlan(워밍업 포함)
  ├ progression/       ProgressionRule (트리거: onSessionCompleted — v4에서 단일화)
  │   ├ nsunsTopSet / t2LastSet / doubleProgression
  ├ fold.ts            이벤트 → 현재 상태. §3.3 fold 계약 구현
  ├ analytics.ts / exerciseLibrary.ts
[포트] Storage / LogSink / ConfigSource / QuestionOutbox(id dedup) / AskService(오프라인 즉시 실패+Outbox 제안)
[어댑터] adapters/ (S2: MSAL·토큰 갱신 내부 관심사)
```

### 3.3 데이터 스키마 & fold 계약 (모든 영속 엔티티 `schemaVersion`)

```typescript
ProgramDefinition {
  id, name, version, schemaVersion,             // 편집 = 항상 새 version, 전 버전 보존
  weeks: [{ days: [{ ordinal, weekdayHint?, name,
    slots: [{ id,                               // identity: exerciseId 불변인 동안 유지. 교체 = 새 id.
                                                // 예외: substitutedFrom 세트는 슬롯 유지(임시 대체)
      exerciseId, label, groupId?,
      sets: [{ load: {kind:"pctOfTM", ref?, pct} | {kind:"tracked"},  // 개방 union
               reps, amrapRole?: "topSet"|"backoff" }],
      warmupRuleId?, progressionRuleId?, progressionParams }] }] }]
  // 검증 규칙(로드 시): 각 사이클-주 내에서 exerciseId당 progressionRule 보유 슬롯 ≤ 1
  //   (다주차 프로그램에서 주가 다르면 별개 슬롯 적법. rule 0개 = 수동 관리 리프트, 적법) — §2-3 불변식
}
ProgramInstanceState {
  programId, programVersion, mode: "calendar"|"rolling", schemaVersion,
  anchor: { startDate }        // calendar: 사이클-주 = startDate+7k일 창. 제약: startDate = 사이클-주 첫 훈련일
        | { }                  // rolling: 커서 = 이벤트에서 파생(마지막 SessionCompleted/Skipped의 cyclePos 다음)
  // anchor 변경은 이후 세션에만 적용. 과거 cyclePos 스냅샷이 정본(불변).
}

// ── 불변 이벤트 로그 (fold 입력 = 아래 4종 전부) ──
SetRecord        { id, sessionId, slotId?, exerciseId, setType?: "work"|"warmup",
                   targetWeight, targetReps, actualWeight, actualReps, rir?,
                   amrapRole?, substitutedFrom?, completedAt, schemaVersion }
CorrectionRecord { id, supersedes,                        // 대상: SetRecord | SessionCompleted | 선행 Correction
                   patch: {actualWeight?|actualReps?|rir?|cyclePos?} | {revoked:true},
                   at, schemaVersion }                    // 복수 정정: at 최신 승, tie=id
DecisionEvent    { id, target: {kind:"tm"|"accessory", exerciseId|slotId},
                   kind: "seed"|"manual"|"deloadAccepted"|"bonusAccepted"|"rollbackAccepted"|"t2DeloadAccepted",
                   value,                                 // 절대값 스냅샷
                   at, sourceSetRecordId,                 // seed·manual 외에는 필수 (재검토 추적용)
                   schemaVersion }
SessionCompleted { id, sessionId, at, cyclePos: {cycleIndex, week, dayOrdinal},   // 판정 트리거·정렬 앵커
                   status: "completed"|"skipped", programId, programVersion, schemaVersion }
// SessionLog(제목·노트·externalTags)는 가변 메타데이터 엔티티 — fold 입력 아님

// ── fold 계약 ──
// 입력: 위 4종 이벤트 + 참조된 ProgramDefinition 버전들
// 전순서: (at, id). 파생 증량의 위치 = 그것을 유발한 SessionCompleted의 (at, id) 직후.
// DecisionEvent는 재검토 플래그와 무관하게 항상 절대값 적용(결정성 우선) — 시정은 새 DecisionEvent로만.
// 재검토 플래그(UI 전용) 트리거: ① sourceSetRecord의 판정 입력 필드(actualReps·revoked) 변경
//   ② SessionCompleted.cyclePos 정정 → 해당 사이클-주의 판정에 근거한 결정 전부 플래그.
// 규칙 파라미터는 각 SessionCompleted.programVersion 시점 값 사용.
// 머지: id 합집합 (정정·tombstone도 이벤트 → 삭제 부활 없음).
```

**마이그레이션**: Dexie 버전 체인 + lazy migration. 볼트 교환 JSON도 schemaVersion — 비호환 시 명시 안내.

### 3.4 기술 스택
Vite+React+TS / Dexie / Zustand / vite-plugin-pwa (autoUpdate+토스트, `base`=저장소 경로) / hash 라우팅(GH Pages 404 회피) — 단 **MSAL redirect는 라우터 밖 전용 `auth.html`**(hash 소거 충돌 회피, MS 권장) / 차트 경량 SVG / GitHub Pages.

### 3.5 에러·엣지
- 진행 중 세션 즉시 커밋 → 복원. TM 오염 = 세트 정정 → 재fold 자동 교정 + 관련 결정 재검토 플래그. 오프라인 질문 = Outbox(id dedup).

### 3.6 테스트 (정답 = 공식 시트 확정 %테이블)
진리표 전 구간(데드 보수 각주) · volume day 무판정 · **사이클-주 1회 상한(cycleIndex 구분 포함)** · **화 OHP T2 + 목 topSet → OHP 주 +2.5 정확히 1회** · T2 리프트별 증량폭·실패 경로 · 더블 프로그레션(증량→리셋→유예→2연속 미달 롤백, 데드존 없음 확인) · 정정 재fold(자동 증량 교정+플래그) · (at,id) 결정성 · anchor 변경 후 과거 cyclePos 불변 · 워밍업 불변식(역전 없음·힌지 하한) · 내보내기 왕복(전 버전 포함).

### 3.7 프로그램 표준 양식 & 자연어 변환 파이프라인 (Stage 1 **첫 태스크** — 스키마 우선 개발)

**분업 원칙**: 자연어 해석 = Claude(LLM 일, 코드로 못 짬) / **미리 짜두는 코드 = 결정론적 검증기·렌더러**. 변환의 정답성은 이 도구들이 닫는다.

| 산출물 | 내용 |
|---|---|
| `schema/program.schema.json` | **표준 양식의 기계 정본** (JSON Schema) — §3.3 ProgramDefinition을 스키마화. 앱·검증기·Claude 변환이 전부 이것 하나를 참조 |
| `schema/rules-catalog.md` | **내장 증량 규칙 카탈로그** — `nsunsTopSet` / `t2LastSet` / `doubleProgression` / `linear`(고정 주기 증량) 각각의 params 명세. 프로그램 JSON은 이 카탈로그의 ruleId만 참조 가능(새 규칙 = 코드 파일 1개 추가, §5 앵커) |
| `tools/validate.mjs` | 스키마 검사 + 의미 규칙(§3.3 검증 규칙: 사이클-주당 TM 규칙 ≤1, slotId 유일성, ruleId 존재, amrapRole 정합) — node CLI, 앱 가져오기 경로도 동일 로직 사용 |
| `tools/render.mjs` | 프로그램 JSON + 샘플 TM → **주차별 세트표(무게 계산 포함) 마크다운 출력** — 변환 결과를 사람이 원문과 대조하는 눈검수용 |

**자연어 → 표준 양식 변환 규약** (볼트 Claude Code 세션에서 수행):
1. 사용자가 볼트에 자연어로 루틴 작성 (예: `4. KK/Weight Lifting/routines/내루틴.md`)
2. Claude가 `program.schema.json`+카탈로그를 참조해 JSON 변환
3. `validate` 통과 → `render` 표를 원문과 대조(불일치 시 재변환) → 사용자 확인
4. 확정본을 프로그램 라이브러리(GitHub `programs/`)에 push — 앱·친구가 URL로 가져옴

**배포 채널**:
| 채널 | 용도 | 제약 |
|---|---|---|
| **GitHub repo `programs/`** (기본) | 프로그램 라이브러리 정본 — raw URL이 CORS 허용이라 앱이 직접 fetch 가능, 버전 관리, Claude Code가 직접 push | 공개 저장소(개인 데이터 아님 — 프로그램 정의만) |
| 파일 전달 (Drive 공유·카톡 등) | 친구에게 1회성 전달 → 앱 가져오기 | 수동 |
| Google Drive 직접 fetch | ❌ 브라우저 CORS 차단(Drive는 CORS 헤더 미제공). 필요 시 Drive API v3+키로 우회 가능 — ConfigSource 포트 뒤 어댑터로 추가(앵커됨, 기본 채택 안 함) | API 키 관리 |

## 4. LLM-wiki 연동 (Stage 2)

| 방향 | 내용 | 규칙 |
|---|---|---|
| 앱→볼트 | 이벤트 로그 | `4. KK/Weight Lifting/logs/YYYY-MM-DD.json` — 이벤트는 발생 시각(at) 날짜 파일에 append-only |
| 앱→볼트 | 질문 | `_queue.md` — 질문 id 컬럼(dedup) |
| 볼트→앱 | 프로그램 | `app/program.json` — Claude는 새 버전으로만 발행, 로컬 fork 충돌 안내 |
| 볼트→앱 | 티어리스트 | TIER_*.md → JSON 미러 |

## 5. 미래 앵커 표

| 미래 기능 | Stage 1 앵커 | 추가분 |
|---|---|---|
| 프로그램 빌더 (S3) | weeks/slots/groupId/자유 label/개방 load union/버전 불변 | 편집 UI |
| 새 증량 규칙 | ProgressionRule(onSessionCompleted) + 개방 union | 규칙 파일 |
| OneDrive (S2) | (at,id) 전순서·id 합집합·tombstone + LogSink/ConfigSource | Graph 어댑터+스파이크 |
| Claude Q&A (S3) | AskService 포트 | API 어댑터 |
| 새 통계 | 이벤트 위 순수 함수 (rir·setType 확보) | 함수 |
| 친구용/신규 프로그램 | 표준 양식 스키마 + validate/render 도구 + GitHub 라이브러리 + URL 가져오기(§3.7) | 자연어 스펙 → Claude 변환 → push (앱 코드 변경 0) |
| Google Drive 연동(선택) | ConfigSource 포트 | Drive API 어댑터 + 키 |
| 크로스핏 정식 추적 | slotId optional + externalTags | 입력 UI |
| 스키마 진화 | 전 엔티티 schemaVersion + lazy migration | 마이그레이션 함수 |

## 6. 성공 기준 (검증 방법)
1. 비행기모드 금요일 세션(워밍업 램프 포함) 완주 → 강제종료 → 복원.
2. §3.6 단위테스트 전체 통과.
3. 주간 분석이 수기 계산과 일치(역할 기반 유효세트·하체 각주 표시 포함).
4. iPhone·Android standalone 설치 + 오프라인 콜드 스타트.
5. 실기기 iPhone standalone 공유시트 내보내기 → 초기화 → 가져오기 → 완전 복원(전 버전 fold 재현).
6. 세트 정정 → 통계·TM 재계산 + 결정 재검토 플래그.
7. 백그라운드 5분 → 복귀 타이머 정확.

## 7. 알려진 제약
**플랫폼 원리상 불가 (iOS)**: Vibration 미지원 / Wake Lock 18.4 미만 설치형 silent failure(감지 불가 — UA 사전 안내, 권장 18.4+) / 미설치 Safari 7일 삭제·persist() 비보장(설치가 유일 방어) / 아이콘 삭제 = 전멸(내보내기로 방어) / `beforeinstallprompt` 없음(수동 안내).
**Stage 1 선택의 결과**: 잠금화면 푸시 없음(Web Push는 서버 필요 — 0원 원칙과 교환) / MSAL standalone 리스크(S2 스파이크로 검증).

## 8. 미결정 (구현 전 사용자 확정)
1. 악세사리 시드(세트 2~3·rep 8~12·RIR 정지) 확정.
2. 유효 세트 규칙(§2-4) + "하체 낮게 표시" 각주 승인.
3. 공식 %테이블 확정(볼트 표와 차이 시 공식 우선).
4. 데드 +2.5(보수) vs 표준 +5.
5. T2 규칙(마지막 세트 완수 +스텝 / 리프트별 폭 / 2주 실패 디로드) 승인.
6. RDL 안전 대체 스케일(50~60% × 3×6~10) 승인. 스모 일반 대체 캡(≤85%·AMRAP 제거) 승인.
