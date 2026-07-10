import Dexie from "dexie";
import { describe, it, expect } from "vitest";
import { WorkoutDB } from "../../src/storage/db";

// Stage1-C3 T4 — Dexie v2 마이그레이션: version(1) 선언은 그대로 두고 version(2).stores()엔
// externalSessions만 추가했다. 기존 v1 스키마로 실제 데이터를 써넣은 뒤 WorkoutDB(v1+v2 선언)로
// 같은 이름의 DB를 열어 업그레이드를 트리거해, 기존 테이블 데이터가 보존되는지 직접 검증한다.

describe("WorkoutDB — Dexie v2 업그레이드(Stage1-C3 T4)", () => {
  it("③ 기존 v1 데이터 보존 + externalSessions 신규 테이블 사용 가능", async () => {
    const dbName = `upgrade-test-${crypto.randomUUID()}`;

    // v1 스키마만 아는 옛 클라이언트를 흉내낸다 (db.ts 변경 전 상태와 동일한 stores()).
    const legacy = new Dexie(dbName);
    legacy.version(1).stores({
      setRecords: "id, sessionId",
      corrections: "id, supersedes",
      decisions: "id",
      sessions: "id, sessionId",
      programVersions: "_key, id",
      instanceState: "_id",
      library: "programId",
    });
    await legacy.open();
    await legacy.table("decisions").put({
      id: "d1",
      target: { kind: "tm", exerciseId: "bench" },
      kind: "seed",
      value: 100,
      at: "2026-07-10T00:00:00Z",
      schemaVersion: 1,
    });
    await legacy.table("library").put({ programId: "p1", addedAt: "2026-07-10T00:00:00Z" });
    legacy.close();

    // 같은 이름으로 v1+v2를 선언하는 현행 WorkoutDB를 열면 Dexie가 1→2 업그레이드를 수행한다.
    const upgraded = new WorkoutDB(dbName);
    await upgraded.open();

    const decisions = await upgraded.decisions.toArray();
    expect(decisions).toHaveLength(1);
    expect(decisions[0]?.id).toBe("d1");

    const library = await upgraded.library.toArray();
    expect(library).toEqual([{ programId: "p1", addedAt: "2026-07-10T00:00:00Z" }]);

    await upgraded.externalSessions.put({
      id: "e1",
      at: "2026-07-10T00:00:00Z",
      groups: ["back"],
      programId: "p1",
      cyclePos: { cycleIndex: 0, week: 0 },
    });
    expect(await upgraded.externalSessions.count()).toBe(1);

    upgraded.close();
    await Dexie.delete(dbName);
  });
});
