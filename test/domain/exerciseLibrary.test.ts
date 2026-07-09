import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { EXERCISES, exerciseInfo } from "../../src/domain/exerciseLibrary";

describe("exerciseLibrary", () => {
  it("nSuns 시드 JSON의 모든 exerciseId가 라이브러리에 존재", () => {
    const seedJson = JSON.parse(
      readFileSync("programs/nsuns-5day.json", "utf-8")
    );
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
