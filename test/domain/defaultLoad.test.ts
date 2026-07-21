import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildWorkoutPlan } from "../../src/domain/programEngine";
import { USER_PLATES } from "../../src/lib/plateConfig";
import type { ProgramDefinition, AccessoryState, SlotSpec } from "../../src/domain/types.ts";

/** 사용자 실제 TM(2026-07 기준) — 유도값 검증의 기준 */
const TM = { bench: 105, ohp: 67.5, squat: 85, deadlift: 140, tbarRow: 91 };

function loadProgram(file: string): ProgramDefinition {
  return JSON.parse(readFileSync(`programs/${file}`, "utf8")) as ProgramDefinition;
}

/** 한 슬롯짜리 최소 프로그램 — defaultLoad 해석만 격리해서 본다 */
function oneSlotProgram(slot: SlotSpec): ProgramDefinition {
  return {
    id: "t",
    name: "t",
    version: 1,
    schemaVersion: 1,
    weeks: [{ days: [{ ordinal: 1, name: "d", slots: [slot] }] }],
  };
}

const trackedSlot = (over: Partial<SlotSpec>): SlotSpec => ({
  id: "s1",
  exerciseId: "machineCurl",
  label: "accessory",
  progressionRuleId: "repLadder",
  progressionParams: { sets: 4, repMin: 5, repMax: 7, weightStep: 5 },
  sets: Array.from({ length: 4 }, () => ({ load: { kind: "tracked" as const }, reps: 5 })),
  ...over,
});

const POS = { cycleIndex: 0, week: 0, dayOrdinal: 1 };

describe("defaultLoad — tracked 슬롯 최초 무게 자동 유도(UI13)", () => {
  it("ref×pct를 슬롯 증량단위로 반올림하고 needsInit을 해제한다", () => {
    const prog = oneSlotProgram(trackedSlot({ defaultLoad: { ref: "ohp", pct: 0.3 } }));
    const slot = buildWorkoutPlan(prog, POS, TM, {}, USER_PLATES)!.slots[0]!;
    // 67.5 × 0.30 = 20.25 → weightStep 5 반올림 → 20
    expect(slot.sets.every((s) => s.weight === 20)).toBe(true);
    expect(slot.needsInit).toBe(false);
  });

  it("kg 절대값도 처방한다(중량풀업 추가중량)", () => {
    const prog = oneSlotProgram(
      trackedSlot({
        exerciseId: "pullup",
        progressionRuleId: "doubleProgression",
        progressionParams: { repMin: 3, repMax: 6, weightStep: 2.5, sets: 4 },
        defaultLoad: { kg: 5 },
      }),
    );
    const slot = buildWorkoutPlan(prog, POS, TM, {}, USER_PLATES)!.slots[0]!;
    expect(slot.sets.every((s) => s.weight === 5)).toBe(true);
    expect(slot.needsInit).toBe(false);
  });

  it("repLadder 첫 세션은 사다리 0스텝(전 세트 repMin)으로 처방한다", () => {
    const prog = oneSlotProgram(trackedSlot({ defaultLoad: { ref: "ohp", pct: 0.3 } }));
    const slot = buildWorkoutPlan(prog, POS, TM, {}, USER_PLATES)!.slots[0]!;
    expect(slot.sets.map((s) => s.reps)).toEqual([5, 5, 5, 5]);
  });

  it("참조 TM이 없으면 기존 자유입력(needsInit) 경로로 폴백한다", () => {
    const prog = oneSlotProgram(trackedSlot({ defaultLoad: { ref: "없는리프트", pct: 0.3 } }));
    const slot = buildWorkoutPlan(prog, POS, TM, {}, USER_PLATES)!.slots[0]!;
    expect(slot.needsInit).toBe(true);
    expect(slot.sets.every((s) => s.weight === null)).toBe(true);
  });

  it("defaultLoad가 없으면 종전과 동일하게 needsInit(회귀 방지)", () => {
    const prog = oneSlotProgram(trackedSlot({}));
    const slot = buildWorkoutPlan(prog, POS, TM, {}, USER_PLATES)!.slots[0]!;
    expect(slot.needsInit).toBe(true);
  });

  it("AccessoryState가 있으면 defaultLoad를 무시하고 상태를 우선한다(기존 사용자 회귀 방지)", () => {
    const prog = oneSlotProgram(trackedSlot({ defaultLoad: { ref: "ohp", pct: 0.3 } }));
    const state: Record<string, AccessoryState> = {
      s1: { weight: 32.5, targetReps: 22, missStreak: 0, grace: false },
    };
    const slot = buildWorkoutPlan(prog, POS, TM, state, USER_PLATES)!.slots[0]!;
    expect(slot.sets.every((s) => s.weight === 32.5)).toBe(true);
    // 총합 22 → 사다리 6655
    expect(slot.sets.map((s) => s.reps)).toEqual([6, 6, 5, 5]);
  });
});

describe("kk-6day — 첫 세션이 전부 처방된다(사용자 요구 회귀 방지)", () => {
  const prog = loadProgram("kk-6day.json");

  it("tmSeeds가 티바로우 TM을 데드리프트에서 유도하도록 선언돼 있다", () => {
    expect(prog.tmSeeds).toEqual([{ exerciseId: "tbarRow", ref: "deadlift", pct: 0.65 }]);
  });

  it("전 요일 모든 슬롯에 수동 입력(needsInit)이 하나도 없다", () => {
    for (const day of prog.weeks[0]!.days) {
      const plan = buildWorkoutPlan(prog, { cycleIndex: 0, week: 0, dayOrdinal: day.ordinal }, TM, {}, USER_PLATES)!;
      for (const slot of plan.slots) {
        expect({ day: day.ordinal, slot: slot.slotId, needsInit: slot.needsInit }).toEqual({
          day: day.ordinal,
          slot: slot.slotId,
          needsInit: false,
        });
        expect(slot.sets.every((s) => s.weight !== null)).toBe(true);
      }
    }
  });

  it("월요일 3슬롯이 TM에서 유도된 구체 무게로 처방된다", () => {
    const plan = buildWorkoutPlan(prog, POS, TM, {}, USER_PLATES)!;
    const byId = Object.fromEntries(plan.slots.map((s) => [s.slotId, s]));
    expect(byId["d1-pullup"]!.sets[0]!.weight).toBe(5); // 절대값
    expect(byId["d1-dbrow"]!.sets[0]!.weight).toBe(35); // 140 × 0.25
    // UI14 item3 — 월↔화 악세사리 스왑: 월 3번째 슬롯은 이제 machineCurl(d1-curl, weightStep 5).
    expect(byId["d1-curl"]!.sets[0]!.weight).toBe(20); // 67.5 × 0.3 = 20.25 → 5 단위
  });
});

describe("kk-4day — 기존 프로그램도 동일하게 처방된다", () => {
  it("tracked 슬롯에 수동 입력이 남지 않는다", () => {
    const prog = loadProgram("kk-4day.json");
    for (const day of prog.weeks[0]!.days) {
      const plan = buildWorkoutPlan(prog, { cycleIndex: 0, week: 0, dayOrdinal: day.ordinal }, TM, {}, USER_PLATES)!;
      for (const slot of plan.slots) expect(slot.needsInit).toBe(false);
    }
  });
});
