import { describe, it, expect } from "vitest";
import { epley, e1rmSeries, tmHistory } from "../../src/domain/e1rm";
import { programKey } from "../../src/domain/foldSupport";
import type { EffectiveSet } from "../../src/domain/corrections";
import type {
  ProgramDefinition, SetRecord, DecisionEvent, SessionCompleted, FoldInput,
} from "../../src/domain/types.ts";

function at(day: number, hh = 10): string {
  return `2026-07-${String(day).padStart(2, "0")}T${String(hh).padStart(2, "0")}:00:00Z`;
}

/** EffectiveSet 헬퍼 — corrected/revoked는 e1rmSeries 테스트에서 항상 false */
function eset(over: Partial<SetRecord> & { id: string; exerciseId: string; completedAt: string }): EffectiveSet {
  return {
    sessionId: "s1",
    targetWeight: null,
    targetReps: 1,
    actualWeight: 100,
    actualReps: 1,
    schemaVersion: 1,
    corrected: false,
    revoked: false,
    ...over,
  };
}

describe("epley", () => {
  it("① epley(100,3) = 110", () => {
    expect(epley(100, 3)).toBe(110);
  });
});

describe("e1rmSeries", () => {
  it("② actualReps 11 제외, actualReps 0 제외", () => {
    const sets = [
      eset({ id: "a", exerciseId: "bench", amrapRole: "topSet", actualWeight: 100, actualReps: 11, completedAt: at(1) }),
      eset({ id: "b", exerciseId: "bench", amrapRole: "topSet", actualWeight: 100, actualReps: 0, completedAt: at(2) }),
      eset({ id: "c", exerciseId: "bench", amrapRole: "topSet", actualWeight: 100, actualReps: 3, completedAt: at(3) }),
    ];
    const series = e1rmSeries(sets);
    expect(series).toHaveLength(1);
    expect(series[0]!.points).toEqual([{ at: at(3), value: 110 }]);
  });

  it("③ topSet 아닌 세트는 제외", () => {
    const sets = [
      eset({ id: "a", exerciseId: "bench", actualWeight: 100, actualReps: 3, completedAt: at(1) }), // amrapRole 없음
      eset({ id: "b", exerciseId: "bench", amrapRole: "backoff", actualWeight: 100, actualReps: 3, completedAt: at(2) }),
      eset({ id: "c", exerciseId: "bench", amrapRole: "topSet", actualWeight: 100, actualReps: 3, completedAt: at(3) }),
    ];
    const series = e1rmSeries(sets);
    expect(series).toHaveLength(1);
    expect(series[0]!.points).toHaveLength(1);
    expect(series[0]!.points[0]).toEqual({ at: at(3), value: 110 });
  });

  it("④ substitutedFrom 유무로 시리즈 분리", () => {
    const sets = [
      eset({ id: "a", exerciseId: "bench", amrapRole: "topSet", actualWeight: 100, actualReps: 3, completedAt: at(1) }),
      eset({
        id: "b", exerciseId: "bench", amrapRole: "topSet", actualWeight: 90, actualReps: 3,
        completedAt: at(2), substitutedFrom: "cgbp",
      }),
    ];
    const series = e1rmSeries(sets);
    expect(series).toHaveLength(2);
    const plain = series.find((s) => !s.substituted)!;
    const sub = series.find((s) => s.substituted)!;
    expect(plain.exerciseId).toBe("bench");
    expect(plain.points).toEqual([{ at: at(1), value: 110 }]);
    expect(sub.exerciseId).toBe("bench");
    expect(sub.points).toEqual([{ at: at(2), value: epley(90, 3) }]);
  });
});

describe("tmHistory", () => {
  const prog: ProgramDefinition = {
    id: "p", name: "P", version: 1, schemaVersion: 1,
    weeks: [{
      days: [{
        ordinal: 1, name: "bench heavy",
        slots: [{
          id: "sl-bench", exerciseId: "bench", label: "T1",
          progressionRuleId: "nsunsTopSet", progressionParams: { increment: 2.5 },
          sets: [{ load: { kind: "pctOfTM", pct: 0.95 }, reps: 1, amrapRole: "topSet" }],
        }],
      }],
    }],
  };
  const programs = new Map([[programKey("p", 1), prog]]);

  function seed(exerciseId: string, value: number, day: number): DecisionEvent {
    return { id: "d-seed", target: { kind: "tm", exerciseId }, kind: "seed", value, at: at(day), schemaVersion: 1 };
  }
  function session(id: string, day: number): SessionCompleted {
    return {
      id: `sc-${id}`, sessionId: id, at: at(day, 12), cyclePos: { cycleIndex: 0, week: 0, dayOrdinal: 1 },
      status: "completed", programId: "p", programVersion: 1, schemaVersion: 1,
    };
  }
  function topSet(id: string, sessionId: string, day: number): SetRecord {
    return {
      id, sessionId, slotId: "sl-bench", exerciseId: "bench",
      targetWeight: 100, targetReps: 1, actualWeight: 100, actualReps: 3, amrapRole: "topSet",
      completedAt: at(day, 11), schemaVersion: 1,
    };
  }

  it("⑤ seed 100 → 세션(+2.5 자동) → manual 110 → [100, 102.5, 110] (at 오름차순)", () => {
    const manual: DecisionEvent = {
      id: "d-manual", target: { kind: "tm", exerciseId: "bench" }, kind: "manual",
      value: 110, at: at(5), schemaVersion: 1,
    };
    const input: FoldInput = {
      sets: [topSet("s1", "w1", 2)],
      corrections: [],
      decisions: [seed("bench", 100, 1), manual],
      sessions: [session("w1", 2)],
      programs,
    };
    const points = tmHistory(input, "bench");
    expect(points).toEqual([
      { at: at(1), value: 100 },
      { at: at(2, 12), value: 102.5 },
      { at: at(5), value: 110 },
    ]);
  });
});
