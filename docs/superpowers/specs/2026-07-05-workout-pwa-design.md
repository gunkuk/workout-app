# 운동 추적 PWA — 설계 스펙 (v2)

> v2 (2026-07-05): 무맥락 검토 에이전트 3종(아키텍처·트레이닝 도메인·PWA/UX)의 35건 지적을 재검증 후 반영한 개정판. v1 대비 주요 변경: 주차/사이클 축, 슬롯 identity, 증량 이벤트 로그, 세트 정정, 주간 단위 TM 판정, 탑세트 기준 명문화, 머신 무게 스텝, Stage 1 백업, iOS 제약 명시.

> **용어 정의 (cold reader용)**
> - **PWA** (Progressive Web App): 브라우저로 접속해 홈화면에 설치하는 웹앱. 앱스토어 없이 Android·iPhone 양쪽 지원, 오프라인 작동 가능.
> - **nSuns 5-day**: 사용자가 쓰는 리프팅 프로그램. 주 5일(화~토), 각 날 T1(메인 9세트 웨이브)+T2(보조 8세트)+악세사리 1개. 벤치는 주 2회(화 volume / 토 heavy)로 %스킴이 다름.
> - **TM** (Training Max): 프로그램 계산의 기준 무게. 작업세트 무게 = TM × 정해진 %.
> - **탑 세트**: T1의 95%×1+ AMRAP 세트(3번째 세트). nSuns 증량 판정의 유일한 기준 세트. (9세트 65%×5+ AMRAP은 백오프 — 판정에 안 씀.)
> - **AMRAP** (As Many Reps As Possible): 최대 반복 세트.
> - **더블 프로그레션**: 악세사리 증량 규칙. 목표 rep 도달 시 무게를 올리고 rep을 리셋.
> - **RIR** (Reps In Reserve): 실패까지 남긴 반복 수. 사용자 악세사리 처방은 "실패 2~3회 전 종료"(RIR 2~3).
> - **Boostcamp**: 시중 리프팅 추적 앱. 이 프로젝트는 그 유료 기능의 개인용 대체가 1차 목표.
> - **LLM-wiki / 볼트**: 사용자의 Obsidian 지식 시스템(`C:\Users\rjs11\Desktop\LLM-Wiki`). OneDrive로 동기화되며 Claude Code가 파일 레벨로 읽고 씀.

---

## 0. BLUF

**Boostcamp 유료 기능을 완전 대체하는 오프라인 우선 PWA 운동 추적기.** Stage 1은 순수 로컬 추적기(Claude/서버/비용 0), Stage 2에서 OneDrive로 LLM-wiki와 연결, Stage 3에서 Claude API 실시간 Q&A. 모든 미래 단계가 Stage 1 아키텍처에 앵커됨 (§5).

- 사용자: 본인 + 친구 몇 명 (URL 공유로 설치, 계정 없음 — 기기별 독립 데이터)
- 신뢰 모델: **코드·URL은 공개**(GitHub Pages), **개인 데이터는 각 기기 로컬**(Stage 2부터 본인 OneDrive에만 추가 저장). MSAL client ID 공개는 정상.
- 비용: Stage 1~2 = 0원

## 1. Stage 로드맵

| Stage | 내용 | 리스크 게이트 |
|---|---|---|
| **1. 추적기 코어** | Boostcamp 유료 패리티(§2) — 완전 오프라인 + **JSON 내보내기/가져오기**(백업) | 없음 |
| **2. 볼트 연동** | OneDrive 직결: 로그 쓰기, 프로그램·티어 읽기, 질문 아웃박스 | **착수 첫 작업 = 실기기 iPhone standalone에서 MSAL redirect 검증 스파이크** (알려진 이슈: standalone→브라우저 튕김). 실패 시 대안: 인증만 Safari 탭 유도 |
| **3. 지능 레이어** | 앱 내 Claude API(Haiku) 실시간 Q&A + 커스텀 프로그램 빌더 UI | API 키 (질문당 ~0.3원) |

## 2. Stage 1 기능 스펙 — "Boostcamp 유료 패리티"의 정의

1. **프로그램 엔진** — 프로그램은 선언적 JSON(§3.3). 오늘의 작업세트(무게×reps) 자동 생성. **무게 반올림 단위는 상수가 아니라 "보유 원판(§2-5 플레이트 설정)으로 구성 가능한 최소 증분"에서 파생** (마이크로플레이트 없으면 5kg 단위로 자동 조정). nSuns 5-day 시드의 **요일별 %테이블(벤치 volume/heavy 구분 포함)은 nSuns 공식 스프레드시트를 정본**으로 확정한다 — 볼트의 표는 원문 스스로 "대표값"이라 명시하므로 테스트 정답으로 쓰지 않음. [Stage 1 착수 태스크]
2. **악세사리 운동** — 요일별 악세사리 배정(시드: 화 랫풀 / 수 카프 / 목 리어델트 / 금 머신이두 / 토 CSR). 각 슬롯에 증량 규칙 부착:
   - 기본 규칙(더블 프로그레션·RIR 양립형): 세트 수 2~3, 목표 rep 범위(기본 8~12), **마지막 세트가 목표 상한에 도달하면 다음 세션 +1 스텝, rep은 하한으로 리셋**. RIR 2~3 정지 방식과 양립(상한 도달 = 그 무게가 가벼워졌다는 신호로 해석).
   - **운동별 `weightStep`**: 머신/스택은 5kg(또는 실측 단위), 덤벨 2kg, 바벨 2.5kg — 운동 라이브러리에 정의.
   - 상태 전이 명세: 증량 → rep 하한 리셋 → **다음 세션 하한 미달 시 이전 무게로 롤백 제안**(자동 강행 안 함).
   - ⚠️ 시드 파라미터(세트 수·rep 범위)는 사용자 실처방 확인 후 확정 [미결정 §8].
3. **TM 자동 증량 (주간 단위·탑세트 기준·이벤트 로그)** —
   - **판정 세트 = T1 탑 세트(95%×1+)만.** 9세트 백오프 AMRAP은 기록만 하고 판정에 쓰지 않음. 스키마에서 `amrapRole: "topSet" | "backoff"`로 구분.
   - **판정 주기 = 리프트당 주 1회.** 벤치처럼 주 2회 T1이 있는 리프트는 **그 주 마지막 T1 세션(heavy day)에서만** 판정. 세션 단위 판정 금지(주당 이중 증량 버그 방지).
   - 구간 테이블(진리표, `progressionParams`로 데이터화):
     | 탑세트 reps | 동작 |
     |---|---|
     | 0~1 | 제안: 동결(기본) 또는 −5kg — 첫 실패 시점부터 양자택일 UI |
     | 2~3 | 자동: 벤치/OHP/데드 +2.5, 스쿼트 +5 |
     | 4+ | 제안: 추가 증량(+5/+10) — 확인 후 적용 |
   - **모든 TM/악세사리 무게 변경은 append-only `ProgressionEvent`로 기록**(§3.3) — 자동·수동·시드·디로드 전부. 현재 TM은 이벤트의 fold 결과일 뿐.
4. **주간 부위별 분석** — 주 단위(월 시작): 부위별 **① 유효 세트 수(강도 필터: 기본 ≥75%TM인 세트만, 임계값 설정 가능) ② 총 톤수(kg×reps, 필터 없음 — 별도 지표) ③ 빈도**. 운동→부위 매핑(주동근 1.0/보조근 0.5). 크로스핏(일)은 외부 세션으로 부위 태깅 → 빈도만 반영.
5. **세션 UX** —
   - 세트 체크오프: **행 전체가 탭 타겟(최소 48px)**, reps 입력은 ± 스테퍼 기본(키보드는 예외 경로) — 땀 손 전제.
   - **직전 세션 실적 인라인 표시**: 각 운동/세트에 지난 세션 동일 슬롯의 무게×reps·AMRAP 결과를 표시 (히스토리 화면 왕복 금지).
   - **세트 정정**: 진행 중·완료 후 모두 "세트 탭 → 수정" — 원본 불변, `supersedes` 정정 레코드로 기록(§3.3).
   - 휴식 타이머: **종료 시각 timestamp 저장 + visibilitychange 재계산** 방식(백그라운드 suspend 대응). ⚠️ iOS 잠금 중 소리/진동 알림 불가(§7) — 화면 복귀 시 잔여/초과 시간 표시로 보완.
   - **Wake Lock**(세션 중 화면 유지) 요청, 미지원/실패 시 안내.
   - 플레이트 계산기: 바 무게 + 보유 원판 설정(§2-1 반올림 단위의 원천).
   - 운동 스킵/대체(사유 메모) + **데드리프트 안전 프리셋**: 컨디션 저하 시 스모/RDL 원탭 대체(무게 스케일 규칙 포함) — 볼트 안전 수칙("허리 통증 신호 시 데드 즉시 RDL·경량화") 반영.
   - 진행 중 세션 복원(모든 체크는 즉시 IndexedDB 커밋).
6. **히스토리·개인 통계** — 캘린더 뷰, 운동별 이력, TM 이력(이벤트 로그 뷰), e1RM 추이. **e1RM은 탑 세트(95%×1+)만으로 계산, reps>10 세트는 제외**(Epley 고reps 과대추정 방지).
7. **프로그램 편집(데이터 레벨)** — TM 수동 조정(=manual ProgressionEvent), 악세사리 교체/추가, rep 범위 조정. 풀 빌더 UI는 Stage 3 — 스키마는 Stage 1부터 §3.3 요건 충족.
8. **온보딩·데이터 안전** —
   - TM 설정: 벤치 105 / OHP 67.5 / 스쿼트 85 시드. **데드는 1RM 미상 전제 보수 초기화 플로우**(추정 1RM의 ~80%, 낮게 시작 권장 안내).
   - **홈화면 설치 강유도** + 미설치 Safari 탭 사용 시 데이터 휘발 경고(iOS 7일 eviction) + `navigator.storage.persist()` 호출.
   - **JSON 내보내기/가져오기** (파일 다운로드/공유시트) — Stage 2 전까지의 유일한 백업 수단.

**비목표 (전 Stage)**: 계정/서버/멀티유저 동기화, 소셜, 폼 분석, 유산소, 식단.

## 3. 아키텍처

### 3.1 원칙
1. **프로그램 = 데이터, 엔진 = 해석기.** 코드는 특정 프로그램을 모른다.
2. **로그 = 불변 사실(append-only), 나머지 = 파생.** 사실에는 세트 기록뿐 아니라 **증량 이벤트·정정 이벤트**도 포함된다. 파생 상태(현재 TM·악세사리 무게·통계)는 전부 이벤트 fold로 재계산 가능.
3. **부수효과는 포트 뒤로.** 도메인 로직은 플랫폼 API를 직접 만지지 않는다.

### 3.2 모듈 지도 (의존 방향: 위 → 아래만, **전 레이어 쌍에 ESLint boundaries 강제** — UI→adapters 직접 import 금지 포함)

```
[UI]      screens/ (오늘운동·히스토리·분석·설정)
   ↓
[상태]    store/ (Zustand)
   ↓
[도메인]  domain/                          ← 순수 TS, 브라우저 API 금지, 단위테스트 대상
          ├ programEngine.ts   ProgramDefinition+파생상태 → 오늘의 WorkoutPlan
          ├ progression/       ProgressionRule 인터페이스
          │   ├ nsunsTopSet.ts (주간·탑세트·구간테이블)
          │   └ doubleProgression.ts (RIR 양립형)
          ├ analytics.ts       이벤트 로그 → 주간 통계·e1RM (순수 함수)
          ├ fold.ts            이벤트 로그 → 현재 상태(TM·악세사리 무게) 재계산
          └ exerciseLibrary.ts 운동↔부위·weightStep, 시드
   ↓
[포트]    ports/
          ├ Storage        (get/put/list — Dexie 구현)
          ├ LogSink        (로그 push — S2: OneDrive)      ┐ SyncTarget을
          ├ ConfigSource   (프로그램·티어 pull — S2)        ┘ 방향별 분리
          ├ QuestionOutbox (enqueue, fire-and-forget — S2: _queue.md)
          └ AskService     (ask(): Promise<Answer> — S3: Claude API)  ← Outbox와 별개 계약
   ↓
[어댑터]  adapters/  (+ Stage 2: MSAL 인증 관심사는 어댑터 내부, 토큰 갱신 포함)
```

### 3.3 핵심 데이터 스키마 (요지 — 모든 영속 엔티티에 `schemaVersion` 필수)

```typescript
// 프로그램 정의 — 주차 축·슬롯 identity·그룹핑 포함 (임의 프로그램 표현 요건)
ProgramDefinition {
  id, name, version, schemaVersion,
  cycleLengthWeeks,                       // nSuns = 1
  weeks: [{                               // 주차별 상이한 %스킴 표현 (531 등)
    days: [{
      ordinal, weekdayHint?, name,        // 요일은 힌트 — 롤링 스케줄 가능
      slots: [{
        id,                               // 안정적 identity (상태·이력이 참조)
        exerciseId,
        label,                            // "T1"|"T2"|"accessory" 등 자유 라벨 (표시·분석용, enum 아님)
        groupId?,                         // 슈퍼셋 페어링
        sets: [{ load: { kind:"pctOfTM", ref?: exerciseId, pct }   // ref 생략=자기 자신
                       | { kind:"tracked" },                        // 악세사리 자기 무게
                 reps, amrapRole?: "topSet"|"backoff" }],
        progressionRuleId, progressionParams   // 구간테이블·rep범위 등 데이터
      }]
    }]
  }]
}

// ── 불변 이벤트 로그 (진실의 원본, append-only) ──
SetRecord        { id, sessionId, slotId, exerciseId, targetWeight, targetReps,
                   actualWeight, actualReps, amrapRole?, completedAt, schemaVersion }
CorrectionRecord { id, supersedes: setRecordId, patch | revoked: true, at }  // 정정·삭제(tombstone)
ProgressionEvent { id, target: {kind:"tm", exerciseId} | {kind:"accessory", slotId},
                   value, targetReps?, cause: "seed"|"auto"|"manual"|"deload"|"rollback",
                   at, sourceSessionId?, ruleParamsSnapshot? }
SessionLog       { id, date, programId, programVersion,   // 당시 프로그램 버전 스냅샷
                   status, notes, externalTags?, schemaVersion }

// ── 파생 (fold 캐시 — 언제든 재계산 가능) ──
현재 TM / AccessoryState = fold(ProgressionEvent[])
통계·차트 = 순수함수(SetRecord[] ⊖ CorrectionRecord[])
```

**동기화 머지 규칙 (Stage 2 앵커)**: 이벤트는 id 기준 합집합, 정정·tombstone도 이벤트이므로 왕복 시 "삭제 부활" 없음. 파생 상태는 머지 후 재계산.
**마이그레이션**: Dexie 버전 체인 + 읽기 시 lazy migration(`schemaVersion` 스위치). 볼트 교환 JSON에도 동일 필드 — 구버전 앱이 신버전 파일을 만나면 무시가 아니라 명시적 비호환 안내.

### 3.4 기술 스택
| 선택 | 이유 |
|---|---|
| Vite + React + TypeScript | 표준 — 미래 Claude 세션이 유지보수하기 최적, TS가 스키마 규율 강제 |
| Dexie / Zustand / vite-plugin-pwa | 오프라인 DB / 최소 상태관리 / SW 자동화 |
| **SW 업데이트**: autoUpdate + 새 버전 토스트, vite `base`=저장소 경로, **hash 라우팅** | iOS 구버전 캐시 고착 대응, GitHub Pages 404 트릭 회피, MSAL redirect URI 등록 단순화 |
| MSAL.js (Stage 2) | §1 스파이크 게이트 통과 후 |
| 차트: 경량 SVG 직접 | 의존성 0, 필요 시 recharts |
| 호스팅: GitHub Pages | 무료 HTTPS (§0 신뢰 모델) |

### 3.5 에러·엣지
- 진행 중 세션: 세트 체크 즉시 커밋 → 앱 사망에도 복원.
- TM 오염: 원인(오입력 세트)은 CorrectionRecord로 정정 → 재fold하면 TM도 자동 교정. 제안형 변경(deload·추가증량)은 사용자 확인 전 적용 안 함.
- 오프라인 질문(S2): Outbox 적재 → 온라인 flush.

### 3.6 테스트
- `domain/` 전체 Vitest: **정답 = 공식 nSuns 스프레드시트에서 확정한 요일별 %테이블**(§2-1 태스크 산출물). 증량 진리표(§2-3) 전 구간, 벤치 주2회 시나리오(주 1회만 증량됨), 더블 프로그레션 전이(증량→리셋→미달 롤백), 정정 재fold, 주간 집계.
- UI·어댑터는 스모크 수준.

## 4. LLM-wiki 연동 상세 (Stage 2)

| 방향 | 내용 | 경로 |
|---|---|---|
| 앱→볼트 | 이벤트 로그 JSON (일별) | `4. KK/Weight Lifting/logs/YYYY-MM-DD.json` |
| 앱→볼트 | 질문 아웃박스 | `_queue.md`에 `| 질문(앱) |` 행 append |
| 볼트→앱 | 프로그램 정의(버전 포함) | `4. KK/Weight Lifting/app/program.json` (Claude Code 관리) |
| 볼트→앱 | 티어리스트 (읽기 전용) | TIER_*.md → Claude가 JSON 미러 생성 |

Claude Code는 로그를 읽고 분석·프로그램 개선을 `program.json` **새 버전**으로 발행(SessionLog가 버전을 스냅샷하므로 과거 재계산 안전).

## 5. 미래 앵커 표

| 미래 기능 | Stage 1의 앵커 | 나중에 추가되는 것 |
|---|---|---|
| 커스텀 프로그램 빌더 (S3) | weeks/slots/groupId/자유 label 스키마 | 편집 UI만 |
| 새 증량 규칙 (531, RPE 등) | ProgressionRule + 구간테이블 데이터화 | 규칙 파일 1개 |
| OneDrive 동기화 (S2) | 이벤트 합집합 머지(tombstone 포함) + LogSink/ConfigSource 포트 | Graph 어댑터 + MSAL 스파이크 |
| Claude 실시간 Q&A (S3) | AskService 포트 (Outbox와 별도 계약으로 이미 분리) | API 어댑터 + 키 UI |
| 새 통계 | 분석 = 이벤트 로그 위 순수 함수 | 함수 추가 |
| 친구용 다른 프로그램 | 프로그램=데이터 (주차·그룹 표현력 확보) | JSON 하나 |
| 크로스핏 정식 추적 | SessionLog.externalTags | 입력 UI |
| 스키마 진화 | 전 엔티티 schemaVersion + lazy migration | 마이그레이션 함수 |

## 6. 성공 기준 (Stage 1 완료 정의 — 전부 검증 가능 항목)
1. 비행기모드에서 금요일 세션(데드 T1 + 프론트스쿼트 T2 + 머신이두) 완주 로깅, 앱 강제종료 후 재시작 시 세션 복원.
2. 증량 진리표 전 구간 + **벤치 주 2회 시나리오에서 주 1회만 증량** 단위테스트 통과.
3. 주간 분석: 유효 세트/톤수/빈도가 수기 계산과 일치 (등 주 2회 빈도 포함).
4. iPhone·Android 홈화면 설치 → standalone 표시 확인, 오프라인 콜드 스타트 성공.
5. JSON 내보내기 → 초기화 → 가져오기 시 TM·이력·통계 완전 복원 (fold 재계산 검증).
6. 세트 정정 후 e1RM·주간 통계·TM 판정이 정정 반영값으로 재계산됨.

## 7. 알려진 제약 (iOS PWA — 설계로 못 없애는 것)
| 제약 | 대응 |
|---|---|
| 잠금 중 타이머 소리/진동 알림 불가 (푸시 서버 없음, Vibration API 미지원) | timestamp 타이머 + 복귀 시 잔여/초과 표시. 잠금화면 알림은 포기 명시 |
| 미설치 Safari 탭 = 7일 미사용 시 데이터 삭제 | 설치 강유도 + persist() + 경고 (§2-8) |
| 아이콘 삭제 = 데이터 전멸 | JSON 내보내기 (§2-8), Stage 2부터 OneDrive |
| MSAL redirect가 standalone에서 튕길 수 있음 | Stage 2 첫 작업 = 실기기 스파이크 (§1) |
| Wake Lock이 구 iOS 설치형에서 미작동 이력 | 기능 감지 + 실패 시 안내, iOS 최소 버전 가정: 17+ |

## 8. 미결정 사항 (사용자 확정 필요 — 구현 전 확인)
1. 악세사리 시드 파라미터: 세트 수(볼트 처방 2~3세트)·rep 범위(8~12?)·정지 기준(RIR 2~3) 확정.
2. 유효 세트 강도 임계값 기본값(≥75%TM 제안).
3. nSuns 공식 %테이블 확정본 (Stage 1 착수 태스크에서 스프레드시트 대조).
