import { describe, it, expect } from "vitest";
import { roundToStep, renderProgram } from "../lib/render.mjs";
import { minimalProgram } from "./fixtures.mjs";

describe("roundToStep", () => {
  it("2.5 단위 반올림 — 볼트 표 재현", () => {
    // TM 105 기준: 스펙 검증 라운드에서 확인된 볼트 표 값
    expect(roundToStep(105 * 0.75, 2.5)).toBe(80);   // 78.75 → 80
    expect(roundToStep(105 * 0.85, 2.5)).toBe(90);   // 89.25 → 90
    expect(roundToStep(105 * 0.95, 2.5)).toBe(100);  // 99.75 → 100
    expect(roundToStep(105 * 0.65, 2.5)).toBe(67.5); // 68.25 → 67.5
  });
  it("step 5 반올림", () => {
    expect(roundToStep(78.75, 5)).toBe(80);
    expect(roundToStep(72.4, 5)).toBe(70);
  });
});

describe("renderProgram", () => {
  it("pctOfTM 세트를 무게로 계산해 표로 출력", () => {
    const md = renderProgram(minimalProgram(), { bench: 105 });
    expect(md).toContain("| 1 | 80kg (75%) | 5 |");
  });
  it("TM 누락 시 물음표 표기(에러 아님)", () => {
    const md = renderProgram(minimalProgram(), {});
    expect(md).toContain("75% of bench (TM?)");
  });
  it("tracked load는 — 로 표기, topSet에 ★ 표기", () => {
    const p = minimalProgram();
    p.weeks[0].days[0].slots[0].sets = [
      { load: { kind: "tracked" }, reps: 8 },
      { load: { kind: "pctOfTM", pct: 0.95 }, reps: 1, amrapRole: "topSet" },
    ];
    const md = renderProgram(p, { bench: 105 });
    expect(md).toContain("| 1 | — | 8 |");
    expect(md).toContain("1+ ★topSet");
  });
});
