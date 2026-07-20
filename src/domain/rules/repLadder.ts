import type { AccessoryState } from "../types.ts";

export type RepLadderParams = { sets: number; repMin: number; repMax: number; weightStep: number };

/**
 * 사용자 확정 스펙: AccessoryState.targetReps에 "사다리 총합"(sets*repMin ~ sets*repMax)을 저장하고,
 * per-set 목표는 이 총합에서 결정론적으로 파생한다. 앞쪽 세트부터 +1이 쌓이는 방식이라
 * 최솟값을 가진 가장 앞쪽 세트가 먼저 오른다 (5555→6555→6655→6665→6666→7666→7766→7776→7777).
 */
export function deriveRepLadderTargets(total: number, params: RepLadderParams): number[] {
  const { sets, repMin } = params;
  const extra = total - sets * repMin;
  const level = repMin + Math.floor(extra / sets);
  const rem = extra % sets;
  return Array.from({ length: sets }, (_, i) => (i < rem ? level + 1 : level));
}

/**
 * 세션 판정: per-set 목표(위 파생)를 전 세트가 달성(actualReps >= target)해야 한 스텝 전진.
 * 하나라도 미달이면 그 스텝 유지(재도전, 상태 불변). 최상단(sets*repMax) 달성 후에는
 * weight += weightStep, 총합은 sets*repMin으로 리셋.
 */
export function applyRepLadderSession(
  state: AccessoryState,
  lastSets: { actualReps: number }[] | undefined,
  params: RepLadderParams,
): { state: AccessoryState } {
  if (!lastSets || lastSets.length < params.sets) return { state };

  const targets = deriveRepLadderTargets(state.targetReps, params);
  const allMet = targets.every((t, i) => lastSets[i]!.actualReps >= t);
  if (!allMet) return { state };

  const maxTotal = params.sets * params.repMax;
  if (state.targetReps >= maxTotal) {
    return {
      state: {
        weight: state.weight + params.weightStep,
        targetReps: params.sets * params.repMin,
        missStreak: 0,
        grace: false,
      },
    };
  }
  return { state: { ...state, targetReps: state.targetReps + 1 } };
}
