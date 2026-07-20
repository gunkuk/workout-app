/** 사이클 위치 — week는 program.weeks의 0-based 인덱스, dayOrdinal은 1-based, cycleIndex는 0-based 반복 번호 */
export type CyclePos = { cycleIndex: number; week: number; dayOrdinal: number };

export type SetRecord = {
  id: string;
  sessionId: string;
  slotId?: string;
  exerciseId: string;
  setType?: "work" | "warmup";
  targetWeight: number | null;
  targetReps: number;
  actualWeight: number;
  actualReps: number;
  rir?: number;
  amrapRole?: "topSet" | "backoff";
  substitutedFrom?: string;
  completedAt: string; // ISO 8601
  schemaVersion: 1;
};

export type CorrectionPatch = {
  actualWeight?: number;
  actualReps?: number;
  rir?: number;
  cyclePos?: CyclePos;
};

export type CorrectionRecord = {
  id: string;
  /** 대상: SetRecord.id | SessionCompleted.id | 선행 CorrectionRecord.id */
  supersedes: string;
  patch?: CorrectionPatch;
  revoked?: true;
  at: string;
  schemaVersion: 1;
};

export type DecisionTarget =
  | { kind: "tm"; exerciseId: string }
  | { kind: "accessory"; slotId: string };

export type DecisionEvent = {
  id: string;
  target: DecisionTarget;
  kind: "seed" | "manual" | "deloadAccepted" | "bonusAccepted" | "rollbackAccepted" | "t2DeloadAccepted";
  /** 절대값 스냅샷 (델타 아님) */
  value: number;
  targetReps?: number;
  at: string;
  /** seed·manual 외에는 필수 */
  sourceSetRecordId?: string;
  schemaVersion: 1;
};

export type SessionCompleted = {
  id: string;
  sessionId: string;
  at: string;
  cyclePos: CyclePos;
  status: "completed" | "skipped";
  programId: string;
  programVersion: number;
  schemaVersion: 1;
};

/** 프로그램 정의 (Plan A 스키마와 동일 구조의 TS 타입) */
export type LoadSpec =
  | { kind: "pctOfTM"; ref?: string; pct: number }
  | { kind: "tracked" };

export type SetSpec = { load: LoadSpec; reps: number; amrapRole?: "topSet" | "backoff" };

export type SlotSpec = {
  id: string;
  exerciseId: string;
  label: string;
  groupId?: string;
  warmupRuleId?: string;
  progressionRuleId?: string;
  progressionParams?: Record<string, unknown>;
  /** tracked 슬롯의 최초 무게 유도(UI13) — AccessoryState가 아직 없을 때만 쓰인다.
   *  `kg` 절대값 또는 `ref` TM × `pct`. 상태가 생기면(첫 세션 기록) 무시된다. */
  defaultLoad?: { ref?: string; pct?: number; kg?: number };
  sets: SetSpec[];
};

export type DaySpec = { ordinal: number; weekdayHint?: string; name: string; slots: SlotSpec[] };

export type ProgramDefinition = {
  id: string;
  name: string;
  description?: string;
  version: number;
  schemaVersion: 1;
  /** 프로그램 활성화 시 누락된 TM을 다른 TM에서 자동 시드(UI13). 이미 있는 TM은 덮지 않는다. */
  tmSeeds?: { exerciseId: string; ref: string; pct: number }[];
  weeks: { days: DaySpec[] }[];
};

/** fold가 표면화하는, 사용자 결정 대기 제안 */
export type Proposal = {
  type: "tmDeload" | "tmBonus" | "t2Deload" | "accessoryRollback";
  target: DecisionTarget;
  label: string; // 한국어 설명
  sourceSetRecordId: string;
  /** 제안 옵션 (절대값 후보들) */
  options: number[];
};

export type AccessoryState = {
  weight: number;
  targetReps: number;
  missStreak: number;
  /** 증량 직후 1세션 유예 (스펙 §2-2 롤백 카운트 제외) */
  grace: boolean;
};

export type FoldInput = {
  sets: SetRecord[];
  corrections: CorrectionRecord[];
  decisions: DecisionEvent[];
  sessions: SessionCompleted[];
  /** key = `${programId}@${programVersion}` */
  programs: Map<string, ProgramDefinition>;
};

export type FoldState = {
  /** exerciseId -> 현재 TM (T1·T2 공통) */
  tm: Record<string, number>;
  /** slotId -> 악세사리 상태 */
  accessories: Record<string, AccessoryState>;
  /** 미결 제안 (같은 target의 새 판정이 옛 제안을 대체, 결정이 소비) */
  pendingProposals: Proposal[];
  /** 재검토 필요 플래그가 붙은 DecisionEvent id들 (UI 전용 — fold 값엔 영향 없음) */
  reviewFlags: string[];
};

/** 프로그램 인스턴스 상태 (스펙 §3.3) — calendar면 anchor.startDate(YYYY-MM-DD) 필수 */
export type ProgramInstanceState = {
  programId: string;
  programVersion: number;
  mode: "calendar" | "rolling";
  anchor: { startDate?: string };
  schemaVersion: 1;
};
