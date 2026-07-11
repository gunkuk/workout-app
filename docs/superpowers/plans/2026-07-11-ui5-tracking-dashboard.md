# UI5 — 추적 데이터 확장 + 홈 대시보드 (사용자 지시 2026-07-11)

> 원 지시: ①추적할 가치가 있는 정보와 ②그중 첫 페이지 대시보드로 시각화할 가치가 있는 정보를 **따로** 제안·반영. 대시보드: 몸무게+체지방 동시 / 출석률+루틴 수행률(미완수 연한 색) / 부상+수행능력 / 기타. 대시보드엔 없지만 추적할 것(티어리스트·이전 루틴·운동 코멘트)은 코드로 지금 검증해 앵커.

## 설계 원칙 (스펙 §3.3 유지)
- **fold 입력 4종은 동결** — 신규 엔티티는 전부 fold 밖. TM/증량 판정에 절대 영향 없음.
- 신규 엔티티는 스펙의 "SessionLog = 가변 메타데이터 엔티티" 전례를 따름(put 갱신 허용, schemaVersion 필수).
- Dexie v4 마이그레이션(기존 버전 체인 + lazy — v3까지 쓰였는지 db.ts에서 확인 후 다음 번호), 백업 export/import 왕복에 신규 테이블 포함(스키마 체크 포함).

## 추적 엔티티 (전량 이번에 코드 검증)
| 엔티티 | 필드 | 용도 | 대시보드 |
|---|---|---|---|
| `BodyMetric` | id, at(ISO), weightKg?, bodyFatPct?, schemaVersion | 몸무게·체지방(둘 중 하나만도 허용) | ✅ 듀얼 라인 |
| `InjuryLog` | id, bodyPart(자유문자열), note?, startedAt, resolvedAt?, schemaVersion | 부상 시작/해소 | ✅ active 칩 |
| `SessionNote` | id, sessionId, note, at, schemaVersion | 세션 코멘트("오늘 어깨 불편" 등) | ❌ 히스토리 상세에서 |
| `ExerciseComment` | id, exerciseId, note, at, schemaVersion | 운동별 메모/자가 티어평가("랫풀 그립 넓게가 잘 맞음") | ❌ 추후 운동 상세·볼트 티어 연동(S2) 앵커 |
| (기존) programVersions 전 버전 | — | "이전 루틴들" — **이미 불변 보존됨**(§2-7), 추가 작업 불필요 | ❌ 프로그램 탭 |
| (파생) 출석/수행률 | sessions+sets에서 계산 | 새 엔티티 불필요 | ✅ 8주 스트립 |
| (파생) 수행능력 | tmHistory/e1rm 기존 함수 | 새 엔티티 불필요 | ✅ TM 미니 추이 |

## 홈 대시보드 카드 (기존 프로그램 카드·오늘 카드 아래에 추가)
1. **몸무게·체지방**: 듀얼 시리즈 라인(골드=몸무게 kg, 틸=체지방 % — 각자 y스케일 정규화, 범례 표시). 카드 내 빠른 입력(두 number 필드+기록 버튼, 둘 중 하나만 입력 가능). 데이터 0~1개면 입력 UI만.
2. **출석·수행 스트립**: 최근 8주×요일 그리드(GitHub 히트맵풍, 프로그램 훈련일 화~토 기준). 진한 골드=세션 완수(SessionCompleted completed) / **연한 골드=부분**(그날 SetRecord 있으나 완수 없음, 또는 skipped) / 어두운 칸=기록 없음. 헤더에 "이번 주 출석 n/5 · 수행률 m%".
3. **부상·수행능력**: active InjuryLog 칩(부위 + n일째, 탭하면 해소 처리) + "부상 기록" 추가 버튼(부위·메모 입력). 옆에 수행능력 = 4대 T1 리프트 TM 합계 추이 미니 라인(tmHistory 재사용, 최근 10포인트).
4. **세션 코멘트 입력**: TodayScreen 세션 완료 버튼 옆 선택 입력(1줄) → SessionNote 저장, HistoryScreen 세션 펼침에 표시.

## 태스크
- **T1 (데이터)**: db 버전업(+4테이블), eventStore CRUD(append/update/list), backup export/import 확장(왕복 테스트), 마이그레이션 테스트. UI 무변경.
- **T2 (대시보드)**: HomeScreen 카드 3종 + LineChart 듀얼 시리즈 확장(기존 단일 호출부 무영향 — series prop 추가는 opt-in) + TodayScreen 코멘트 입력 + History 표시. 테스트.
- 게이트: 267+ tests·tsc·lint·build 후 VLM 스크린샷 검수 → 배포.
