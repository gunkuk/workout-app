import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { useProgramStore } from "../../src/store/programStore";
import { SettingsScreen } from "../../src/screens/SettingsScreen";
import type { DecisionEvent } from "../../src/domain/types.ts";
import { resetDb } from "../helpers/db";
import { loadSeedProgram, seedOnboarded as seedOnboardedHelper } from "../helpers/seed";

// UI14 item9 — TM 수동 편집 섹션은 ProgramScreen.tsx로 이관(테스트도 함께 이동,
// test/screens/ProgramScreen.test.tsx 참조).
// UI14 재검수(컨트롤러) — "앱 설명 · 사용법" 안내 카드는 사용자가 삭제 요청한 항목으로 판명돼
// SettingsScreen에서 제거됨. 이 파일은 이제 백업 섹션만 검증.

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
  await useProgramStore.getState().load();
}

beforeEach(async () => {
  await resetDb();
  useProgramStore.setState(useProgramStore.getInitialState(), true);
});

afterEach(() => {
  cleanup();
});

describe("SettingsScreen", () => {
  it("앱 설명 · 사용법 안내 카드는 더 이상 렌더되지 않는다(사용자 삭제 요청)", async () => {
    await seedOnboarded();
    render(<SettingsScreen />);

    await screen.findByRole("heading", { name: "백업" });
    expect(screen.queryByRole("heading", { name: "앱 설명 · 사용법" })).not.toBeInTheDocument();
  });

  it("TM 수동 편집 섹션은 더 이상 여기 없음(item9 — 프로그램 탭으로 이관)", async () => {
    await seedOnboarded();
    render(<SettingsScreen />);

    await screen.findByRole("heading", { name: "백업" });
    expect(screen.queryByRole("heading", { name: "TM / 1RM 편집" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("tm-input-bench")).not.toBeInTheDocument();
  });
});
