import { describe, it, expect } from "vitest";
import type { SetRecord, FoldState } from "../../src/domain/types.ts";

describe("도메인 타입", () => {
  it("SetRecord 리터럴이 타입을 만족한다", () => {
    const s: SetRecord = {
      id: "s1", sessionId: "ss1", exerciseId: "bench",
      targetWeight: 80, targetReps: 5, actualWeight: 80, actualReps: 5,
      completedAt: "2026-07-05T10:00:00Z", schemaVersion: 1,
    };
    expect(s.exerciseId).toBe("bench");
  });
  it("FoldState 초기형", () => {
    const f: FoldState = { tm: {}, accessories: {}, pendingProposals: [], reviewFlags: [] };
    expect(f.pendingProposals).toEqual([]);
  });
});
