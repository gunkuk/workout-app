# 운동 추적 PWA — 설계 스펙 (v1)

> **용어 정의 (cold reader용)**
> - **PWA** (Progressive Web App): 브라우저로 접속해 홈화면에 설치하는 웹앱. 앱스토어 없이 Android·iPhone 양쪽 지원, 오프라인 작동 가능.
> - **nSuns 5-day**: 사용자가 쓰는 리프팅 프로그램. 주 5일(화~토), 각 날 T1(메인 9세트 웨이브)+T2(보조 8세트)+악세사리 1개. AMRAP(As Many Reps As Possible) 세트 결과로 주간 증량을 결정.
> - **TM** (Training Max): 프로그램 계산의 기준 무게. 작업세트 무게 = TM × 정해진 %.
> - **Boostcamp**: 시중 리프팅 추적 앱. 이 프로젝트는 그 유료 기능(커스텀 프로그램·부위별 분석 등)의 개인용 대체가 1차 목표.
> - **LLM-wiki / 볼트**: 사용자의 Obsidian 지식 시스템(`C:\Users\rjs11\Desktop\LLM-Wiki`). OneDrive로 동기화되며 Claude Code가 파일 레벨로 읽고 씀.
> - **더블 프로그레션** (double progression): 악세사리 증량 규칙. rep 범위(예: 8~12)를 정하고, 전 세트 상한 도달 시 무게를 올리고 rep을 하한으로 리셋.

---

## 0. BLUF

**Boostcamp 유료 기능을 완전 대체하는 오프라인 우선 PWA 운동 추적기.** Stage 1은 순수 로컬 추적기(Claude/서버/비용 0), Stage 2에서 OneDrive로 LLM-wiki와 연결, Stage 3에서 Claude API 실시간 Q&A. **모든 미래 단계가 Stage 1 아키텍처에 앵커되어 있어** 나중 기능이 리팩토링 없이 어댑터/데이터 추가로 들어온다 (§5 앵커 표).

- 사용자: 본인 + 친구 몇 명 (URL 공유로 설치, 계정 시스템 없음 — 기기별 독립 데이터)
- 플랫폼: Android + iPhone (PWA 단일 코드베이스)
- 비용: Stage 1~2 = 0원 (호스팅 GitHub Pages 무료, API 없음)

## 1. Stage 로드맵

| Stage | 내용 | 외부 의존 |
|---|---|---|
| **1. 추적기 코어** | Boostcamp 유료 패리티: 프로그램 엔진(nSuns 시드)·악세사리+자동증량·세트 로깅·TM 자동증량·주간 부위별 분석·히스토리·휴식타이머·플레이트 계산기 | 없음 (완전 오프라인) |
| **2. 볼트 연동** | OneDrive 직결(MS 로그인 1회): 로그 JSON을 볼트에 쓰기, 프로그램 규칙·티어리스트 읽기, 질문 아웃박스→`_queue.md` | MS 앱 등록 1회 (사용자) |
| **3. 지능 레이어** | 앱 내 Claude API(Haiku) 실시간 Q&A, 커스텀 프로그램 빌더 UI | API 키 (종량, 질문당 ~0.3원) |

Stage 1이 끝나면 헬스장에서 실사용 시작. Stage 경계는 배포 가능한 완결 단위.

## 2. Stage 1 기능 스펙 — "Boostcamp 유료 패리티"의 정의

패리티는 아래 목록으로 **구체적으로 정의**한다 (Boostcamp의 정확한 과금표가 아니라 사용자가 필요로 하는 유료급 기능 집합):

1. **프로그램 엔진** — nSuns 5-day 전체(요일별 T1/T2 %테이블, AMRAP 마킹)가 선언적 JSON으로 시드됨. 오늘 요일+TM으로 작업세트(무게×reps) 자동 생성. 무게는 2.5kg 단위 반올림.
2. **악세사리 운동** — 요일별 악세사리 배정(시드: 화 랫풀 / 수 카프 / 목 리어델트 / 금 머신이두 / 토 CSR + 후보 풀). 각 악세사리에 **자동 증량 규칙**(기본: 더블 프로그레션 8~12 reps, 상한 도달 시 +2.5kg) 부착.
3. **TM 자동 증량** — 세션 저장 시 nSuns 규칙 적용: T1 AMRAP ≥2회 → 벤치/OHP +2.5, 스쿼트 +5, 데드 +2.5. 0~1회 → TM 동결, 2주 연속 실패 → −5kg 제안(사용자 확인 후 적용). 모든 TM 변경은 이력으로 남고 수동 오버라이드 가능.
4. **주간 부위별 분석** — 주 단위(월요일 시작): 부위별 **세트 수 / 볼륨(kg×reps 합) / 빈도(그 부위를 건드린 세션 수)**. 운동→부위 매핑은 운동 라이브러리에 내장(주동근 가중 1.0, 보조근 0.5, 상수로 조정 가능). 크로스핏(일)은 "외부 세션"으로 부위만 태깅해 빈도에 반영(세트·볼륨은 제외).
5. **세션 UX** — 세트 체크오프, AMRAP reps 입력, 휴식 타이머(세트 체크 시 자동 시작), 플레이트 계산기(바 20kg + 보유 원판 설정), 운동 스킵/대체(사유 메모), 진행 중 세션 복원(앱 재시작에도).
6. **히스토리·개인 통계** — 캘린더 뷰, 운동별 이력, e1RM(추정 1RM: Epley 공식) 추이 차트, TM 변경 이력.
7. **프로그램 편집(데이터 레벨)** — TM 수동 조정, 악세사리 교체/추가, 세트·rep 범위 조정. (드래그앤드롭 풀 빌더 UI는 Stage 3 — 단 스키마는 Stage 1부터 임의 프로그램을 표현 가능해야 함.)

**비목표 (전 Stage)**: 계정/서버/멀티유저 동기화, 소셜 기능, 영상 폼 분석, 유산소 추적, 식단.

## 3. 아키텍처

### 3.1 원칙
1. **프로그램 = 데이터, 엔진 = 해석기.** 코드는 nSuns를 모른다. `ProgramDefinition` JSON을 해석할 뿐. 새 프로그램·커스텀 빌더 = 새 JSON.
2. **로그 = 불변 사실, 나머지 = 파생.** `SetRecord`는 append-only. TM 이력·분석·차트는 전부 로그에서 재계산 가능한 순수 함수. (백업·동기화·마이그레이션이 로그 하나로 끝남.)
3. **부수효과는 어댑터 뒤로.** 저장(IndexedDB)·동기화(OneDrive)·질문(아웃박스)은 인터페이스 뒤에 격리. 도메인 로직은 플랫폼 API를 직접 만지지 않는다.

### 3.2 모듈 지도 (의존 방향: 위 → 아래만)

```
[UI 레이어]   screens/ (오늘운동·히스토리·분석·설정)  — React 컴포넌트, 상태는 store 구독만
     ↓
[상태]        store/ (Zustand: 진행중 세션, 설정)
     ↓
[도메인]      domain/                          ← 순수 TypeScript, 브라우저 API 금지, 단위테스트 대상
              ├ programEngine.ts   ProgramDefinition + TM → 오늘의 WorkoutPlan
              ├ progression/       ProgressionRule 인터페이스
              │   ├ nsuns.ts       (AMRAP→TM 규칙)
              │   └ doubleProgression.ts (악세사리 규칙)   ← 새 규칙 = 파일 추가
              ├ analytics.ts       SetRecord[] → 주간 부위별 통계, e1RM (순수 함수)
              └ exerciseLibrary.ts 운동↔부위 매핑, 시드 데이터
     ↓
[포트]        ports/               인터페이스 정의
              ├ Storage            (get/put/list — IndexedDB 구현: Dexie)
              ├ SyncTarget         (push/pull — Stage 2: OneDrive Graph 구현)
              └ Outbox             (질문 적재 — Stage 2: _queue.md append, Stage 3: Claude API)
     ↓
[어댑터]      adapters/            포트의 플랫폼별 구현
```

**규율**: `domain/`은 import 방향 검사(ESLint boundaries)로 강제. UI가 도메인 함수를 직접 호출하는 건 허용, 역방향 금지.

### 3.3 핵심 데이터 스키마 (요지)

```typescript
// 프로그램 정의 — nSuns는 이 스키마의 인스턴스일 뿐
ProgramDefinition {
  id, name,
  days: [{ weekday, slots: [{
    exerciseId,
    role: "T1" | "T2" | "accessory",
    sets: [{ pctOfTM?, fixedWeightRef?, reps, amrap? }],   // %기반(메인) 또는 자기무게(악세사리)
    progressionRuleId, progressionParams                    // 슬롯별 증량 규칙
  }]}]
}

// 불변 로그 — 진실의 원본
SetRecord   { id, sessionId, exerciseId, slotRole, targetWeight, targetReps,
              actualWeight, actualReps, isAmrap, completedAt }
SessionLog  { id, date, programId, status, notes, externalTags? }  // 크로스핏 = external

// 파생 상태 (로그에서 재계산 가능하지만 캐시로 저장)
TMState     { exerciseId, value, effectiveFrom, cause: "auto"|"manual", sourceSessionId? }
AccessoryState { slotId, currentWeight, currentTargetReps }

// 운동 라이브러리
Exercise    { id, name, nameKo, muscles: [{ group, weight: 1.0|0.5 }], equipment }
```

### 3.4 기술 스택

| 선택 | 이유 |
|---|---|
| **Vite + React + TypeScript** | 표준 조합 — 미래의 Claude 세션(유지보수자)이 가장 잘 다루는 스택. TS가 스키마 규율 강제 |
| **Dexie** (IndexedDB 래퍼) | 오프라인 로컬 DB 표준 |
| **Zustand** | 최소 상태관리 (Redux 오버킬) |
| **vite-plugin-pwa** | Service Worker·설치 manifest 자동화 |
| **MSAL.js** (Stage 2) | Microsoft OAuth 표준 라이브러리 |
| 차트: 경량 SVG 직접 구현 | 분석 차트는 막대·선 몇 개뿐 — 라이브러리 의존성 0. 요구가 커지면 그때 recharts 도입 |
| 호스팅: **GitHub Pages** | 무료 HTTPS URL (PWA 설치 요건), `gh` CLI 이미 보유 |

### 3.5 에러 처리·엣지
- **진행 중 세션**: 모든 세트 체크는 즉시 IndexedDB 커밋 — 앱이 죽어도 세션 복원.
- **동기화 충돌 (Stage 2)**: 로그는 append-only라 충돌 없음(합집합 머지). TM 같은 파생 상태는 로그에서 재계산으로 해소. 이것이 원칙 2의 실전 이유.
- **오프라인 질문 (Stage 2)**: Outbox에 적재, 온라인 복귀 시 flush.
- **TM 자동 변경은 항상 제안→적용 로그**: 잘못된 AMRAP 입력으로 TM이 오염돼도 이력에서 롤백 가능.

### 3.6 테스트
- `domain/` 전체 단위테스트 (Vitest): nSuns %테이블 재현, 증량 규칙, 주간 분석 집계 — **볼트의 [[페이지3_nSuns기반_통합루틴]] 표의 수치가 기대값** (TM 벤치105 → 1세트 80kg 등).
- UI·어댑터는 스모크 수준. 도메인 커버리지가 우선.

## 4. LLM-wiki 연동 상세 (Stage 2)

| 방향 | 내용 | 경로 |
|---|---|---|
| 앱 → 볼트 | 세션 로그 JSON (일별) | `4. KK/Weight Lifting/logs/YYYY-MM-DD.json` |
| 앱 → 볼트 | 질문 아웃박스 | `_queue.md`에 `| 질문(앱) |` 행 append |
| 볼트 → 앱 | 프로그램 정의·악세사리 후보 풀 | `4. KK/Weight Lifting/app/program.json` (Claude Code가 관리) |
| 볼트 → 앱 | 티어리스트 (읽기 전용 표시) | 기존 TIER_*.md 파싱 또는 Claude가 JSON 미러 생성 |

Claude Code(볼트 세션)는 로그를 읽고 주기 분석·프로그램 개선을 `program.json`에 써서 앱에 반영 — **README §7의 비동기 파일 매개 패턴 그대로.**

## 5. 미래 앵커 표 (스텝 1이 미리 지불하는 것)

| 미래 기능 | Stage 1의 앵커 | 나중에 추가되는 것 |
|---|---|---|
| 커스텀 프로그램 빌더 (S3) | ProgramDefinition 스키마가 임의 프로그램 표현 | 편집 UI만 |
| 새 증량 규칙 (linear, RPE 등) | ProgressionRule 인터페이스 | 규칙 파일 1개 |
| OneDrive 동기화 (S2) | SyncTarget 포트 + append-only 로그(충돌 무해) | Graph 어댑터 1개 |
| Claude 실시간 Q&A (S3) | Outbox 포트 | API 어댑터 1개 + 키 UI |
| 새 통계 (RPE 추이, PR 알림 등) | 분석 = 로그 위 순수 함수 | 함수 추가 |
| 친구용 다른 프로그램 | 프로그램=데이터, 기기별 독립 저장 | JSON 하나 |
| 크로스핏·외부 운동 정식 추적 | SessionLog.externalTags | 입력 UI |

## 6. 성공 기준 (Stage 1 완료 정의)
1. 오프라인(비행기모드)에서 nSuns 금요일 세션(데드 T1 9세트 + 프론트스쿼트 T2 + 머신이두)을 세트 자동계산으로 완주 로깅.
2. AMRAP 결과에 따라 TM이 규칙대로 자동 증량되고 이력에 남음.
3. 주간 분석 화면에서 부위별 세트/볼륨/빈도가 볼트 문서의 배분 논리(등 주2회 등)와 일치하게 집계됨.
4. Android·iPhone 홈화면 설치 후 네이티브 앱처럼 실행.
5. `domain/` 단위테스트 전체 통과 (nSuns 수치 = 볼트 문서 기대값).
