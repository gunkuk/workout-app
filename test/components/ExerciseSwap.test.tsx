import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import { db } from "../../src/storage/db";
import { appendSession } from "../../src/storage/eventStore";
import { useProgramStore } from "../../src/store/programStore";
import { TodayScreen, sessionIdFor } from "../../src/screens/TodayScreen";
import { ExerciseSwap } from "../../src/components/ExerciseSwap";
import type { DecisionEvent, CyclePos } from "../../src/domain/types.ts";
import type { PlannedSlot } from "../../src/domain/programEngine";
import { resetDb } from "../helpers/db";
import { loadSeedProgram, seedOnboarded as seedOnboardedHelper } from "../helpers/seed";
import { completeAllRows, waitForWarmupSettled } from "../helpers/todayScreenInteractions";

// Task 3 — ExerciseSwap: 스킵/통증일(경량) 대체 슬롯 헤더 컨트롤.
// ④⑦은 순수 컴포넌트 테스트(store/db 불필요), ⑤⑥은 TodayScreen(실제, 이 컴포넌트가 실제로
// 배선되는 화면)을 통해 handleComplete 5번째 인자(swappedFrom) 배선·sessionStorage 스킵 영속을
// 통합 검증한다(ProposalCard.test.tsx·TodayScreen.test.tsx와 동일한 실 nSuns 시드 + 실 store 패턴).

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

/** dayOrdinal 완료 처리 재현 — rollingCyclePos가 그다음 날로 전진(TodayScreen.test.tsx와 동일 패턴). */
async function advancePast(dayOrdinal: number): Promise<void> {
  await appendSession({
    id: `seed-prior-${dayOrdinal}`,
    sessionId: `prior-${dayOrdinal}`,
    at: at(dayOrdinal, 9),
    cyclePos: { cycleIndex: 0, week: 0, dayOrdinal },
    status: "completed",
    programId: seed.id,
    programVersion: seed.version,
    schemaVersion: 1,
  });
}

function sectionFor(container: HTMLElement, label: string): HTMLElement | null {
  const heading = Array.from(container.querySelectorAll("h3")).find((h) => h.textContent === label);
  return heading ? heading.closest("section") : null;
}

const deadliftSlot: PlannedSlot = {
  slotId: "w1d4-dead-t1",
  exerciseId: "deadlift",
  label: "T1",
  warmups: [],
  sets: [],
  missingTM: false,
  needsInit: false,
};

const squatSlot: PlannedSlot = {
  slotId: "w1d2-squat-t1",
  exerciseId: "squat",
  label: "T1",
  warmups: [],
  sets: [],
  missingTM: false,
  needsInit: false,
};

const noop = () => {};

afterEach(() => {
  cleanup();
});

beforeEach(async () => {
  await resetDb();
  useProgramStore.setState(useProgramStore.getInitialState(), true);
  sessionStorage.clear();
});

describe("ExerciseSwap", () => {
  it("④ 데드리프트 슬롯엔 통증일(경량) 옵션 노출", () => {
    render(
      <ExerciseSwap
        slot={deadliftSlot}
        skipped={false}
        swapped={false}
        onSkip={noop}
        onUnskip={noop}
        onPainDay={noop}
        onRestoreOriginal={noop}
      />,
    );
    expect(screen.getByRole("button", { name: "통증일(경량)" })).toBeInTheDocument();
  });

  it("⑦ 데드리프트 아닌 슬롯(스쿼트)엔 통증일 옵션 없음 — RDL 등 다른 대체 옵션도 없음", () => {
    render(
      <ExerciseSwap
        slot={squatSlot}
        skipped={false}
        swapped={false}
        onSkip={noop}
        onUnskip={noop}
        onPainDay={noop}
        onRestoreOriginal={noop}
      />,
    );
    expect(screen.queryByRole("button", { name: "통증일(경량)" })).not.toBeInTheDocument();
    expect(screen.queryByText(/RDL/i)).not.toBeInTheDocument();
    // 스킵만 노출(대체 옵션 없음)
    expect(screen.getByRole("button", { name: "스킵" })).toBeInTheDocument();
  });

  it("⑤ 통증일 선택 → 5×5 경량 컨벤셔널로 교체 렌더 → 완료한 SetRecord에 substitutedFrom='deadlift'(handleComplete 5번째 인자 배선)", async () => {
    await seedOnboarded();
    await advancePast(3); // day4(데드리프트 T1 + 프론트스쿼트 T2 + 컬 accessory)로 전진
    await useProgramStore.getState().load();
    expect(useProgramStore.getState().todayPos).toEqual({ cycleIndex: 0, week: 0, dayOrdinal: 4 });

    const { container } = render(<TodayScreen />);
    await waitForWarmupSettled();

    fireEvent.click(screen.getByRole("button", { name: "통증일(경량)" }));

    // 교체 렌더 확인 — lightConventionalPreset의 label "T1(경량)" + 5개 작업세트
    const swappedSection = await waitFor(() => {
      const section = sectionFor(container, "T1(경량)");
      expect(section).toBeTruthy();
      return section!;
    });
    const rows = within(swappedSection).getAllByTestId(/^setrow-/);
    expect(rows).toHaveLength(5);
    expect(within(swappedSection).getByRole("button", { name: "원래대로" })).toBeInTheDocument();
    expect(within(swappedSection).queryByRole("button", { name: "통증일(경량)" })).not.toBeInTheDocument();

    // 첫 작업세트 완료(계획 무게 있음 — 탭 1회로 즉시 완료)
    const firstRow = rows[0]!;
    fireEvent.click(firstRow);
    await waitFor(() => expect(firstRow.querySelector('[aria-label="완료됨"]')).toBeTruthy());

    const setId = firstRow.getAttribute("data-testid")!.replace("setrow-", "");
    await waitFor(async () => {
      const rec = await db.setRecords.get(setId);
      expect(rec).toBeDefined();
      expect(rec!.substitutedFrom).toBe("deadlift");
      expect(rec!.exerciseId).toBe("deadlift");
    });
  });

  it("⑤b 경량 세트 기록 후 '원래대로' → revoked correction 기록(analytics 이중집계 차단) + 완료 카운트 제외", async () => {
    await seedOnboarded();
    await advancePast(3); // day4로 전진
    await useProgramStore.getState().load();

    const { container } = render(<TodayScreen />);
    await waitForWarmupSettled();

    fireEvent.click(screen.getByRole("button", { name: "통증일(경량)" }));
    const swappedSection = await waitFor(() => {
      const section = sectionFor(container, "T1(경량)");
      expect(section).toBeTruthy();
      return section!;
    });
    const rows = within(swappedSection).getAllByTestId(/^setrow-/);
    const firstRow = rows[0]!;
    fireEvent.click(firstRow); // 경량 세트 1개 완료
    await waitFor(() => expect(firstRow.querySelector('[aria-label="완료됨"]')).toBeTruthy());
    const setId = firstRow.getAttribute("data-testid")!.replace("setrow-", "");
    await waitFor(async () => expect(await db.setRecords.get(setId)).toBeDefined());

    fireEvent.click(within(swappedSection).getByRole("button", { name: "원래대로" }));

    await waitFor(async () => {
      const corrections = await db.corrections.toArray();
      const revoke = corrections.find((c) => c.supersedes === setId);
      expect(revoke).toBeDefined();
      expect(revoke!.revoked).toBe(true);
    });

    // 원본 T1(데드리프트)로 복귀 렌더 — 경량 세트는 더 이상 표시되지 않고, 원본 슬롯 세트는 미완료 상태.
    const originalSection = await waitFor(() => {
      const section = sectionFor(container, "T1");
      expect(section).toBeTruthy();
      return section!;
    });
    const originalRows = within(originalSection).getAllByTestId(/^setrow-/);
    expect(originalRows.every((r) => !r.querySelector('[aria-label="완료됨"]'))).toBe(true);
  });

  it("⑥a 스킵 → 그 슬롯 제외하고 나머지 완료 시 '세션 완료' 버튼 활성화 가능", async () => {
    await seedOnboarded();
    await useProgramStore.getState().load();
    const { container } = render(<TodayScreen />);
    await waitForWarmupSettled();

    const t1Section = sectionFor(container, "T1")!; // day1 — 벤치 T1
    fireEvent.click(within(t1Section).getByRole("button", { name: "스킵" }));
    expect(within(t1Section).getByText("스킵됨")).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "세션 완료" })).not.toBeInTheDocument();

    await completeAllRows(container, { exclude: t1Section });

    expect(await screen.findByRole("button", { name: "세션 완료" })).toBeInTheDocument();
  });

  it("⑥b 스킵 상태가 리마운트(새로고침 시뮬레이션) 후에도 sessionStorage로 복원", async () => {
    await seedOnboarded();
    await useProgramStore.getState().load();
    const first = render(<TodayScreen />);
    await waitForWarmupSettled();

    const t1Section = sectionFor(first.container, "T1")!;
    fireEvent.click(within(t1Section).getByRole("button", { name: "스킵" }));
    expect(within(t1Section).getByText("스킵됨")).toBeInTheDocument();

    const pos: CyclePos = { cycleIndex: 0, week: 0, dayOrdinal: 1 };
    const sessionId = sessionIdFor(seed.id, seed.version, pos);
    expect(sessionStorage.getItem(`skip:${sessionId}:w1d1-bench-t1`)).toBe("1");

    first.unmount();

    const second = render(<TodayScreen />);
    await waitFor(() => {
      const t1Again = sectionFor(second.container, "T1")!;
      expect(within(t1Again).getByText("스킵됨")).toBeInTheDocument();
    });
  });
});
