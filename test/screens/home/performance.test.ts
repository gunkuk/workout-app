import { describe, it, expect } from "vitest";
import {
  combinedT1Performance,
  est1RM,
  liftSummary,
  programT1ExerciseIds,
  programT2ExerciseIds,
} from "../../../src/screens/home/performance";
import { computeExerciseHistory } from "../../../src/domain/exerciseHistory";
import type { DecisionEvent, FoldInput, ProgramDefinition, SetRecord } from "../../../src/domain/types.ts";

// UI5 T2 — performance.ts(T1 리프트 TM 합계 추이) 단위 테스트. carry-forward 병합 로직이 버그
// 나기 쉬워(계획 §4번 지시) tmHistory 기반 병합만 렌더 없이 직접 검증한다.
// UI7 — est1RM(TM→추정1RM 환산)·liftSummary(TM/환산1RM/실측e1RM 커플링) 단위 테스트 추가.
// UI19 — 하드코딩 T1_LIFTS 제거에 따라 combinedT1Performance/liftSummary가 exerciseIds 파라미터를
// 받게 시그니처가 바뀜(활성 프로그램에서 동적으로 뽑음). 아래 테스트들은 기존 T1 4종을 그대로
// exerciseIds로 넘겨 기존 계약을 보존하면서, programT1/T2ExerciseIds와 TM 없는 종목 처리를 추가 검증.

const T1_LIFTS = ["bench", "ohp", "squat", "deadlift"] as const;

function tmDecision(id: string, exerciseId: string, value: number, at: string): DecisionEvent {
  return { id, target: { kind: "tm", exerciseId }, kind: "manual", value, at, schemaVersion: 1 };
}

function foldInput(decisions: DecisionEvent[], sets: SetRecord[] = []): FoldInput {
  return { sets, corrections: [], decisions, sessions: [], programs: new Map() };
}

function topSet(over: Partial<SetRecord> & { id: string; exerciseId: string; completedAt: string }): SetRecord {
  return {
    sessionId: "s1",
    slotId: "sl-1",
    targetWeight: null,
    targetReps: 1,
    actualWeight: 100,
    actualReps: 1,
    amrapRole: "topSet",
    schemaVersion: 1,
    ...over,
  };
}

describe("combinedT1Performance", () => {
  it("① 기록 전혀 없음 → 빈 배열", () => {
    expect(combinedT1Performance(foldInput([]), [...T1_LIFTS])).toEqual([]);
  });

  it("② 4개 리프트가 같은 시각에 시드 → 첫 포인트가 4개 합", () => {
    const at1 = "2026-07-01T08:00:00Z";
    const input = foldInput([
      tmDecision("d-bench", "bench", 100, at1),
      tmDecision("d-ohp", "ohp", 50, at1),
      tmDecision("d-squat", "squat", 120, at1),
      tmDecision("d-deadlift", "deadlift", 140, at1),
    ]);
    expect(combinedT1Performance(input, [...T1_LIFTS])).toEqual([{ at: at1, value: 410 }]);
  });

  it("③ 이후 한 리프트만 증가 → 새 포인트는 그 변화량만 반영(나머지 carry-forward)", () => {
    const at1 = "2026-07-01T08:00:00Z";
    const at2 = "2026-07-08T08:00:00Z";
    const input = foldInput([
      tmDecision("d-bench-1", "bench", 100, at1),
      tmDecision("d-ohp-1", "ohp", 50, at1),
      tmDecision("d-squat-1", "squat", 120, at1),
      tmDecision("d-deadlift-1", "deadlift", 140, at1),
      tmDecision("d-bench-2", "bench", 105, at2), // 벤치만 +5
    ]);
    expect(combinedT1Performance(input, [...T1_LIFTS])).toEqual([
      { at: at1, value: 410 },
      { at: at2, value: 415 },
    ]);
  });

  it("④ 일부 리프트만 기록 있음 → 있는 것만 부분 합산(없는 리프트는 0 취급 안 함)", () => {
    const at1 = "2026-07-01T08:00:00Z";
    const input = foldInput([tmDecision("d-bench", "bench", 100, at1), tmDecision("d-squat", "squat", 120, at1)]);
    expect(combinedT1Performance(input, [...T1_LIFTS])).toEqual([{ at: at1, value: 220 }]);
  });

  it("⑤ 동일 값으로 재시드(변화 없음) → tmHistory 자체 압축 계약에 따라 중복 포인트 없음", () => {
    const at1 = "2026-07-01T08:00:00Z";
    const at2 = "2026-07-08T08:00:00Z";
    const input = foldInput([
      tmDecision("d-bench-1", "bench", 100, at1),
      tmDecision("d-bench-2", "bench", 100, at2), // 동일 값 — tmHistory가 압축
    ]);
    expect(combinedT1Performance(input, [...T1_LIFTS])).toEqual([{ at: at1, value: 100 }]);
  });

  it("⑫ exerciseIds가 kk-6day식(pullup 등 TM 없는 종목 포함)이어도 TM 있는 종목만 합산에 반영", () => {
    const at1 = "2026-07-01T08:00:00Z";
    const input = foldInput([tmDecision("d-ohp", "ohp", 50, at1)]);
    expect(combinedT1Performance(input, ["pullup", "ohp", "legPress", "tbarRow", "bench"])).toEqual([
      { at: at1, value: 50 },
    ]);
  });
});

describe("est1RM", () => {
  it("⑥ TM=105 → 116.7 (105/0.9 = 116.666... 소수 1자리 반올림)", () => {
    expect(est1RM(105)).toBe(116.7);
  });

  it("⑦ TM=90 → 100 (정확히 나눠떨어지는 경우)", () => {
    expect(est1RM(90)).toBe(100);
  });
});

describe("liftSummary", () => {
  const at1 = "2026-07-01T08:00:00Z";
  const emptyHistory = new Map();

  it("⑧ TM 105(벤치) → est1RM 116.7, 실측 없음 → measuredE1RM undefined", () => {
    const input = foldInput([tmDecision("d-bench", "bench", 105, at1)]);
    const rows = liftSummary(input, { bench: 105 }, ["bench"], emptyHistory);
    expect(rows).toEqual([
      { exerciseId: "bench", name: "벤치프레스", tm: 105, est1RM: 116.7, measuredE1RM: undefined },
    ]);
  });

  it("⑨ TM 없는 종목도 스킵하지 않고 행을 반환(history에 기록 없으면 bestWeight undefined)", () => {
    const input = foldInput([tmDecision("d-bench", "bench", 100, at1)]);
    const rows = liftSummary(input, { bench: 100 }, [...T1_LIFTS], emptyHistory);
    expect(rows.map((r) => r.exerciseId)).toEqual([...T1_LIFTS]);
    const benchRow = rows.find((r) => r.exerciseId === "bench")!;
    expect(benchRow.tm).toBe(100);
    const squatRow = rows.find((r) => r.exerciseId === "squat")!;
    expect(squatRow.tm).toBeUndefined();
    expect(squatRow.bestWeight).toBeUndefined();
  });

  it("⑨-2 TM 없는 종목(예: pullup) → history에 있는 bestWeight를 채운다", () => {
    const input = foldInput([]);
    const history = computeExerciseHistory([
      topSet({ id: "p1", exerciseId: "pullup", actualWeight: 20, actualReps: 5, completedAt: at1, setType: "work" }),
    ]);
    const rows = liftSummary(input, {}, ["pullup"], history);
    expect(rows).toEqual([{ exerciseId: "pullup", name: "풀업", bestWeight: 20 }]);
  });

  it("⑩ 실측 AMRAP topSet 존재 → measuredE1RM = 최신 e1rmSeries 값(epley)", () => {
    const input = foldInput(
      [tmDecision("d-bench", "bench", 100, at1)],
      [topSet({ id: "set-1", exerciseId: "bench", actualWeight: 100, actualReps: 3, completedAt: at1 })],
    );
    const rows = liftSummary(input, { bench: 100 }, ["bench"], emptyHistory);
    expect(rows[0]!.measuredE1RM).toBe(110); // epley(100,3) = 110
  });

  it("⑪ 대체 종목(substitutedFrom) 세트는 measuredE1RM에서 제외(원 종목 시리즈만 사용)", () => {
    const input = foldInput(
      [tmDecision("d-bench", "bench", 100, at1)],
      [
        topSet({
          id: "set-sub",
          exerciseId: "bench",
          actualWeight: 90,
          actualReps: 3,
          completedAt: at1,
          substitutedFrom: "cgbp",
        }),
      ],
    );
    const rows = liftSummary(input, { bench: 100 }, ["bench"], emptyHistory);
    expect(rows[0]!.measuredE1RM).toBeUndefined();
  });
});

describe("programT1ExerciseIds / programT2ExerciseIds", () => {
  function program(slotsPerDay: { label: string; exerciseId: string }[][]): ProgramDefinition {
    return {
      id: "p",
      name: "p",
      version: 1,
      schemaVersion: 1,
      weeks: [
        {
          days: slotsPerDay.map((slots, i) => ({
            ordinal: i + 1,
            name: `day${i + 1}`,
            slots: slots.map((s, j) => ({ id: `d${i}-s${j}`, exerciseId: s.exerciseId, label: s.label, sets: [] })),
          })),
        },
      ],
    };
  }

  it("kk-6day 패턴 — T1이 pullup/ohp/legPress/tbarRow/bench 순서로 등장 순 dedup", () => {
    const p = program([
      [{ label: "T1", exerciseId: "pullup" }, { label: "T2", exerciseId: "dumbbellRow" }],
      [{ label: "T1", exerciseId: "ohp" }, { label: "T2", exerciseId: "bench" }],
      [{ label: "T1", exerciseId: "legPress" }],
      [{ label: "T1", exerciseId: "tbarRow" }, { label: "T2", exerciseId: "oneArmRow" }],
      [{ label: "T1", exerciseId: "bench" }, { label: "T2", exerciseId: "cgbp" }],
    ]);
    expect(programT1ExerciseIds(p)).toEqual(["pullup", "ohp", "legPress", "tbarRow", "bench"]);
    expect(programT2ExerciseIds(p)).toEqual(["dumbbellRow", "bench", "oneArmRow", "cgbp"]);
  });

  it("같은 종목이 여러 요일에 T1으로 나와도 1번만 반환", () => {
    const p = program([
      [{ label: "T1", exerciseId: "bench" }],
      [{ label: "T1", exerciseId: "bench" }],
    ]);
    expect(programT1ExerciseIds(p)).toEqual(["bench"]);
  });
});
