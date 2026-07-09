import { describe, it, expect } from "vitest";
import { foldState } from "../../src/domain/fold";
import { programKey } from "../../src/domain/foldSupport";
import type {
  ProgramDefinition, SetRecord, DecisionEvent, SessionCompleted, CorrectionRecord, FoldInput,
} from "../../src/domain/types.ts";

/** 테스트 프로그램: 1주 사이클, day1 벤치 T1(rule, topSet), day2 인클라인 T2(rule) */
const prog: ProgramDefinition = {
  id: "p", name: "P", version: 1, schemaVersion: 1,
  weeks: [{
    days: [
      {
        ordinal: 1, name: "bench heavy",
        slots: [{
          id: "sl-bench", exerciseId: "bench", label: "T1",
          progressionRuleId: "nsunsTopSet", progressionParams: { increment: 2.5 },
          sets: [{ load: { kind: "pctOfTM", pct: 0.95 }, reps: 1, amrapRole: "topSet" }],
        }],
      },
      {
        ordinal: 2, name: "incline",
        slots: [{
          id: "sl-inc", exerciseId: "inclineBench", label: "T2",
          progressionRuleId: "t2LastSet", progressionParams: { increment: 2.5 },
          sets: [{ load: { kind: "pctOfTM", pct: 0.6 }, reps: 8 }],
        }],
      },
    ],
  }],
};
const programs = new Map([[programKey("p", 1), prog]]);

let n = 0;
function at(day: number, hh = 10): string {
  return `2026-07-${String(day).padStart(2, "0")}T${String(hh).padStart(2, "0")}:00:00Z`;
}
function seed(exerciseId: string, value: number, day: number): DecisionEvent {
  return { id: `d${++n}`, target: { kind: "tm", exerciseId }, kind: "seed", value, at: at(day), schemaVersion: 1 };
}
function session(id: string, day: number, cycleIndex: number, dayOrdinal: number, status: "completed" | "skipped" = "completed"): SessionCompleted {
  return { id: `sc-${id}`, sessionId: id, at: at(day, 12), cyclePos: { cycleIndex, week: 0, dayOrdinal }, status, programId: "p", programVersion: 1, schemaVersion: 1 };
}
function topSet(id: string, sessionId: string, reps: number, day: number): SetRecord {
  return {
    id, sessionId, slotId: "sl-bench", exerciseId: "bench",
    targetWeight: 100, targetReps: 1, actualWeight: 100, actualReps: reps, amrapRole: "topSet",
    completedAt: at(day, 11), schemaVersion: 1,
  };
}
function t2Set(id: string, sessionId: string, reps: number, day: number): SetRecord {
  return {
    id, sessionId, slotId: "sl-inc", exerciseId: "inclineBench",
    targetWeight: 60, targetReps: 8, actualWeight: 60, actualReps: reps,
    completedAt: at(day, 11), schemaVersion: 1,
  };
}
function input(over: Partial<FoldInput>): FoldInput {
  return { sets: [], corrections: [], decisions: [], sessions: [], programs, ...over };
}

describe("foldState — TM 경로", () => {
  it("seed 결정이 TM을 만든다", () => {
    const st = foldState(input({ decisions: [seed("bench", 100, 1)] }));
    expect(st.tm["bench"]).toBe(100);
  });

  it("탑세트 2~3렙 자동 증량 (세션 완료 시점)", () => {
    const st = foldState(input({
      decisions: [seed("bench", 100, 1)],
      sessions: [session("w1", 2, 0, 1)],
      sets: [topSet("s1", "w1", 3, 2)],
    }));
    expect(st.tm["bench"]).toBe(102.5);
  });

  it("같은 사이클-주 두 번째 판정은 no-op (첫 판정 승)", () => {
    const st = foldState(input({
      decisions: [seed("bench", 100, 1)],
      sessions: [session("w1a", 2, 0, 1), session("w1b", 4, 0, 1)],
      sets: [topSet("s1", "w1a", 3, 2), topSet("s2", "w1b", 3, 4)],
    }));
    expect(st.tm["bench"]).toBe(102.5); // 한 번만
  });

  it("cycleIndex가 다르면 각각 발효", () => {
    const st = foldState(input({
      decisions: [seed("bench", 100, 1)],
      sessions: [session("c0", 2, 0, 1), session("c1", 9, 1, 1)],
      sets: [topSet("s1", "c0", 3, 2), topSet("s2", "c1", 2, 9)],
    }));
    expect(st.tm["bench"]).toBe(105);
  });

  it("skipped 세션은 발효 없음", () => {
    const st = foldState(input({
      decisions: [seed("bench", 100, 1)],
      sessions: [session("w1", 2, 0, 1, "skipped")],
      sets: [topSet("s1", "w1", 3, 2)],
    }));
    expect(st.tm["bench"]).toBe(100);
  });

  it("manual 결정은 절대값으로 덮고, 이후 자동 증량은 그 위에", () => {
    const manual: DecisionEvent = { id: "dm", target: { kind: "tm", exerciseId: "bench" }, kind: "manual", value: 90, at: at(3), schemaVersion: 1 };
    const st = foldState(input({
      decisions: [seed("bench", 100, 1), manual],
      sessions: [session("c1", 9, 1, 1)],
      sets: [topSet("s2", "c1", 3, 9)],
    }));
    expect(st.tm["bench"]).toBe(92.5); // 90 + 2.5
  });

  it("0~1렙 → 증량 없음 + tmDeload 제안 (cap은 소진)", () => {
    const st = foldState(input({
      decisions: [seed("bench", 100, 1)],
      sessions: [session("w1", 2, 0, 1)],
      sets: [topSet("s1", "w1", 1, 2)],
    }));
    expect(st.tm["bench"]).toBe(100);
    expect(st.pendingProposals).toHaveLength(1);
    expect(st.pendingProposals[0]).toMatchObject({ type: "tmDeload", sourceSetRecordId: "s1", options: [100, 95] });
  });

  it("4+렙 → tmBonus 제안, 이후 bonusAccepted 결정이 소비", () => {
    const st1 = foldState(input({
      decisions: [seed("bench", 100, 1)],
      sessions: [session("w1", 2, 0, 1)],
      sets: [topSet("s1", "w1", 5, 2)],
    }));
    expect(st1.tm["bench"]).toBe(100);
    expect(st1.pendingProposals[0]).toMatchObject({ type: "tmBonus", options: [105] });

    const accept: DecisionEvent = {
      id: "da", target: { kind: "tm", exerciseId: "bench" }, kind: "bonusAccepted",
      value: 105, at: at(3), sourceSetRecordId: "s1", schemaVersion: 1,
    };
    const st2 = foldState(input({
      decisions: [seed("bench", 100, 1), accept],
      sessions: [session("w1", 2, 0, 1)],
      sets: [topSet("s1", "w1", 5, 2)],
    }));
    expect(st2.tm["bench"]).toBe(105);
    expect(st2.pendingProposals).toHaveLength(0);
  });

  it("T2: 마지막 세트 완수 → +2.5 / 2연속 미완수 → t2Deload 제안", () => {
    const ok = foldState(input({
      decisions: [seed("inclineBench", 60, 1)],
      sessions: [session("t1", 2, 0, 2)],
      sets: [t2Set("s1", "t1", 8, 2)],
    }));
    expect(ok.tm["inclineBench"]).toBe(62.5);

    const fail2 = foldState(input({
      decisions: [seed("inclineBench", 60, 1)],
      sessions: [session("t1", 2, 0, 2), session("t2", 9, 1, 2)],
      sets: [t2Set("s1", "t1", 6, 2), t2Set("s2", "t2", 6, 9)],
    }));
    expect(fail2.tm["inclineBench"]).toBe(60);
    expect(fail2.pendingProposals.some((p) => p.type === "t2Deload")).toBe(true);
  });

  it("정정 재fold: 탑세트 3→1 정정 시 자동 증량이 사라지고, 그 세트 기반 결정엔 플래그", () => {
    const correction: CorrectionRecord = { id: "c1", supersedes: "s1", patch: { actualReps: 1 }, at: at(5), schemaVersion: 1 };
    const accept: DecisionEvent = {
      id: "da", target: { kind: "tm", exerciseId: "bench" }, kind: "bonusAccepted",
      value: 105, at: at(3), sourceSetRecordId: "s1", schemaVersion: 1,
    };
    const st = foldState(input({
      decisions: [seed("bench", 100, 1), accept],
      sessions: [session("w1", 2, 0, 1)],
      sets: [topSet("s1", "w1", 3, 2)],
      corrections: [correction],
    }));
    // 자동 +2.5는 사라짐(1렙), 결정 105는 절대값이라 그대로 적용, 단 플래그
    expect(st.tm["bench"]).toBe(105);
    expect(st.reviewFlags).toContain("da");
  });

  it("대체 세트(substitutedFrom)는 판정 제외", () => {
    const sub: SetRecord = { ...topSet("s1", "w1", 3, 2), substitutedFrom: "deadlift" };
    const st = foldState(input({
      decisions: [seed("bench", 100, 1)],
      sessions: [session("w1", 2, 0, 1)],
      sets: [sub],
    }));
    expect(st.tm["bench"]).toBe(100);
  });
});
