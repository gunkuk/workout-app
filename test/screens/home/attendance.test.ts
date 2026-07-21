import { describe, it, expect } from "vitest";
import { trainingWeekdays, buildMonthGrid, monthSummary } from "../../../src/screens/home/attendance";
import type { ProgramDefinition, SessionCompleted, SetRecord } from "../../../src/domain/types.ts";

// UI5 T2 — attendance.ts 순수 파생 로직 단위 테스트. 날짜 버킷팅(로컬 타임존 + Monday-start 주 경계)이
// 까다로워 렌더 없이 직접 검증한다(계획 §4번 "date bucketing is fiddly" 지시).
// UI14 item5 — 주간/4주 스트립 buildAttendanceGrid/thisWeekSummary를 월간 달력 buildMonthGrid/
// monthSummary로 교체(유일한 호출부인 HomeScreen도 함께 이관). 이 파일도 새 API로 전면 재작성.

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

describe("buildMonthGrid — 요일 열 고정 + 이번 달 범위", () => {
  const weekdays = ["월", "화", "수", "목", "금"]; // 토·일은 훈련일 아님(off)
  const today = new Date(2026, 6, 13); // 2026-07-13(월) — 2026-07은 1일이 수요일

  it("④ 항상 월~일 7열 고정(프로그램의 훈련요일과 무관)", () => {
    const grid = buildMonthGrid([], [], weekdays, today);
    expect(grid.weekdayLabels).toEqual(["월", "화", "수", "목", "금", "토", "일"]);
    for (const week of grid.weeks) expect(week).toHaveLength(7);
  });

  it("⑤ 이번 달 첫 주 앞쪽(2026-07-01은 수요일) — 월·화 칸은 6월(이전 달)이라 패딩(date:null)", () => {
    const grid = buildMonthGrid([], [], weekdays, today);
    const firstWeek = grid.weeks[0]!;
    expect(firstWeek[0]!.date).toBeNull(); // 월(06-29)
    expect(firstWeek[1]!.date).toBeNull(); // 화(06-30)
    expect(firstWeek[2]!.date).toBe("2026-07-01"); // 수 — 이번 달 첫날
  });

  it("⑥ 완료 세션이 있는 날 → complete", () => {
    const grid = buildMonthGrid([session("s1", "2026-07-14T10:00:00")], [], weekdays, today);
    const cell = grid.weeks.flat().find((c) => c.date === "2026-07-14")!;
    expect(cell.status).toBe("complete");
  });

  it("⑦ 세트 기록만 있고 완료 세션 없음 → partial", () => {
    const grid = buildMonthGrid([], [setRec("set1", "2026-07-15T10:00:00")], weekdays, today);
    const cell = grid.weeks.flat().find((c) => c.date === "2026-07-15")!;
    expect(cell.status).toBe("partial");
  });

  it("⑧ 기록 없고 훈련일(월~금)이면 → none", () => {
    const grid = buildMonthGrid([], [], weekdays, today);
    const cell = grid.weeks.flat().find((c) => c.date === "2026-07-16")!; // 목요일
    expect(cell.status).toBe("none");
  });

  it("⑨ 기록 없고 훈련일 아님(토·일)이면 → off", () => {
    const grid = buildMonthGrid([], [], weekdays, today);
    const sat = grid.weeks.flat().find((c) => c.date === "2026-07-18")!; // 토요일
    const sun = grid.weeks.flat().find((c) => c.date === "2026-07-19")!; // 일요일
    expect(sat.status).toBe("off");
    expect(sun.status).toBe("off");
  });

  it("⑩ 같은 날 partial(세트)이 먼저 잡혀도 완료 세션이 있으면 complete로 승격", () => {
    const grid = buildMonthGrid(
      [session("s1", "2026-07-14T20:00:00")],
      [setRec("set1", "2026-07-14T10:00:00")],
      weekdays,
      today,
    );
    const cell = grid.weeks.flat().find((c) => c.date === "2026-07-14")!;
    expect(cell.status).toBe("complete");
  });

  it("⑪ 훈련일이라도 완료 세션이 있으면 off보다 complete가 우선(월요일 훈련일 + 완료)", () => {
    const grid = buildMonthGrid([session("s1", "2026-07-20T10:00:00")], [], weekdays, today);
    const cell = grid.weeks.flat().find((c) => c.date === "2026-07-20")!; // 월요일
    expect(cell.status).toBe("complete");
  });

  it("⑫ 달 경계 — 마지막 주 뒤쪽도 다음 달이면 패딩(date:null)", () => {
    const grid = buildMonthGrid([], [], weekdays, today);
    const lastWeek = grid.weeks.at(-1)!;
    const augustCells = lastWeek.filter((c) => c.date !== null && !c.date.startsWith("2026-07"));
    expect(augustCells).toHaveLength(0);
    // 마지막 주에 최소 1개는 date:null(8월로 넘어가는 패딩)이거나, 7월 31일이 정확히 일요일이면
    // 패딩이 없을 수도 있음 — 이 달(2026-07)은 31일이 금요일이므로 패딩이 있어야 함.
    expect(lastWeek.some((c) => c.date === null)).toBe(true);
  });
});

describe("monthSummary", () => {
  const weekdays = ["월", "화", "수", "목", "금"];
  const today = new Date(2026, 6, 13);

  it("⑬ 완료/부분/off/패딩 섞인 그리드에서 total = 이번 달 훈련일 수(off·패딩 제외), completed = complete 개수", () => {
    const grid = buildMonthGrid(
      [session("s1", "2026-07-14T10:00:00"), session("s2", "2026-07-15T10:00:00")],
      [],
      weekdays,
      today,
    );
    const { completed, total, percent } = monthSummary(grid);
    // 2026-07은 31일, 월~금만 훈련일. 31일 중 토/일 개수를 빼면 total.
    const totalTrainingDays = grid.weeks.flat().filter((c) => c.date !== null && c.status !== "off").length;
    expect(total).toBe(totalTrainingDays);
    expect(completed).toBe(2);
    expect(percent).toBe(Math.round((2 / totalTrainingDays) * 100));
  });

  it("⑭ 기록 전혀 없음 → completed 0, percent 0", () => {
    const grid = buildMonthGrid([], [], weekdays, today);
    expect(monthSummary(grid)).toEqual({ completed: 0, total: monthSummary(grid).total, percent: 0 });
  });
});
