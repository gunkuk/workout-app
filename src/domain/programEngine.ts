import type { ProgramDefinition, CyclePos, AccessoryState, SlotSpec, SetSpec } from "./types.ts";
import { stepOf, roundToStep, type PlateConfig } from "./plates";
import { generateWarmup } from "./warmup";
import { exerciseInfo } from "./exerciseLibrary";
import { daySpecFor } from "./foldSupport";
import { deriveRepLadderTargets, type RepLadderParams } from "./rules/repLadder";

/** 계획된 한 세트 — 워밍업·작업세트 공통 ("공유 타입" 절, T5) */
export type PlannedSet = {
  weight: number | null;
  reps: number;
  amrapRole?: "topSet" | "backoff";
  setType: "work" | "warmup";
};

/** 계획된 한 슬롯(운동) — TM 미시드·악세사리 미초기화 플래그 포함 */
export type PlannedSlot = {
  slotId: string;
  exerciseId: string;
  label: string;
  warmups: PlannedSet[];
  sets: PlannedSet[];
  missingTM: boolean;
  needsInit: boolean;
};

/** 오늘의 운동 계획 — 특정 CyclePos의 day 하나 */
export type WorkoutPlan = {
  pos: CyclePos;
  dayName: string;
  slots: PlannedSlot[];
};

function buildSet(
  setSpec: SetSpec,
  slot: SlotSpec,
  tm: Record<string, number>,
  accessoryState: AccessoryState | undefined,
  cfg: PlateConfig,
  markMissingTM: () => void,
  repLadderReps?: number,
  defaultWeight: number | null = null
): PlannedSet {
  const amrap = setSpec.amrapRole ? { amrapRole: setSpec.amrapRole } : {};

  if (setSpec.load.kind === "pctOfTM") {
    const ref = setSpec.load.ref ?? slot.exerciseId;
    const tmValue = tm[ref];
    if (tmValue === undefined) {
      markMissingTM();
      return { weight: null, reps: setSpec.reps, setType: "work", ...amrap };
    }
    const weight = roundToStep(tmValue * setSpec.load.pct, stepOf(cfg));
    return { weight, reps: setSpec.reps, setType: "work", ...amrap };
  }

  // tracked (악세사리)
  if (!accessoryState) {
    // 상태가 아직 없어도 slot.defaultLoad로 무게를 유도할 수 있으면 처방한다(UI13) —
    // 첫 세션부터 nSuns처럼 전부 채워진 상태로 보이고, ± 스테퍼로 조정 가능.
    // 유도 불가(참조 TM 없음·defaultLoad 없음)면 기존 자유입력(needsInit) 경로 유지.
    if (defaultWeight === null) {
      return { weight: null, reps: setSpec.reps, setType: "work", ...amrap };
    }
    return { weight: defaultWeight, reps: repLadderReps ?? setSpec.reps, setType: "work", ...amrap };
  }
  const reps = repLadderReps ?? accessoryState.targetReps;
  return { weight: accessoryState.weight, reps, setType: "work", ...amrap };
}

/** 첫 세트 load.kind === "pctOfTM"인 슬롯만 워밍업 생성. tracked·missingTM 슬롯은 []. */
function computeWarmups(slot: SlotSpec, sets: PlannedSet[], missingTM: boolean, cfg: PlateConfig): PlannedSet[] {
  const firstSpec = slot.sets[0];
  const firstSet = sets[0];
  if (!firstSpec || !firstSet || firstSpec.load.kind !== "pctOfTM" || missingTM) return [];
  const firstWeight = firstSet.weight;
  if (firstWeight === null) return [];
  const hinge = exerciseInfo(slot.exerciseId)?.hinge === true;
  return generateWarmup(firstWeight, { hinge, cfg }).map((w) => ({
    weight: w.weight,
    reps: w.reps,
    setType: "warmup" as const,
  }));
}

/**
 * tracked 슬롯의 최초 무게 유도(UI13) — AccessoryState가 없을 때만 호출된다.
 * `kg` 절대값이 있으면 그대로, 아니면 `tm[ref] × pct`를 그 슬롯의 증량 단위로 반올림한다.
 * 참조 TM이 없으면 null → 호출부가 기존 자유입력(needsInit) 경로로 폴백.
 */
function resolveDefaultLoad(slot: SlotSpec, tm: Record<string, number>, cfg: PlateConfig): number | null {
  const d = slot.defaultLoad;
  if (!d) return null;
  const step = (slot.progressionParams?.["weightStep"] as number | undefined) ?? stepOf(cfg);
  if (typeof d.kg === "number") return roundToStep(d.kg, step);
  if (!d.ref || typeof d.pct !== "number") return null;
  const base = tm[d.ref];
  if (base === undefined) return null;
  return roundToStep(base * d.pct, step);
}

function buildSlot(
  slot: SlotSpec,
  tm: Record<string, number>,
  accessories: Record<string, AccessoryState>,
  cfg: PlateConfig
): PlannedSlot {
  let missingTM = false;
  const accessoryState = accessories[slot.id];
  const hasTracked = slot.sets.some((s) => s.load.kind === "tracked");
  // UI13: 상태가 없어도 defaultLoad로 무게를 유도할 수 있으면 처방된 슬롯으로 취급(needsInit 해제).
  const defaultWeight = accessoryState ? null : resolveDefaultLoad(slot, tm, cfg);
  const needsInit = hasTracked && !accessoryState && defaultWeight === null;

  // repLadder: per-set 목표를 총합(targetReps)에서 파생 — doubleProgression 경로(uniform reps)는 그대로 둔다.
  // 상태가 없고 defaultLoad로 처방하는 첫 세션은 사다리 0스텝(= sets×repMin 총합)을 쓴다.
  const ladderParams = slot.progressionParams as unknown as RepLadderParams | undefined;
  const repLadderTotal =
    slot.progressionRuleId === "repLadder"
      ? accessoryState
        ? accessoryState.targetReps
        : defaultWeight !== null && ladderParams
          ? ladderParams.sets * ladderParams.repMin
          : null
      : null;
  const repLadderTargets =
    repLadderTotal !== null && ladderParams ? deriveRepLadderTargets(repLadderTotal, ladderParams) : null;

  const sets = slot.sets.map((setSpec, i) =>
    buildSet(setSpec, slot, tm, accessoryState, cfg, () => {
      missingTM = true;
    }, repLadderTargets ? repLadderTargets[i] : undefined, defaultWeight)
  );

  const warmups = computeWarmups(slot, sets, missingTM, cfg);

  return { slotId: slot.id, exerciseId: slot.exerciseId, label: slot.label, warmups, sets, missingTM, needsInit };
}

/** 오늘의 WorkoutPlan 생성 — 해당 CyclePos에 day가 없으면 null (스펙 §2-1) */
export function buildWorkoutPlan(
  program: ProgramDefinition,
  pos: CyclePos,
  tm: Record<string, number>,
  accessories: Record<string, AccessoryState>,
  cfg: PlateConfig
): WorkoutPlan | null {
  const day = daySpecFor(program, pos);
  if (!day) return null;
  return {
    pos,
    dayName: day.name,
    slots: day.slots.map((slot) => buildSlot(slot, tm, accessories, cfg)),
  };
}

/**
 * 통증일 프리셋 — 경량 컨벤셔널 데드리프트 5×5 @ 55%TM (스펙 §2-1, 컨트롤러 확정 2026-07-09).
 *
 * ⚠️ fold 계약: 이 프리셋으로 기록되는 SetRecord는 반드시 `substitutedFrom: "deadlift"`를 달아야 한다.
 * foldSupport.judgingSetsForSlot이 substitutedFrom이 있는 세트를 판정 대상에서 제외하므로,
 * 이 표시가 없으면 경량 세트가 정식 데드리프트 T1 TM 판정에 잘못 반영된다.
 *
 * (0.55 = 스펙 50~60% 범위의 중앙값. 그날 통증 정도에 따른 범위 내 조정은 세션 UI의
 * ± 스테퍼/세트 수정으로 처리 — 이 프리셋은 기본값일 뿐이다.)
 */
export function lightConventionalPreset(tmDeadlift: number, cfg: PlateConfig): PlannedSlot {
  const weight = roundToStep(0.55 * tmDeadlift, stepOf(cfg));
  const sets: PlannedSet[] = Array.from({ length: 5 }, () => ({
    weight,
    reps: 5,
    setType: "work" as const,
  }));
  const hinge = exerciseInfo("deadlift")?.hinge === true;
  const warmups: PlannedSet[] = generateWarmup(weight, { hinge, cfg }).map((w) => ({
    weight: w.weight,
    reps: w.reps,
    setType: "warmup" as const,
  }));
  return {
    slotId: "lightConventionalDeadlift",
    exerciseId: "deadlift",
    label: "T1(경량)",
    warmups,
    sets,
    missingTM: false,
    needsInit: false,
  };
}
