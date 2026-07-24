import { describe, it, expect } from "vitest";
import { computeExerciseHistory } from "../../src/domain/exerciseHistory";
import type { SetRecord } from "../../src/domain/types.ts";

// Stage1-UI19 — computeExerciseHistory: 종목별 "최고 무게/볼륨을 처음 세운 시점" 인덱스.
// domain/prDetection.ts(세트 완료 시점 실시간 PR 1건 판정)와는 목적이 다른 별개 파일 — 개념
// 유사성 때문에 합치지 말라는 지시에 따라 여기 테스트도 독립적으로 둔다.

function set(over: Partial<SetRecord> & { id: string; exerciseId: string; completedAt: string }): SetRecord {
  return {
    sessionId: "s1",
    setType: "work",
    targetWeight: null,
    targetReps: 5,
    actualWeight: 100,
    actualReps: 5,
    schemaVersion: 1,
    ...over,
  };
}

describe("computeExerciseHistory", () => {
  it("① 빈 입력 → 빈 맵", () => {
    expect(computeExerciseHistory([]).size).toBe(0);
  });

  it("② 단일 세트 → bestWeight/bestWeightAt = 그 세트, bestVolume = weight*reps", () => {
    const s = set({ id: "s1", exerciseId: "bench", actualWeight: 100, actualReps: 5, completedAt: "2026-07-01T08:00:00Z" });
    const history = computeExerciseHistory([s]);
    const e = history.get("bench")!;
    expect(e.bestWeight).toBe(100);
    expect(e.bestWeightAt).toBe("2026-07-01T08:00:00Z");
    expect(e.bestVolume).toBe(500);
    expect(e.bestVolumeAt).toBe("2026-07-01T08:00:00Z");
  });

  it("③ 이후 더 무거운 무게 → bestWeight/bestWeightAt 갱신", () => {
    const s1 = set({ id: "s1", exerciseId: "bench", actualWeight: 100, actualReps: 5, completedAt: "2026-07-01T08:00:00Z" });
    const s2 = set({ id: "s2", exerciseId: "bench", actualWeight: 110, actualReps: 3, completedAt: "2026-07-08T08:00:00Z" });
    const history = computeExerciseHistory([s1, s2]);
    const e = history.get("bench")!;
    expect(e.bestWeight).toBe(110);
    expect(e.bestWeightAt).toBe("2026-07-08T08:00:00Z");
  });

  it("④ 동률(같은 무게 반복) → bestWeightAt은 최초 달성 날짜 그대로(갱신 안 됨)", () => {
    const s1 = set({ id: "s1", exerciseId: "bench", actualWeight: 100, actualReps: 5, completedAt: "2026-07-01T08:00:00Z" });
    const s2 = set({ id: "s2", exerciseId: "bench", actualWeight: 100, actualReps: 5, completedAt: "2026-07-08T08:00:00Z" });
    const history = computeExerciseHistory([s1, s2]);
    const e = history.get("bench")!;
    expect(e.bestWeight).toBe(100);
    expect(e.bestWeightAt).toBe("2026-07-01T08:00:00Z"); // 갱신되지 않음
  });

  it("⑤ 더 낮은 무게가 나중에 와도 bestWeight/bestWeightAt은 그대로", () => {
    const s1 = set({ id: "s1", exerciseId: "bench", actualWeight: 100, actualReps: 5, completedAt: "2026-07-01T08:00:00Z" });
    const s2 = set({ id: "s2", exerciseId: "bench", actualWeight: 90, actualReps: 5, completedAt: "2026-07-08T08:00:00Z" });
    const history = computeExerciseHistory([s1, s2]);
    const e = history.get("bench")!;
    expect(e.bestWeight).toBe(100);
    expect(e.bestWeightAt).toBe("2026-07-01T08:00:00Z");
  });

  it("⑥ 볼륨은 세션 내 work 세트 합산 — 같은 세션 여러 세트의 합이 다른 세션 단일 세트보다 크면 그 세션이 최고", () => {
    const s1 = set({ id: "s1", sessionId: "sess-a", exerciseId: "bench", actualWeight: 100, actualReps: 5, completedAt: "2026-07-01T08:00:00Z" }); // 500
    const s2 = set({ id: "s2", sessionId: "sess-a", exerciseId: "bench", actualWeight: 100, actualReps: 5, completedAt: "2026-07-01T08:05:00Z" }); // +500 = 1000
    const s3 = set({ id: "s3", sessionId: "sess-b", exerciseId: "bench", actualWeight: 120, actualReps: 5, completedAt: "2026-07-08T08:00:00Z" }); // 600
    const history = computeExerciseHistory([s1, s2, s3]);
    const e = history.get("bench")!;
    expect(e.bestVolume).toBe(1000);
    expect(e.bestVolumeAt).toBe("2026-07-01T08:05:00Z"); // 세션 합이 1000을 처음 넘은(도달한) 시점
  });

  it("⑦ 볼륨 동률 → bestVolumeAt은 최초 세션 시점 그대로(갱신 안 됨)", () => {
    const s1 = set({ id: "s1", sessionId: "sess-a", exerciseId: "bench", actualWeight: 100, actualReps: 5, completedAt: "2026-07-01T08:00:00Z" }); // vol 500
    const s2 = set({ id: "s2", sessionId: "sess-b", exerciseId: "bench", actualWeight: 100, actualReps: 5, completedAt: "2026-07-08T08:00:00Z" }); // vol 500, 동률
    const history = computeExerciseHistory([s1, s2]);
    const e = history.get("bench")!;
    expect(e.bestVolume).toBe(500);
    expect(e.bestVolumeAt).toBe("2026-07-01T08:00:00Z");
  });

  it("⑧ 여러 종목 — exerciseId별로 독립 집계", () => {
    const s1 = set({ id: "s1", exerciseId: "bench", actualWeight: 100, actualReps: 5, completedAt: "2026-07-01T08:00:00Z" });
    const s2 = set({ id: "s2", exerciseId: "pullup", actualWeight: 20, actualReps: 8, completedAt: "2026-07-01T08:10:00Z" });
    const history = computeExerciseHistory([s1, s2]);
    expect(history.get("bench")!.bestWeight).toBe(100);
    expect(history.get("pullup")!.bestWeight).toBe(20);
  });

  it("⑨ completedAt이 뒤섞여 들어와도(오름차순 아님) 내부에서 정렬 후 처리", () => {
    const later = set({ id: "s2", exerciseId: "bench", actualWeight: 110, actualReps: 3, completedAt: "2026-07-08T08:00:00Z" });
    const earlier = set({ id: "s1", exerciseId: "bench", actualWeight: 100, actualReps: 5, completedAt: "2026-07-01T08:00:00Z" });
    const history = computeExerciseHistory([later, earlier]);
    const e = history.get("bench")!;
    expect(e.bestWeight).toBe(110);
    expect(e.bestWeightAt).toBe("2026-07-08T08:00:00Z");
  });
});
