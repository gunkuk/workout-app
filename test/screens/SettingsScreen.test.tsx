import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { useProgramStore } from "../../src/store/programStore";
import { loadFoldInput } from "../../src/storage/eventStore";
import { tmHistory } from "../../src/domain/e1rm";
import { SettingsScreen } from "../../src/screens/SettingsScreen";
import type { DecisionEvent } from "../../src/domain/types.ts";
import { resetDb } from "../helpers/db";
import { loadSeedProgram, seedOnboarded as seedOnboardedHelper } from "../helpers/seed";

// Stage1-C3 T4 — SettingsScreen의 TM 수동 편집 섹션: programStore.tm을 렌더하고, 저장 시
// DecisionEvent{kind:"manual"}을 만들어 acceptProposal(=appendDecision+refresh)을 재사용한다.
// ProgramLibrary.test.tsx·ProposalCard.test.tsx와 동일 패턴(실 nSuns 시드 + eventStore + programStore).

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

/** input이 속한 <li> 안의 "저장" 버튼만 클릭 — Object.entries(tm) 순서에 의존하지 않음. */
function saveButtonFor(input: HTMLElement): HTMLElement {
  const li = input.closest("li");
  if (!li) throw new Error("fixture 오류: input이 li 안에 없음");
  return within(li as HTMLElement).getByRole("button", { name: "저장" });
}

beforeEach(async () => {
  await resetDb();
  useProgramStore.setState(useProgramStore.getInitialState(), true);
});

afterEach(() => {
  cleanup();
});

describe("SettingsScreen — 앱 설명 · 사용법", () => {
  it("앱 설명 · 사용법 섹션이 렌더된다", async () => {
    await seedOnboarded();
    render(<SettingsScreen />);

    expect(await screen.findByRole("heading", { name: "앱 설명 · 사용법" })).toBeInTheDocument();
    expect(screen.getByText(/오프라인 우선 운동 추적기/)).toBeInTheDocument();
  });
});

describe("SettingsScreen — TM 수동 편집(Stage1-C3 T4)", () => {
  it("① TM 수동 편집 → fold 반영(programStore.tm 변경)", async () => {
    await seedOnboarded();
    render(<SettingsScreen />);

    const input = await screen.findByTestId("tm-input-bench");
    fireEvent.change(input, { target: { value: "110" } });
    fireEvent.click(saveButtonFor(input));

    await waitFor(() => expect(useProgramStore.getState().tm.bench).toBe(110));
  });

  it("② manual 결정이 이력(tmHistory)에 나타남", async () => {
    await seedOnboarded();
    render(<SettingsScreen />);

    const input = await screen.findByTestId("tm-input-squat");
    fireEvent.change(input, { target: { value: "90" } });
    fireEvent.click(saveButtonFor(input));

    await waitFor(() => expect(useProgramStore.getState().tm.squat).toBe(90));

    const foldInput = await loadFoldInput();
    const manualDecision = foldInput.decisions.find((d) => d.kind === "manual" && d.target.kind === "tm" && d.target.exerciseId === "squat");
    expect(manualDecision).toBeDefined();
    expect(manualDecision?.value).toBe(90);

    const history = tmHistory(foldInput, "squat");
    expect(history.at(-1)?.value).toBe(90);
  });

  it("올바르지 않은 숫자 입력 → role=alert 에러, 결정 미기록", async () => {
    await seedOnboarded();
    render(<SettingsScreen />);

    const input = await screen.findByTestId("tm-input-ohp");
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.click(saveButtonFor(input));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    const foldInput = await loadFoldInput();
    expect(foldInput.decisions.some((d) => d.kind === "manual")).toBe(false);
  });
});
