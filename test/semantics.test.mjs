import { describe, it, expect } from "vitest";
import { validateSemantics, validateProgram } from "../lib/validation.mjs";
import { minimalProgram } from "./fixtures.mjs";

function twoSlotProgram() {
  const p = minimalProgram();
  p.weeks[0].days[0].slots.push({
    id: "s2",
    exerciseId: "ohp",
    label: "T2",
    sets: [{ load: { kind: "pctOfTM", pct: 0.5 }, reps: 6 }],
  });
  return p;
}

describe("시맨틱 검증", () => {
  it("유효 프로그램은 빈 배열", () => {
    expect(validateSemantics(twoSlotProgram())).toEqual([]);
  });

  it("slotId 중복을 잡는다", () => {
    const p = twoSlotProgram();
    p.weeks[0].days[0].slots[1].id = "s1";
    expect(validateSemantics(p).join("\n")).toContain("slotId 중복");
  });

  it("슬롯당 topSet 2개를 잡는다", () => {
    const p = minimalProgram();
    p.weeks[0].days[0].slots[0].sets = [
      { load: { kind: "pctOfTM", pct: 0.95 }, reps: 1, amrapRole: "topSet" },
      { load: { kind: "pctOfTM", pct: 0.9 }, reps: 1, amrapRole: "topSet" },
    ];
    expect(validateSemantics(p).join("\n")).toContain("topSet");
  });

  it("validateProgram = 스키마 실패 시 시맨틱 생략", () => {
    const p = minimalProgram({ schemaVersion: 99 });
    const errors = validateProgram(p);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every((e) => e.startsWith("[스키마]"))).toBe(true);
  });
});
