import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../../src/storage/db";
import { appendSet, appendSession, upsertProgramVersion, loadFoldInput } from "../../src/storage/eventStore";
import { useProgramStore } from "../../src/store/programStore";
import { foldState } from "../../src/domain/fold";
import { nextCyclePos } from "../../src/domain/cyclePos";
import { buildWorkoutPlan, type PlannedSet } from "../../src/domain/programEngine";
import { DEFAULT_PLATES } from "../../src/domain/plates";
import type { DecisionEvent, SessionCompleted, SetRecord } from "../../src/domain/types.ts";
import { resetDb } from "../helpers/db";
import { loadSeedProgram, seedOnboarded as seedOnboardedHelper } from "../helpers/seed";

// Task 3 — programStore(zustand): eventStore를 소비해 활성 프로그램·TM·오늘의 커서를 파생한다.
// 실제 nSuns 시드(programs/nsuns-5day.json) + eventStore의 append* 함수로 온보딩 완료 상태를
// fake-indexeddb 위에 그대로 재현해 검증한다 (rolling 모드만 — calendar UI는 Plan C2).

const seed = loadSeedProgram();

const TM = { bench: 105, ohp: 67.5, squat: 85, deadlift: 140 };

function at(day: number, hh = 10, mm = 0): string {
  return `2026-07-${String(day).padStart(2, "0")}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`;
}

const seedDecisions: DecisionEvent[] = (["bench", "ohp", "squat", "deadlift"] as const).map((exerciseId) => ({
  id: `seed-${exerciseId}`,
  target: { kind: "tm", exerciseId },
  kind: "seed",
  value: TM[exerciseId],
  at: at(1, 8),
  schemaVersion: 1,
}));

/** 온보딩 완료 상태 재현: programVersions + library + instanceState(rolling) + TM 시드 4개 결정 */
async function seedOnboarded(): Promise<void> {
  await seedOnboardedHelper(seed, seedDecisions, at(1, 8));
}

function sessionCompleted(id: string, day: number, pos: { cycleIndex: number; week: number; dayOrdinal: number }): SessionCompleted {
  return {
    id: `sc-${id}`,
    sessionId: id,
    at: at(day, 14),
    cyclePos: pos,
    status: "completed",
    programId: seed.id,
    programVersion: seed.version,
    schemaVersion: 1,
  };
}

/** PlannedSet[] → SetRecord[] (engine-integration.test.ts와 동일 패턴) */
function toSetRecords(
  sessionId: string,
  slotId: string,
  exerciseId: string,
  day: number,
  hourBase: number,
  plannedSets: PlannedSet[],
  actualRepsOverride: Record<number, number> = {},
): SetRecord[] {
  return plannedSets.map((s, i) => {
    if (s.weight === null) throw new Error(`계획 무게 null — fixture 오류 (idx ${i})`);
    return {
      id: `${sessionId}-${slotId}-${s.setType}-${i}`,
      sessionId,
      slotId,
      exerciseId,
      setType: s.setType,
      targetWeight: s.weight,
      targetReps: s.reps,
      actualWeight: s.weight,
      actualReps: actualRepsOverride[i] ?? s.reps,
      amrapRole: s.amrapRole,
      completedAt: at(day, hourBase, i),
      schemaVersion: 1,
    };
  });
}

beforeEach(async () => {
  await resetDb();
  useProgramStore.setState(useProgramStore.getInitialState(), true);
});

describe("programStore", () => {
  it("① 빈 DB → status empty", async () => {
    await useProgramStore.getState().load();
    const state = useProgramStore.getState();
    expect(state.status).toBe("empty");
    expect(state.todayPlan).toBeNull();
  });

  it("② 온보딩 완료(라이브러리+인스턴스+TM 시드 4개) → load() 후 status ready, todayPlan 존재", async () => {
    await seedOnboarded();
    await useProgramStore.getState().load();
    const state = useProgramStore.getState();
    expect(state.status).toBe("ready");
    expect(state.activeProgram?.id).toBe(seed.id);
    expect(state.tm).toEqual(TM);
    expect(state.todayPlan).not.toBeNull();
    expect(state.todayPos).toEqual({ cycleIndex: 0, week: 0, dayOrdinal: seed.weeks[0]!.days[0]!.ordinal });
  });

  it("③ 세션 완료 기록 후 refreshAfterWrite → todayPos가 nextCyclePos만큼 전진", async () => {
    await seedOnboarded();
    await useProgramStore.getState().load();
    const before = useProgramStore.getState().todayPos!;
    const expectedNext = nextCyclePos(seed, before);

    await appendSession(sessionCompleted("s1", 1, before));
    await useProgramStore.getState().refreshAfterWrite();

    expect(useProgramStore.getState().todayPos).toEqual(expectedNext);
  });

  it("④ TM 자동증량 세션(탑세트 3렙) 후 tm 갱신 반영", async () => {
    await seedOnboarded();
    await useProgramStore.getState().load();

    const day4Pos = { cycleIndex: 0, week: 0, dayOrdinal: 4 };
    const plan = buildWorkoutPlan(seed, day4Pos, TM, {}, DEFAULT_PLATES)!;
    const deadSlot = plan.slots.find((s) => s.slotId === "w1d4-dead-t1")!;
    const topSetIdx = deadSlot.sets.findIndex((s) => s.amrapRole === "topSet");

    const workRecords = toSetRecords("fri", deadSlot.slotId, "deadlift", 4, 10, deadSlot.sets, { [topSetIdx]: 3 });
    const warmupRecords = toSetRecords("fri", deadSlot.slotId, "deadlift", 4, 9, deadSlot.warmups);
    for (const r of [...warmupRecords, ...workRecords]) await appendSet(r);
    await appendSession(sessionCompleted("fri", 4, day4Pos));

    await useProgramStore.getState().refreshAfterWrite();

    expect(useProgramStore.getState().tm["deadlift"]).toBe(145);
  });

  it("⑤ pendingProposals가 domain fold 결과 그대로 노출된다", async () => {
    await seedOnboarded();
    await useProgramStore.getState().load();

    // 탑세트 1렙 이하 → judgeTopSet: holdOrDeload 제안 (TM 불변)
    const day4Pos = { cycleIndex: 0, week: 0, dayOrdinal: 4 };
    const plan = buildWorkoutPlan(seed, day4Pos, TM, {}, DEFAULT_PLATES)!;
    const deadSlot = plan.slots.find((s) => s.slotId === "w1d4-dead-t1")!;
    const topSetIdx = deadSlot.sets.findIndex((s) => s.amrapRole === "topSet");

    const workRecords = toSetRecords("fri", deadSlot.slotId, "deadlift", 4, 10, deadSlot.sets, { [topSetIdx]: 1 });
    for (const r of workRecords) await appendSet(r);
    await appendSession(sessionCompleted("fri", 4, day4Pos));

    await useProgramStore.getState().refreshAfterWrite();

    const storeProposals = useProgramStore.getState().pendingProposals;
    expect(storeProposals).toHaveLength(1);
    expect(storeProposals[0]?.type).toBe("tmDeload");
    expect(useProgramStore.getState().tm["deadlift"]).toBe(140); // 미변경

    // 오라클: 동일 FoldInput을 직접 foldState에 넣은 결과와 store 값이 정확히 일치해야 함.
    const input = await loadFoldInput();
    const oracle = foldState(input);
    expect(storeProposals).toEqual(oracle.pendingProposals);
  });

  it("⑥ instanceState 없이 라이브러리만 있으면 status empty(온보딩 미완)", async () => {
    await upsertProgramVersion(seed);
    await db.library.put({ programId: seed.id, addedAt: at(1, 8) });
    // instanceState 미설정

    await useProgramStore.getState().load();

    expect(useProgramStore.getState().status).toBe("empty");
  });
});
