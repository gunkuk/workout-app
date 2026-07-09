import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildWorkoutPlan, lightConventionalPreset } from "../../src/domain/programEngine";
import { DEFAULT_PLATES } from "../../src/domain/plates";
import type { ProgramDefinition, AccessoryState } from "../../src/domain/types.ts";

const seed = JSON.parse(readFileSync("programs/nsuns-5day.json", "utf8")) as ProgramDefinition;
const tm = { bench: 105, ohp: 67.5, squat: 85, deadlift: 140 };

describe("buildWorkoutPlan", () => {
  it("① day5 벤치 T1 9세트 무게 오라클", () => {
    const plan = buildWorkoutPlan(seed, { cycleIndex: 0, week: 0, dayOrdinal: 5 }, tm, {}, DEFAULT_PLATES);
    const benchSlot = plan!.slots.find((s) => s.slotId === "w1d5-bench-t1")!;
    expect(benchSlot.sets.map((s) => s.weight)).toEqual([80, 90, 100, 95, 90, 85, 80, 72.5, 67.5]);
  });

  it("② day5 벤치 워밍업 오라클", () => {
    const plan = buildWorkoutPlan(seed, { cycleIndex: 0, week: 0, dayOrdinal: 5 }, tm, {}, DEFAULT_PLATES);
    const benchSlot = plan!.slots.find((s) => s.slotId === "w1d5-bench-t1")!;
    expect(benchSlot.warmups).toEqual([
      { weight: 20, reps: 10, setType: "warmup" },
      { weight: 40, reps: 5, setType: "warmup" },
      { weight: 55, reps: 3, setType: "warmup" },
      { weight: 70, reps: 1, setType: "warmup" },
    ]);
  });

  it("③ day4 데드 T1 무게 + 힌지 워밍업 오라클", () => {
    const plan = buildWorkoutPlan(seed, { cycleIndex: 0, week: 0, dayOrdinal: 4 }, tm, {}, DEFAULT_PLATES);
    const deadSlot = plan!.slots.find((s) => s.slotId === "w1d4-dead-t1")!;
    expect(deadSlot.sets.map((s) => s.weight)).toEqual([105, 120, 132.5, 125, 120, 112.5, 105, 97.5, 90]);
    expect(deadSlot.warmups).toEqual([
      { weight: 60, reps: 5, setType: "warmup" },
      { weight: 72.5, reps: 3, setType: "warmup" },
      { weight: 92.5, reps: 1, setType: "warmup" },
    ]);
  });

  it("④ day1 랫풀 악세사리 — 상태 있음(3세트 40kg×10) / 상태 없음(needsInit)", () => {
    const accessories: Record<string, AccessoryState> = {
      "w1d1-latpull-acc": { weight: 40, targetReps: 10, missStreak: 0, grace: false },
    };
    const withState = buildWorkoutPlan(seed, { cycleIndex: 0, week: 0, dayOrdinal: 1 }, tm, accessories, DEFAULT_PLATES);
    const slotWithState = withState!.slots.find((s) => s.slotId === "w1d1-latpull-acc")!;
    expect(slotWithState.sets).toEqual([
      { weight: 40, reps: 10, setType: "work" },
      { weight: 40, reps: 10, setType: "work" },
      { weight: 40, reps: 10, setType: "work" },
    ]);
    expect(slotWithState.warmups).toEqual([]);
    expect(slotWithState.needsInit).toBe(false);

    const withoutState = buildWorkoutPlan(seed, { cycleIndex: 0, week: 0, dayOrdinal: 1 }, tm, {}, DEFAULT_PLATES);
    const slotNoState = withoutState!.slots.find((s) => s.slotId === "w1d1-latpull-acc")!;
    expect(slotNoState.needsInit).toBe(true);
    expect(slotNoState.sets.every((s) => s.weight === null)).toBe(true);
    expect(slotNoState.sets.map((s) => s.reps)).toEqual([8, 8, 8]);
  });

  it("⑤ TM 없는 ref(frontSquat) → missingTM=true, 전 세트 weight null, 워밍업 []", () => {
    const plan = buildWorkoutPlan(seed, { cycleIndex: 0, week: 0, dayOrdinal: 4 }, tm, {}, DEFAULT_PLATES);
    const frontSlot = plan!.slots.find((s) => s.slotId === "w1d4-front-t2")!;
    expect(frontSlot.missingTM).toBe(true);
    expect(frontSlot.sets.every((s) => s.weight === null)).toBe(true);
    expect(frontSlot.warmups).toEqual([]);
  });

  it("⑥ 존재하지 않는 pos → null", () => {
    expect(buildWorkoutPlan(seed, { cycleIndex: 0, week: 0, dayOrdinal: 99 }, tm, {}, DEFAULT_PLATES)).toBeNull();
  });

  it("⑦ lightConventionalPreset(140) → 5×5 @ 77.5 + 힌지 워밍업 하한 + substitutedFrom JSDoc 규약", () => {
    const preset = lightConventionalPreset(140, DEFAULT_PLATES);
    expect(preset.exerciseId).toBe("deadlift");
    expect(preset.label).toBe("T1(경량)");
    expect(preset.sets).toEqual([
      { weight: 77.5, reps: 5, setType: "work" },
      { weight: 77.5, reps: 5, setType: "work" },
      { weight: 77.5, reps: 5, setType: "work" },
      { weight: 77.5, reps: 5, setType: "work" },
      { weight: 77.5, reps: 5, setType: "work" },
    ]);
    expect(preset.warmups).toEqual([
      { weight: 60, reps: 5, setType: "warmup" },
      { weight: 67.5, reps: 1, setType: "warmup" },
    ]);

    // JSDoc이 substitutedFrom 규약을 명시하는지 정적 확인 (코드 리뷰 항목)
    const src = readFileSync("src/domain/programEngine.ts", "utf8");
    expect(src).toContain("substitutedFrom");
  });
});
