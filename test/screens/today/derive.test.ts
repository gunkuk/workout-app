import { describe, it, expect } from "vitest";
import { DEFAULT_PLATES } from "../../../src/domain/plates";
import { deriveEffectiveSlots, isSessionComplete, LIGHT_DEADLIFT_SLOT_ID } from "../../../src/screens/today/derive";
import type { PlannedSlot } from "../../../src/domain/programEngine";
import type { SetRecord } from "../../../src/domain/types.ts";

// Task 5 — derive.ts 순수 함수 단위 테스트(렌더 없이 검증). TodayScreen 인라인 계산을 그대로 추출한
// deriveEffectiveSlots(통증일 슬롯 대체)와 isSessionComplete(세션완료 게이트)를 다룬다.

const deadliftSlot: PlannedSlot = {
  slotId: "w1d4-dead-t1",
  exerciseId: "deadlift",
  label: "T1",
  warmups: [],
  sets: [{ weight: 100, reps: 5, setType: "work" }],
  missingTM: false,
  needsInit: false,
};

const squatSlot: PlannedSlot = {
  slotId: "w1d2-squat-t1",
  exerciseId: "squat",
  label: "T1",
  warmups: [],
  sets: [{ weight: 80, reps: 5, setType: "work" }],
  missingTM: false,
  needsInit: false,
};

describe("deriveEffectiveSlots", () => {
  it("스왑 없음 → 원본 슬롯 그대로(swapped=false)", () => {
    const result = deriveEffectiveSlots([deadliftSlot, squatSlot], {}, { deadlift: 140 }, DEFAULT_PLATES);
    expect(result).toEqual([
      { original: deadliftSlot, slot: deadliftSlot, swapped: false },
      { original: squatSlot, slot: squatSlot, swapped: false },
    ]);
  });

  it("데드리프트 슬롯 + swappedSlots 설정 + TM 있음 → 경량 프리셋으로 교체(swapped=true)", () => {
    const result = deriveEffectiveSlots(
      [deadliftSlot],
      { [LIGHT_DEADLIFT_SLOT_ID]: "deadlift" },
      { deadlift: 140 },
      DEFAULT_PLATES,
    );
    expect(result[0]!.swapped).toBe(true);
    expect(result[0]!.slot.slotId).toBe(LIGHT_DEADLIFT_SLOT_ID);
    expect(result[0]!.original).toBe(deadliftSlot);
  });

  it("데드리프트 아닌 슬롯은 swappedSlots 무관하게 원본 그대로", () => {
    const result = deriveEffectiveSlots([squatSlot], { [LIGHT_DEADLIFT_SLOT_ID]: "deadlift" }, { deadlift: 140 }, DEFAULT_PLATES);
    expect(result[0]!.swapped).toBe(false);
    expect(result[0]!.slot).toBe(squatSlot);
  });

  it("tm.deadlift 미시드(방어 가드) → 스왑 요청돼도 원본 그대로", () => {
    const result = deriveEffectiveSlots([deadliftSlot], { [LIGHT_DEADLIFT_SLOT_ID]: "deadlift" }, {}, DEFAULT_PLATES);
    expect(result[0]!.swapped).toBe(false);
    expect(result[0]!.slot).toBe(deadliftSlot);
  });
});

describe("isSessionComplete", () => {
  const sessionId = "prog@1:0-0-1";
  const rec = (id: string): SetRecord => ({
    id,
    sessionId,
    slotId: squatSlot.slotId,
    exerciseId: "squat",
    setType: "work",
    targetWeight: 80,
    targetReps: 5,
    actualWeight: 80,
    actualReps: 5,
    completedAt: "2026-07-10T10:00:00Z",
    schemaVersion: 1,
  });

  it("작업세트 전부 기록됨 → true", () => {
    const id = `${sessionId}-${squatSlot.slotId}-work-0`;
    const effectiveSlots = [{ original: squatSlot, slot: squatSlot, swapped: false }];
    expect(isSessionComplete(effectiveSlots, sessionId, { [id]: rec(id) }, () => false)).toBe(true);
  });

  it("작업세트 미기록 + 스킵 아님 → false", () => {
    const effectiveSlots = [{ original: squatSlot, slot: squatSlot, swapped: false }];
    expect(isSessionComplete(effectiveSlots, sessionId, {}, () => false)).toBe(false);
  });

  it("작업세트 미기록이지만 스킵됨 → true(면제)", () => {
    const effectiveSlots = [{ original: squatSlot, slot: squatSlot, swapped: false }];
    expect(isSessionComplete(effectiveSlots, sessionId, {}, () => true)).toBe(true);
  });

  it("missingTM 슬롯은 미기록이어도 게이트에서 면제 → true", () => {
    const missingTMSlot: PlannedSlot = { ...squatSlot, missingTM: true };
    const effectiveSlots = [{ original: missingTMSlot, slot: missingTMSlot, swapped: false }];
    expect(isSessionComplete(effectiveSlots, sessionId, {}, () => false)).toBe(true);
  });
});
