import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useProgramStore } from "../../src/store/programStore";
import { ProgramScreen } from "../../src/screens/ProgramScreen";
import type { DecisionEvent } from "../../src/domain/types.ts";
import { resetDb } from "../helpers/db";
import { loadSeedProgram, seedOnboarded as seedOnboardedHelper } from "../helpers/seed";

// Task — ProgramScreen: 활성 프로그램 description을 토글로 보여주는 섹션 검증
// (ProgramLibrary.test.tsx와 동일한 실 nSuns 시드 + 실 store/eventStore fixture 패턴).

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

async function seedOnboarded(): Promise<void> {
  await seedOnboardedHelper(seed, seedDecisions, at(1, 8));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(async () => {
  await resetDb();
  useProgramStore.setState(useProgramStore.getInitialState(), true);
});

describe("ProgramScreen", () => {
  it("설명 토글 버튼 클릭 시 프로그램 설명이 펼쳐진다", async () => {
    await seedOnboarded();
    await useProgramStore.getState().load();

    render(<ProgramScreen />);

    const toggle = await screen.findByRole("button", { name: /설명 보기/ });
    expect(toggle).toBeInTheDocument();
    expect(screen.queryByText(/T1 = 강도/)).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(screen.getByText(/왜 T2는 저중량 고볼륨/)).toBeInTheDocument();
    expect(screen.getByText(/T1 = 강도/)).toBeInTheDocument();
  });
});
