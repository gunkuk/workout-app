import { describe, it, expect } from "vitest";
import { combinedT1Performance, est1RM, liftSummary } from "../../../src/screens/home/performance";
import type { DecisionEvent, FoldInput, SetRecord } from "../../../src/domain/types.ts";

// UI5 T2 — performance.ts(4대 T1 리프트 TM 합계 추이) 단위 테스트. carry-forward 병합 로직이 버그
// 나기 쉬워(계획 §4번 지시) tmHistory 기반 병합만 렌더 없이 직접 검증한다.
// UI7 — est1RM(TM→추정1RM 환산)·liftSummary(TM/환산1RM/실측e1RM 커플링) 단위 테스트 추가.

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
    expect(combinedT1Performance(foldInput([]))).toEqual([]);
  });

  it("② 4개 리프트가 같은 시각에 시드 → 첫 포인트가 4개 합", () => {
    const at1 = "2026-07-01T08:00:00Z";
    const input = foldInput([
      tmDecision("d-bench", "bench", 100, at1),
      tmDecision("d-ohp", "ohp", 50, at1),
      tmDecision("d-squat", "squat", 120, at1),
      tmDecision("d-deadlift", "deadlift", 140, at1),
    ]);
    expect(combinedT1Performance(input)).toEqual([{ at: at1, value: 410 }]);
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
    expect(combinedT1Performance(input)).toEqual([
      { at: at1, value: 410 },
      { at: at2, value: 415 },
    ]);
  });

  it("④ 일부 리프트만 기록 있음 → 있는 것만 부분 합산(없는 리프트는 0 취급 안 함)", () => {
    const at1 = "2026-07-01T08:00:00Z";
    const input = foldInput([tmDecision("d-bench", "bench", 100, at1), tmDecision("d-squat", "squat", 120, at1)]);
    expect(combinedT1Performance(input)).toEqual([{ at: at1, value: 220 }]);
  });

  it("⑤ 동일 값으로 재시드(변화 없음) → tmHistory 자체 압축 계약에 따라 중복 포인트 없음", () => {
    const at1 = "2026-07-01T08:00:00Z";
    const at2 = "2026-07-08T08:00:00Z";
    const input = foldInput([
      tmDecision("d-bench-1", "bench", 100, at1),
      tmDecision("d-bench-2", "bench", 100, at2), // 동일 값 — tmHistory가 압축
    ]);
    expect(combinedT1Performance(input)).toEqual([{ at: at1, value: 100 }]);
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

  it("⑧ TM 105(벤치) → est1RM 116.7, 실측 없음 → measuredE1RM undefined", () => {
    const input = foldInput([tmDecision("d-bench", "bench", 105, at1)]);
    const rows = liftSummary(input, { bench: 105 });
    expect(rows).toEqual([
      { exerciseId: "bench", name: "벤치프레스", tm: 105, est1RM: 116.7, measuredE1RM: undefined },
    ]);
  });

  it("⑨ TM 없는 리프트는 스킵(4개 중 벤치만 tm 맵에 있으면 벤치 행만 반환)", () => {
    const input = foldInput([]);
    const rows = liftSummary(input, { bench: 100 });
    expect(rows.map((r) => r.exerciseId)).toEqual(["bench"]);
  });

  it("⑩ 실측 AMRAP topSet 존재 → measuredE1RM = 최신 e1rmSeries 값(epley)", () => {
    const input = foldInput(
      [tmDecision("d-bench", "bench", 100, at1)],
      [topSet({ id: "set-1", exerciseId: "bench", actualWeight: 100, actualReps: 3, completedAt: at1 })],
    );
    const rows = liftSummary(input, { bench: 100 });
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
    const rows = liftSummary(input, { bench: 100 });
    expect(rows[0]!.measuredE1RM).toBeUndefined();
  });
});
