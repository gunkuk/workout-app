import { describe, it, expect } from "vitest";
import { foldState } from "../../src/domain/fold";
import { programKey } from "../../src/domain/foldSupport";
import type { SetRecord, DecisionEvent, SessionCompleted, FoldInput } from "../../src/domain/types.ts";
import { loadSeedProgram } from "../helpers/seed";

const seed = loadSeedProgram();
const programs = new Map([[programKey(seed.id, seed.version), seed]]);

function at(day: number, hh = 10): string {
  return `2026-07-${String(day).padStart(2, "0")}T${String(hh).padStart(2, "0")}:00:00Z`;
}
const seeds: DecisionEvent[] = [
  { id: "d1", target: { kind: "tm", exerciseId: "bench" }, kind: "seed", value: 105, at: at(1), schemaVersion: 1 },
  { id: "d2", target: { kind: "tm", exerciseId: "ohp" }, kind: "seed", value: 67.5, at: at(1), schemaVersion: 1 },
];
function session(id: string, day: number, dayOrdinal: number): SessionCompleted {
  return { id: `sc-${id}`, sessionId: id, at: at(day, 14), cyclePos: { cycleIndex: 0, week: 0, dayOrdinal }, status: "completed", programId: seed.id, programVersion: seed.version, schemaVersion: 1 };
}

describe("nSuns 시드 × fold 통합", () => {
  it("화요일 벤치 volume(topSet 없음·rule 없음) + OHP T2(rule 없음) → 아무 TM도 안 움직임", () => {
    // 화요일 세션: 벤치 volume 마지막 backoff AMRAP 12렙 + OHP T2 마지막 세트 완수
    const sets: SetRecord[] = [
      { id: "s1", sessionId: "tue", slotId: "w1d1-bench-t1", exerciseId: "bench", targetWeight: 68, targetReps: 8, actualWeight: 68, actualReps: 12, amrapRole: "backoff", completedAt: at(2, 11), schemaVersion: 1 },
      { id: "s2", sessionId: "tue", slotId: "w1d1-ohp-t2", exerciseId: "ohp", targetWeight: 47.5, targetReps: 8, actualWeight: 47.5, actualReps: 8, completedAt: at(2, 12), schemaVersion: 1 },
    ];
    const st = foldState({ sets, corrections: [], decisions: seeds, sessions: [session("tue", 2, 1)], programs });
    expect(st.tm["bench"]).toBe(105);
    expect(st.tm["ohp"]).toBe(67.5);
    expect(st.pendingProposals).toHaveLength(0);
  });

  it("토요일 벤치 heavy 탑세트 3렙 → 벤치 +2.5 정확히 1회 (스펙 §3.6 오라클)", () => {
    const sets: SetRecord[] = [
      { id: "s1", sessionId: "sat", slotId: "w1d5-bench-t1", exerciseId: "bench", targetWeight: 100, targetReps: 1, actualWeight: 100, actualReps: 3, amrapRole: "topSet", completedAt: at(6, 11), schemaVersion: 1 },
    ];
    const st = foldState({ sets, corrections: [], decisions: seeds, sessions: [session("sat", 6, 5)], programs });
    expect(st.tm["bench"]).toBe(107.5);
  });

  it("화 OHP T2 완수 + 목 OHP 탑세트 3렙이 한 주에 있어도 OHP는 +2.5 정확히 1회", () => {
    const sets: SetRecord[] = [
      { id: "s1", sessionId: "tue", slotId: "w1d1-ohp-t2", exerciseId: "ohp", targetWeight: 47.5, targetReps: 8, actualWeight: 47.5, actualReps: 10, completedAt: at(2, 12), schemaVersion: 1 },
      { id: "s2", sessionId: "thu", slotId: "w1d3-ohp-t1", exerciseId: "ohp", targetWeight: 64, targetReps: 1, actualWeight: 64, actualReps: 3, amrapRole: "topSet", completedAt: at(4, 11), schemaVersion: 1 },
    ];
    const st = foldState({
      sets, corrections: [], decisions: seeds,
      sessions: [session("tue", 2, 1), session("thu", 4, 3)],
      programs,
    });
    expect(st.tm["ohp"]).toBe(70); // 67.5 + 2.5 (T1만) — 화요일 T2 슬롯엔 rule이 없으므로
  });
});
