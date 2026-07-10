import { describe, it, expect, afterEach, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import { db } from "../../src/storage/db";
import { appendSession, appendSet } from "../../src/storage/eventStore";
import { HistoryScreen } from "../../src/screens/HistoryScreen";
import type { SessionCompleted, SetRecord } from "../../src/domain/types.ts";

// Task 6 — HistoryScreen: 캘린더 없이 세션 리스트만(최신순) + 클릭 시 세트 요약 펼침.
// 실제 eventStore + fake-indexeddb로 세션·세트를 시드하고 렌더해 검증(다른 screens 테스트와 동일 패턴).

function session(id: string, over: Partial<SessionCompleted> = {}): SessionCompleted {
  return {
    id,
    sessionId: id,
    at: "2026-07-10T09:00:00Z",
    cyclePos: { cycleIndex: 0, week: 0, dayOrdinal: 1 },
    status: "completed",
    programId: "nsuns-5day",
    programVersion: 1,
    schemaVersion: 1,
    ...over,
  };
}

function setRec(id: string, over: Partial<SetRecord> = {}): SetRecord {
  return {
    id,
    sessionId: "s1",
    exerciseId: "bench",
    targetWeight: 100,
    targetReps: 5,
    actualWeight: 100,
    actualReps: 5,
    completedAt: "2026-07-10T09:00:00Z",
    schemaVersion: 1,
    ...over,
  };
}

afterEach(() => {
  cleanup();
});

beforeEach(async () => {
  await Promise.all([db.setRecords.clear(), db.sessions.clear()]);
});

describe("HistoryScreen", () => {
  it("① 세션 없음 → 빈 상태 메시지", async () => {
    render(<HistoryScreen />);
    expect(await screen.findByText("아직 기록된 세션이 없습니다")).toBeInTheDocument();
  });

  it("② 세션 2개 → 최신순(내림차순) 정렬", async () => {
    await appendSession(session("s-older", { at: "2026-07-01T09:00:00Z", sessionId: "older" }));
    await appendSession(session("s-newer", { at: "2026-07-08T09:00:00Z", sessionId: "newer" }));
    render(<HistoryScreen />);

    await waitFor(() => expect(screen.getByTestId("session-row-s-newer")).toBeInTheDocument());
    const rows = screen.getAllByRole("button").filter((el) => el.dataset.testid?.startsWith("session-row-"));
    expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual(["session-row-s-newer", "session-row-s-older"]);
  });

  it("③ 클릭 → 세트 요약 펼침(exerciseId + weight×reps)", async () => {
    await appendSession(session("s1", { sessionId: "sess1" }));
    await appendSet(setRec("set1", { sessionId: "sess1", exerciseId: "bench", actualWeight: 100, actualReps: 5 }));
    await appendSet(setRec("set2", { sessionId: "sess1", exerciseId: "squat", actualWeight: 85, actualReps: 3 }));
    // 다른 세션 소속 세트는 요약에 섞이면 안 됨.
    await appendSet(setRec("set3", { sessionId: "other-session", exerciseId: "ohp", actualWeight: 60, actualReps: 5 }));

    render(<HistoryScreen />);
    const row = await screen.findByTestId("session-row-s1");

    expect(screen.queryByTestId("session-sets-s1")).not.toBeInTheDocument();
    fireEvent.click(row);

    const summary = await screen.findByTestId("session-sets-s1");
    expect(within(summary).getByText("bench 100kg × 5")).toBeInTheDocument();
    expect(within(summary).getByText("squat 85kg × 3")).toBeInTheDocument();
    expect(within(summary).queryByText(/ohp/)).not.toBeInTheDocument();

    fireEvent.click(row);
    expect(screen.queryByTestId("session-sets-s1")).not.toBeInTheDocument();
  });
});
