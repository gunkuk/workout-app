import { describe, it, expect } from "vitest";
import { nextCyclePos, rollingCyclePos, calendarCyclePos, validateAnchor } from "../../src/domain/cyclePos";
import { foldState } from "../../src/domain/fold";
import { programKey } from "../../src/domain/foldSupport";
import type {
  ProgramDefinition,
  ProgramInstanceState,
  SessionCompleted,
  SetRecord,
  DecisionEvent,
  FoldInput,
} from "../../src/domain/types.ts";
import { loadSeedProgram } from "../helpers/seed";

const seed = loadSeedProgram();
const programs = new Map([[programKey(seed.id, seed.version), seed]]);

function at(day: number, hh = 10): string {
  return `2026-07-${String(day).padStart(2, "0")}T${String(hh).padStart(2, "0")}:00:00Z`;
}

function session(id: string, day: number, cyclePos: { cycleIndex: number; week: number; dayOrdinal: number }, status: "completed" | "skipped" = "completed"): SessionCompleted {
  return {
    id: `sc-${id}`,
    sessionId: id,
    at: at(day, 14),
    cyclePos,
    status,
    programId: seed.id,
    programVersion: seed.version,
    schemaVersion: 1,
  };
}

describe("cyclePos — rolling", () => {
  it("① 세션 없음 → {0,0,1}", () => {
    expect(rollingCyclePos(seed, [])).toEqual({ cycleIndex: 0, week: 0, dayOrdinal: 1 });
  });

  it("② 마지막 완료 {0,0,3} → {0,0,4}", () => {
    const sessions = [session("a", 2, { cycleIndex: 0, week: 0, dayOrdinal: 3 })];
    expect(rollingCyclePos(seed, sessions)).toEqual({ cycleIndex: 0, week: 0, dayOrdinal: 4 });
  });

  it("③ {0,0,5}(주 마지막, 1주 프로그램) → {1,0,1} (week wrap = cycle++)", () => {
    const sessions = [session("a", 2, { cycleIndex: 0, week: 0, dayOrdinal: 5 })];
    expect(rollingCyclePos(seed, sessions)).toEqual({ cycleIndex: 1, week: 0, dayOrdinal: 1 });
  });

  it("④ skipped도 커서 전진", () => {
    const sessions = [session("a", 2, { cycleIndex: 0, week: 0, dayOrdinal: 3 }, "skipped")];
    expect(rollingCyclePos(seed, sessions)).toEqual({ cycleIndex: 0, week: 0, dayOrdinal: 4 });
  });

  it("⑨ 다른 programId 세션만 있으면 무시하고 {0,0,1} (프로그램 전환 시나리오)", () => {
    const foreign: SessionCompleted = {
      id: "sc-x", sessionId: "x", at: at(2, 14),
      cyclePos: { cycleIndex: 0, week: 0, dayOrdinal: 5 },
      status: "completed", programId: "other-program", programVersion: 1, schemaVersion: 1,
    };
    expect(rollingCyclePos(seed, [foreign])).toEqual({ cycleIndex: 0, week: 0, dayOrdinal: 1 });
  });

  it("(at,id) 최대 세션 기준 — 여러 세션 중 가장 늦은 것만 사용", () => {
    const sessions = [
      session("early", 2, { cycleIndex: 0, week: 0, dayOrdinal: 1 }),
      session("late", 4, { cycleIndex: 0, week: 0, dayOrdinal: 3 }),
    ];
    expect(rollingCyclePos(seed, sessions)).toEqual({ cycleIndex: 0, week: 0, dayOrdinal: 4 });
  });
});

describe("cyclePos — nextCyclePos", () => {
  it("주 중간 → 다음 ordinal", () => {
    expect(nextCyclePos(seed, { cycleIndex: 0, week: 0, dayOrdinal: 1 })).toEqual({
      cycleIndex: 0, week: 0, dayOrdinal: 2,
    });
  });

  it("주 마지막 day → cycleIndex+1, week0 첫 day (1주 프로그램 wrap)", () => {
    expect(nextCyclePos(seed, { cycleIndex: 2, week: 0, dayOrdinal: 5 })).toEqual({
      cycleIndex: 3, week: 0, dayOrdinal: 1,
    });
  });

  // 이월 Minor #4 해소(B2-T4 리뷰): 다주 프로그램의 "같은 사이클 내 week+1 첫 day" 중간 분기 —
  // nSuns 시드가 1주짜리라 이 경로가 기존 스위트에서 한 번도 실행되지 않았다.
  it("다주 프로그램: 주 마지막 day → 같은 cycleIndex의 week+1 첫 day", () => {
    const twoWeek: typeof seed = {
      ...seed,
      weeks: [
        { days: [{ ordinal: 1, name: "w1d1", slots: [] }, { ordinal: 2, name: "w1d2", slots: [] }] },
        { days: [{ ordinal: 1, name: "w2d1", slots: [] }] },
      ],
    };
    expect(nextCyclePos(twoWeek, { cycleIndex: 0, week: 0, dayOrdinal: 2 })).toEqual({
      cycleIndex: 0, week: 1, dayOrdinal: 1,
    });
    // 마지막 주 마지막 day는 여전히 cycle wrap
    expect(nextCyclePos(twoWeek, { cycleIndex: 0, week: 1, dayOrdinal: 1 })).toEqual({
      cycleIndex: 1, week: 0, dayOrdinal: 1,
    });
  });
});

describe("cyclePos — calendar", () => {
  it("⑤ startDate 2026-07-07(화)·today 2026-07-09(목) → {0,0,3}", () => {
    const state: ProgramInstanceState = {
      programId: seed.id, programVersion: seed.version, mode: "calendar",
      anchor: { startDate: "2026-07-07" }, schemaVersion: 1,
    };
    expect(calendarCyclePos(seed, state, "2026-07-09")).toEqual({
      cycleIndex: 0, week: 0, candidateDayOrdinal: 3,
    });
  });

  it("⑥ today 2026-07-13(월) → 힌트 불일치 휴식일 → candidateDayOrdinal null", () => {
    const state: ProgramInstanceState = {
      programId: seed.id, programVersion: seed.version, mode: "calendar",
      anchor: { startDate: "2026-07-07" }, schemaVersion: 1,
    };
    expect(calendarCyclePos(seed, state, "2026-07-13")).toEqual({
      cycleIndex: 0, week: 0, candidateDayOrdinal: null,
    });
  });

  it("⑥ today 2026-07-14(화) → diffDays 7, 1주 프로그램 wrap → {cycleIndex:1, week:0, candidateDayOrdinal:1}", () => {
    const state: ProgramInstanceState = {
      programId: seed.id, programVersion: seed.version, mode: "calendar",
      anchor: { startDate: "2026-07-07" }, schemaVersion: 1,
    };
    expect(calendarCyclePos(seed, state, "2026-07-14")).toEqual({
      cycleIndex: 1, week: 0, candidateDayOrdinal: 1,
    });
  });

  it("⑦ today < startDate → notStarted", () => {
    const state: ProgramInstanceState = {
      programId: seed.id, programVersion: seed.version, mode: "calendar",
      anchor: { startDate: "2026-07-09" }, schemaVersion: 1,
    };
    expect(calendarCyclePos(seed, state, "2026-07-07")).toEqual({ notStarted: true });
  });

  it("startDate 없으면 notStarted", () => {
    const state: ProgramInstanceState = {
      programId: seed.id, programVersion: seed.version, mode: "calendar",
      anchor: {}, schemaVersion: 1,
    };
    expect(calendarCyclePos(seed, state, "2026-07-09")).toEqual({ notStarted: true });
  });
});

describe("cyclePos — validateAnchor", () => {
  it("⑧ startDate 2026-07-07(화) = 첫 day 힌트(화) → true", () => {
    const state: ProgramInstanceState = {
      programId: seed.id, programVersion: seed.version, mode: "calendar",
      anchor: { startDate: "2026-07-07" }, schemaVersion: 1,
    };
    expect(validateAnchor(seed, state)).toBe(true);
  });

  it("⑧ startDate 2026-07-08(수) ≠ 첫 day 힌트(화) → false", () => {
    const state: ProgramInstanceState = {
      programId: seed.id, programVersion: seed.version, mode: "calendar",
      anchor: { startDate: "2026-07-08" }, schemaVersion: 1,
    };
    expect(validateAnchor(seed, state)).toBe(false);
  });

  it("힌트 없는 프로그램이면 startDate 무엇이든 true", () => {
    const noHintProgram: ProgramDefinition = {
      ...seed,
      weeks: [{ days: [{ ordinal: 1, name: "day1", slots: [] }] }],
    };
    const state: ProgramInstanceState = {
      programId: seed.id, programVersion: seed.version, mode: "calendar",
      anchor: { startDate: "2026-07-08" }, schemaVersion: 1,
    };
    expect(validateAnchor(noHintProgram, state)).toBe(true);
  });
});

describe("cyclePos — ⑩ anchor 회귀: anchor 변경이 rolling·SessionCompleted.cyclePos·foldState를 건드리지 않는다", () => {
  it("startDate를 바꿔도 rolling(①~④) 결과·기록된 SessionCompleted.cyclePos·foldState 결과는 동일 (calendar 계산만 변함)", () => {
    const state: ProgramInstanceState = {
      programId: seed.id, programVersion: seed.version, mode: "calendar",
      anchor: { startDate: "2026-07-07" }, schemaVersion: 1,
    };

    // 기록된 세션 (rolling ②에 해당하는 상황)
    const recordedSessions = [session("a", 2, { cycleIndex: 0, week: 0, dayOrdinal: 3 })];
    const decisions: DecisionEvent[] = [
      { id: "d1", target: { kind: "tm", exerciseId: "deadlift" }, kind: "seed", value: 140, at: at(1), schemaVersion: 1 },
    ];
    const deadSession = session("dead", 4, { cycleIndex: 0, week: 0, dayOrdinal: 4 });
    const sets: SetRecord[] = [
      {
        id: "s1", sessionId: "dead", slotId: "w1d4-dead-t1", exerciseId: "deadlift",
        targetWeight: 133, targetReps: 1, actualWeight: 133, actualReps: 3, amrapRole: "topSet",
        completedAt: at(4, 11), schemaVersion: 1,
      },
    ];
    const foldInput: FoldInput = {
      sets, corrections: [], decisions, sessions: [deadSession], programs,
    };

    const beforeRolling1 = rollingCyclePos(seed, []);
    const beforeRolling2 = rollingCyclePos(seed, recordedSessions);
    const beforeRolling3 = rollingCyclePos(seed, [session("a", 2, { cycleIndex: 0, week: 0, dayOrdinal: 5 })]);
    const beforeRolling4 = rollingCyclePos(seed, [session("a", 2, { cycleIndex: 0, week: 0, dayOrdinal: 3 }, "skipped")]);
    const beforeFold = foldState(foldInput);
    const beforeSessionCyclePos = [...recordedSessions, deadSession].map((s) => s.cyclePos);
    const beforeCalendar = calendarCyclePos(seed, state, "2026-07-09");

    // anchor 변경
    state.anchor.startDate = "2026-07-14";

    const afterRolling1 = rollingCyclePos(seed, []);
    const afterRolling2 = rollingCyclePos(seed, recordedSessions);
    const afterRolling3 = rollingCyclePos(seed, [session("a", 2, { cycleIndex: 0, week: 0, dayOrdinal: 5 })]);
    const afterRolling4 = rollingCyclePos(seed, [session("a", 2, { cycleIndex: 0, week: 0, dayOrdinal: 3 }, "skipped")]);
    const afterFold = foldState(foldInput);
    const afterSessionCyclePos = [...recordedSessions, deadSession].map((s) => s.cyclePos);
    const afterCalendar = calendarCyclePos(seed, state, "2026-07-09");

    expect(afterRolling1).toEqual(beforeRolling1);
    expect(afterRolling2).toEqual(beforeRolling2);
    expect(afterRolling3).toEqual(beforeRolling3);
    expect(afterRolling4).toEqual(beforeRolling4);
    expect(afterFold).toEqual(beforeFold);
    expect(afterSessionCyclePos).toEqual(beforeSessionCyclePos);
    // 대조군: calendar 계산은 anchor에 실제로 민감함을 확인 (그렇지 않으면 이 회귀가 무의미)
    expect(afterCalendar).not.toEqual(beforeCalendar);
  });
});
