import { db } from "./db";
import { programKey } from "../domain/foldSupport";
import type {
  SetRecord,
  CorrectionRecord,
  DecisionEvent,
  SessionCompleted,
  ProgramDefinition,
  ProgramInstanceState,
  FoldInput,
} from "../domain/types.ts";

export async function appendSet(rec: SetRecord): Promise<void> {
  await db.setRecords.put(rec);
}

export async function appendCorrection(rec: CorrectionRecord): Promise<void> {
  await db.corrections.put(rec);
}

export async function appendDecision(rec: DecisionEvent): Promise<void> {
  await db.decisions.put(rec);
}

export async function appendSession(rec: SessionCompleted): Promise<void> {
  await db.sessions.put(rec);
}

export async function upsertProgramVersion(program: ProgramDefinition): Promise<void> {
  await db.programVersions.put({ ...program, _key: programKey(program.id, program.version) });
}

export async function getProgram(id: string, version: number): Promise<ProgramDefinition | undefined> {
  const row = await db.programVersions.get(programKey(id, version));
  if (!row) return undefined;
  const { _key, ...program } = row;
  return program;
}

export async function listLibrary(): Promise<ProgramDefinition[]> {
  const entries = await db.library.toArray();
  const allVersions = await db.programVersions.toArray();
  const result: ProgramDefinition[] = [];
  for (const entry of entries) {
    const versions = allVersions.filter((v) => v.id === entry.programId);
    if (versions.length === 0) continue;
    const latest = versions.reduce((a, b) => (b.version > a.version ? b : a));
    const { _key, ...program } = latest;
    result.push(program);
  }
  return result;
}

export async function getInstanceState(): Promise<ProgramInstanceState | undefined> {
  const row = await db.instanceState.get("active");
  if (!row) return undefined;
  const { _id, ...state } = row;
  return state;
}

export async function setInstanceState(s: ProgramInstanceState): Promise<void> {
  await db.instanceState.put({ ...s, _id: "active" });
}

export async function loadFoldInput(): Promise<FoldInput> {
  const [sets, corrections, decisions, sessions, programVersions] = await Promise.all([
    db.setRecords.toArray(),
    db.corrections.toArray(),
    db.decisions.toArray(),
    db.sessions.toArray(),
    db.programVersions.toArray(),
  ]);
  const programs = new Map<string, ProgramDefinition>();
  for (const row of programVersions) {
    const { _key, ...program } = row;
    programs.set(_key, program);
  }
  return { sets, corrections, decisions, sessions, programs };
}
