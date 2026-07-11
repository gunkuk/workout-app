import { describe, it, expect } from "vitest";
import { combinedT1Performance } from "../../../src/screens/home/performance";
import type { DecisionEvent, FoldInput } from "../../../src/domain/types.ts";

// UI5 T2 — performance.ts(4대 T1 리프트 TM 합계 추이) 단위 테스트. carry-forward 병합 로직이 버그
// 나기 쉬워(계획 §4번 지시) tmHistory 기반 병합만 렌더 없이 직접 검증한다.

function tmDecision(id: string, exerciseId: string, value: number, at: string): DecisionEvent {
  return { id, target: { kind: "tm", exerciseId }, kind: "manual", value, at, schemaVersion: 1 };
}

function foldInput(decisions: DecisionEvent[]): FoldInput {
  return { sets: [], corrections: [], decisions, sessions: [], programs: new Map() };
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
