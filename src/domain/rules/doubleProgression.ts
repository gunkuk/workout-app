import type { AccessoryState } from "../types.ts";

export type DoubleProgressionParams = { repMin: number; repMax: number; weightStep: number };

/**
 * 스펙 §2-2: 마지막 세트 ≥repMax → +스텝·하한 리셋·유예 1세션.
 * 유예 아닌 세션에서 마지막 세트 <repMin 2연속 → rollback 신호 (상태는 불변, 수락 시 DecisionEvent).
 */
export function applyAccessorySession(
  state: AccessoryState,
  lastSet: { actualWeight: number; actualReps: number } | undefined,
  params: DoubleProgressionParams,
): { state: AccessoryState; rollback: boolean } {
  if (!lastSet) return { state, rollback: false };

  if (lastSet.actualReps >= params.repMax) {
    return {
      state: { weight: state.weight + params.weightStep, targetReps: params.repMin, missStreak: 0, grace: true },
      rollback: false,
    };
  }

  if (lastSet.actualReps < params.repMin) {
    if (state.grace) return { state: { ...state, grace: false, missStreak: 0 }, rollback: false };
    const missStreak = state.missStreak + 1;
    return { state: { ...state, missStreak, grace: false }, rollback: missStreak >= 2 };
  }

  const targetReps = Math.min(Math.max(lastSet.actualReps + 1, params.repMin), params.repMax);
  return { state: { ...state, targetReps, missStreak: 0, grace: false }, rollback: false };
}
