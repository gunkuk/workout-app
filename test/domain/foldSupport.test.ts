import { describe, it, expect } from "vitest";
import { programKey, capKey, daySpecFor, judgingSetsForSlot, lastSetOf } from "../../src/domain/foldSupport";
import { applyCorrections } from "../../src/domain/corrections";
import type { ProgramDefinition, SetRecord } from "../../src/domain/types.ts";

const prog: ProgramDefinition = {
  id: "p", name: "P", version: 1, schemaVersion: 1,
  weeks: [
    { days: [{ ordinal: 1, name: "d1", slots: [] }, { ordinal: 2, name: "d2", slots: [] }] },
    { days: [{ ordinal: 1, name: "w2d1", slots: [] }] },
  ],
};

function set(id: string, over: Partial<SetRecord> = {}): SetRecord {
  return {
    id, sessionId: "ss1", slotId: "sl1", exerciseId: "bench",
    targetWeight: 100, targetReps: 5, actualWeight: 100, actualReps: 5,
    completedAt: "2026-07-05T10:00:00Z", schemaVersion: 1, ...over,
  };
}

describe("foldSupport", () => {
  it("programKey·capKey 포맷", () => {
    expect(programKey("nsuns", 3)).toBe("nsuns@3");
    expect(capKey("tm:bench", { cycleIndex: 2, week: 0, dayOrdinal: 5 })).toBe("tm:bench|c2w0");
  });
  it("daySpecFor: week 인덱스 + ordinal 매칭", () => {
    expect(daySpecFor(prog, { cycleIndex: 0, week: 1, dayOrdinal: 1 })?.name).toBe("w2d1");
    expect(daySpecFor(prog, { cycleIndex: 0, week: 0, dayOrdinal: 2 })?.name).toBe("d2");
    expect(daySpecFor(prog, { cycleIndex: 0, week: 5, dayOrdinal: 1 })).toBeUndefined();
  });
  it("judgingSetsForSlot: warmup·substituted·revoked·다른 슬롯 제외, 시간순", () => {
    const sets = applyCorrections(
      [
        set("s1", { completedAt: "2026-07-05T10:02:00Z" }),
        set("s2", { completedAt: "2026-07-05T10:01:00Z" }),
        set("s3", { setType: "warmup" }),
        set("s4", { substitutedFrom: "deadlift" }),
        set("s5", { slotId: "other" }),
        set("s6", {}),
      ],
      [{ id: "c1", supersedes: "s6", revoked: true, at: "2026-07-06T00:00:00Z", schemaVersion: 1 }],
    );
    const out = judgingSetsForSlot(sets, "ss1", "sl1");
    expect(out.map((s) => s.id)).toEqual(["s2", "s1"]);
    expect(lastSetOf(out)?.id).toBe("s1");
  });
});
