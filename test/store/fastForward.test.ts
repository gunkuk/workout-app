import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { db } from "../../src/storage/db";
import { upsertProgramVersion, setInstanceState, appendDecision, loadFoldInput, appendSet } from "../../src/storage/eventStore";
import { useProgramStore } from "../../src/store/programStore";
import { rollingCyclePos, nextCyclePos } from "../../src/domain/cyclePos";
import { activeSessions } from "../../src/store/sessionRevocation";
import type { ProgramDefinition, DecisionEvent, CyclePos } from "../../src/domain/types.ts";
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

/**
 * from에서 target까지 nextCyclePos로 순회했을 때 거치는 위치 수(= fastForwardTo가 append할
 * 빈 완료 세션 수와 정확히 같다 — 프로덕션 forwardFillRecords와 동일한 순회). kk-4day.json이
 * 동시작업(컨트롤러)으로 주차 수가 바뀔 수 있어(예: 2주 → 7주 사이클) 하드코딩 대신 실제 로드한
 * program.weeks 구조에서 매번 다시 계산한다.
 */
function stepsBetween(program: ProgramDefinition, from: CyclePos, target: CyclePos): number {
  let cursor = from;
  let n = 0;
  while (!(cursor.cycleIndex === target.cycleIndex && cursor.week === target.week && cursor.dayOrdinal === target.dayOrdinal)) {
    n++;
    cursor = nextCyclePos(program, cursor);
  }
  return n;
}

beforeEach(async () => {
  await resetDb();
  useProgramStore.setState(useProgramStore.getInitialState(), true);
});

describe("programStore.fastForwardTo", () => {
  it("① 신규 전환(첫 위치)에서 {cycleIndex:1,week:0,dayOrdinal:5}로 이동 — 순회 스텝 수만큼 append, 커서가 target과 일치", async () => {
    await seedRollingOnboarded();
    await useProgramStore.getState().load();
    const start = { cycleIndex: 0, week: 0, dayOrdinal: 1 };
    expect(useProgramStore.getState().todayPos).toEqual(start);

    const target = { cycleIndex: 1, week: 0, dayOrdinal: 5 };
    await useProgramStore.getState().fastForwardTo(target);

    const input = await loadFoldInput();
    const mySessions = input.sessions.filter((s) => s.programId === seed.id);
    // 하드코딩 대신 실제 program.weeks 구조로 스텝 수를 다시 계산(kk-4day 주차 수가 동시작업으로
    // 바뀔 수 있음 — 계획 참고).
    expect(mySessions).toHaveLength(stepsBetween(seed, start, target));
    expect(mySessions.every((s) => s.status === "completed")).toBe(true);

    expect(rollingCyclePos(seed, input.sessions)).toEqual(target);
    expect(useProgramStore.getState().todayPos).toEqual(target);
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

// Stage1-UI9 — 뒤로 이동: SessionCompleted를 삭제하지 않고 CorrectionRecord(revoked:true)로
// 취소한다(설계: append-only + 백업 id-union 병합 보존, src/store/sessionRevocation.ts 참고).
describe("programStore.fastForwardTo — 뒤로 이동(Stage1-UI9)", () => {
  it("① 전진 후 후진 — db.sessions row 수는 그대로(삭제 없음), corrections가 append되고 커서는 target과 정확히 일치", async () => {
    await seedRollingOnboarded();
    await useProgramStore.getState().load();

    await useProgramStore.getState().fastForwardTo({ cycleIndex: 1, week: 0, dayOrdinal: 5 });
    const rowCountAfterForward = await db.sessions.count();
    expect(rowCountAfterForward).toBeGreaterThan(0);

    const target = { cycleIndex: 0, week: 0, dayOrdinal: 2 };
    const result = await useProgramStore.getState().fastForwardTo(target);

    // 삭제 없음 — sessions 테이블 row 수는 전진 직후와 동일(취소는 corrections 테이블에 append).
    expect(await db.sessions.count()).toBe(rowCountAfterForward);
    expect(await db.corrections.count()).toBeGreaterThan(0);
    // 전진으로 채운 세션은 전부 빈 완료(SetRecord 없음)였으므로 실제 기록 있는 세션은 0개.
    expect(result.revokedReal).toBe(0);

    expect(useProgramStore.getState().todayPos).toEqual(target);
    const input = await loadFoldInput();
    const live = activeSessions(input.sessions, input.corrections).filter((s) => s.programId === seed.id);
    expect(rollingCyclePos(seed, live)).toEqual(target);
  });

  it("② 후진 후 다시 전진 — 새 세션이 append되고(옛 세션은 revoked로 유지) 커서가 정확히 target에 도달", async () => {
    await seedRollingOnboarded();
    await useProgramStore.getState().load();

    await useProgramStore.getState().fastForwardTo({ cycleIndex: 1, week: 0, dayOrdinal: 5 });
    await useProgramStore.getState().fastForwardTo({ cycleIndex: 0, week: 0, dayOrdinal: 2 });
    const rowCountAfterBack = await db.sessions.count();

    const forwardAgain = { cycleIndex: 1, week: 0, dayOrdinal: 3 };
    await useProgramStore.getState().fastForwardTo(forwardAgain);

    // 되돌아간 위치부터 다시 새 세션들이 append됨 — row 수는 늘어난다(옛 세션은 삭제되지 않고 여전히 존재).
    expect(await db.sessions.count()).toBeGreaterThan(rowCountAfterBack);
    expect(useProgramStore.getState().todayPos).toEqual(forwardAgain);

    const input = await loadFoldInput();
    const live = activeSessions(input.sessions, input.corrections).filter((s) => s.programId === seed.id);
    expect(rollingCyclePos(seed, live)).toEqual(forwardAgain);
  });

  it("③ 실제 기록(work SetRecord)이 있던 세션을 취소 — revokedReal===1", async () => {
    await seedRollingOnboarded();
    await useProgramStore.getState().load();
    const start = useProgramStore.getState().todayPos!; // {0,0,1}

    // start 위치에 실제 세트 기록이 있는 "진짜" 완료 세션을 기록(빈 완료가 아님).
    const sessionId = `${seed.id}@${seed.version}:${start.cycleIndex}-${start.week}-${start.dayOrdinal}`;
    await appendSet({
      id: "real-set-1",
      sessionId,
      exerciseId: "squat",
      setType: "work",
      targetWeight: 100,
      targetReps: 5,
      actualWeight: 100,
      actualReps: 5,
      completedAt: "2026-07-02T09:00:00Z",
      schemaVersion: 1,
    });
    await useProgramStore.getState().completeSession({
      id: "real-session-1",
      sessionId,
      at: "2026-07-02T09:00:00Z",
      cyclePos: start,
      status: "completed",
      programId: seed.id,
      programVersion: seed.version,
      schemaVersion: 1,
    });

    const next = useProgramStore.getState().todayPos!;
    expect(next).not.toEqual(start); // 커서가 한 칸 전진했어야 뒤로 이동할 대상이 생김

    const result = await useProgramStore.getState().fastForwardTo(start);
    expect(result.revokedReal).toBe(1);
    expect(useProgramStore.getState().todayPos).toEqual(start);
  });
});
