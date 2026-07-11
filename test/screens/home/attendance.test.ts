import { describe, it, expect } from "vitest";
import {
  trainingWeekdays,
  buildAttendanceGrid,
  thisWeekSummary,
  type AttendanceStatus,
} from "../../../src/screens/home/attendance";
import type { ProgramDefinition, SessionCompleted, SetRecord } from "../../../src/domain/types.ts";

// UI5 T2 — attendance.ts 순수 파생 로직 단위 테스트. 날짜 버킷팅(로컬 타임존 + Monday-start 주 경계)이
// 까다로워 렌더 없이 직접 검증한다(계획 §4번 "date bucketing is fiddly" 지시).

function program(weekdayHints: (string | undefined)[]): ProgramDefinition {
  return {
    id: "p1",
    name: "테스트 프로그램",
    version: 1,
    schemaVersion: 1,
    weeks: [
      {
        days: weekdayHints.map((weekdayHint, i) => ({
          ordinal: i + 1,
          weekdayHint,
          name: `day${i + 1}`,
          slots: [],
        })),
      },
    ],
  };
}

function session(id: string, at: string, over: Partial<SessionCompleted> = {}): SessionCompleted {
  return {
    id,
    sessionId: id,
    at,
    cyclePos: { cycleIndex: 0, week: 0, dayOrdinal: 1 },
    status: "completed",
    programId: "p1",
    programVersion: 1,
    schemaVersion: 1,
    ...over,
  };
}

function setRec(id: string, completedAt: string): SetRecord {
  return {
    id,
    sessionId: "s1",
    exerciseId: "bench",
    targetWeight: 100,
    targetReps: 5,
    actualWeight: 100,
    actualReps: 5,
    completedAt,
    schemaVersion: 1,
  };
}

describe("trainingWeekdays", () => {
  it("① 프로그램의 weekdayHint들을 Monday-start 순서로 유일화해 반환", () => {
    expect(trainingWeekdays(program(["금", "화", "화", "수", "목", "토"]))).toEqual(["화", "수", "목", "금", "토"]);
  });

  it("② 프로그램 없음(undefined) → 기본값(화~토)", () => {
    expect(trainingWeekdays(undefined)).toEqual(["화", "수", "목", "금", "토"]);
  });

  it("③ weekdayHint가 하나도 없는 프로그램 → 기본값(화~토)", () => {
    expect(trainingWeekdays(program([undefined, undefined]))).toEqual(["화", "수", "목", "금", "토"]);
  });
});

describe("buildAttendanceGrid — 상태 3종", () => {
  const weekdays = ["월", "화", "수"];
  const today = new Date(2026, 6, 13); // 2026-07-13, 월요일

  it("④ 완료 세션이 있는 날 → complete", () => {
    const grid = buildAttendanceGrid([session("s1", "2026-07-14T10:00:00")], [], weekdays, today, 1);
    expect(grid.weeks[0]!.cells[1]).toBe("complete"); // 화요일(2026-07-14)
  });

  it("⑤ 세트 기록만 있고 완료 세션 없음 → partial", () => {
    const grid = buildAttendanceGrid([], [setRec("set1", "2026-07-15T10:00:00")], weekdays, today, 1);
    expect(grid.weeks[0]!.cells[2]).toBe("partial"); // 수요일(2026-07-15)
  });

  it("⑥ skipped 세션만 있음 → partial(complete 아님)", () => {
    const grid = buildAttendanceGrid(
      [session("s1", "2026-07-14T10:00:00", { status: "skipped" })],
      [],
      weekdays,
      today,
      1,
    );
    expect(grid.weeks[0]!.cells[1]).toBe("partial");
  });

  it("⑦ 아무 기록도 없는 날 → none", () => {
    const grid = buildAttendanceGrid([], [], weekdays, today, 1);
    const statuses: AttendanceStatus[] = grid.weeks[0]!.cells;
    expect(statuses).toEqual(["none", "none", "none"]);
  });

  it("⑧ 같은 날 partial(세트)이 먼저 잡혀도 완료 세션이 있으면 complete로 승격", () => {
    const grid = buildAttendanceGrid(
      [session("s1", "2026-07-14T20:00:00")],
      [setRec("set1", "2026-07-14T10:00:00")],
      weekdays,
      today,
      1,
    );
    expect(grid.weeks[0]!.cells[1]).toBe("complete");
  });
});

describe("buildAttendanceGrid — Monday-start 주 경계", () => {
  const weekdays = ["월", "화", "수", "목", "금", "토", "일"];
  // today = 2026-07-13(월). weeksCount=2 → weeks[0]=2026-07-06주, weeks[1]=2026-07-13주(당현재주).
  const today = new Date(2026, 6, 13);

  it("⑨ 일요일(2026-07-12)은 그 전 월요일(2026-07-06)이 속한 주의 마지막 칸 — Sunday-start였다면 다음 주(07-13주) 첫 칸이 됐을 것", () => {
    const grid = buildAttendanceGrid([session("s1", "2026-07-12T10:00:00")], [], weekdays, today, 2);
    expect(grid.weeks[0]!.weekStart).toBe("2026-07-06");
    expect(grid.weeks[0]!.cells[6]).toBe("complete"); // 07-06주의 "일" 칸
    expect(grid.weeks[1]!.cells[6]).toBe("none"); // 07-13주의 "일"(07-19)은 기록 없음
  });

  it("⑩ 그 다음 일요일(2026-07-19)은 현재 주(07-13주)의 마지막 칸", () => {
    const grid = buildAttendanceGrid([session("s1", "2026-07-19T10:00:00")], [], weekdays, today, 2);
    expect(grid.weeks[1]!.weekStart).toBe("2026-07-13");
    expect(grid.weeks[1]!.cells[6]).toBe("complete");
    expect(grid.weeks[0]!.cells[6]).toBe("none");
  });
});

describe("thisWeekSummary", () => {
  it("⑪ 마지막 주(이번 주) 칸 중 complete 개수/비율만 집계", () => {
    const weekdays = ["화", "수", "목", "금", "토"];
    const today = new Date(2026, 6, 11); // 2026-07-11(토)
    const grid = buildAttendanceGrid(
      [session("s1", "2026-07-07T10:00:00"), session("s2", "2026-07-08T10:00:00")], // 화,수 완료
      [],
      weekdays,
      today,
      1,
    );
    expect(thisWeekSummary(grid)).toEqual({ completed: 2, total: 5, percent: 40 });
  });

  it("⑫ 기록 없음 → 0/전체 · 0%", () => {
    const weekdays = ["화", "수", "목", "금", "토"];
    const grid = buildAttendanceGrid([], [], weekdays, new Date(2026, 6, 11), 1);
    expect(thisWeekSummary(grid)).toEqual({ completed: 0, total: 5, percent: 0 });
  });
});
