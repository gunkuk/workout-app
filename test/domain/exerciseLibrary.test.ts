import { describe, it, expect } from "vitest";
import { EXERCISES, exerciseInfo } from "../../src/domain/exerciseLibrary";
import { loadSeedProgram } from "../helpers/seed";

describe("exerciseLibrary", () => {
  it("nSuns 시드 JSON의 모든 exerciseId가 라이브러리에 존재", () => {
    const seedJson = loadSeedProgram();
    const exerciseIds = new Set<string>();

    for (const week of seedJson.weeks) {
      for (const day of week.days) {
        for (const slot of day.slots) {
          exerciseIds.add(slot.exerciseId);
        }
      }
    }

    for (const exerciseId of exerciseIds) {
      expect(EXERCISES[exerciseId], `exerciseId "${exerciseId}" not found in EXERCISES`).toBeDefined();
    }
  });

  it("hinge = {deadlift, sumoDeadlift} 정확히", () => {
    const hingeExercises = Object.entries(EXERCISES)
      .filter(([_, info]) => info.hinge === true)
      .map(([id, _]) => id);

    expect(new Set(hingeExercises)).toEqual(
      new Set(["deadlift", "sumoDeadlift"])
    );
  });

  it("신규 6종(tbarRow·pullup·backExtension·hipThrust·lateralRaise·legRaise)이 올바른 groups로 조회됨", () => {
    expect(exerciseInfo("tbarRow")?.groups).toEqual(["back"]);
    expect(exerciseInfo("pullup")?.groups).toEqual(["back", "biceps"]);
    expect(exerciseInfo("backExtension")?.groups).toEqual(["hamstrings", "glutes"]);
    expect(exerciseInfo("hipThrust")?.groups).toEqual(["glutes"]);
    expect(exerciseInfo("lateralRaise")?.groups).toEqual(["shoulders"]);
    expect(exerciseInfo("legRaise")?.groups).toEqual(["core"]);
  });

  it("모든 항목 groups 1~3개·유효 MuscleGroup", () => {
    const validGroups = new Set([
      "chest",
      "back",
      "shoulders",
      "quads",
      "hamstrings",
      "glutes",
      "calves",
      "biceps",
      "triceps",
      "core",
    ]);

    for (const [id, info] of Object.entries(EXERCISES)) {
      expect(info.groups.length).toBeGreaterThanOrEqual(1);
      expect(info.groups.length).toBeLessThanOrEqual(3);

      for (const group of info.groups) {
        expect(validGroups.has(group), `Invalid group "${group}" in exercise "${id}"`).toBe(true);
      }
    }
  });
});
