import { describe, it, expect } from "vitest";
import { judgeLinearTopSet } from "../../src/domain/rules/linearTopSet";
import { foldState } from "../../src/domain/fold";
import { programKey } from "../../src/domain/foldSupport";
import type { ProgramDefinition, SetRecord, DecisionEvent, SessionCompleted, FoldInput } from "../../src/domain/types.ts";

describe("judgeLinearTopSet (선형 T1 진리표)", () => {
  it("minReps 이상 → 자동 +increment", () => {
    expect(judgeLinearTopSet(3, { increment: 2.5, minReps: 3 })).toEqual({ kind: "auto", delta: 2.5 });
    expect(judgeLinearTopSet(5, { increment: 5, minReps: 3 })).toEqual({ kind: "auto", delta: 5 });
  });

  it("minReps 미만 → holdOrDeload 제안", () => {
    expect(judgeLinearTopSet(2, { increment: 2.5, minReps: 3 }).kind).toBe("holdOrDeload");
    expect(judgeLinearTopSet(0, { increment: 2.5, minReps: 3 }).kind).toBe("holdOrDeload");
  });

  it("경계값 — minReps와 정확히 같으면 자동 증량(이상 판정)", () => {
    expect(judgeLinearTopSet(3, { increment: 2.5, minReps: 3 }).kind).toBe("auto");
    expect(judgeLinearTopSet(2, { increment: 2.5, minReps: 3 }).kind).toBe("holdOrDeload");
  });

  it("minReps가 다른 값이어도 동일 이진 판정", () => {
    expect(judgeLinearTopSet(4, { increment: 2.5, minReps: 5 }).kind).toBe("holdOrDeload");
    expect(judgeLinearTopSet(5, { increment: 2.5, minReps: 5 }).kind).toBe("auto");
  });
});

describe("linearTopSet — fold 경유 발효 상한(TM당 사이클-주 ≤1)", () => {
  const prog: ProgramDefinition = {
    id: "p", name: "P", version: 1, schemaVersion: 1,
    weeks: [{
      days: [{
        ordinal: 1, name: "T1 day",
        slots: [{
          id: "sl-t1", exerciseId: "tbarRow", label: "T1",
          progressionRuleId: "linearTopSet", progressionParams: { increment: 2.5, minReps: 3 },
          sets: [{ load: { kind: "pctOfTM", pct: 0.95 }, reps: 1, amrapRole: "topSet" }],
        }],
      }],
    }],
  };
  const programs = new Map([[programKey("p", 1), prog]]);

  function at(day: number, hh = 10): string {
    return `2026-07-${String(day).padStart(2, "0")}T${String(hh).padStart(2, "0")}:00:00Z`;
  }
  function seed(exerciseId: string, value: number, day: number): DecisionEvent {
    return { id: `s-${exerciseId}`, target: { kind: "tm", exerciseId }, kind: "seed", value, at: at(day), schemaVersion: 1 };
  }
  function session(id: string, day: number, cycleIndex: number): SessionCompleted {
    return { id: `sc-${id}`, sessionId: id, at: at(day, 12), cyclePos: { cycleIndex, week: 0, dayOrdinal: 1 }, status: "completed", programId: "p", programVersion: 1, schemaVersion: 1 };
  }
  function topSet(id: string, sessionId: string, reps: number, day: number): SetRecord {
    return {
      id, sessionId, slotId: "sl-t1", exerciseId: "tbarRow",
      targetWeight: 60, targetReps: 1, actualWeight: 60, actualReps: reps, amrapRole: "topSet",
      completedAt: at(day, 11), schemaVersion: 1,
    };
  }
  function input(over: Partial<FoldInput>): FoldInput {
    return { sets: [], corrections: [], decisions: [], sessions: [], programs, ...over };
  }

  it("3렙 이상 → TM 자동 증량, 제안 없음", () => {
    const st = foldState(input({
      decisions: [seed("tbarRow", 60, 1)],
      sessions: [session("w1", 2, 0)],
      sets: [topSet("s1", "w1", 4, 2)],
    }));
    expect(st.tm["tbarRow"]).toBe(62.5);
    expect(st.pendingProposals).toHaveLength(0);
  });

  it("3렙 미만 → TM 불변, tmDeload 제안(동결·-5%)", () => {
    const st = foldState(input({
      decisions: [seed("tbarRow", 60, 1)],
      sessions: [session("w1", 2, 0)],
      sets: [topSet("s1", "w1", 2, 2)],
    }));
    expect(st.tm["tbarRow"]).toBe(60);
    expect(st.pendingProposals).toHaveLength(1);
    expect(st.pendingProposals[0]).toMatchObject({ type: "tmDeload", sourceSetRecordId: "s1", options: [60, 57.5] });
  });

  it("같은 사이클-주 두 번째 판정은 no-op(발효상한 — fold의 capKey 경로 재사용 확인)", () => {
    const st = foldState(input({
      decisions: [seed("tbarRow", 60, 1)],
      sessions: [session("w1a", 2, 0), session("w1b", 4, 0)],
      sets: [topSet("s1", "w1a", 5, 2), topSet("s2", "w1b", 5, 4)],
    }));
    expect(st.tm["tbarRow"]).toBe(62.5); // 한 번만 발효
  });
});
