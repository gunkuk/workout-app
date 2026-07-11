/**
 * UI5 T1 — 추적 전용 엔티티 4종(BodyMetric/InjuryLog/SessionNote/ExerciseComment).
 * fold 입력 4종(SetRecord/CorrectionRecord/DecisionEvent/SessionCompleted, domain/types.ts)과
 * 동결 경계가 다르므로 별도 파일로 분리한다 — TM/증량 판정(fold)에 어떤 영향도 주지 않는
 * 순수 저장용 메타데이터(계획 docs/superpowers/plans/2026-07-11-ui5-tracking-dashboard.md §설계원칙).
 */

/** 체성분 기록 — 몸무게·체지방 중 하나만 있어도 허용(둘 다 optional). */
export type BodyMetric = {
  id: string;
  at: string; // ISO 8601
  weightKg?: number;
  bodyFatPct?: number;
  schemaVersion: 1;
};

/** 부상 기록 — resolvedAt이 없으면 active. */
export type InjuryLog = {
  id: string;
  bodyPart: string;
  note?: string;
  startedAt: string; // ISO 8601
  resolvedAt?: string; // ISO 8601
  schemaVersion: 1;
};

/** 세션 코멘트(자유 텍스트 1건) — 동일 sessionId로 여러 번 upsert 가능, getSessionNote는 최신 1건 반환. */
export type SessionNote = {
  id: string;
  sessionId: string;
  note: string;
  at: string; // ISO 8601
  schemaVersion: 1;
};

/** 운동별 메모/자가 평가 — exerciseId당 여러 건 누적되는 히스토리형 기록. */
export type ExerciseComment = {
  id: string;
  exerciseId: string;
  note: string;
  at: string; // ISO 8601
  schemaVersion: 1;
};
