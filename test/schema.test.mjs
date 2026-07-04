import { describe, it, expect } from "vitest";
import { validateSchema } from "../lib/validation.mjs";
import { minimalProgram } from "./fixtures.mjs";

describe("스키마 검증", () => {
  it("최소 유효 프로그램을 통과시킨다", () => {
    expect(validateSchema(minimalProgram())).toEqual([]);
  });

  it("필수 필드 누락(weeks)을 거부한다", () => {
    const p = minimalProgram();
    delete p.weeks;
    const errors = validateSchema(p);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join("\n")).toContain("weeks");
  });

  it("잘못된 schemaVersion을 거부한다", () => {
    const errors = validateSchema(minimalProgram({ schemaVersion: 2 }));
    expect(errors.length).toBeGreaterThan(0);
  });

  it("pct 범위 밖(1.5) load를 거부한다", () => {
    const p = minimalProgram();
    p.weeks[0].days[0].slots[0].sets[0].load.pct = 1.5;
    expect(validateSchema(p).length).toBeGreaterThan(0);
  });

  it("알 수 없는 load kind를 거부한다", () => {
    const p = minimalProgram();
    p.weeks[0].days[0].slots[0].sets[0].load = { kind: "rpe", value: 8 };
    expect(validateSchema(p).length).toBeGreaterThan(0);
  });

  it("tracked load를 통과시킨다", () => {
    const p = minimalProgram();
    p.weeks[0].days[0].slots[0].sets[0].load = { kind: "tracked" };
    expect(validateSchema(p)).toEqual([]);
  });

  it("amrapRole 오타를 거부한다", () => {
    const p = minimalProgram();
    p.weeks[0].days[0].slots[0].sets[0].amrapRole = "topset";
    expect(validateSchema(p).length).toBeGreaterThan(0);
  });
});
