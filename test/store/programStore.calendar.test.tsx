import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { db } from "../../src/storage/db";
import { appendSession, appendDecision, upsertProgramVersion, setInstanceState, loadFoldInput } from "../../src/storage/eventStore";
import { useProgramStore } from "../../src/store/programStore";
import { foldState } from "../../src/domain/fold";
import { TodayScreen } from "../../src/screens/TodayScreen";
import type { DecisionEvent, SessionCompleted } from "../../src/domain/types.ts";
import { resetDb } from "../helpers/db";
import { loadSeedProgram } from "../helpers/seed";

// Task 3(Stage1-C3) — programStore calendar 모드 분기: calendarCyclePos 상태 계약
// ({cycleIndex,week,candidateDayOrdinal:number|null} | {notStarted:true})을 restDay 필드로
// 노출하고, todayPos는 rest/notStarted에서 undefined로 남긴다(사전 검증 반영).
// 시드 프로그램 weekdayHint: day1=화, day2=수, day3=목, day4=금, day5=토.
// 2026-07-07=화(첫 훈련 요일), 2026-07-13=월(비훈련 요일) — 계획 문서에 사전 검증된 날짜 사실.

const seed = loadSeedProgram();
const TM = { bench: 105, ohp: 67.5, squat: 85, deadlift: 140 };

function at(day: number, hh = 10, mm = 0): string {
  return `2026-07-${String(day).padStart(2, "0")}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`;
}

const seedDecisions: DecisionEvent[] = (["bench", "ohp", "squat", "deadlift"] as const).map((exerciseId) => ({
  id: `seed-${exerciseId}`,
  target: { kind: "tm", exerciseId },
  kind: "seed",
  value: TM[exerciseId],
  at: at(1, 8),
  schemaVersion: 1,
}));

/** rolling 온보딩 없이 calendar 모드 InstanceState로 직접 시딩(seedOnboarded 헬퍼는 mode:"rolling" 고정이라 미사용). */
async function seedCalendar(startDate: string | undefined): Promise<void> {
  await upsertProgramVersion(seed);
  await db.library.put({ programId: seed.id, addedAt: at(1, 8) });
  await setInstanceState({
    programId: seed.id,
    programVersion: seed.version,
    mode: "calendar",
    anchor: { startDate },
    schemaVersion: 1,
  });
  for (const d of seedDecisions) await appendDecision(d);
}

beforeEach(async () => {
  await resetDb();
  useProgramStore.setState(useProgramStore.getInitialState(), true);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("programStore — calendar 모드", () => {
  it("① startDate=2026-07-07(화) + 오늘=2026-07-07(화, 시드 첫 훈련 요일) → day1 플랜", async () => {
    vi.setSystemTime(new Date("2026-07-07T10:00:00"));
    await seedCalendar("2026-07-07");

    await useProgramStore.getState().load();
    const state = useProgramStore.getState();

    expect(state.status).toBe("ready");
    expect(state.restDay).toBeUndefined();
    expect(state.todayPos).toEqual({ cycleIndex: 0, week: 0, dayOrdinal: 1 });
    expect(state.todayPlan).not.toBeNull();
  });

  it("② 오늘=2026-07-13(월, 비훈련 요일) → restDay='rest', todayPos/todayPlan 없음", async () => {
    vi.setSystemTime(new Date("2026-07-13T10:00:00"));
    await seedCalendar("2026-07-07");

    await useProgramStore.getState().load();
    const state = useProgramStore.getState();

    expect(state.status).toBe("ready");
    expect(state.restDay).toBe("rest");
    expect(state.todayPos).toBeUndefined();
    expect(state.todayPlan).toBeNull();

    render(<TodayScreen />);
    expect(await screen.findByText("오늘은 휴식일입니다")).toBeInTheDocument();
  });

  it("③ startDate가 미래(오늘 이전 미도달) → restDay='notStarted', 시작일 안내 렌더", async () => {
    vi.setSystemTime(new Date("2026-07-07T10:00:00"));
    await seedCalendar("2026-08-01");

    await useProgramStore.getState().load();
    const state = useProgramStore.getState();

    expect(state.status).toBe("ready");
    expect(state.restDay).toBe("notStarted");
    expect(state.todayPos).toBeUndefined();
    expect(state.todayPlan).toBeNull();

    render(<TodayScreen />);
    expect(await screen.findByText(/프로그램 시작 전입니다/)).toBeInTheDocument();
    expect(screen.getByText(/2026-08-01/)).toBeInTheDocument();
  });

  it("④ 모드 전환(rolling→calendar) 후 과거 SessionCompleted.cyclePos 불변(fold 재확인)", async () => {
    vi.setSystemTime(new Date("2026-07-07T10:00:00"));
    await upsertProgramVersion(seed);
    await db.library.put({ programId: seed.id, addedAt: at(1, 8) });
    await setInstanceState({
      programId: seed.id,
      programVersion: seed.version,
      mode: "rolling",
      anchor: {},
      schemaVersion: 1,
    });
    for (const d of seedDecisions) await appendDecision(d);

    const pastSession: SessionCompleted = {
      id: "sc-1",
      sessionId: "s1",
      at: at(1, 14),
      cyclePos: { cycleIndex: 0, week: 0, dayOrdinal: 1 },
      status: "completed",
      programId: seed.id,
      programVersion: seed.version,
      schemaVersion: 1,
    };
    await appendSession(pastSession);

    const beforeFold = foldState(await loadFoldInput());

    await useProgramStore.getState().switchProgram({
      programId: seed.id,
      programVersion: seed.version,
      mode: "calendar",
      anchor: { startDate: "2026-07-07" },
      schemaVersion: 1,
    });

    const sessions = await db.sessions.toArray();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.cyclePos).toEqual({ cycleIndex: 0, week: 0, dayOrdinal: 1 });

    const afterFold = foldState(await loadFoldInput());
    expect(afterFold.tm).toEqual(beforeFold.tm);
  });
});
