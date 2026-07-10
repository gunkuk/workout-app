import { lightConventionalPreset, type PlannedSlot } from "../../domain/programEngine";
import type { PlateConfig } from "../../domain/plates";
import type { SetRecord } from "../../domain/types.ts";
import { setIdFor } from "./sessionId";

/** lightConventionalPreset(programEngine.ts)이 하드코딩한 slotId — 데드리프트 슬롯 1개 가정(계획 "참고" 항목). */
export const LIGHT_DEADLIFT_SLOT_ID = "lightConventionalDeadlift";

export type EffectiveSlot = { original: PlannedSlot; slot: PlannedSlot; swapped: boolean };

/**
 * 원본 슬롯 옆에, 통증일로 교체된 경우 그 대체 슬롯을 함께 들고 있는 표시용 목록.
 * swapped=true인 항목만 slot !== original (참조가 다른 lightConventionalPreset 결과).
 * 순수 함수 — TodayScreen의 렌더 직전 인라인 계산을 그대로 추출(Stage1-R T5).
 */
export function deriveEffectiveSlots(
  slots: PlannedSlot[],
  swappedSlots: Record<string, string>,
  tm: Record<string, number>,
  cfg: PlateConfig,
): EffectiveSlot[] {
  return slots.map((original) => {
    if (original.exerciseId !== "deadlift" || swappedSlots[LIGHT_DEADLIFT_SLOT_ID] === undefined) {
      return { original, slot: original, swapped: false };
    }
    const tmDeadlift = tm.deadlift;
    if (tmDeadlift === undefined) return { original, slot: original, swapped: false };
    return { original, slot: lightConventionalPreset(tmDeadlift, cfg), swapped: true };
  });
}

/** 모든 유효 슬롯이 완료(작업세트 전부 기록, 또는 missingTM/스킵으로 게이트에서 면제)됐는지 판정. */
export function isSessionComplete(
  effectiveSlots: EffectiveSlot[],
  sessionId: string,
  recorded: Record<string, SetRecord>,
  isSkipped: (slotId: string) => boolean,
): boolean {
  return effectiveSlots.every(
    ({ slot }) =>
      slot.missingTM ||
      isSkipped(slot.slotId) ||
      slot.sets.every((_, i) => recorded[setIdFor(sessionId, slot.slotId, "work", i)] !== undefined),
  );
}
