import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { db } from "../../src/storage/db";
import { upsertProgramVersion, setInstanceState, appendDecision, loadFoldInput } from "../../src/storage/eventStore";
import { useProgramStore } from "../../src/store/programStore";
import { rollingCyclePos } from "../../src/domain/cyclePos";
import type { ProgramDefinition, DecisionEvent } from "../../src/domain/types.ts";
import { resetDb } from "../helpers/db";

// Stage1-UI7 — programStore.fastForwardTo: 롤링 커서 fast-forward(빈 완료 세션 append)를
// kk-4day(2주 사이클, ordinal 1~5 = 월화수금토, 매 주 5일)로 순수하게 검증한다.
// TM 판정 영향(=0)까지 확인하므로 tm 시드도 포함하되, engine 세부 계산은 무관하니 최소로만.

function loadKk4day(): ProgramDefinition {
  return JSON.parse(readFileSync("programs/kk-4day.json", "utf8")) as ProgramDefinition;
}

const seed = loadKk4day();

async function seedRollingOnboarded(): Promise<void> {
  await upsertProgramVersion(seed);
  await db.library.put({ programId: seed.id, addedAt: "2026-07-01T08:00:00Z" });
  await setInstanceState({
    programId: seed.id,
    programVersion: seed.version,
    mode: "rolling",
    anchor: {},
    schemaVersion: 1,
  });
  const decisions: DecisionEvent[] = [
    {
      id: "seed-deadlift",
      target: { kind: "tm", exerciseId: "deadlift" },
      kind: "seed",
      value: 140,
      at: "2026-07-01T08:00:00Z",
      schemaVersion: 1,
    },
    {
      id: "seed-squat",
      target: { kind: "tm", exerciseId: "squat" },
      kind: "seed",
      value: 100,
      at: "2026-07-01T08:00:00Z",
      schemaVersion: 1,
    },
  ];
  for (const d of decisions) await appendDecision(d);
}

beforeEach(async () => {
  await resetDb();
  useProgramStore.setState(useProgramStore.getInitialState(), true);
});

describe("programStore.fastForwardTo", () => {
  it("① 신규 전환(첫 위치)에서 {cycleIndex:1,week:0,dayOrdinal:5}로 이동 — 정확히 14건 append, 커서가 target과 일치", async () => {
    await seedRollingOnboarded();
    await useProgramStore.getState().load();
    expect(useProgramStore.getState().todayPos).toEqual({ cycleIndex: 0, week: 0, dayOrdinal: 1 });

    await useProgramStore.getState().fastForwardTo({ cycleIndex: 1, week: 0, dayOrdinal: 5 });

    const input = await loadFoldInput();
    const mySessions = input.sessions.filter((s) => s.programId === seed.id);
    // c0w0 d1-5(5) + c0w1 d1-5(5) + c1w0 d1,2,3,4(4) = 14
    expect(mySessions).toHaveLength(14);
    expect(mySessions.every((s) => s.status === "completed")).toBe(true);

    expect(rollingCyclePos(seed, input.sessions)).toEqual({ cycleIndex: 1, week: 0, dayOrdinal: 5 });
    expect(useProgramStore.getState().todayPos).toEqual({ cycleIndex: 1, week: 0, dayOrdinal: 5 });
  });

  it("② append된 세션엔 SetRecord가 전혀 없어 판정이 빈 채로 스킵됨 — TM 불변", async () => {
    await seedRollingOnboarded();
    await useProgramStore.getState().load();
    const tmBefore = { ...useProgramStore.getState().tm };
    expect(tmBefore).toEqual({ deadlift: 140, squat: 100 });

    await useProgramStore.getState().fastForwardTo({ cycleIndex: 1, week: 0, dayOrdinal: 5 });

    expect(useProgramStore.getState().tm).toEqual(tmBefore);
  });

  it("③ target이 현재 위치와 같으면 no-op(0건 append)", async () => {
    await seedRollingOnboarded();
    await useProgramStore.getState().load();
    const current = useProgramStore.getState().todayPos!;

    await useProgramStore.getState().fastForwardTo(current);

    const input = await loadFoldInput();
    expect(input.sessions.filter((s) => s.programId === seed.id)).toHaveLength(0);
  });

  it("④ 도달 불가능한 target(dayOrdinal 99)은 throw하고 아무 것도 append하지 않는다", async () => {
    await seedRollingOnboarded();
    await useProgramStore.getState().load();

    await expect(
      useProgramStore.getState().fastForwardTo({ cycleIndex: 0, week: 0, dayOrdinal: 99 }),
    ).rejects.toThrow();

    const input = await loadFoldInput();
    expect(input.sessions.filter((s) => s.programId === seed.id)).toHaveLength(0);
  });

  it("⑤ calendar 모드에서는 throw(진행 위치 조정은 rolling 전용)", async () => {
    await seedRollingOnboarded();
    await setInstanceState({
      programId: seed.id,
      programVersion: seed.version,
      mode: "calendar",
      anchor: { startDate: "2026-07-06" },
      schemaVersion: 1,
    });
    await useProgramStore.getState().load();

    await expect(
      useProgramStore.getState().fastForwardTo({ cycleIndex: 0, week: 1, dayOrdinal: 1 }),
    ).rejects.toThrow();
  });
});
