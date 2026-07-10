import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { db } from "../../src/storage/db";
import { appendSet, appendSession } from "../../src/storage/eventStore";
import { useProgramStore } from "../../src/store/programStore";
import { sessionIdFor } from "../../src/screens/TodayScreen";
import { ProposalCard } from "../../src/components/ProposalCard";
import type { DecisionEvent, SetRecord, SessionCompleted, CyclePos, Proposal } from "../../src/domain/types.ts";
import { resetDb } from "../helpers/db";
import { loadSeedProgram, seedOnboarded as seedOnboardedHelper } from "../helpers/seed";

// Task 1 — ProposalCard: pendingProposals(fold가 계산) -> DecisionEvent(승인) 왕복.
// TodayScreen이 실제로 하게 될 `pendingProposals.map(p => <ProposalCard proposal={p} />)`을
// 그대로 로컬 헬퍼(ProposalList)로 재현해, 실 nSuns 시드 + eventStore + programStore(실제, mock 아님)
// 조합으로 fold가 만든 진짜 Proposal을 카드에 먹여 검증한다(TodayScreen.test.tsx와 동일 픽스처 패턴).

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

/** 온보딩 완료 상태 재현(TodayScreen.test.tsx와 동일 패턴). extra로 T2 전용 TM 등 추가 시드 주입. */
async function seedOnboarded(extra: DecisionEvent[] = []): Promise<void> {
  await seedOnboardedHelper(seed, seedDecisions, at(1, 8), extra);
}

function sessionCompletedFor(pos: CyclePos, day: number, hh: number): SessionCompleted {
  return {
    id: crypto.randomUUID(),
    sessionId: sessionIdFor(seed.id, seed.version, pos),
    at: at(day, hh),
    cyclePos: pos,
    status: "completed",
    programId: seed.id,
    programVersion: seed.version,
    schemaVersion: 1,
  };
}

/** 여러 pendingProposals을 TodayScreen과 동일한 방식(map)으로 카드 나열 — 로컬 테스트 헬퍼, 신규 소스 파일 아님 */
function ProposalList({ proposals }: { proposals: Proposal[] }) {
  return (
    <>
      {proposals.map((p) => (
        <ProposalCard key={`${p.type}-${p.sourceSetRecordId}`} proposal={p} />
      ))}
    </>
  );
}

/** 스쿼트 T1(day2) 탑세트 1렙 기록 → holdOrDeload → tmDeload 제안(options=[85, 80]) */
async function setupTmDeload(): Promise<Proposal> {
  await seedOnboarded();
  const pos: CyclePos = { cycleIndex: 0, week: 0, dayOrdinal: 2 };
  const sessionId = sessionIdFor(seed.id, seed.version, pos);
  const topSet: SetRecord = {
    id: `${sessionId}-w1d2-squat-t1-work-2`,
    sessionId,
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
  await appendSession(sessionCompletedFor(pos, 2, 14));
  await useProgramStore.getState().load();
  const proposal = useProgramStore.getState().pendingProposals.find((p) => p.type === "tmDeload");
  if (!proposal) throw new Error("fixture 오류: tmDeload 제안 생성 실패");
  return proposal;
}

/** 스쿼트 T1(day2) 탑세트 5렙 기록 → bonusProposal → tmBonus 제안(options=[95]) */
async function setupTmBonus(): Promise<Proposal> {
  await seedOnboarded();
  const pos: CyclePos = { cycleIndex: 0, week: 0, dayOrdinal: 2 };
  const sessionId = sessionIdFor(seed.id, seed.version, pos);
  const topSet: SetRecord = {
    id: `${sessionId}-w1d2-squat-t1-work-2`,
    sessionId,
    slotId: "w1d2-squat-t1",
    exerciseId: "squat",
    setType: "work",
    targetWeight: 80.75,
    targetReps: 1,
    actualWeight: 80.75,
    actualReps: 5,
    amrapRole: "topSet",
    completedAt: at(2, 11),
    schemaVersion: 1,
  };
  await appendSet(topSet);
  await appendSession(sessionCompletedFor(pos, 2, 14));
  await useProgramStore.getState().load();
  const proposal = useProgramStore.getState().pendingProposals.find((p) => p.type === "tmBonus");
  if (!proposal) throw new Error("fixture 오류: tmBonus 제안 생성 실패");
  return proposal;
}

/** 스모데드 T2(day2) 마지막 세트 2연속 미완수(5<8) → t2Deload 제안(options=[57.5, 60]) */
async function setupT2Deload(): Promise<Proposal> {
  await seedOnboarded([
    { id: "seed-sumoDeadlift", target: { kind: "tm", exerciseId: "sumoDeadlift" }, kind: "seed", value: 60, at: at(1, 8), schemaVersion: 1 },
  ]);
  const pos1: CyclePos = { cycleIndex: 0, week: 0, dayOrdinal: 2 };
  const pos2: CyclePos = { cycleIndex: 1, week: 0, dayOrdinal: 2 };
  const s1 = sessionIdFor(seed.id, seed.version, pos1);
  const s2 = sessionIdFor(seed.id, seed.version, pos2);
  const lastSet = (sessionId: string, day: number): SetRecord => ({
    id: `${sessionId}-w1d2-sumo-t2-work-7`,
    sessionId,
    slotId: "w1d2-sumo-t2",
    exerciseId: "sumoDeadlift",
    setType: "work",
    targetWeight: 42,
    targetReps: 8,
    actualWeight: 42,
    actualReps: 5,
    completedAt: at(day, 11),
    schemaVersion: 1,
  });
  await appendSet(lastSet(s1, 2));
  await appendSession(sessionCompletedFor(pos1, 2, 14));
  await appendSet(lastSet(s2, 9));
  await appendSession(sessionCompletedFor(pos2, 9, 14));
  await useProgramStore.getState().load();
  const proposal = useProgramStore.getState().pendingProposals.find((p) => p.type === "t2Deload");
  if (!proposal) throw new Error("fixture 오류: t2Deload 제안 생성 실패");
  return proposal;
}

/** 랫풀다운 accessory(day1) 2연속 하한 미달(5<8) → accessoryRollback 제안(options=[15]) */
async function setupAccessoryRollback(): Promise<Proposal> {
  await seedOnboarded();
  const pos1: CyclePos = { cycleIndex: 0, week: 0, dayOrdinal: 1 };
  const pos2: CyclePos = { cycleIndex: 1, week: 0, dayOrdinal: 1 };
  const s1 = sessionIdFor(seed.id, seed.version, pos1);
  const s2 = sessionIdFor(seed.id, seed.version, pos2);
  const missSet = (sessionId: string, day: number): SetRecord => ({
    id: `${sessionId}-w1d1-latpull-acc-work-2`,
    sessionId,
    slotId: "w1d1-latpull-acc",
    exerciseId: "latPulldown",
    setType: "work",
    targetWeight: 20,
    targetReps: 8,
    actualWeight: 20,
    actualReps: 5,
    completedAt: at(day, 11),
    schemaVersion: 1,
  });
  await appendSet(missSet(s1, 1));
  await appendSession(sessionCompletedFor(pos1, 1, 14));
  await appendSet(missSet(s2, 8));
  await appendSession(sessionCompletedFor(pos2, 8, 14));
  await useProgramStore.getState().load();
  const proposal = useProgramStore.getState().pendingProposals.find((p) => p.type === "accessoryRollback");
  if (!proposal) throw new Error("fixture 오류: accessoryRollback 제안 생성 실패");
  return proposal;
}

afterEach(() => {
  cleanup();
});

beforeEach(async () => {
  await resetDb();
  useProgramStore.setState(useProgramStore.getInitialState(), true);
});

describe("ProposalCard", () => {
  it("① 제안 없음 → 카드 미표시", async () => {
    await seedOnboarded();
    await useProgramStore.getState().load();
    expect(useProgramStore.getState().pendingProposals).toHaveLength(0);

    render(<ProposalList proposals={useProgramStore.getState().pendingProposals} />);
    expect(screen.queryAllByTestId("proposal-card")).toHaveLength(0);
  });

  it("② tmDeload 제안 → label + 2옵션(동결/−5) 렌더", async () => {
    const proposal = await setupTmDeload();
    render(<ProposalCard proposal={proposal} />);

    expect(screen.getByText(proposal.label)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "85kg" })).toBeInTheDocument(); // 동결(현재 TM 유지)
    expect(screen.getByRole("button", { name: "80kg" })).toBeInTheDocument(); // −5
    expect(screen.getByRole("button", { name: "동결/보류" })).toBeInTheDocument();
  });

  it("③ 옵션 클릭 → DecisionEvent append(kind=deloadAccepted, value=선택값)", async () => {
    const proposal = await setupTmDeload();
    render(<ProposalCard proposal={proposal} />);

    fireEvent.click(screen.getByRole("button", { name: "80kg" }));

    await waitFor(async () => {
      const decisions = await db.decisions.toArray();
      expect(
        decisions.some(
          (d) =>
            d.kind === "deloadAccepted" &&
            d.value === 80 &&
            d.target.kind === "tm" &&
            d.target.exerciseId === "squat" &&
            d.sourceSetRecordId === proposal.sourceSetRecordId,
        ),
      ).toBe(true);
    });
  });

  it("④ 승인 후 refreshAfterWrite → pendingProposals에서 그 제안 제거", async () => {
    const proposal = await setupTmDeload();
    render(<ProposalCard proposal={proposal} />);

    fireEvent.click(screen.getByRole("button", { name: "80kg" }));

    await waitFor(() => {
      expect(useProgramStore.getState().pendingProposals.some((p) => p.type === "tmDeload")).toBe(false);
    });
  });

  it("⑤ 여러 제안 동시 렌더 (TM 1개 + 악세사리 1개)", async () => {
    const tmProposal = await setupTmDeload();
    const accProposal = await setupAccessoryRollback();

    const proposals = useProgramStore.getState().pendingProposals;
    expect(proposals).toHaveLength(2);

    render(<ProposalList proposals={proposals} />);
    expect(screen.getAllByTestId("proposal-card")).toHaveLength(2);
    expect(screen.getByText(tmProposal.label)).toBeInTheDocument();
    expect(screen.getByText(accProposal.label)).toBeInTheDocument();
  });

  it("⑥ t2Deload/accessoryRollback/tmBonus — kind 매핑 표 전수 검증", async () => {
    // tmBonus -> bonusAccepted
    const bonusProposal = await setupTmBonus();
    const bonusView = render(<ProposalCard proposal={bonusProposal} />);
    fireEvent.click(screen.getByRole("button", { name: "95kg" }));
    await waitFor(async () => {
      const decisions = await db.decisions.toArray();
      expect(
        decisions.some(
          (d) => d.kind === "bonusAccepted" && d.value === 95 && d.sourceSetRecordId === bonusProposal.sourceSetRecordId,
        ),
      ).toBe(true);
    });
    bonusView.unmount();

    // t2Deload -> t2DeloadAccepted
    const t2Proposal = await setupT2Deload();
    const t2View = render(<ProposalCard proposal={t2Proposal} />);
    fireEvent.click(screen.getByRole("button", { name: "57.5kg" }));
    await waitFor(async () => {
      const decisions = await db.decisions.toArray();
      expect(
        decisions.some(
          (d) =>
            d.kind === "t2DeloadAccepted" && d.value === 57.5 && d.sourceSetRecordId === t2Proposal.sourceSetRecordId,
        ),
      ).toBe(true);
    });
    t2View.unmount();

    // accessoryRollback -> rollbackAccepted
    const accProposal = await setupAccessoryRollback();
    const accView = render(<ProposalCard proposal={accProposal} />);
    fireEvent.click(screen.getByRole("button", { name: "15kg" }));
    await waitFor(async () => {
      const decisions = await db.decisions.toArray();
      expect(
        decisions.some(
          (d) =>
            d.kind === "rollbackAccepted" &&
            d.value === 15 &&
            d.target.kind === "accessory" &&
            d.target.slotId === "w1d1-latpull-acc" &&
            d.sourceSetRecordId === accProposal.sourceSetRecordId,
        ),
      ).toBe(true);
    });
    accView.unmount();
  });
});
