import Dexie, { type Table } from "dexie";
import type {
  SetRecord,
  CorrectionRecord,
  DecisionEvent,
  SessionCompleted,
  ProgramDefinition,
  ProgramInstanceState,
} from "../domain/types.ts";

export class WorkoutDB extends Dexie {
  setRecords!: Table<SetRecord, string>;
  corrections!: Table<CorrectionRecord, string>;
  decisions!: Table<DecisionEvent, string>;
  sessions!: Table<SessionCompleted, string>;
  programVersions!: Table<ProgramDefinition & { _key: string }, string>;
  instanceState!: Table<ProgramInstanceState & { _id: "active" }, string>;
  library!: Table<{ programId: string; addedAt: string }, string>;

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
  }
}

export const db = new WorkoutDB();
