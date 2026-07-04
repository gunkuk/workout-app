# 운동 추적 PWA — 설계 스펙 (v3)

> v3 (2026-07-05): 2라운드 무맥락 검토 33건(아키 16·도메인 7·PWA 10) 반영. 핵심 변경: **자동 증량을 이벤트에서 파생으로 강등**(정정 재fold 모순 해소), T2 보조리프트 TM·증량 신설, 프로그램 커서 엔티티, 판정을 슬롯 앵커로 재정의, 워밍업 세트, MSAL×hash 라우팅 정정, Wake Lock 사실관계 정정, 플랫폼별 내보내기 경로.
> v2 (2026-07-05): 1라운드 검토 35건 반영.

> **용어 정의 (cold reader용)**
> - **PWA**: 브라우저로 접속해 홈화면에 설치하는 웹앱. 앱스토어 없이 Android·iPhone 지원, 오프라인 작동.
> - **nSuns 5-day**: 사용자의 리프팅 프로그램. 주 5일(화~토), 각 날 T1(메인 9세트 웨이브)+T2(보조 8세트)+악세사리 1개. 벤치는 주 2회(화 volume / 토 heavy)로 %스킴이 다름.
> - **TM** (Training Max): 프로그램 계산 기준 무게. 작업세트 무게 = TM × %. **T1 리프트(벤치·스쿼트·OHP·데드)와 T2 리프트(스모·프론트스쿼트·인클라인·CGBP)는 각자 독립 TM을 가진다.**
> - **탑 세트**: `amrapRole: "topSet"`으로 표시된 세트 (nSuns heavy 스킴의 95%×1+). TM 증량 판정의 유일한 기준. volume day 스킴에는 탑 세트가 **없다**(정본 시트 기준) — 그날은 판정이 발생하지 않는 것이 정상.
> - **AMRAP**: 최대 반복 세트. **RIR**: 실패까지 남긴 반복 수(사용자 악세사리 처방 = RIR 2~3 정지).
> - **더블 프로그레션**: 목표 rep 도달 시 무게 증량 + rep 리셋.
> - **fold**: 이벤트 로그를 순서대로 접어 현재 상태(TM 등)를 계산하는 순수 함수. 이 스펙의 상태 모델 근간.
> - **Boostcamp**: 시중 리프팅 앱. 유료 기능의 개인용 대체가 1차 목표.
> - **LLM-wiki / 볼트**: 사용자의 Obsidian 지식 시스템. OneDrive 동기화, Claude Code가 파일로 읽고 씀.

---

## 0. BLUF

**Boostcamp 유료 기능을 완전 대체하는 오프라인 우선 PWA 운동 추적기.** Stage 1 = 순수 로컬 추적기(비용 0), Stage 2 = OneDrive로 LLM-wiki 연결, Stage 3 = Claude API Q&A. 미래 단계는 Stage 1 아키텍처에 앵커(§5).

- 사용자: 본인 + 친구 몇 명 (URL 공유 설치, 계정 없음, 기기별 독립 데이터)
- 신뢰 모델: 코드·URL 공개(GitHub Pages), 개인 데이터는 기기 로컬(S2부터 본인 OneDrive 추가). MSAL client ID 공개 정상.
- 비용: Stage 1~2 = 0원

## 1. Stage 로드맵

| Stage | 내용 | 리스크 게이트 |
|---|---|---|
| **1. 추적기 코어** | Boostcamp 유료 패리티(§2) — 완전 오프라인 + JSON 내보내기 | 없음 |
| **2. 볼트 연동** | OneDrive: 로그 쓰기, 프로그램·티어 읽기, 질문 아웃박스 | 착수 첫 작업 = **실기기 iPhone standalone MSAL 스파이크** — 검증 항목: ① redirect가 standalone 밖으로 튕기는지 ② 라우터가 인증 응답 hash를 소거하는지(§3.4 전용 redirect 페이지로 회피) |
| **3. 지능 레이어** | 앱 내 Claude API(Haiku) Q&A + 프로그램 빌더 UI | API 키 (질문당 ~0.3원) |

## 2. Stage 1 기능 스펙 — "Boostcamp 유료 패리티"의 정의

**§2의 8개 항목 체크리스트가 곧 Stage 1 완료 정의다** (§6은 그 검증 방법).

1. **프로그램 엔진** — 프로그램은 선언적 JSON(§3.3). 오늘의 작업세트 자동 생성. 무게 반올림 단위는 **보유 원판(§2-5)으로 구성 가능한 최소 증분에서 파생**. nSuns 시드의 요일별 %테이블(벤치 volume/heavy 구분)은 **nSuns 공식 스프레드시트가 정본** — 볼트 표는 "대표값"이라 테스트 정답으로 쓰지 않음 [Stage 1 착수 태스크].
2. **악세사리 운동** — 요일별 배정(시드: 화 랫풀 / 수 카프 / 목 리어델트 / 금 머신이두 / 토 CSR). 슬롯별 증량 규칙:
   - 기본(더블 프로그레션·RIR 양립형): 세트 2~3, 목표 rep 범위(기본 8~12). **마지막 세트가 상한 도달 && (rir 입력 시 rir≥2) → 다음 세션 +1 스텝, rep 하한 리셋.**
   - **운동별 `weightStep`**: 머신/스택 5kg, 덤벨 2kg, 바벨 2.5kg (운동 라이브러리 정의).
   - **롤백(발진 방지)**: 증량 후 **2세션 연속 첫 세트가 하한 미달**일 때만 이전 무게 롤백 제안 (1회 미달은 정상 적응기).
   - 시드 파라미터는 사용자 확정 필요 [§8].
3. **TM 자동 증량** — T1·T2 분리:
   - **(a) T1 판정 = 슬롯 앵커**: `amrapRole:"topSet"` 세트를 포함한 세션이 완료될 때 판정. **리프트당 사이클-주 1회 상한**(같은 사이클-주에 topSet 세션이 2번 오면 마지막 것만; 스킵하면 그 주 판정 없음 = 동결). 달력 요일이 아니라 프로그램 구조(§3.3 cyclePos)에 앵커되므로 롤링 스케줄에서도 성립.
   - T1 진리표(`progressionParams`로 데이터화):
     | 탑세트 reps | 동작 |
     |---|---|
     | 0~1 | 제안: 동결(기본) / −5kg 양자택일 |
     | 2~3 | **자동(파생)**: 벤치/OHP +2.5, 스쿼트 +5, 데드 +2.5* |
     | 4+ | 제안: 추가 증량(+5/+10) — 확인 후 적용 |
     *데드 +2.5는 nSuns 표준(+5)이 아닌 **의도적 보수 설정**(디스크·볼트 안전 수칙) — 테스트 오라클(공식 시트)과 다른 유일한 지점임을 명시 [§8 확인].
   - **(b) T2 리프트(스모·프론트·인클라인·CGBP) = 독립 TM + 전용 규칙**: T2엔 탑세트가 없으므로 규칙(제안, §8 확정): "그 주 T2 슬롯의 마지막 세트 목표 reps 완수 시 다음 사이클-주 +2.5". `load.ref`로 자기 TM 참조.
   - **자동 증량은 이벤트로 기록하지 않는다** — fold(§3.3)가 세트 로그+규칙에서 도출. 사용자 결정(시드/수동/디로드 수락/보너스 수락/롤백 수락)만 `DecisionEvent`로 기록.
   - **대체 운동 세트(`substitutedFrom` 표시)는 TM 판정에서 제외** — 경량 RDL AMRAP이 데드 TM을 올리는 사고 차단.
4. **주간 부위별 분석** — 사이클-주 단위: 부위별 ① **유효 세트 수** ② **총 톤수**(전 세트) ③ **빈도**. 유효 세트 판정은 %TM 임계가 아니라(티어 간 비대칭 왜곡) **역할 기반**:
   - T1: AMRAP 세트(topSet·backoff) + ≥85%TM 세트
   - T2: 마지막 세트
   - 악세사리: 전 세트 (RIR 2~3 처방 전제)
   - `rir` 입력이 있으면 rir≤4 세트는 티어 무관 유효 — 규칙은 상수화, §8에서 재확정.
   - 크로스핏(일)은 외부 세션: 부위 태깅 → 빈도만.
5. **세션 UX** —
   - **워밍업 자동 생성**: T1/T2 첫 작업세트 전 램프(예: 빈바×10 → 40%×5 → 55%×3, 규칙 데이터화). 표시·체크 가능하되 `setType:"warmup"`으로 기록, 통계·판정 전부 제외.
   - 세트 체크오프: 행 전체 탭 타겟(≥48px), reps는 ± 스테퍼(키보드 예외 경로). 직전 세션 동일 슬롯 실적 인라인 표시.
   - 세트 정정: "세트 탭 → 수정" — 원본 불변, `CorrectionRecord`(§3.3).
   - 휴식 타이머: 종료 시각 timestamp + visibilitychange 재계산. ⚠️ 잠금 중 알림 불가(§7).
   - Wake Lock: 요청하되 **iOS 18.4 미만 설치형에서는 silent failure(감지 불가)** — UA 버전으로 18.4 미만이면 "화면 자동꺼짐 될 수 있음" 사전 안내(§7).
   - 플레이트 계산기: 바 무게 + 보유 원판 설정(반올림 단위의 원천).
   - 운동 스킵/대체(사유 메모) + **데드 안전 프리셋**: 스모(동일 TM·동일 %스킴) / RDL(데드 TM의 50~60% × 3세트 6~10, §8 확정) 원탭 대체 — 대체 세트는 `substitutedFrom` 기록·판정 제외.
   - 진행 중 세션 복원(체크 즉시 커밋).
6. **히스토리·통계** — 캘린더, 운동별 이력, TM 이력(DecisionEvent+파생 변경 통합 뷰), e1RM 추이(**topSet만, reps>10 제외**).
7. **프로그램 편집(데이터 레벨)** — TM 수동 조정(=DecisionEvent), 악세사리 교체(=새 slotId, §3.3 identity 규칙), rep 범위 조정. **로컬 편집 = 로컬 fork 버전 생성** — Stage 2에서 볼트 신버전 pull 시 충돌 안내 후 선택(§4). 풀 빌더 UI는 Stage 3.
8. **온보딩·데이터 안전** —
   - TM 시드: 벤치 105 / OHP 67.5 / 스쿼트 85. 데드는 보수 초기화 플로우(추정 1RM의 ~80%). T2 TM 초기화 플로우 포함.
   - 설치 유도: **standalone 미감지 시 안내 오버레이(iOS는 공유시트→"홈 화면에 추가" 수동 안내 — `beforeinstallprompt` 없음) + 해제 시 상시 경고 배너.** `navigator.storage.persist()`는 시도하되 **보장 아님** — 설치가 유일한 확실한 방어(§7).
   - **JSON 내보내기/가져오기** — 플랫폼별 경로 확정: **iOS = Web Share Level 2 파일 공유(사용자 제스처 필수, `canShare({files})` 감지) → 미지원 시 클립보드 복사 fallback / Android·데스크톱 = `a[download]`.** 포함 범위: 이벤트 로그 전체(4종) + 프로그램 정의(로컬 fork 포함) + ProgramInstanceState + 설정(플레이트·임계값) + 운동 라이브러리 커스텀.

**비목표**: 계정/서버, 소셜, 폼 분석, 유산소, 식단.

## 3. 아키텍처

### 3.1 원칙
1. **프로그램 = 데이터, 엔진 = 해석기.**
2. **사실만 기록, 나머지는 파생.** 사실 = 세트 기록·정정·**사용자 결정**. 자동 계산 결과(TM 자동 증량 등)는 기록하지 않고 fold로 도출 — 그래야 사실 정정 시 파생이 모순 없이 재계산된다.
3. **부수효과는 포트 뒤로.**

### 3.2 모듈 지도 (의존 위→아래만, **전 레이어 쌍 ESLint boundaries** — UI→adapters 직접 import 금지)

```
[UI]      screens/
[상태]    store/ (Zustand)
[도메인]  domain/                          ← 순수 TS, 단위테스트 대상
          ├ programEngine.ts   (ProgramDefinition, InstanceState, fold결과) → 오늘의 WorkoutPlan(워밍업 포함)
          ├ progression/       ProgressionRule 인터페이스 — **트리거 모델 포함: onSessionComplete | onCycleWeek | onCycle**
          │   ├ nsunsTopSet.ts / t2LastSet.ts / doubleProgression.ts
          ├ fold.ts            이벤트 → 현재 상태 (TM·T2 TM·악세사리 무게). 전순서: (at, id)
          ├ analytics.ts       이벤트 → 주간 통계·e1RM (순수 함수)
          └ exerciseLibrary.ts 운동↔부위·weightStep
[포트]    ports/
          ├ Storage (Dexie) / LogSink (S2 push) / ConfigSource (S2 pull)
          ├ QuestionOutbox (enqueue, at-least-once → **질문 id로 dedup**)
          └ AskService (S3, ask(): Promise — **오프라인 시 즉시 실패 + Outbox 전환 제안**)
[어댑터]  adapters/ (S2: MSAL 인증·토큰 갱신은 어댑터 내부 관심사)
```

### 3.3 핵심 데이터 스키마 (모든 영속 엔티티에 `schemaVersion`)

```typescript
ProgramDefinition {
  id, name, version, schemaVersion,
  weeks: [{ days: [{                      // cycleLength = weeks.length (파생, 중복 필드 없음)
    ordinal, weekdayHint?, name,
    slots: [{
      id,                                 // identity 규칙: exerciseId 불변인 동안만 유지.
                                          // 운동 교체 = 새 slotId (구 슬롯 상태는 보관·미적용)
      exerciseId, label,                  // label = 자유 문자열 ("T1"|"T2"|"accessory"…)
      groupId?,                           // 슈퍼셋
      sets: [{ load: { kind:"pctOfTM", ref?: exerciseId, pct }   // ref 생략 = 자기 TM (T2도 자기 TM)
                     | { kind:"tracked" }                         // 개방 union — RPE 등 확장 지점
               , reps, amrapRole?: "topSet"|"backoff" }],
      warmupRuleId?,                      // 워밍업 램프 생성 규칙
      progressionRuleId, progressionParams
    }]
  }]}]
}
ProgramInstanceState {                     // "오늘 → (week, day)" 매핑의 근원
  programId, programVersion,
  mode: "calendar" | "rolling",
  anchor: { startDate } | { cursor: {week, dayOrdinal} },  // rolling = 커서 진행(스킵 시 규칙 포함)
  schemaVersion
}

// ── 불변 이벤트 로그 (사실만, append-only) ──
SetRecord        { id, sessionId, slotId?,               // slotId optional — ad-hoc/외부 세트 허용
                   exerciseId, setType?: "work"|"warmup",
                   targetWeight, targetReps, actualWeight, actualReps, rir?,
                   amrapRole?, substitutedFrom?: exerciseId, completedAt, schemaVersion }
CorrectionRecord { id, supersedes: recordId,             // 대상: SetRecord 또는 선행 Correction
                   patch: {actualWeight?|actualReps?|rir?} | { revoked: true },  // 허용 필드 열거
                   at, schemaVersion }                   // 동일 대상 복수 정정: at 최신 승, tie=id
DecisionEvent    { id, target: {kind:"tm"|"accessory", exerciseId|slotId},
                   kind: "seed"|"manual"|"deloadAccepted"|"bonusAccepted"|"rollbackAccepted",
                   value,                                // 절대값 스냅샷 (델타 아님)
                   at, sourceSetRecordId?, schemaVersion }
SessionLog       { id, date, programId, programVersion,  // 당시 버전 스냅샷 (재계산 정합)
                   cyclePos: {week, dayOrdinal},         // 판정·통계의 사이클-주 기준
                   status, notes, externalTags?, schemaVersion }

// ── 파생 (재계산 가능, 캐시일 뿐) ──
현재 TM 등 = fold( 정정 반영 SetRecord + DecisionEvent, 각 세션의 programVersion 규칙 )
  · 자동 증량(진리표 2~3 구간, T2 규칙)은 fold가 도출 — 이벤트 없음
  · DecisionEvent의 sourceSetRecord가 정정으로 무효화되면 그 결정은 삭제하지 않고 "재검토 필요" 플래그 → UI 노출
정렬 계약: (at, id) 전순서 / 머지: id 합집합 (tombstone도 이벤트라 삭제 부활 없음)
```

**마이그레이션**: Dexie 버전 체인 + 읽기 시 lazy migration. 볼트 교환 JSON도 schemaVersion — 비호환 시 명시적 안내(무시 금지).

### 3.4 기술 스택
| 선택 | 이유 |
|---|---|
| Vite + React + TS / Dexie / Zustand / vite-plugin-pwa | §v2와 동일 (표준·유지보수성) |
| SW: autoUpdate + 새 버전 토스트, `base`=저장소 경로 | iOS 구버전 캐시 고착 대응 |
| **hash 라우팅** (GitHub Pages 404 트릭 회피용) — 단 **MSAL redirect는 라우터 밖 전용 페이지(`auth.html`)** | hash 라우터가 MSAL 인증 응답 hash를 소거하는 알려진 충돌(`hash_empty_error`) 회피 — Microsoft 권장 패턴 |
| 차트: 경량 SVG | 의존성 0 |
| 호스팅: GitHub Pages | 무료 HTTPS |

### 3.5 에러·엣지
- 진행 중 세션: 즉시 커밋 → 복원.
- TM 오염: 오입력 세트를 정정 → 재fold로 자동 증량분 자동 교정(§3.1 원칙 2의 실전 효과). 결정 이벤트는 "재검토 필요" 플래그.
- 오프라인 질문(S2): Outbox 적재 → flush(질문 id dedup).

### 3.6 테스트
- 정답 = 공식 스프레드시트 확정 %테이블(§2-1 태스크). 커버: 진리표 전 구간(데드 보수 각주 포함), **벤치 volume day에 topSet 없음 → 판정 미발생**, 사이클-주 1회 상한, T2 규칙, 더블 프로그레션(증량→리셋→2연속 미달 롤백), 정정 재fold(자동 증량 교정 + 결정 플래그), (at,id) 전순서 fold 결정성, 내보내기 왕복.

## 4. LLM-wiki 연동 상세 (Stage 2)

| 방향 | 내용 | 경로·규칙 |
|---|---|---|
| 앱→볼트 | 이벤트 로그 | `4. KK/Weight Lifting/logs/YYYY-MM-DD.json` — **모든 이벤트는 발생 시각(at)의 날짜 파일에 append-only** (과거 세트 정정도 오늘 파일로) |
| 앱→볼트 | 질문 아웃박스 | `_queue.md` — **질문 id 컬럼 포함**(flush 재시도 dedup) |
| 볼트→앱 | 프로그램 정의 | `app/program.json` — Claude는 **새 버전으로만** 발행. 로컬 fork 존재 시 pull은 충돌 안내(자동 덮어쓰기 금지) |
| 볼트→앱 | 티어리스트 | TIER_*.md → Claude가 JSON 미러 |

## 5. 미래 앵커 표

| 미래 기능 | Stage 1의 앵커 | 나중에 추가되는 것 |
|---|---|---|
| 커스텀 프로그램 빌더 (S3) | weeks/slots/groupId/자유 label/개방 load union | 편집 UI |
| 새 증량 규칙 (531·RPE) | ProgressionRule + **트리거 모델(onSession/onCycleWeek/onCycle)** + 개방 load union | 규칙 파일 |
| OneDrive 동기화 (S2) | (at,id) 전순서·id 합집합·tombstone 이벤트 + LogSink/ConfigSource | Graph 어댑터 + MSAL 스파이크 |
| Claude Q&A (S3) | AskService 포트 (Outbox와 별도 계약) | API 어댑터 |
| 새 통계 | 분석 = 이벤트 위 순수 함수 (rir·setType 필드 확보) | 함수 추가 |
| 친구용 프로그램 | 프로그램=데이터 + **가져오기가 주입 경로**(§2-8 범위에 프로그램 포함) | JSON |
| 크로스핏 정식 추적 | slotId optional + externalTags | 입력 UI |
| 스키마 진화 | 전 엔티티 schemaVersion + lazy migration | 마이그레이션 함수 |

## 6. 성공 기준 (검증 방법 — 완료 정의 자체는 §2 체크리스트)
1. 비행기모드 금요일 세션(워밍업 램프 포함) 완주 로깅 → 강제종료 → 복원.
2. 단위테스트: §3.6 전 항목 통과 (진리표·주1회 상한·T2·volume day 무판정·롤백 발진 방지·정정 재fold).
3. 주간 분석(역할 기반 유효세트·톤수·빈도)이 수기 계산과 일치.
4. iPhone·Android 설치 → standalone 표시 + 오프라인 콜드 스타트.
5. **실기기 iPhone standalone에서** 공유시트 내보내기 → 초기화 → 가져오기 → TM·이력·통계 완전 복원.
6. 세트 정정 → e1RM·주간 통계·TM이 재계산되고, 관련 DecisionEvent에 재검토 플래그.
7. 백그라운드 5분 → 복귀 시 타이머 잔여/초과 정확(timestamp 방식 검증).

## 7. 알려진 제약
**플랫폼 원리상 불가 (iOS)**
| 제약 | 대응 |
|---|---|
| Vibration API 미지원 | 소리/화면 표시로 대체 |
| Wake Lock: **18.4 미만 설치형에서 silent failure(정상 resolve 후 화면 꺼짐 — 감지 불가)** | UA 버전 스니핑으로 18.4 미만이면 사전 안내. 최소 가정: iOS 18.4+ 권장 |
| 미설치 Safari 탭 7일 미사용 = 데이터 삭제, persist()는 **보장 아님** | 설치 유도가 유일한 확실한 방어 + 내보내기 |
| 아이콘 삭제 = 데이터 전멸 | JSON 내보내기(§2-8), S2부터 OneDrive |
| `beforeinstallprompt` 없음 (프로그램적 설치 유도 불가) | 수동 안내 오버레이 |

**Stage 1 선택의 결과 (원리상은 가능)**
| 제약 | 이유·해제 조건 |
|---|---|
| 잠금화면 타이머 푸시 알림 없음 | Web Push는 iOS 16.4+ 지원되나 푸시 서버 필요 — 서버 0원 원칙과 교환. 필요 시 후순위 |
| MSAL redirect standalone 이탈 리스크 | S2 스파이크로 검증(§1) — 실패 시 Safari 탭 인증 대안 |

## 8. 미결정 사항 (구현 전 사용자 확정)
1. 악세사리 시드: 세트 수(2~3)·rep 범위(8~12?)·RIR 정지 기준 확정.
2. 유효 세트 역할 기반 규칙(§2-4)의 기본값 승인.
3. nSuns 공식 %테이블 확정본 (볼트 표와 차이 나면 공식 우선).
4. **데드 +2.5(보수) vs 표준 +5** — 의도 유지 여부.
5. **T2 증량 규칙**("마지막 세트 완수 시 +2.5") 승인.
6. RDL 대체 스케일(데드 TM 50~60% × 3×6~10) 승인.
