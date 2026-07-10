import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { useProgramStore } from "../src/store/programStore";
import App from "../src/App";
import type { DecisionEvent } from "../src/domain/types.ts";
import { resetDb } from "./helpers/db";
import { loadSeedProgram, seedOnboarded as seedOnboardedHelper } from "./helpers/seed";
import { mockMatchMedia } from "./helpers/dom";

// Task 7 — NavShell + App 라우팅 통합.
// 실제 nSuns 시드 + eventStore + programStore(zustand, 실제 — mock 아님)로 empty/ready 상태를
// fake-indexeddb 위에 재현하고, App을 실제 렌더해 라우팅·탭 상호작용까지 통합 검증한다
// (TodayScreen.test.tsx·OnboardingScreen.test.tsx와 동일 픽스처 패턴).

const seed = loadSeedProgram();

const TM = { bench: 105, ohp: 67.5, squat: 85, deadlift: 140 };

const seedDecisions: DecisionEvent[] = (["bench", "ohp", "squat", "deadlift"] as const).map((exerciseId) => ({
  id: `seed-${exerciseId}`,
  target: { kind: "tm", exerciseId },
  kind: "seed",
  value: TM[exerciseId],
  at: "2026-07-01T08:00:00Z",
  schemaVersion: 1,
}));

async function seedOnboarded(): Promise<void> {
  await seedOnboardedHelper(seed, seedDecisions, "2026-07-01T08:00:00Z");
}

function setHash(hash: string): void {
  act(() => {
    window.location.hash = hash;
  });
}

afterEach(() => {
  cleanup();
});

beforeEach(async () => {
  await resetDb();
  useProgramStore.setState(useProgramStore.getInitialState(), true);
  mockMatchMedia(false);
  window.location.hash = "";
});

describe("App", () => {
  it("① empty 상태 → 어느 해시든 온보딩 렌더", async () => {
    window.location.hash = "#/history";
    render(<App />);

    expect(await screen.findByText("온보딩 — 트레이닝 맥스(TM) 설정")).toBeInTheDocument();
  });

  it("② ready 상태 → #/today·#/history 각각 해당 화면 렌더", async () => {
    await seedOnboarded();
    window.location.hash = "#/today";
    render(<App />);

    await waitFor(() => expect(useProgramStore.getState().status).toBe("ready"));
    const dayName = useProgramStore.getState().todayPlan!.dayName;
    expect(await screen.findByRole("heading", { level: 2, name: dayName })).toBeInTheDocument();

    setHash("#/history");

    // 세션 완료 기록이 아직 없으므로 HistoryScreen은 빈 상태 문구를 렌더한다(h2 "히스토리"는
    // 세션이 1개 이상일 때만 등장 — src/screens/HistoryScreen.tsx 참조).
    expect(await screen.findByText("아직 기록된 세션이 없습니다")).toBeInTheDocument();
  });

  it("③ 탭 클릭 → hash 변경", async () => {
    await seedOnboarded();
    window.location.hash = "#/today";
    render(<App />);

    await waitFor(() => expect(useProgramStore.getState().status).toBe("ready"));
    await screen.findByRole("navigation", { name: "주요 탐색" });

    fireEvent.click(screen.getByRole("button", { name: "히스토리" }));

    await waitFor(() => expect(window.location.hash).toBe("#/history"));
  });
});
