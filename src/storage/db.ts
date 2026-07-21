import Dexie, { type Table } from "dexie";
import type {
  SetRecord,
  CorrectionRecord,
  DecisionEvent,
  SessionCompleted,
  ProgramDefinition,
  ProgramInstanceState,
} from "../domain/types.ts";
import type { MuscleGroup } from "../domain/exerciseLibrary";
import type {
  BodyMetric,
  InjuryLog,
  SessionNote,
  ExerciseComment,
  ActivitySegment,
  SetTiming,
  DailyCheckin,
} from "./trackingTypes";

/**
 * 외부(크로스핏 등) 세션 저장 레코드(Stage1-C3 T4, Dexie v2). domain/analytics.ts의
 * ExternalSession({cyclePos, groups, programId})에 저장 메타(id·at)를 더한 형태 —
 * eventStore가 조회 시 id/at을 드롭해 domain 계약으로 매핑한다.
 */
export type FreeExercise = { name: string; weightKg?: number; reps?: number; sets?: number };
export type CardioEntry = { kind: string; minutes?: number; distanceKm?: number };

export type ExternalSessionRecord = {
  id: string;
  at: string;
  groups: MuscleGroup[];
  programId: string;
  cyclePos: { cycleIndex: number; week: number };
  label?: string;
  exercises?: FreeExercise[];
  cardio?: CardioEntry[];
};

export class WorkoutDB extends Dexie {
  setRecords!: Table<SetRecord, string>;
  corrections!: Table<CorrectionRecord, string>;
  decisions!: Table<DecisionEvent, string>;
  sessions!: Table<SessionCompleted, string>;
  programVersions!: Table<ProgramDefinition & { _key: string }, string>;
  instanceState!: Table<ProgramInstanceState & { _id: "active" }, string>;
  library!: Table<{ programId: string; addedAt: string }, string>;
  externalSessions!: Table<ExternalSessionRecord, string>;
  bodyMetrics!: Table<BodyMetric, string>;
  injuries!: Table<InjuryLog, string>;
  sessionNotes!: Table<SessionNote, string>;
  exerciseComments!: Table<ExerciseComment, string>;
  activitySegments!: Table<ActivitySegment, string>;
  setTimings!: Table<SetTiming, string>;
  dailyCheckins!: Table<DailyCheckin, string>;

  constructor(name = "workout-db") {
    super(name);
    this.version(1).stores({
      setRecords: "id, sessionId",
      corrections: "id, supersedes",
      decisions: "id",
      sessions: "id, sessionId",
      programVersions: "_key, id",
      instanceState: "_id",
      library: "programId",
    });
    // Dexie v2(Stage1-C3 T4) — externalSessions 테이블만 추가. version(1) 선언은 그대로 두고
    // stores()엔 신규 테이블만 명시하면 기존 테이블이 자동 승계된다(기존 데이터 무손실).
    this.version(2).stores({
      externalSessions: "id",
    });
    // Dexie v3(UI5 T1) — 추적 엔티티 4종(체성분/부상/세션노트/운동코멘트) 추가. fold 입력 밖(§설계원칙
    // 동결 유지)이라 TM/증량 판정에 영향 없음. v2와 동일 패턴으로 신규 테이블만 명시하면 기존 8개
    // 테이블이 자동 승계된다(기존 데이터 무손실). 필터/정렬은 기존 코드베이스 전반과 동일하게
    // toArray() 후 JS에서 처리하므로(where/equals 미사용 관례) 보조 인덱스 없이 id만 둔다.
    this.version(3).stores({
      bodyMetrics: "id",
      injuries: "id",
      sessionNotes: "id",
      exerciseComments: "id",
    });
    // Dexie v4(UI11) — 활동 구간 타이머 + 세트별 소요시간 테이블 2종 추가. v2/v3와 동일 패턴(신규
    // 테이블만 명시하면 기존 12개 테이블이 자동 승계, 기존 데이터 무손실). fold 입력 밖(동결 무관).
    this.version(4).stores({
      activitySegments: "id",
      setTimings: "id",
    });
    // Dexie v5(UI15 item4) — 요일별 컨디션/수면/직전식사 체크인 테이블 추가. v2~v4와 동일 패턴(신규
    // 테이블만 명시, 기존 14개 테이블 자동 승계·무손실). fold 입력 밖(동결 무관).
    this.version(5).stores({
      dailyCheckins: "id",
    });
  }
}

export const db = new WorkoutDB();
