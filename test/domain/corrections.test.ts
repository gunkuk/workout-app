import { describe, it, expect } from "vitest";
import { applyCorrections, sessionCyclePosOverride } from "../../src/domain/corrections";
import type { SetRecord, CorrectionRecord } from "../../src/domain/types.ts";

function set(id: string, over: Partial<SetRecord> = {}): SetRecord {
  return {
    id, sessionId: "ss1", exerciseId: "bench",
    targetWeight: 100, targetReps: 1, actualWeight: 100, actualReps: 3,
    completedAt: "2026-07-05T10:00:00Z", schemaVersion: 1, ...over,
  };
}
function corr(id: string, supersedes: string, over: Partial<CorrectionRecord> = {}): CorrectionRecord {
  return { id, supersedes, at: "2026-07-06T10:00:00Z", schemaVersion: 1, ...over };
}

describe("applyCorrections", () => {
  it("정정 없으면 원본 그대로 (corrected=false)", () => {
    const out = applyCorrections([set("s1")], []);
    expect(out[0]!.actualReps).toBe(3);
    expect(out[0]!.corrected).toBe(false);
  });
  it("patch가 필드를 덮는다", () => {
    const out = applyCorrections([set("s1")], [corr("c1", "s1", { patch: { actualReps: 1 } })]);
    expect(out[0]!.actualReps).toBe(1);
    expect(out[0]!.corrected).toBe(true);
  });
  it("revoked 세트는 revoked=true", () => {
    const out = applyCorrections([set("s1")], [corr("c1", "s1", { revoked: true })]);
    expect(out[0]!.revoked).toBe(true);
  });
  it("같은 대상 복수 정정 = at 최신 승", () => {
    const out = applyCorrections([set("s1")], [
      corr("c1", "s1", { patch: { actualReps: 1 }, at: "2026-07-06T10:00:00Z" }),
      corr("c2", "s1", { patch: { actualReps: 5 }, at: "2026-07-07T10:00:00Z" }),
    ]);
    expect(out[0]!.actualReps).toBe(5);
  });
  it("at 동률이면 id 큰 쪽 승", () => {
    const out = applyCorrections([set("s1")], [
      corr("c1", "s1", { patch: { actualReps: 1 } }),
      corr("c2", "s1", { patch: { actualReps: 4 } }),
    ]);
    expect(out[0]!.actualReps).toBe(4);
  });
  it("정정의 정정은 루트 세트로 해소된다", () => {
    const out = applyCorrections([set("s1")], [
      corr("c1", "s1", { patch: { actualReps: 1 }, at: "2026-07-06T10:00:00Z" }),
      corr("c2", "c1", { patch: { actualReps: 2 }, at: "2026-07-07T10:00:00Z" }),
    ]);
    expect(out[0]!.actualReps).toBe(2);
  });
});

describe("sessionCyclePosOverride", () => {
  it("SessionCompleted 대상 cyclePos 정정의 최신 승자를 반환", () => {
    const cs: CorrectionRecord[] = [
      corr("c1", "sc1", { patch: { cyclePos: { cycleIndex: 0, week: 0, dayOrdinal: 1 } }, at: "2026-07-06T10:00:00Z" }),
      corr("c2", "sc1", { patch: { cyclePos: { cycleIndex: 1, week: 0, dayOrdinal: 1 } }, at: "2026-07-07T10:00:00Z" }),
    ];
    expect(sessionCyclePosOverride("sc1", cs)).toEqual({ cycleIndex: 1, week: 0, dayOrdinal: 1 });
  });
  it("정정 없으면 undefined", () => {
    expect(sessionCyclePosOverride("sc1", [])).toBeUndefined();
  });
});
