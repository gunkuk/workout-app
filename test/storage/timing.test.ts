import { describe, it, expect, beforeEach } from "vitest";
import {
  startActivitySegment,
  endActivitySegment,
  listActivitySegments,
  upsertSetTiming,
  listSetTimings,
} from "../../src/storage/eventStore";
import { useProgramStore } from "../../src/store/programStore";
import type { ActivitySegment, SetTiming } from "../../src/storage/trackingTypes";
import { resetDb } from "../helpers/db";

// UI11 — 활동 구간 타이머(storage 레이어 CRUD) + 세트 소요시간(storage 레이어 CRUD) +
// "동시 1개만 진행" 규칙(programStore.startActivity, store 레이어 오케스트레이션).
// fold 입력 밖(§설계원칙 동결 유지)이므로 loadFoldInput/fold 관련 검증은 없음.

function segment(id: string, over: Partial<ActivitySegment> = {}): ActivitySegment {
  return { id, kind: "stretch", startedAt: "2026-07-10T09:00:00Z", schemaVersion: 1, ...over };
}

function timing(id: string, over: Partial<SetTiming> = {}): SetTiming {
  return {
    id,
    sessionId: "s1",
    durationSec: 90,
    startedAt: "2026-07-10T09:00:00Z",
    endedAt: "2026-07-10T09:01:30Z",
    schemaVersion: 1,
    ...over,
  };
}

beforeEach(async () => {
  await resetDb();
  useProgramStore.setState(useProgramStore.getInitialState(), true);
});

describe("timing — ActivitySegment storage CRUD", () => {
  it("① startActivitySegment → listActivitySegments에 반영(진행 중, endedAt 없음)", async () => {
    const seg = segment("seg1");
    await startActivitySegment(seg);
    const [got] = await listActivitySegments();
    expect(got).toEqual(seg);
    expect(got?.endedAt).toBeUndefined();
  });

  it("② endActivitySegment → endedAt·durationSec만 갱신, 나머지 필드 보존", async () => {
    await startActivitySegment(segment("seg1", { kind: "workout", sessionId: "s1" }));
    await endActivitySegment("seg1", "2026-07-10T09:10:00Z", 600);

    const [got] = await listActivitySegments();
    expect(got?.endedAt).toBe("2026-07-10T09:10:00Z");
    expect(got?.durationSec).toBe(600);
    expect(got?.kind).toBe("workout");
    expect(got?.sessionId).toBe("s1");
    expect(got?.startedAt).toBe("2026-07-10T09:00:00Z");
  });

  it("③ listActivitySegments(sessionId) — 해당 세션 것만 필터링", async () => {
    await startActivitySegment(segment("seg1", { sessionId: "s1" }));
    await startActivitySegment(segment("seg2", { sessionId: "s2" }));
    await startActivitySegment(segment("seg3")); // 독립 기록(sessionId 없음)

    const s1Only = await listActivitySegments("s1");
    expect(s1Only.map((s) => s.id)).toEqual(["seg1"]);
  });

  it("④ list ordering — startedAt 오름차순 반환", async () => {
    await startActivitySegment(segment("late", { startedAt: "2026-07-10T09:00:00Z" }));
    await startActivitySegment(segment("early", { startedAt: "2026-07-01T09:00:00Z" }));

    const ids = (await listActivitySegments()).map((s) => s.id);
    expect(ids).toEqual(["early", "late"]);
  });
});

describe("timing — programStore.startActivity: 동시 1개만 진행 규칙", () => {
  it("⑤ 진행 중인 구간이 없으면 그냥 새 구간 시작", async () => {
    await useProgramStore.getState().startActivity(segment("seg1", { kind: "stretch" }));
    const all = await listActivitySegments();
    expect(all).toHaveLength(1);
    expect(all[0]?.endedAt).toBeUndefined();
  });

  it("⑥ 진행 중인 구간이 있으면 새 kind 시작 시 자동 종료(endedAt = 새 구간의 startedAt, 공백 없음)", async () => {
    await useProgramStore
      .getState()
      .startActivity(segment("seg1", { kind: "stretch", startedAt: "2026-07-10T09:00:00Z" }));

    await useProgramStore
      .getState()
      .startActivity(segment("seg2", { kind: "workout", startedAt: "2026-07-10T09:05:00Z" }));

    const all = await listActivitySegments();
    const seg1 = all.find((s) => s.id === "seg1")!;
    const seg2 = all.find((s) => s.id === "seg2")!;
    expect(seg1.endedAt).toBe("2026-07-10T09:05:00Z");
    expect(seg1.durationSec).toBe(300); // 5분
    expect(seg2.endedAt).toBeUndefined();

    // 정확히 1개만 진행 중이어야 함(불변조건).
    const runningCount = all.filter((s) => s.endedAt === undefined).length;
    expect(runningCount).toBe(1);
  });

  it("⑦ endActivity → endedAt·durationSec 갱신(진행 중이던 구간이 명시적으로 종료됨)", async () => {
    await useProgramStore.getState().startActivity(segment("seg1", { startedAt: "2026-07-10T09:00:00Z" }));
    await useProgramStore.getState().endActivity("seg1", "2026-07-10T09:20:00Z", 1200);

    const [got] = await listActivitySegments();
    expect(got?.endedAt).toBe("2026-07-10T09:20:00Z");
    expect(got?.durationSec).toBe(1200);
  });
});

describe("timing — SetTiming storage CRUD", () => {
  it("⑧ upsertSetTiming → listSetTimings에 반영, 같은 id로 재upsert 시 덮어씀(1:1)", async () => {
    await upsertSetTiming(timing("set1", { durationSec: 90 }));
    let [got] = await listSetTimings();
    expect(got?.durationSec).toBe(90);

    await upsertSetTiming(timing("set1", { durationSec: 120 }));
    const all = await listSetTimings();
    expect(all).toHaveLength(1);
    [got] = all;
    expect(got?.durationSec).toBe(120);
  });

  it("⑨ programStore.recordSetTiming → db에 동일하게 기록됨", async () => {
    await useProgramStore.getState().recordSetTiming(timing("set1"));
    expect(await listSetTimings()).toEqual([timing("set1")]);
  });

  it("⑩ listSetTimings(sessionId) — 해당 세션 것만 필터링", async () => {
    await upsertSetTiming(timing("t1", { sessionId: "s1" }));
    await upsertSetTiming(timing("t2", { sessionId: "s2" }));

    const s1Only = await listSetTimings("s1");
    expect(s1Only.map((t) => t.id)).toEqual(["t1"]);
  });
});
