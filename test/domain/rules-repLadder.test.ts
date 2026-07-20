import { describe, it, expect } from "vitest";
import { deriveRepLadderTargets, applyRepLadderSession, type RepLadderParams } from "../../src/domain/rules/repLadder";
import { foldState } from "../../src/domain/fold";
import { programKey } from "../../src/domain/foldSupport";
import type { AccessoryState, ProgramDefinition, SetRecord, SessionCompleted, FoldInput } from "../../src/domain/types.ts";

const params: RepLadderParams = { sets: 4, repMin: 5, repMax: 7, weightStep: 2.5 };

describe("deriveRepLadderTargets — 8스텝 전 구간 시퀀스 (5555→7777)", () => {
  it("총합 20~28이 사용자 확정 시퀀스와 정확히 일치", () => {
    const expected: Record<number, number[]> = {
      20: [5, 5, 5, 5], // 5555
      21: [6, 5, 5, 5], // 6555
      22: [6, 6, 5, 5], // 6655
      23: [6, 6, 6, 5], // 6665
      24: [6, 6, 6, 6], // 6666
      25: [7, 6, 6, 6], // 7666
      26: [7, 7, 6, 6], // 7766
      27: [7, 7, 7, 6], // 7776
      28: [7, 7, 7, 7], // 7777
    };
    for (const [total, targets] of Object.entries(expected)) {
      expect(deriveRepLadderTargets(Number(total), params)).toEqual(targets);
    }
  });

  it("총합↔per-set 파생 왕복 — 전 구간에서 sum(derive(total)) === total", () => {
    for (let total = 20; total <= 28; total++) {
      const targets = deriveRepLadderTargets(total, params);
      expect(targets.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
});

describe("applyRepLadderSession", () => {
  const state20: AccessoryState = { weight: 20, targetReps: 20, missStreak: 0, grace: false };

  it("전 세트 목표 달성 → 총합 +1(한 스텝 전진)", () => {
    // 총합20 → 목표 [5,5,5,5], 전부 달성
    const { state } = applyRepLadderSession(state20, [{ actualReps: 5 }, { actualReps: 5 }, { actualReps: 5 }, { actualReps: 5 }], params);
    expect(state.targetReps).toBe(21);
    expect(state.weight).toBe(20);
  });

  it("마지막 세트(AMRAP) 초과 수행해도 한 스텝만 전진(더블 스텝 없음)", () => {
    const { state } = applyRepLadderSession(state20, [{ actualReps: 5 }, { actualReps: 5 }, { actualReps: 5 }, { actualReps: 9 }], params);
    expect(state.targetReps).toBe(21);
  });

  it("한 세트라도 미달 → 그 스텝 유지(상태 불변, 재도전)", () => {
    const { state } = applyRepLadderSession(state20, [{ actualReps: 5 }, { actualReps: 5 }, { actualReps: 4 }, { actualReps: 5 }], params);
    expect(state).toEqual(state20);
  });

  it("최상단(7777, 총합28) 달성 → weight += weightStep, 총합은 바닥(20)으로 리셋", () => {
    const state28: AccessoryState = { weight: 40, targetReps: 28, missStreak: 0, grace: false };
    const { state } = applyRepLadderSession(state28, [{ actualReps: 7 }, { actualReps: 7 }, { actualReps: 7 }, { actualReps: 7 }], params);
    expect(state).toEqual({ weight: 42.5, targetReps: 20, missStreak: 0, grace: false });
  });

  it("세트 기록이 params.sets보다 적음 → 상태 불변(미완주 세션)", () => {
    const { state } = applyRepLadderSession(state20, [{ actualReps: 5 }, { actualReps: 5 }], params);
    expect(state).toEqual(state20);
  });
});

describe("repLadder — fold 부트스트랩(needsInit)", () => {
  const prog: ProgramDefinition = {
    id: "p", name: "P", version: 1, schemaVersion: 1,
    weeks: [{
      days: [{
        ordinal: 1, name: "acc day",
        slots: [{
          id: "sl-acc", exerciseId: "dumbbellRow", label: "T2",
          progressionRuleId: "repLadder", progressionParams: params,
          sets: [
            { load: { kind: "tracked" }, reps: 5 },
            { load: { kind: "tracked" }, reps: 5 },
            { load: { kind: "tracked" }, reps: 5 },
            { load: { kind: "tracked" }, reps: 5, amrapRole: "backoff" },
          ],
        }],
      }],
    }],
  };
  const programs = new Map([[programKey("p", 1), prog]]);

  function at(day: number, hh = 10): string {
    return `2026-07-${String(day).padStart(2, "0")}T${String(hh).padStart(2, "0")}:00:00Z`;
  }
  function session(id: string, day: number): SessionCompleted {
    return { id: `sc-${id}`, sessionId: id, at: at(day, 12), cyclePos: { cycleIndex: 0, week: 0, dayOrdinal: 1 }, status: "completed", programId: "p", programVersion: 1, schemaVersion: 1 };
  }
  function accSet(id: string, sessionId: string, weight: number, reps: number, minute: number): SetRecord {
    return {
      id, sessionId, slotId: "sl-acc", exerciseId: "dumbbellRow",
      targetWeight: weight, targetReps: 5, actualWeight: weight, actualReps: reps,
      completedAt: `2026-07-02T11:${String(minute).padStart(2, "0")}:00Z`, schemaVersion: 1,
    };
  }
  function input(over: Partial<FoldInput>): FoldInput {
    return { sets: [], corrections: [], decisions: [], sessions: [], programs, ...over };
  }

  it("미초기화 첫 세션 → weight는 실제 기록으로 부트스트랩, 총합은 sets*repMin(20)에서 판정(미달이면 그대로 20 유지)", () => {
    // 부트스트랩 기본 총합(20 = sets*repMin)에 대한 목표는 [5,5,5,5]. 3번째 세트가 4렙으로 미달이라
    // 같은 세션 내 판정에서도 전진하지 않고 총합 20이 그대로 드러난다(bootstrap 값 자체를 관측).
    const st = foldState(input({
      sessions: [session("a1", 2)],
      sets: [accSet("s1", "a1", 22.5, 5, 1), accSet("s2", "a1", 22.5, 5, 2), accSet("s3", "a1", 22.5, 4, 3), accSet("s4", "a1", 22.5, 5, 4)],
    }));
    expect(st.accessories["sl-acc"]).toEqual({ weight: 22.5, targetReps: 20, missStreak: 0, grace: false });
  });

  it("미초기화 첫 세션에서 전 세트 달성 → 부트스트랩과 동시에 한 스텝 전진(21)", () => {
    const st = foldState(input({
      sessions: [session("a1", 2)],
      sets: [accSet("s1", "a1", 22.5, 5, 1), accSet("s2", "a1", 22.5, 5, 2), accSet("s3", "a1", 22.5, 5, 3), accSet("s4", "a1", 22.5, 5, 4)],
    }));
    expect(st.accessories["sl-acc"]).toEqual({ weight: 22.5, targetReps: 21, missStreak: 0, grace: false });
  });
});
