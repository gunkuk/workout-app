import { describe, it, expect, afterEach, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import { db } from "../../src/storage/db";
import { appendSession, appendSet, appendDecision } from "../../src/storage/eventStore";
import { HistoryScreen } from "../../src/screens/HistoryScreen";
import type { SessionCompleted, SetRecord, DecisionEvent } from "../../src/domain/types.ts";

// Task 6(C1) — HistoryScreen: 캘린더 없이 세션 리스트만(최신순) + 클릭 시 세트 요약 펼침.
// Task 4(C2) — TM 이력 + e1RM 차트 통합(아래 ④~⑦ 케이스 추가).
// 실제 eventStore + fake-indexeddb로 세션·세트·결정을 시드하고 렌더해 검증(다른 screens 테스트와 동일 패턴).

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

/** TM 결정 이벤트 헬퍼 — kind는 fold.ts상 seed·manual 구분 없이 동일하게 tm[exerciseId]=value로 반영된다. */
function tmDecision(id: string, exerciseId: string, value: number, at: string): DecisionEvent {
  return {
    id,
    target: { kind: "tm", exerciseId },
    kind: "manual",
    value,
    at,
    schemaVersion: 1,
  };
}

afterEach(() => {
  cleanup();
});

beforeEach(async () => {
  await Promise.all([db.setRecords.clear(), db.sessions.clear(), db.decisions.clear(), db.corrections.clear()]);
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

  it("④ 운동 선택 → tmHistory 호출 결과가 TM 차트에 반영(값이 바뀐 시점만큼 좌표 생성)", async () => {
    await appendSession(session("s1"));
    await appendDecision(tmDecision("d-seed", "bench", 100, "2026-07-01T08:00:00Z"));
    await appendDecision(tmDecision("d-manual", "bench", 110, "2026-07-05T08:00:00Z"));

    render(<HistoryScreen />);
    await screen.findByTestId("session-row-s1");

    fireEvent.change(screen.getByTestId("history-exercise-select"), { target: { value: "bench" } });

    const tmSection = await screen.findByTestId("tm-history-chart");
    const polyline = await waitFor(() => within(tmSection).getByTestId("linechart-polyline"));
    const coords = polyline.getAttribute("points")!.trim().split(" ");
    expect(coords).toHaveLength(2); // 100 → 110, 서로 다른 값이므로 압축되지 않고 둘 다 유지
  });

  it("⑤ e1rmSeries — 원종목/대체종목 분리 표시(테스트 픽스처에 대체 세트 1건 포함)", async () => {
    await appendSession(session("s1"));
    await appendSet(
      setRec("plain-1", {
        sessionId: "s1",
        exerciseId: "deadlift",
        amrapRole: "topSet",
        actualWeight: 140,
        actualReps: 3,
        completedAt: "2026-07-02T09:00:00Z",
      }),
    );
    await appendSet(
      setRec("sub-1", {
        sessionId: "s1",
        exerciseId: "deadlift",
        amrapRole: "topSet",
        actualWeight: 60,
        actualReps: 5,
        substitutedFrom: "deadlift",
        completedAt: "2026-07-03T09:00:00Z",
      }),
    );

    render(<HistoryScreen />);
    await screen.findByTestId("session-row-s1");
    fireEvent.change(screen.getByTestId("history-exercise-select"), { target: { value: "deadlift" } });

    expect(await screen.findByTestId("e1rm-chart-plain")).toBeInTheDocument();
    expect(await screen.findByTestId("e1rm-chart-substituted")).toBeInTheDocument();
    expect(screen.queryByTestId("e1rm-chart-empty")).not.toBeInTheDocument();
  });

  it("⑥ 데이터 없는 운동(악세사리) 선택 → '데이터 부족'(LineChart 공용 빈 상태 재사용, 중복 메시지 없음)", async () => {
    await appendSession(session("s1"));
    render(<HistoryScreen />);
    await screen.findByTestId("session-row-s1");

    fireEvent.change(screen.getByTestId("history-exercise-select"), { target: { value: "machineCurl" } });

    const tmSection = await screen.findByTestId("tm-history-chart");
    expect(within(tmSection).getByText("데이터 부족")).toBeInTheDocument();
    expect(await screen.findByTestId("e1rm-chart-empty")).toBeInTheDocument();
  });

  it("⑦ 값 변화 압축 — 연속 동일 TM 값은 중복 좌표로 나타나지 않음(tmHistory 자체 계약, 화면 통합 확인)", async () => {
    await appendSession(session("s1"));
    await appendDecision(tmDecision("d-seed", "squat", 100, "2026-07-01T08:00:00Z"));
    await appendDecision(tmDecision("d-same", "squat", 100, "2026-07-02T08:00:00Z")); // 동일 값 — 압축
    await appendDecision(tmDecision("d-diff", "squat", 105, "2026-07-03T08:00:00Z"));

    render(<HistoryScreen />);
    await screen.findByTestId("session-row-s1");
    fireEvent.change(screen.getByTestId("history-exercise-select"), { target: { value: "squat" } });

    const tmSection = await screen.findByTestId("tm-history-chart");
    const polyline = await waitFor(() => within(tmSection).getByTestId("linechart-polyline"));
    const coords = polyline.getAttribute("points")!.trim().split(" ");
    expect(coords).toHaveLength(2); // 결정 3건이지만 압축되어 100·105 두 좌표만
  });
});
