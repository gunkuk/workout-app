import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { db } from "../../src/storage/db";
import { useProgramStore } from "../../src/store/programStore";
import { FreeWorkoutScreen } from "../../src/screens/FreeWorkoutScreen";
import { resetDb } from "../helpers/db";
import { loadSeedProgram, seedOnboarded } from "../helpers/seed";
import type { DecisionEvent } from "../../src/domain/types.ts";

// Stage1-UI6 — 크로스핏 · 자유 운동 기록 화면. AnalyticsScreen.test.tsx와 동일 픽스처 패턴
// (실제 nSuns 시드 + eventStore + programStore, mock 없음).

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

describe("FreeWorkoutScreen", () => {
  it("① 운동/유산소 입력 후 저장하면 externalSessions에 1건 저장되고 onDone 호출", async () => {
    await onboard();
    const onDone = vi.fn();
    render(<FreeWorkoutScreen onDone={onDone} />);

    fireEvent.change(screen.getByLabelText("운동명"), { target: { value: "버피" } });

    fireEvent.click(screen.getByRole("button", { name: "+ 유산소 추가" }));
    fireEvent.change(screen.getByPlaceholderText("러닝 / 로잉 / 에어바이크"), { target: { value: "러닝" } });

    fireEvent.click(screen.getByTestId("free-group-core"));

    fireEvent.click(screen.getByRole("button", { name: "기록 저장" }));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));

    const records = await db.externalSessions.toArray();
    expect(records).toHaveLength(1);
    expect(records[0]!.exercises).toEqual([{ name: "버피", weightKg: undefined, reps: undefined, sets: undefined }]);
    expect(records[0]!.cardio).toEqual([{ kind: "러닝", minutes: undefined, distanceKm: undefined }]);
    expect(records[0]!.groups).toEqual(["core"]);
  });

  it("② 빈 이름/종류 행은 저장에서 제외된다", async () => {
    await onboard();
    const onDone = vi.fn();
    render(<FreeWorkoutScreen onDone={onDone} />);

    fireEvent.click(screen.getByRole("button", { name: "+ 운동 추가" }));
    const nameInputs = screen.getAllByLabelText("운동명");
    fireEvent.change(nameInputs[0]!, { target: { value: "스쿼트" } });
    // nameInputs[1] left blank

    fireEvent.click(screen.getByRole("button", { name: "기록 저장" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));

    const records = await db.externalSessions.toArray();
    expect(records[0]!.exercises).toHaveLength(1);
    expect(records[0]!.exercises![0]!.name).toBe("스쿼트");
  });

  it("③ 활성 프로그램이 없으면 안내 문구와 홈 링크를 보여준다", async () => {
    render(<FreeWorkoutScreen onDone={vi.fn()} />);
    expect(await screen.findByText("먼저 프로그램을 시작하세요")).toBeInTheDocument();
    expect(screen.getByText("← 홈으로")).toBeInTheDocument();
  });
});
