import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { validateProgram } from "../lib/validation.mjs";
import { renderProgram, roundToStep } from "../lib/render.mjs";

const seed = JSON.parse(readFileSync("programs/nsuns-5day.json", "utf8"));

describe("nSuns 5-day 시드", () => {
  it("검증 전체 통과", () => {
    expect(validateProgram(seed)).toEqual([]);
  });

  it("토요일 벤치 heavy T1 무게 오라클 (TM 105 = 볼트 검증표)", () => {
    const day5 = seed.weeks[0].days[4];
    const benchT1 = day5.slots.find((s) => s.id === "w1d5-bench-t1");
    const weights = benchT1.sets.map((s) => roundToStep(105 * s.load.pct, 2.5));
    expect(weights).toEqual([80, 90, 100, 95, 90, 85, 80, 72.5, 67.5]);
  });

  it("구조 불변식: 벤치 rule은 heavy day에만, 화 OHP T2는 rule 없음", () => {
    const slots = seed.weeks[0].days.flatMap((d) => d.slots);
    const benchRuled = slots.filter((s) => s.exerciseId === "bench" && s.progressionRuleId);
    expect(benchRuled.map((s) => s.id)).toEqual(["w1d5-bench-t1"]);
    const ohpT2 = slots.find((s) => s.id === "w1d1-ohp-t2");
    expect(ohpT2.progressionRuleId).toBeUndefined();
  });

  it("topSet은 heavy T1 4곳뿐, volume day엔 없음", () => {
    const topSetSlots = seed.weeks[0].days.flatMap((d) =>
      d.slots.filter((s) => s.sets.some((x) => x.amrapRole === "topSet")).map((s) => s.id),
    );
    expect(topSetSlots.sort()).toEqual(
      ["w1d2-squat-t1", "w1d3-ohp-t1", "w1d4-dead-t1", "w1d5-bench-t1"].sort(),
    );
  });

  it("렌더 스모크: 전 TM 제공 시 TM? 표기 없음", () => {
    const md = renderProgram(seed, {
      bench: 105, ohp: 67.5, squat: 85, deadlift: 120,
      sumoDeadlift: 100, frontSquat: 60, inclineBench: 70, cgbp: 80,
    });
    expect(md).not.toContain("(TM?)");
    expect(md).toContain("★topSet");
  });
});
