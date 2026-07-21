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

/** 운동별 메모/자가 평가 — exerciseId당 여러 건 누적되는 히스토리형 기록.
 *  slotId(UI15 item3, additive) — 요일별로 따로 관리하기 위한 슬롯 구분. 저장 시 현재 슬롯의
 *  slotId를 같이 기록하고, 조회는 같은 slotId 최신 메모 우선 → 없으면 같은 exerciseId(다른 요일
 *  포함) 최신 메모로 폴백한다(getExerciseCommentForSlot, eventStore.ts). */
export type ExerciseComment = {
  id: string;
  exerciseId: string;
  slotId?: string;
  note: string;
  at: string; // ISO 8601
  schemaVersion: 1;
};

/**
 * UI11 — 활동 구간 타이머(스트레칭/운동/러닝/운동후스트레칭/복근/기타). 하나의 세션(있으면)
 * 또는 독립적으로 여러 구간이 기록된다. 동시에 하나만 진행(endedAt undefined인 행이 최대 1개) —
 * 이 불변조건은 store 레이어(programStore.startActivity)가 강제한다(storage 레이어는 단순 CRUD).
 */
export type ActivityKind = "stretch" | "workout" | "postStretch" | "running" | "abs" | "other";

export type ActivitySegment = {
  id: string;
  /** 오늘 세션의 결정론적 sessionId(있으면 연결) — 없으면 독립 기록. */
  sessionId?: string;
  kind: ActivityKind;
  /** kind === "other"일 때 자유 입력 라벨. */
  label?: string;
  startedAt: string; // ISO 8601
  /** 진행 중이면 undefined. */
  endedAt?: string; // ISO 8601
  /** 종료 시 확정 저장(재계산 없이 통계에서 바로 사용). */
  durationSec?: number;
  schemaVersion: 1;
};

/**
 * UI11 — 세트 소요시간. SetRecord(domain, 동결)와 id 1:1로 대응하는 별도 테이블 — "세트 완료 시점 -
 * 직전 세트 완료 시점"(set-to-set interval, 작업+휴식 포함)을 잰다. 첫 세트(직전 완료가 없음)는
 * 기록하지 않는다(허구 시작시각 생성 금지 — useTodaySession.setStartedAt 주석 참고).
 */
export type SetTiming = {
  /** 대상 SetRecord.id와 동일(1:1, put-upsert). */
  id: string;
  sessionId: string;
  durationSec: number;
  startedAt: string; // ISO 8601
  endedAt: string; // ISO 8601
  schemaVersion: 1;
};

/**
 * 요일별 컨디션/수면/직전식사 체크인(UI15 item4) — 하루 1건, 같은 date로 upsert. 셋 다 optional —
 * 한 항목만 탭해도 그 필드만 갱신되고 나머지는 보존된다(programStore.upsertDailyCheckin).
 */
export type DailyCheckin = {
  id: string;
  date: string; // YYYY-MM-DD, 하루 1건(같은 date로 upsert)
  condition?: 1 | 2 | 3 | 4 | 5;
  sleep?: 1 | 2 | 3 | 4 | 5;
  lastMeal?: 1 | 2 | 3 | 4 | 5;
  at: string; // ISO 8601
  schemaVersion: 1;
};
