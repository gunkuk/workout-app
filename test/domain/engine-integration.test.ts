import { describe, it, expect } from "vitest";
import { buildWorkoutPlan, type PlannedSet } from "../../src/domain/programEngine";
import { foldState } from "../../src/domain/fold";
import { weeklyAnalysis } from "../../src/domain/analytics";
import { DEFAULT_PLATES, roundToStep, stepOf } from "../../src/domain/plates";
import { programKey } from "../../src/domain/foldSupport";
import type { SetRecord, DecisionEvent, SessionCompleted } from "../../src/domain/types.ts";
import { loadSeedProgram } from "../helpers/seed";

// Task 8 — nSuns 통합 오라클: buildWorkoutPlan(엔진) → SetRecord[] 기록 → foldState(fold) →
// weeklyAnalysis(분석) 접합 경로를 시드 프로그램 하나로 전수 검증한다 (순수 테스트, 새 도메인 모듈 없음).

const seed = loadSeedProgram();
const programs = new Map([[programKey(seed.id, seed.version), seed]]);

const TM = { bench: 105, ohp: 67.5, squat: 85, deadlift: 140 };

function at(day: number, hh: number, mm = 0): string {
  return `2026-07-${String(day).padStart(2, "0")}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`;
}

// TM 시드 — foldState가 소비하는 DecisionEvent(kind: "seed"), fixture의 4개 운동 전부.
const seedDecisions: DecisionEvent[] = (["bench", "ohp", "squat", "deadlift"] as const).map((exerciseId) => ({
  id: `seed-${exerciseId}`,
  target: { kind: "tm", exerciseId },
  kind: "seed",
  value: TM[exerciseId],
  at: at(1, 8),
  schemaVersion: 1,
}));

function sessionCompleted(id: string, day: number, dayOrdinal: number): SessionCompleted {
  return {
    id: `sc-${id}`,
    sessionId: id,
    at: at(day, 14),
    cyclePos: { cycleIndex: 0, week: 0, dayOrdinal },
    status: "completed",
    programId: seed.id,
    programVersion: seed.version,
    schemaVersion: 1,
  };
}

/**
 * PlannedSet[] (엔진 출력, warmup 또는 work) → SetRecord[] (기록 입력).
 * actualWeight/targetWeight = plan weight 그대로. actualReps = plan reps(target 완주) 기본,
 * `actualRepsOverride`로 특정 인덱스만 다르게(예: topSet 실제 렙) 덮어쓴다.
 * completedAt은 hourBase 시부터 인덱스 순 분 단위로 증가 — fold/analytics의 completedAt 정렬 오라클 보존.
 */
function toSetRecords(
  sessionId: string,
  slotId: string,
  exerciseId: string,
  day: number,
  hourBase: number,
  plannedSets: PlannedSet[],
  actualRepsOverride: Record<number, number> = {}
): SetRecord[] {
  return plannedSets.map((s, i) => {
    if (s.weight === null) throw new Error(`계획 무게 null — TM 미시드 fixture 오류 (idx ${i})`);
    return {
      id: `${sessionId}-${slotId}-${s.setType}-${i}`,
      sessionId,
      slotId,
      exerciseId,
      setType: s.setType,
      targetWeight: s.weight,
      targetReps: s.reps,
      actualWeight: s.weight,
      actualReps: actualRepsOverride[i] ?? s.reps,
      amrapRole: s.amrapRole,
      completedAt: at(day, hourBase, i),
      schemaVersion: 1,
    };
  });
}

describe("Task 8 — nSuns 통합 오라클 (엔진×fold×분석 접합)", () => {
  const day4Pos = { cycleIndex: 0, week: 0, dayOrdinal: 4 }; // 금요일 — 데드리프트 T1
  const day1Pos = { cycleIndex: 0, week: 0, dayOrdinal: 1 }; // 화요일 — 벤치 volume(rule 없음)

  it("① 금요일 데드 T1 풀 세션: topSet 3렙(actualReps 오버라이드) → TM 140→145 → 다음 플랜 첫 세트 재계산", () => {
    const plan = buildWorkoutPlan(seed, day4Pos, TM, {}, DEFAULT_PLATES);
    expect(plan).not.toBeNull();
    const deadSlot = plan!.slots.find((s) => s.slotId === "w1d4-dead-t1")!;
    expect(deadSlot.sets).toHaveLength(9);
    // UI15 item1 — 3단계 램프(힌지, 88%컷 없음)의 1단계가 2세트 반복되어 4줄.
    expect(deadSlot.warmups).toHaveLength(4);

    const topSetIdx = deadSlot.sets.findIndex((s) => s.amrapRole === "topSet");
    expect(topSetIdx).toBe(2); // 시드 §w1d4-dead-t1: 3번째 세트가 topSet

    // 계획 그대로(무게=plan weight) + topSet만 actualReps=3 (plan target은 1) → nsunsTopSet auto +5 트리거
    const workRecords = toSetRecords("fri", deadSlot.slotId, "deadlift", 4, 10, deadSlot.sets, { [topSetIdx]: 3 });
    const warmupRecords = toSetRecords("fri", deadSlot.slotId, "deadlift", 4, 9, deadSlot.warmups);
    const sets = [...warmupRecords, ...workRecords];

    const st = foldState({
      sets,
      corrections: [],
      decisions: seedDecisions,
      sessions: [sessionCompleted("fri", 4, 4)],
      programs,
    });

    expect(st.tm["deadlift"]).toBe(145);
    expect(st.pendingProposals).toHaveLength(0);

    // 다음 주 plan 재계산 — 새 TM(145) 기준 첫 작업세트(pct 0.75) 무게 오라클
    const newTM = { ...TM, deadlift: st.tm["deadlift"]! };
    const nextPlan = buildWorkoutPlan(seed, day4Pos, newTM, {}, DEFAULT_PLATES);
    const nextDeadSlot = nextPlan!.slots.find((s) => s.slotId === "w1d4-dead-t1")!;
    const nextFirstSet = nextDeadSlot.sets[0]!;
    expect(nextFirstSet.weight).toBe(roundToStep(0.75 * 145, stepOf(DEFAULT_PLATES)));
    expect(nextFirstSet.weight).toBe(110); // 108.75 → 43.5 → half-up 44 → 110
  });

  it("② 워밍업(setType warmup) 세트는 fold 판정에 무영향 — 포함 vs 미포함 동일 결과", () => {
    const plan = buildWorkoutPlan(seed, day4Pos, TM, {}, DEFAULT_PLATES)!;
    const deadSlot = plan.slots.find((s) => s.slotId === "w1d4-dead-t1")!;
    const topSetIdx = deadSlot.sets.findIndex((s) => s.amrapRole === "topSet");

    const workRecords = toSetRecords("fri", deadSlot.slotId, "deadlift", 4, 10, deadSlot.sets, { [topSetIdx]: 3 });
    const warmupRecords = toSetRecords("fri", deadSlot.slotId, "deadlift", 4, 9, deadSlot.warmups);

    const session = sessionCompleted("fri", 4, 4);
    const baseInput = { corrections: [], decisions: seedDecisions, sessions: [session], programs };

    const withWarmups = foldState({ ...baseInput, sets: [...warmupRecords, ...workRecords] });
    const withoutWarmups = foldState({ ...baseInput, sets: workRecords });

    expect(withWarmups.tm["deadlift"]).toBe(145);
    expect(withoutWarmups.tm["deadlift"]).toBe(145);
    expect(withWarmups.tm).toEqual(withoutWarmups.tm);
  });

  it("③ 벤치 day1(volume, progressionRuleId 없음) 완주 → TM 불변 — B1 동작의 엔진 경유 재확인", () => {
    const plan = buildWorkoutPlan(seed, day1Pos, TM, {}, DEFAULT_PLATES)!;
    const benchSlot = plan.slots.find((s) => s.slotId === "w1d1-bench-t1")!;
    expect(benchSlot.sets).toHaveLength(9);
    expect(benchSlot.sets.some((s) => s.amrapRole === "topSet")).toBe(false);

    const workRecords = toSetRecords("tue", benchSlot.slotId, "bench", 1, 10, benchSlot.sets);

    const st = foldState({
      sets: workRecords,
      corrections: [],
      decisions: seedDecisions,
      sessions: [sessionCompleted("tue", 1, 1)],
      programs,
    });

    expect(st.tm["bench"]).toBe(105);
  });

  it("④ analytics: ①의 세션 → hamstrings validSets ≥ 3, 워밍업은 톤수 미포함", () => {
    const plan = buildWorkoutPlan(seed, day4Pos, TM, {}, DEFAULT_PLATES)!;
    const deadSlot = plan.slots.find((s) => s.slotId === "w1d4-dead-t1")!;
    const topSetIdx = deadSlot.sets.findIndex((s) => s.amrapRole === "topSet");

    const workRecords = toSetRecords("fri", deadSlot.slotId, "deadlift", 4, 10, deadSlot.sets, { [topSetIdx]: 3 });
    const warmupRecords = toSetRecords("fri", deadSlot.slotId, "deadlift", 4, 9, deadSlot.warmups);
    const sets = [...warmupRecords, ...workRecords];

    const buckets = weeklyAnalysis({
      sets,
      corrections: [],
      sessions: [sessionCompleted("fri", 4, 4)],
      programs,
    });

    const bucket = buckets.find((b) => b.programId === seed.id && b.cycleIndex === 0 && b.week === 0)!;
    expect(bucket).toBeDefined();
    const hamstrings = bucket.groups.hamstrings!;
    expect(hamstrings.validSets).toBeGreaterThanOrEqual(3); // topSet + backoff(amrapRole) + pct 0.90 세트

    // 워밍업 톤수 미포함 — 직접 계산한 "워크 세트만의 톤수"와 정확히 일치해야 함
    // (워밍업 3세트는 무게가 60/72.5/92.5로 워크 세트와 겹치지 않으므로, 새어 들어갔다면 값이 달라진다).
    const workOnlyTonnage = workRecords.reduce((sum, s) => sum + s.actualWeight * s.actualReps, 0);
    expect(hamstrings.tonnage).toBe(workOnlyTonnage);
  });
});
