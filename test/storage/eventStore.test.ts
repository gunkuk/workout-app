import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../../src/storage/db";
import {
  appendSet,
  appendCorrection,
  appendDecision,
  appendSession,
  upsertProgramVersion,
  getProgram,
  listLibrary,
  getInstanceState,
  setInstanceState,
  loadFoldInput,
} from "../../src/storage/eventStore";
import { programKey } from "../../src/domain/foldSupport";
import type {
  SetRecord,
  CorrectionRecord,
  DecisionEvent,
  SessionCompleted,
  ProgramDefinition,
  ProgramInstanceState,
} from "../../src/domain/types.ts";

function program(id: string, version: number, over: Partial<ProgramDefinition> = {}): ProgramDefinition {
  return {
    id,
    name: `프로그램 ${id}`,
    version,
    schemaVersion: 1,
    weeks: [{ days: [{ ordinal: 1, name: "월", slots: [] }] }],
    ...over,
  };
}

function setRec(id: string, over: Partial<SetRecord> = {}): SetRecord {
  return {
    id,
    sessionId: "s1",
    exerciseId: "bench",
    targetWeight: 100,
    targetReps: 5,
    actualWeight: 100,
    actualReps: 5,
    completedAt: "2026-07-10T09:00:00Z",
    schemaVersion: 1,
    ...over,
  };
}

beforeEach(async () => {
  await Promise.all([
    db.setRecords.clear(),
    db.corrections.clear(),
    db.decisions.clear(),
    db.sessions.clear(),
    db.programVersions.clear(),
    db.instanceState.clear(),
    db.library.clear(),
  ]);
});

describe("eventStore", () => {
  it("appends 4종 이벤트 → loadFoldInput에 반영", async () => {
    const set = setRec("set1");
    const correction: CorrectionRecord = {
      id: "c1",
      supersedes: "set1",
      patch: { actualReps: 4 },
      at: "2026-07-10T09:05:00Z",
      schemaVersion: 1,
    };
    const decision: DecisionEvent = {
      id: "d1",
      target: { kind: "tm", exerciseId: "bench" },
      kind: "seed",
      value: 100,
      at: "2026-07-10T08:00:00Z",
      schemaVersion: 1,
    };
    const session: SessionCompleted = {
      id: "sc1",
      sessionId: "s1",
      at: "2026-07-10T09:30:00Z",
      cyclePos: { cycleIndex: 0, week: 0, dayOrdinal: 1 },
      status: "completed",
      programId: "p1",
      programVersion: 1,
      schemaVersion: 1,
    };

    await appendSet(set);
    await appendCorrection(correction);
    await appendDecision(decision);
    await appendSession(session);

    const input = await loadFoldInput();
    expect(input.sets).toEqual([set]);
    expect(input.corrections).toEqual([correction]);
    expect(input.decisions).toEqual([decision]);
    expect(input.sessions).toEqual([session]);
  });

  it("programVersions 왕복 — 같은 id 다른 version 2개가 개별 조회 가능", async () => {
    const v1 = program("p1", 1);
    const v2 = program("p1", 2);
    await upsertProgramVersion(v1);
    await upsertProgramVersion(v2);

    expect(await getProgram("p1", 1)).toEqual(v1);
    expect(await getProgram("p1", 2)).toEqual(v2);
  });

  it("listLibrary — 프로그램별 최신 version만 반환", async () => {
    const v1 = program("p1", 1);
    const v2 = program("p1", 2);
    const other = program("p2", 1);
    await upsertProgramVersion(v1);
    await upsertProgramVersion(v2);
    await upsertProgramVersion(other);
    await db.library.put({ programId: "p1", addedAt: "2026-07-10T00:00:00Z" });
    await db.library.put({ programId: "p2", addedAt: "2026-07-10T00:00:00Z" });

    const library = await listLibrary();
    expect(library).toHaveLength(2);
    const p1Entry = library.find((p) => p.id === "p1");
    expect(p1Entry?.version).toBe(2);
    const p2Entry = library.find((p) => p.id === "p2");
    expect(p2Entry?.version).toBe(1);
  });

  it("instanceState 왕복 — 단일 레코드, 덮어쓰기", async () => {
    const s1: ProgramInstanceState = {
      programId: "p1",
      programVersion: 1,
      mode: "rolling",
      anchor: {},
      schemaVersion: 1,
    };
    await setInstanceState(s1);
    expect(await getInstanceState()).toEqual(s1);

    const s2: ProgramInstanceState = {
      programId: "p1",
      programVersion: 2,
      mode: "rolling",
      anchor: {},
      schemaVersion: 1,
    };
    await setInstanceState(s2);
    expect(await getInstanceState()).toEqual(s2);

    const all = await db.instanceState.toArray();
    expect(all).toHaveLength(1);
  });

  it("loadFoldInput의 programs 필드는 Map<string,ProgramDefinition>, 키는 programKey(id,version)", async () => {
    const v1 = program("p1", 1);
    const v2 = program("p1", 2);
    await upsertProgramVersion(v1);
    await upsertProgramVersion(v2);

    const input = await loadFoldInput();
    expect(input.programs).toBeInstanceOf(Map);
    expect(input.programs.get(programKey("p1", 1))).toEqual(v1);
    expect(input.programs.get(programKey("p1", 2))).toEqual(v2);
  });

  it("빈 DB → loadFoldInput은 빈 배열들 + 빈 Map", async () => {
    const input = await loadFoldInput();
    expect(input.sets).toEqual([]);
    expect(input.corrections).toEqual([]);
    expect(input.decisions).toEqual([]);
    expect(input.sessions).toEqual([]);
    expect(input.programs.size).toBe(0);
  });

  it("같은 SetRecord id로 두 번 append → 마지막 값으로 upsert", async () => {
    await appendSet(setRec("set1", { actualReps: 5 }));
    await appendSet(setRec("set1", { actualReps: 8 }));

    const input = await loadFoldInput();
    expect(input.sets).toHaveLength(1);
    expect(input.sets[0]?.actualReps).toBe(8);
  });

  it("대량(500개) append 후 loadFoldInput 성능 허용범위(<500ms)", async () => {
    const records = Array.from({ length: 500 }, (_, i) =>
      setRec(`set${i}`, { completedAt: `2026-07-10T09:${String(i % 60).padStart(2, "0")}:00Z` }),
    );
    await Promise.all(records.map((r) => appendSet(r)));

    const start = performance.now();
    const input = await loadFoldInput();
    const elapsed = performance.now() - start;

    expect(input.sets).toHaveLength(500);
    expect(elapsed).toBeLessThan(500);
  });
});
