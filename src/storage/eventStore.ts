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

/** 라이브러리에 프로그램 등록 — Task 5(온보딩) 최초 시드용, 스토어 캡슐화 유지(스크린이 db 직접 참조 안 함) */
export async function addToLibrary(programId: string, addedAt: string): Promise<void> {
  await db.library.put({ programId, addedAt });
}

/**
 * Task 7(C2, 백업) — library 테이블 원본 그대로(programId/addedAt, listLibrary()처럼 programVersions와
 * 조인해 병합하지 않음). listLibrary()는 이 둘을 합쳐 최신 버전만 남기며 addedAt을 버려 무손실 왕복이
 * 안 되므로, 백업 내보내기는 이 원본 함수를 쓴다.
 */
export async function getLibraryEntries(): Promise<{ programId: string; addedAt: string }[]> {
  return db.library.toArray();
}

/** Task 7(C2, 백업) — programVersions 테이블 전 버전(fork 포함) 그대로, 조인 없음. */
export async function getAllProgramVersions(): Promise<ProgramDefinition[]> {
  return db.programVersions.toArray();
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

/**
 * 온보딩 최초 시드 — programVersions upsert → library 등록 → instanceState 설정 → TM 시드 결정 N개를
 * 하나의 Dexie 트랜잭션으로 묶는다(Stage1-R T3, 감사 robustness-high). 중간 실패 시 4테이블 전부
 * 롤백되어 부분쓰기·중복 seed 오염을 막는다. 트랜잭션 내부는 기존 export 함수를 그대로 호출 —
 * Dexie의 ambient transaction이 자동 전파되므로 각 함수는 무변경.
 */
export async function seedOnboarding(
  program: ProgramDefinition,
  libraryEntry: { programId: string; addedAt: string },
  instanceState: ProgramInstanceState,
  decisions: DecisionEvent[],
): Promise<void> {
  await db.transaction(
    "rw",
    [db.programVersions, db.library, db.instanceState, db.decisions],
    async () => {
      await upsertProgramVersion(program);
      await addToLibrary(libraryEntry.programId, libraryEntry.addedAt);
      await setInstanceState(instanceState);
      for (const decision of decisions) {
        await appendDecision(decision);
      }
    },
  );
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
