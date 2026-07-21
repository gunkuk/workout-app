import { describe, it, expect } from "vitest";
import { estimateOneRM, detectPr } from "../../src/domain/prDetection";
import type { SetRecord } from "../../src/domain/types.ts";

function set(over: Partial<SetRecord> = {}): SetRecord {
  return {
    id: "s1",
    sessionId: "sess1",
    exerciseId: "bench",
    setType: "work",
    targetWeight: 100,
    targetReps: 5,
    actualWeight: 100,
    actualReps: 5,
    completedAt: "2026-07-10T10:00:00Z",
    schemaVersion: 1,
    ...over,
  };
}

describe("estimateOneRM (Epley)", () => {
  it("① weight*(1+reps/30)", () => {
    expect(estimateOneRM(100, 5)).toBeCloseTo(116.6667, 3);
    expect(estimateOneRM(100, 0)).toBe(100);
    expect(estimateOneRM(60, 30)).toBe(120);
  });
});

describe("detectPr", () => {
  it("② 기록이 아예 없던 운동의 첫 세트 — 1RM PR도 볼륨 PR도 true", () => {
    const completed = set({ id: "new", sessionId: "sess1", actualWeight: 100, actualReps: 5, completedAt: "2026-07-10T10:00:00Z" });
    const result = detectPr([], completed);
    expect(result.isOneRmPr).toBe(true);
    expect(result.isVolumePr).toBe(true);
  });

  it("③ 이전 세트보다 무게·렙 모두 낮음 — 1RM PR 아님, 같은 세션 볼륨은 그래도 늘어나므로 볼륨 PR일 수 있음", () => {
    const prior = set({ id: "prior1", sessionId: "sess-prev", actualWeight: 100, actualReps: 5, completedAt: "2026-07-01T10:00:00Z" });
    const completed = set({ id: "new", sessionId: "sess1", actualWeight: 80, actualReps: 3, completedAt: "2026-07-10T10:00:00Z" });
    const result = detectPr([prior], completed);
    expect(result.isOneRmPr).toBe(false);
    // 이번 세션 볼륨(240) < 과거 세션 볼륨(500) → 볼륨 PR도 아님
    expect(result.isVolumePr).toBe(false);
  });

  it("④ 이전 최고 1RM과 정확히 동률 — PR 아님(동률은 신기록 아님)", () => {
    const prior = set({ id: "prior1", sessionId: "sess-prev", actualWeight: 100, actualReps: 5, completedAt: "2026-07-01T10:00:00Z" });
    const completed = set({ id: "new", sessionId: "sess1", actualWeight: 100, actualReps: 5, completedAt: "2026-07-10T10:00:00Z" });
    const result = detectPr([prior], completed);
    expect(result.isOneRmPr).toBe(false);
  });

  it("⑤ 이전 최고보다 무게가 더 무거움 — 1RM PR", () => {
    const prior = set({ id: "prior1", sessionId: "sess-prev", actualWeight: 100, actualReps: 5, completedAt: "2026-07-01T10:00:00Z" });
    const completed = set({ id: "new", sessionId: "sess1", actualWeight: 102.5, actualReps: 5, completedAt: "2026-07-10T10:00:00Z" });
    const result = detectPr([prior], completed);
    expect(result.isOneRmPr).toBe(true);
  });

  it("⑥ 같은 세션 내 여러 세트 누적 — 세션 볼륨이 과거 세션 최대치를 넘으면 볼륨 PR", () => {
    const prevSession = set({ id: "p1", sessionId: "sess-prev", actualWeight: 100, actualReps: 5, completedAt: "2026-07-01T10:00:00Z" }); // 500
    const thisSet1 = set({ id: "t1", sessionId: "sess1", actualWeight: 100, actualReps: 5, completedAt: "2026-07-10T10:00:00Z" }); // 500
    const thisSet2 = set({ id: "t2", sessionId: "sess1", actualWeight: 100, actualReps: 5, completedAt: "2026-07-10T10:05:00Z" }); // +500=1000

    // t1 완료 시점 — 이번 세션 누적 500, 과거 세션 500 → 동률이라 PR 아님.
    const r1 = detectPr([prevSession], thisSet1);
    expect(r1.isVolumePr).toBe(false);

    // t2 완료 시점 — history에 t1이 이미 반영, 이번 세션 누적 1000 > 과거 500 → 볼륨 PR.
    const r2 = detectPr([prevSession, thisSet1], thisSet2);
    expect(r2.isVolumePr).toBe(true);
  });

  it("⑦ 워밍업 세트는 history/completedSet 판정에서 제외(setType==='warmup'인 history 항목 무시)", () => {
    // 워밍업으로 아무리 무거운 무게를 들어도(비현실적이지만) 1RM PR 산정에 영향 없어야 함.
    const warmup = set({ id: "w1", sessionId: "sess-prev", setType: "warmup", actualWeight: 999, actualReps: 10, completedAt: "2026-07-01T10:00:00Z" });
    const completed = set({ id: "new", sessionId: "sess1", actualWeight: 100, actualReps: 5, completedAt: "2026-07-10T10:00:00Z" });
    const result = detectPr([warmup], completed);
    expect(result.isOneRmPr).toBe(true); // warmup 제외되어 이전 기록 없음 취급
  });

  it("⑧ completedSet 자기 자신이 history에 포함돼 있어도 이전 기록 비교에서 제외(동률 오탐 방지)", () => {
    const completed = set({ id: "new", sessionId: "sess1", actualWeight: 100, actualReps: 5, completedAt: "2026-07-10T10:00:00Z" });
    // history에 완전히 동일한 레코드(자기 자신)가 섞여 들어와도 비교 대상에서 제외되어야 정상 PR 판정(첫 기록이므로 true).
    const result = detectPr([completed], completed);
    expect(result.isOneRmPr).toBe(true);
    expect(result.isVolumePr).toBe(true);
  });
});
