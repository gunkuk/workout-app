import { describe, it, expect } from "vitest";
import { foldState } from "../../src/domain/fold";
import { programKey } from "../../src/domain/foldSupport";
import type { ProgramDefinition, SetRecord, SessionCompleted, FoldInput, DecisionEvent } from "../../src/domain/types.ts";

const prog: ProgramDefinition = {
  id: "p", name: "P", version: 1, schemaVersion: 1,
  weeks: [{
    days: [{
      ordinal: 1, name: "acc day",
      slots: [{
        id: "sl-lat", exerciseId: "latPulldown", label: "accessory",
        progressionRuleId: "doubleProgression",
        progressionParams: { repMin: 8, repMax: 12, weightStep: 5, sets: 3 },
        sets: [
          { load: { kind: "tracked" }, reps: 8 },
          { load: { kind: "tracked" }, reps: 8 },
          { load: { kind: "tracked" }, reps: 8 },
        ],
      }],
    }],
  }],
};
const programs = new Map([[programKey("p", 1), prog]]);

function at(day: number, hh = 10): string {
  return `2026-07-${String(day).padStart(2, "0")}T${String(hh).padStart(2, "0")}:00:00Z`;
}
function session(id: string, day: number, cycleIndex: number): SessionCompleted {
  return { id: `sc-${id}`, sessionId: id, at: at(day, 12), cyclePos: { cycleIndex, week: 0, dayOrdinal: 1 }, status: "completed", programId: "p", programVersion: 1, schemaVersion: 1 };
}
function accSet(id: string, sessionId: string, weight: number, reps: number, day: number, minute: number): SetRecord {
  return {
    id, sessionId, slotId: "sl-lat", exerciseId: "latPulldown",
    targetWeight: weight, targetReps: 8, actualWeight: weight, actualReps: reps,
    completedAt: `2026-07-${String(day).padStart(2, "0")}T11:${String(minute).padStart(2, "0")}:00Z`, schemaVersion: 1,
  };
}
function input(over: Partial<FoldInput>): FoldInput {
  return { sets: [], corrections: [], decisions: [], sessions: [], programs, ...over };
}

describe("foldState — 악세사리 경로", () => {
  it("첫 세션: 상태가 마지막 세트 무게로 부트스트랩", () => {
    const st = foldState(input({
      sessions: [session("a1", 2, 0)],
      sets: [accSet("s1", "a1", 40, 9, 2, 1), accSet("s2", "a1", 40, 9, 2, 5)],
    }));
    expect(st.accessories["sl-lat"]).toMatchObject({ weight: 40, targetReps: 10 });
  });

  it("마지막 세트 12렙 → +5·rep 리셋·유예", () => {
    const st = foldState(input({
      sessions: [session("a1", 2, 0)],
      sets: [accSet("s1", "a1", 40, 12, 2, 1)],
    }));
    expect(st.accessories["sl-lat"]).toEqual({ weight: 45, targetReps: 8, missStreak: 0, grace: true });
  });

  it("증량 직후 유예 → 다음 세션 미달은 카운트 제외, 그 다음 2연속 미달에 롤백 제안", () => {
    const st = foldState(input({
      sessions: [session("a1", 2, 0), session("a2", 9, 1), session("a3", 16, 2), session("a4", 23, 3)],
      sets: [
        accSet("s1", "a1", 40, 12, 2, 1),  // → 45, grace
        accSet("s2", "a2", 45, 6, 9, 1),   // grace 소진, 카운트 X
        accSet("s3", "a3", 45, 6, 16, 1),  // miss 1
        accSet("s4", "a4", 45, 7, 23, 1),  // miss 2 → rollback 제안
      ],
    }));
    expect(st.accessories["sl-lat"]!.missStreak).toBe(2);
    const rb = st.pendingProposals.find((p) => p.type === "accessoryRollback");
    expect(rb).toBeDefined();
    expect(rb!.options).toEqual([40]);
  });

  it("rollbackAccepted 결정이 무게를 덮고 제안을 소비", () => {
    const accept: DecisionEvent = {
      id: "dr", target: { kind: "accessory", slotId: "sl-lat" }, kind: "rollbackAccepted",
      value: 40, targetReps: 8, at: at(24), sourceSetRecordId: "s4", schemaVersion: 1,
    };
    const st = foldState(input({
      decisions: [accept],
      sessions: [session("a1", 2, 0), session("a2", 9, 1), session("a3", 16, 2), session("a4", 23, 3)],
      sets: [
        accSet("s1", "a1", 40, 12, 2, 1),
        accSet("s2", "a2", 45, 6, 9, 1),
        accSet("s3", "a3", 45, 6, 16, 1),
        accSet("s4", "a4", 45, 7, 23, 1),
      ],
    }));
    expect(st.accessories["sl-lat"]).toMatchObject({ weight: 40, targetReps: 8, missStreak: 0 });
    expect(st.pendingProposals).toHaveLength(0);
  });
});
