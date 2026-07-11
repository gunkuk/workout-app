import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { appendSession } from "../../src/storage/eventStore";
import { useProgramStore } from "../../src/store/programStore";
import { HomeScreen } from "../../src/screens/HomeScreen";
import { resetDb } from "../helpers/db";
import { loadSeedProgram, seedOnboarded } from "../helpers/seed";
import type { DecisionEvent, SessionCompleted } from "../../src/domain/types.ts";

// 신규 홈/대시보드 화면 — 프로그램 카드(이름+주간 진행률) + 오늘 카드(오늘 세션 미리보기+시작 버튼).
// 실제 nSuns 시드 + eventStore + programStore(zustand, 실제)로 재현(AnalyticsScreen.test.tsx와 동일 패턴).

const seed = loadSeedProgram();

const TM = { bench: 105, ohp: 67.5, squat: 85, deadlift: 140 };

function at(day: number, hh = 8): string {
  return `2026-07-${String(day).padStart(2, "0")}T${String(hh).padStart(2, "0")}:00:00Z`;
}

const seedDecisions: DecisionEvent[] = (["bench", "ohp", "squat", "deadlift"] as const).map((exerciseId) => ({
  id: `seed-${exerciseId}`,
  target: { kind: "tm", exerciseId },
  kind: "seed",
  value: TM[exerciseId],
  at: at(1),
  schemaVersion: 1,
}));

afterEach(() => {
  cleanup();
});

beforeEach(async () => {
  await resetDb();
  useProgramStore.setState(useProgramStore.getInitialState(), true);
});

async function onboard(): Promise<void> {
  await seedOnboarded(seed, seedDecisions, at(1));
  await useProgramStore.getState().load();
  await waitFor(() => expect(useProgramStore.getState().status).toBe("ready"));
}

describe("HomeScreen", () => {
  it("① 온보딩 후 활성 프로그램 이름을 렌더한다", async () => {
    await onboard();
    render(<HomeScreen onStartSession={vi.fn()} onLogFreeWorkout={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(seed.name)).toBeInTheDocument());
  });

  it("② 오늘 day의 운동 이름들을 렌더한다", async () => {
    await onboard();
    const todayPos = useProgramStore.getState().todayPos!;
    const day = seed.weeks[todayPos.week]!.days[todayPos.dayOrdinal - 1]!;
    const firstSlot = day.slots[0]!;

    const { exerciseInfo } = await import("../../src/domain/exerciseLibrary");
    const displayName = exerciseInfo(firstSlot.exerciseId)?.name ?? firstSlot.exerciseId;

    render(<HomeScreen onStartSession={vi.fn()} onLogFreeWorkout={vi.fn()} />);

    expect(await screen.findByText(displayName)).toBeInTheDocument();
  });

  it("③ '오늘 운동 시작' 버튼 클릭 시 onStartSession 호출", async () => {
    await onboard();
    const onStartSession = vi.fn();
    render(<HomeScreen onStartSession={onStartSession} onLogFreeWorkout={vi.fn()} />);

    const btn = await screen.findByRole("button", { name: "오늘 운동 시작" });
    fireEvent.click(btn);
    expect(onStartSession).toHaveBeenCalledTimes(1);
  });

  it("⑥ '크로스핏 · 자유 운동 기록' 버튼 클릭 시 onLogFreeWorkout 호출", async () => {
    await onboard();
    const onLogFreeWorkout = vi.fn();
    render(<HomeScreen onStartSession={vi.fn()} onLogFreeWorkout={onLogFreeWorkout} />);

    const btn = await screen.findByRole("button", { name: "크로스핏 · 자유 운동 기록" });
    fireEvent.click(btn);
    expect(onLogFreeWorkout).toHaveBeenCalledTimes(1);
  });

  it("④ 완료된 세션 없을 때 주간 진행률 0/M 표시", async () => {
    await onboard();
    const todayPos = useProgramStore.getState().todayPos!;
    const totalDays = seed.weeks[todayPos.week]!.days.length;

    render(<HomeScreen onStartSession={vi.fn()} onLogFreeWorkout={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(`이번 주 0/${totalDays} 완료`)).toBeInTheDocument());
  });

  it("⑤ 이번 주 세션 1개 완료 후 진행률 1/M로 갱신", async () => {
    await onboard();
    const todayPos = useProgramStore.getState().todayPos!;
    const totalDays = seed.weeks[todayPos.week]!.days.length;

    const completedSession: SessionCompleted = {
      id: "sc-home-test",
      sessionId: "home-test-session",
      at: at(2),
      cyclePos: todayPos,
      status: "completed",
      programId: seed.id,
      programVersion: seed.version,
      schemaVersion: 1,
    };
    await appendSession(completedSession);

    render(<HomeScreen onStartSession={vi.fn()} onLogFreeWorkout={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(`이번 주 1/${totalDays} 완료`)).toBeInTheDocument());
  });
});
