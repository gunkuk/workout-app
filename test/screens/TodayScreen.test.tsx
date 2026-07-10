import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import { db } from "../../src/storage/db";
import { appendSet, appendSession } from "../../src/storage/eventStore";
import { useProgramStore } from "../../src/store/programStore";
import { TodayScreen, sessionIdFor } from "../../src/screens/TodayScreen";
import App from "../../src/App";
import type { DecisionEvent, SetRecord, CyclePos } from "../../src/domain/types.ts";
import { resetDb } from "../helpers/db";
import { loadSeedProgram, seedOnboarded as seedOnboardedHelper } from "../helpers/seed";
import { completeAllRows, waitForWarmupSettled } from "../helpers/todayScreenInteractions";

// Task 4 — SetRow + TodayScreen: 체크오프·즉시커밋·정정·needsInit.
// 실제 nSuns 시드 + eventStore + programStore(zustand, 실제 — mock 아님)로 온보딩 완료 상태를
// fake-indexeddb 위에 재현하고, TodayScreen을 실제 렌더해 DOM 상호작용 → DB 반영까지 통합 검증한다
// (programStore.test.ts와 동일한 픽스처 패턴).

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

/**
 * 온보딩 완료 상태 재현 — TM 4개(벤치/OHP/스쿼트/데드)만 시드한다. T2 전용 변형 리프트
 * (스모데드/프론트스쿼트/인클라인/CGBP)의 TM과 악세사리 상태는 의도적으로 미시드(Task5 확장 시드
 * 대상, 스펙 §2-8) — 이로써 day2 T2(스모데드)·day4 T2(프론트스쿼트)가 자연스럽게 missingTM이 되고,
 * 모든 day의 악세사리 슬롯이 needsInit이 된다. 두 UX를 별도 픽스처 조작 없이 실제 시드 데이터로 검증한다.
 */
async function seedOnboarded(): Promise<void> {
  await seedOnboardedHelper(seed, seedDecisions, at(1, 8));
}

/** rollingCyclePos를 dayOrdinal 다음 날로 전진시키는 가짜 완료 세션 — 그 날의 실제 SetRecord는 없으므로
 *  fold는 해당 슬롯들을 빈 판정으로 안전하게 스킵한다(judgingSetsForSlot이 빈 배열 반환 → continue). */
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

/** 특정 슬롯 label의 <section> 내부 setrow 요소들 (DOM 등장 순서 = slot.sets 배열 순서) */
function rowsForLabel(container: HTMLElement, label: string): HTMLElement[] {
  const heading = Array.from(container.querySelectorAll("h3")).find((h) => h.textContent === label);
  if (!heading) return [];
  const section = heading.closest("section");
  if (!section) return [];
  return Array.from(section.querySelectorAll('[data-testid^="setrow-"]'));
}

afterEach(() => {
  // 세션완료 → refreshAfterWrite로 todayPlan이 바뀌면 복원/워밍업 effect가 재발화하는 케이스가 있다.
  // 다음 테스트로 넘어가기 전(또는 마지막 테스트의 경우 파일 teardown 전) 반드시 언마운트해
  // effect cleanup의 cancelled 플래그로 그 뒤의 setState를 막는다(그렇지 않으면 environment teardown
  // 이후 React 스케줄러가 window를 참조하다 unhandled error가 난다).
  cleanup();
});

beforeEach(async () => {
  await resetDb();
  useProgramStore.setState(useProgramStore.getInitialState(), true);
});

describe("TodayScreen", () => {
  it("① 렌더 시 워밍업·작업세트 전부 표시 (day1: 벤치T1 + OHP T2 + 랫풀 accessory)", async () => {
    await seedOnboarded();
    await useProgramStore.getState().load();
    const plan = useProgramStore.getState().todayPlan!;
    const { container } = render(<TodayScreen />);

    const totalWork = plan.slots.reduce((n, s) => n + s.sets.length, 0);
    const totalWarmup = plan.slots.reduce((n, s) => n + s.warmups.length, 0);
    expect(totalWork).toBeGreaterThan(0);
    expect(totalWarmup).toBeGreaterThan(0);
    expect(container.querySelectorAll('[data-testid^="setrow-"]').length).toBe(totalWork);
    expect(container.querySelectorAll('[data-testid^="warmup-"]').length).toBe(totalWarmup);

    await waitForWarmupSettled();
  });

  it("② 세트 탭 → appendSet 즉시 반영(fake-indexeddb) 확인", async () => {
    await seedOnboarded();
    await useProgramStore.getState().load();
    const { container } = render(<TodayScreen />);
    await waitForWarmupSettled();

    const rows = rowsForLabel(container, "T1"); // 벤치 T1
    fireEvent.click(rows[0]!);

    await waitFor(() => expect(rows[0]!.querySelector('[aria-label="완료됨"]')).toBeTruthy());
    const setId = rows[0]!.getAttribute("data-testid")!.replace("setrow-", "");
    await waitFor(async () => {
      const rec = await db.setRecords.get(setId);
      expect(rec).toBeDefined();
      expect(rec!.setType).toBe("work");
    });
  });

  it("③ 정정 플로우: 완료된 세트 재탭 → 값 변경 → appendCorrection", async () => {
    await seedOnboarded();
    await useProgramStore.getState().load();
    const { container } = render(<TodayScreen />);
    await waitForWarmupSettled();

    const row = rowsForLabel(container, "T1")[0]!;
    fireEvent.click(row); // 최초 완료
    await waitFor(() => expect(row.querySelector('[aria-label="완료됨"]')).toBeTruthy());
    const setId = row.getAttribute("data-testid")!.replace("setrow-", "");

    fireEvent.click(row); // 재탭 → 정정모드
    const repsUp = within(row).getByRole("button", { name: "렙 증가" });
    fireEvent.click(repsUp);
    fireEvent.click(repsUp);
    fireEvent.click(within(row).getByRole("button", { name: "저장" }));

    await waitFor(async () => {
      const corrections = await db.corrections.toArray();
      const correction = corrections.find((rec) => rec.supersedes === setId);
      expect(correction).toBeDefined();
      expect(correction!.patch?.actualReps).toBeDefined();
    });
    expect(row.querySelector('[aria-label="완료됨"]')).toBeTruthy();
  });

  it("④ 전부 완료 전엔 세션 완료 버튼 없음", async () => {
    await seedOnboarded();
    await useProgramStore.getState().load();
    render(<TodayScreen />);
    await waitForWarmupSettled();
    expect(screen.queryByRole("button", { name: "세션 완료" })).not.toBeInTheDocument();
  });

  it("⑤ 전부 완료 후 버튼 노출 → 탭 → SessionCompleted append(sessionId 조인 검증) + 콜백", async () => {
    await seedOnboarded();
    await useProgramStore.getState().load();
    const onSessionComplete = vi.fn();
    const { container } = render(<TodayScreen onSessionComplete={onSessionComplete} />);
    await waitForWarmupSettled();

    await completeAllRows(container);

    const completeBtn = await screen.findByRole("button", { name: "세션 완료" });
    fireEvent.click(completeBtn);

    await waitFor(async () => {
      const sessions = await db.sessions.toArray();
      expect(sessions).toHaveLength(1);
    });

    const sessions = await db.sessions.toArray();
    const sc = sessions[0]!;
    const workSets = (await db.setRecords.toArray()).filter((r) => r.setType === "work");
    expect(workSets.length).toBeGreaterThan(0);
    // 필수 조인 계약: SessionCompleted.sessionId === 그날 모든 SetRecord.sessionId (같은 결정론적 문자열)
    for (const s of workSets) {
      expect(s.sessionId).toBe(sc.sessionId);
    }
    expect(onSessionComplete).toHaveBeenCalledTimes(1);
  });

  it("⑥ 새로고침 시뮬레이션(컴포넌트 리마운트): 이미 기록된 세트가 체크됨 상태로 복원", async () => {
    await seedOnboarded();
    await useProgramStore.getState().load();
    const first = render(<TodayScreen />);
    await waitForWarmupSettled();

    const rowBefore = rowsForLabel(first.container, "T1")[0]!;
    fireEvent.click(rowBefore);
    await waitFor(() => expect(rowBefore.querySelector('[aria-label="완료됨"]')).toBeTruthy());
    const setId = rowBefore.getAttribute("data-testid")!.replace("setrow-", "");
    await waitFor(async () => expect(await db.setRecords.get(setId)).toBeDefined());

    first.unmount();

    const second = render(<TodayScreen />);
    await waitFor(() => {
      const rowAfter = rowsForLabel(second.container, "T1")[0]!;
      expect(rowAfter.querySelector('[aria-label="완료됨"]')).toBeTruthy();
    });
  });

  it("⑦ missingTM 슬롯은 TM 필요 안내 표시(체크오프 비활성) — day2 T2(스모데드 TM 미시드)", async () => {
    await seedOnboarded();
    await advancePast(1); // day1 완료 처리 → rollingCyclePos가 day2로 전진
    await useProgramStore.getState().load();

    const plan = useProgramStore.getState().todayPlan!;
    expect(plan.pos.dayOrdinal).toBe(2);
    const t2Slot = plan.slots.find((s) => s.label === "T2")!;
    expect(t2Slot.missingTM).toBe(true);

    const { container } = render(<TodayScreen />);
    await waitForWarmupSettled(); // T1(스쿼트)에는 워밍업이 있음

    expect(screen.getByText(/TM 필요/)).toBeInTheDocument();
    expect(rowsForLabel(container, "T2")).toHaveLength(0); // 체크오프 비활성 — 행 자체가 없음
    expect(rowsForLabel(container, "T1").length).toBeGreaterThan(0); // 같은 화면의 정상 슬롯은 그대로 렌더
  });

  it("⑧ needsInit 악세사리 슬롯은 자유입력 필드로 렌더(비활성 아님) — 입력·제출 → appendSet 확인", async () => {
    await seedOnboarded();
    await useProgramStore.getState().load();
    const { container } = render(<TodayScreen />);
    await waitForWarmupSettled();

    const row = rowsForLabel(container, "accessory")[0]!; // 랫풀다운 — 온보딩이 악세사리 미시드 → needsInit
    const weightInput = within(row).getByLabelText("무게 입력") as HTMLInputElement;
    const repsInput = within(row).getByLabelText("렙 입력") as HTMLInputElement;
    fireEvent.change(weightInput, { target: { value: "22.5" } });
    fireEvent.change(repsInput, { target: { value: "10" } });
    fireEvent.click(within(row).getByRole("button", { name: "완료" }));

    const setId = row.getAttribute("data-testid")!.replace("setrow-", "");
    await waitFor(async () => {
      const rec = await db.setRecords.get(setId);
      expect(rec).toBeDefined();
      expect(rec!.actualWeight).toBe(22.5);
      expect(rec!.actualReps).toBe(10);
    });
  });

  it("⑨ topSet 3렙 세션 완료 후 TM이 fold를 통해 실제 증량 반영(programStore 재조회) — sessionId 조인 검증", async () => {
    await seedOnboarded();
    await advancePast(3); // day3 완료 처리 → rollingCyclePos가 day4(데드T1+프론트스쿼트T2+컬accessory)로 전진
    await useProgramStore.getState().load();
    expect(useProgramStore.getState().todayPos).toEqual({ cycleIndex: 0, week: 0, dayOrdinal: 4 });
    expect(useProgramStore.getState().tm["deadlift"]).toBe(140);

    const { container } = render(<TodayScreen />);
    await waitForWarmupSettled();

    // T1(데드리프트) 3번째 세트가 topSet(스펙 target reps=1) — +렙 버튼 2번으로 실제 3렙 완료 기록
    const topSetRow = rowsForLabel(container, "T1")[2]!;
    const repsUp = within(topSetRow).getByRole("button", { name: "렙 증가" });
    fireEvent.click(repsUp);
    fireEvent.click(repsUp);
    fireEvent.click(topSetRow);
    await waitFor(() => expect(topSetRow.querySelector('[aria-label="완료됨"]')).toBeTruthy());

    // 나머지(T1 잔여 8세트 + 컬 accessory 3세트) 완료 — 프론트스쿼트 T2는 missingTM이라 게이트에서 제외됨
    await completeAllRows(container);

    const completeBtn = await screen.findByRole("button", { name: "세션 완료" });
    fireEvent.click(completeBtn);

    await waitFor(() => {
      expect(useProgramStore.getState().tm["deadlift"]).toBe(145);
    });
  });

  // Task 6(C2) — 최종 통합 배선: RestTimer 추가 배선 + ProposalCard/PlateBreakdown/ExerciseSwap이
  // (T1/T3에서 이미 배선된 채로) 여전히 정상 마운트되는지, 스킵이 세션완료를 막지 않는지, App의
  // 3탭 네비게이션과 통합해도 TodayScreen이 정상 동작하는지 확인한다.

  it("⑩ 전체 렌더 시 4개 컴포넌트(제안카드·타이머·플레이트·스왑) 모두 마운트 확인", async () => {
    await seedOnboarded();
    // 스쿼트(day2) T1 topSet 1렙 미달 기록 + 세션완료 → tmDeload 제안 생성(ProposalCard.test.tsx의
    // setupTmDeload와 동일 픽스처). 제안은 오늘 슬롯과 무관하게 항상 상단에 뜨므로(계획 계약),
    // ①에서 만든 제안이 그대로 화면 최상단에 보여야 한다.
    const proposalPos: CyclePos = { cycleIndex: 0, week: 0, dayOrdinal: 2 };
    const proposalSessionId = sessionIdFor(seed.id, seed.version, proposalPos);
    const topSet: SetRecord = {
      id: `${proposalSessionId}-w1d2-squat-t1-work-2`,
      sessionId: proposalSessionId,
      slotId: "w1d2-squat-t1",
      exerciseId: "squat",
      setType: "work",
      targetWeight: 80.75,
      targetReps: 1,
      actualWeight: 80.75,
      actualReps: 1,
      amrapRole: "topSet",
      completedAt: at(2, 11),
      schemaVersion: 1,
    };
    await appendSet(topSet);
    await appendSession({
      id: "seed-day2-session",
      sessionId: proposalSessionId,
      at: at(2, 14),
      cyclePos: proposalPos,
      status: "completed",
      programId: seed.id,
      programVersion: seed.version,
      schemaVersion: 1,
    });
    await useProgramStore.getState().load();
    expect(useProgramStore.getState().pendingProposals.some((p) => p.type === "tmDeload")).toBe(true);

    const { container } = render(<TodayScreen />);
    await waitForWarmupSettled();

    // 제안카드 — pendingProposals가 있으므로 항상 렌더(무조건 마운트 대상이 아니라 이 픽스처로 검증).
    expect(screen.getByTestId("proposal-card")).toBeInTheDocument();
    // 플레이트 — 각 작업세트 옆에 무조건 렌더.
    expect(container.querySelectorAll('[data-testid="plate-breakdown"]').length).toBeGreaterThan(0);
    // 스왑 — 각 슬롯 헤더에 무조건 렌더.
    expect(container.querySelectorAll('[data-testid^="exercise-swap-"]').length).toBeGreaterThan(0);
    // 타이머 — 작업세트 완료 전엔 미노출(조건부 마운트가 계약, T2가 만든 컴포넌트 자체는 항상 마운트 대상이 아님).
    expect(screen.queryByTestId("rest-timer")).not.toBeInTheDocument();

    const row = rowsForLabel(container, "T1")[0]!;
    fireEvent.click(row);
    await waitFor(() => expect(row.querySelector('[aria-label="완료됨"]')).toBeTruthy());

    // 그 슬롯의 작업세트 1개 완료 → 슬롯 하단에 타이머 노출(Task 6 트리거: handleComplete 콜백에서 로컬 state true).
    expect(screen.getByTestId("rest-timer")).toBeInTheDocument();
  });

  it("⑪ 스킵한 슬롯이 있어도 나머지 세트 완료 시 세션 완료 가능(TodayScreen 통합)", async () => {
    await seedOnboarded();
    await useProgramStore.getState().load();
    const { container } = render(<TodayScreen />);
    await waitForWarmupSettled();

    const t1Section = Array.from(container.querySelectorAll("h3"))
      .find((h) => h.textContent === "T1")!
      .closest("section")!;
    fireEvent.click(within(t1Section).getByRole("button", { name: "스킵" }));
    expect(within(t1Section).getByText("스킵됨")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "세션 완료" })).not.toBeInTheDocument();

    // 스킵된 T1 슬롯을 제외한 나머지(T2 + accessory) 전부 완료.
    await completeAllRows(container, { exclude: t1Section });

    expect(await screen.findByRole("button", { name: "세션 완료" })).toBeInTheDocument();
  });

  it("⑫ Task5가 만든 3탭 네비게이션과 통합해도 TodayScreen이 정상 동작(App.tsx/NavShell.tsx 변경 없이, 스모크)", async () => {
    await seedOnboarded();
    window.location.hash = "#/today";
    render(<App />);

    await waitFor(() => expect(useProgramStore.getState().status).toBe("ready"));
    const dayName = useProgramStore.getState().todayPlan!.dayName;
    expect(await screen.findByRole("heading", { level: 2, name: dayName })).toBeInTheDocument();
    await screen.findByRole("navigation", { name: "주요 탐색" });

    // 히스토리 탭으로 이동 후 오늘 탭으로 복귀 — TodayScreen이 재마운트되어도 정상 렌더(스모크).
    fireEvent.click(screen.getByRole("button", { name: "히스토리" }));
    await waitFor(() => expect(window.location.hash).toBe("#/history"));

    fireEvent.click(screen.getByRole("button", { name: "오늘" }));
    await waitFor(() => expect(window.location.hash).toBe("#/today"));
    expect(await screen.findByRole("heading", { level: 2, name: dayName })).toBeInTheDocument();

    // 분석 탭(Task5)도 정상 진입 — App.tsx/NavShell.tsx는 이 태스크가 건드리지 않았음을 재확인.
    fireEvent.click(screen.getByRole("button", { name: "분석" }));
    await waitFor(() => expect(window.location.hash).toBe("#/analytics"));
  });
});
