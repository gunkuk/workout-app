import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "../../src/storage/db";
import { appendSet, seedOnboarding } from "../../src/storage/eventStore";
import { useProgramStore } from "../../src/store/programStore";
import type { CorrectionRecord, DecisionEvent, SessionCompleted, SetRecord } from "../../src/domain/types.ts";
import { resetDb } from "../helpers/db";
import { loadSeedProgram } from "../helpers/seed";

// Task 3 — programStore mutation 계층: eventStore 함수를 감싸는 store 메서드들이 (a) DB에
// 동일한 결과를 쓰고 (b) refresh 시맨틱(Global Constraints §Task3: recordSet/recordCorrection은
// no-refresh, completeSession/seedProgram/acceptProposal은 refresh)을 지키는지 검증한다.

const seed = loadSeedProgram();

function at(day: number, hh = 10, mm = 0): string {
  return `2026-07-${String(day).padStart(2, "0")}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`;
}

const seedDecisions: DecisionEvent[] = (["bench", "ohp", "squat", "deadlift"] as const).map((exerciseId) => ({
  id: `seed-${exerciseId}`,
  target: { kind: "tm", exerciseId },
  kind: "seed",
  value: 100,
  at: at(1, 8),
  schemaVersion: 1,
}));

const libraryEntry = { programId: seed.id, addedAt: at(1, 8) };
const instanceState = {
  programId: seed.id,
  programVersion: seed.version,
  mode: "rolling" as const,
  anchor: {},
  schemaVersion: 1 as const,
};

function sampleSet(id: string): SetRecord {
  return {
    id,
    sessionId: "s1",
    slotId: "w1d1-bench-t1",
    exerciseId: "bench",
    setType: "work",
    targetWeight: 100,
    targetReps: 5,
    actualWeight: 100,
    actualReps: 5,
    completedAt: at(1, 10),
    schemaVersion: 1,
  };
}

function sampleCorrection(id: string, supersedes: string): CorrectionRecord {
  return { id, supersedes, patch: { actualReps: 4 }, at: at(1, 11), schemaVersion: 1 };
}

function sampleSession(id: string): SessionCompleted {
  return {
    id: `sc-${id}`,
    sessionId: id,
    at: at(1, 14),
    cyclePos: { cycleIndex: 0, week: 0, dayOrdinal: seed.weeks[0]!.days[0]!.ordinal },
    status: "completed",
    programId: seed.id,
    programVersion: seed.version,
    schemaVersion: 1,
  };
}

async function tableCounts() {
  return {
    programVersions: await db.programVersions.count(),
    library: await db.library.count(),
    instanceState: await db.instanceState.count(),
    decisions: await db.decisions.count(),
  };
}

beforeEach(async () => {
  await resetDb();
  useProgramStore.setState(useProgramStore.getInitialState(), true);
});

describe("eventStore.seedOnboarding — 트랜잭션 원자성", () => {
  it("① 트랜잭션 중간 실패 시 4테이블 전부 빈 상태로 롤백된다", async () => {
    // 두 번째 decision의 id를 undefined로 만들어 Dexie put이 실패하도록 유도 —
    // programVersions/library/instanceState는 이미 써진 뒤 실패하는 시나리오.
    const brokenDecisions = [
      seedDecisions[0]!,
      { ...seedDecisions[1]!, id: undefined as unknown as string },
    ];

    await expect(
      seedOnboarding(seed, libraryEntry, instanceState, brokenDecisions),
    ).rejects.toBeTruthy();

    expect(await tableCounts()).toEqual({ programVersions: 0, library: 0, instanceState: 0, decisions: 0 });
  });
});

describe("programStore mutation 메서드 — eventStore와 동일 DB 결과", () => {
  it("② recordSet(rec) → db.setRecords에 appendSet과 동일하게 기록된다", async () => {
    const rec = sampleSet("direct-1");
    await appendSet(rec);
    const viaEventStore = await db.setRecords.get(rec.id);

    await resetDb();

    const recViaStore = sampleSet("via-store-1");
    await useProgramStore.getState().recordSet(recViaStore);
    const viaStore = await db.setRecords.get(recViaStore.id);

    expect(viaStore).toEqual({ ...viaEventStore, id: recViaStore.id });
  });

  it("③ recordCorrection(rec) → db.corrections에 appendCorrection과 동일하게 기록된다", async () => {
    const rec = sampleCorrection("corr-1", "set-1");
    await useProgramStore.getState().recordCorrection(rec);
    expect(await db.corrections.get(rec.id)).toEqual(rec);
  });

  it("④ seedProgram(...) → eventStore.seedOnboarding과 동일하게 4테이블 채워진다", async () => {
    await useProgramStore.getState().seedProgram(seed, libraryEntry, instanceState, seedDecisions);

    expect(await db.programVersions.count()).toBe(1);
    expect(await db.library.count()).toBe(1);
    expect(await db.instanceState.get("active")).toBeTruthy();
    expect(await db.decisions.count()).toBe(seedDecisions.length);
  });
});

describe("refresh 시맨틱 — recordSet/recordCorrection은 no-refresh, completeSession은 refresh", () => {
  it("⑤ recordSet은 store의 load()를 호출하지 않는다(낙관적 UI 시맨틱 보존)", async () => {
    await useProgramStore.getState().seedProgram(seed, libraryEntry, instanceState, seedDecisions);
    await useProgramStore.getState().load();
    const loadSpy = vi.fn(async () => {});
    useProgramStore.setState({ load: loadSpy });

    await useProgramStore.getState().recordSet(sampleSet("noop-set"));

    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("⑥ completeSession은 store의 load()를 호출해 상태를 재fold한다", async () => {
    await useProgramStore.getState().seedProgram(seed, libraryEntry, instanceState, seedDecisions);
    await useProgramStore.getState().load();
    const loadSpy = vi.fn(async () => {});
    useProgramStore.setState({ load: loadSpy });

    await useProgramStore.getState().completeSession(sampleSession("sess-1"));

    expect(loadSpy).toHaveBeenCalledTimes(1);
  });
});
