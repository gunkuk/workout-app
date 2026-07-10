import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { db } from "../../src/storage/db";
import {
  appendSet,
  appendSession,
  upsertProgramVersion,
  listExternalSessions,
  addToLibrary,
  setInstanceState,
} from "../../src/storage/eventStore";
import { useProgramStore } from "../../src/store/programStore";
import { weeklyAnalysis } from "../../src/domain/analytics";
import { programKey } from "../../src/domain/foldSupport";
import { AnalyticsScreen } from "../../src/screens/AnalyticsScreen";
import * as queries from "../../src/store/queries";
import type { SessionCompleted, SetRecord } from "../../src/domain/types.ts";
import { loadSeedProgram } from "../helpers/seed";

// Task 5(C2) — AnalyticsScreen: weeklyAnalysis(domain/analytics.ts) 결과를 표로 렌더.
// 실제 nSuns 시드 + eventStore + programStore(zustand, 실제 — mock 아님)로 재현한다
// (HistoryScreen.test.tsx·TodayScreen.test.tsx와 동일 픽스처 패턴). programStore는 온보딩 플로우
// 전체를 재현하는 대신 이 화면이 실제로 읽는 필드(activeProgram·todayPos)만 직접 setState한다 —
// 이 화면은 그 두 필드 외 store 상태를 소비하지 않으므로 최소 셋업으로 충분(단순성 우선).

const seed = loadSeedProgram();
const programs = new Map([[programKey(seed.id, seed.version), seed]]);

function session(id: string, at: string, cyclePos: { cycleIndex: number; week: number; dayOrdinal: number }): SessionCompleted {
  return {
    id: `sc-${id}`,
    sessionId: id,
    at,
    cyclePos,
    status: "completed",
    programId: seed.id,
    programVersion: seed.version,
    schemaVersion: 1,
  };
}

function csrSet(id: string, sessionId: string, weight: number, reps: number, completedAt: string): SetRecord {
  return {
    id,
    sessionId,
    slotId: "w1d5-csr-acc",
    exerciseId: "chestSupportedRow", // exerciseLibrary groups: ["back"]
    targetWeight: weight,
    targetReps: reps,
    actualWeight: weight,
    actualReps: reps,
    rir: 2, // isRirValid 폴백 경로(슬롯 스펙 못 찾는 주)에서도 유효로 잡히도록 고정
    completedAt,
    schemaVersion: 1,
  };
}

/** week0 세션(3세트, 40kg×8) — firstAt이 더 이름 */
const week0Session = session("w0", "2026-07-01T09:00:00Z", { cycleIndex: 0, week: 0, dayOrdinal: 5 });
const week0Sets = [0, 1, 2].map((i) => csrSet(`w0-${i}`, "w0", 40, 8, `2026-07-01T09:0${i}:00Z`));

/** week1 세션(2세트, 50kg×6) — firstAt이 더 나중(최신) */
const week1Session = session("w1", "2026-07-08T09:00:00Z", { cycleIndex: 0, week: 1, dayOrdinal: 5 });
const week1Sets = [0, 1].map((i) => csrSet(`w1-${i}`, "w1", 50, 6, `2026-07-08T09:0${i}:00Z`));

async function seedTwoWeeks(): Promise<void> {
  await upsertProgramVersion(seed);
  await appendSession(week0Session);
  await appendSession(week1Session);
  for (const s of week0Sets) await appendSet(s);
  for (const s of week1Sets) await appendSet(s);
}

function setStoreReady(todayPos: { cycleIndex: number; week: number; dayOrdinal: number }): void {
  useProgramStore.setState({ status: "ready", activeProgram: seed, todayPos });
}

afterEach(() => {
  cleanup();
});

beforeEach(async () => {
  await Promise.all([
    db.setRecords.clear(),
    db.corrections.clear(),
    db.decisions.clear(),
    db.sessions.clear(),
    db.programVersions.clear(),
    db.externalSessions.clear(),
  ]);
  useProgramStore.setState(useProgramStore.getInitialState(), true);
});

describe("AnalyticsScreen", () => {
  it("① 현재 위치와 매칭되는 버킷이 없으면 최신 주(firstAt 최신) 기본 표시", async () => {
    await seedTwoWeeks();
    // todayPos를 어떤 버킷과도 매칭되지 않는 미래 주로 설정 → fallback: firstAt이 가장 최신인 week1.
    setStoreReady({ cycleIndex: 0, week: 5, dayOrdinal: 5 });

    render(<AnalyticsScreen />);

    await waitFor(() => expect(screen.getByTestId("analytics-week-label")).toHaveTextContent("2주차"));
    expect(screen.getByTestId("analytics-validSets-back")).toHaveTextContent("2");
    expect(screen.getByTestId("analytics-tonnage-back")).toHaveTextContent("600");
  });

  it("② 부위별 수치가 domain weeklyAnalysis 직접 호출 결과와 일치", async () => {
    await seedTwoWeeks();
    setStoreReady({ cycleIndex: 0, week: 1, dayOrdinal: 5 }); // week1과 정확히 매칭

    const expected = weeklyAnalysis({
      sets: [...week0Sets, ...week1Sets],
      corrections: [],
      sessions: [week0Session, week1Session],
      programs,
      externalSessions: [],
    }).find((b) => b.week === 1)!;

    render(<AnalyticsScreen />);

    await waitFor(() => expect(screen.getByTestId("analytics-week-label")).toHaveTextContent("2주차"));
    expect(screen.getByTestId("analytics-validSets-back")).toHaveTextContent(String(expected.groups.back!.validSets));
    expect(screen.getByTestId("analytics-tonnage-back")).toHaveTextContent(String(expected.groups.back!.tonnage));
    expect(screen.getByTestId("analytics-frequency-back")).toHaveTextContent(String(expected.groups.back!.frequency));
  });

  it("③ 하체 각주가 표와 함께 항상 렌더(고정 문구 그대로)", async () => {
    await seedTwoWeeks();
    setStoreReady({ cycleIndex: 0, week: 1, dayOrdinal: 5 });

    render(<AnalyticsScreen />);

    expect(
      await screen.findByText("nSuns 구조상 하체 유효세트는 상체보다 낮게 표시됩니다(프로그램 특성)"),
    ).toBeInTheDocument();
  });

  it("④ 이전/다음 버튼으로 같은 programId 내 버킷 이동(firstAt 순)", async () => {
    await seedTwoWeeks();
    setStoreReady({ cycleIndex: 0, week: 1, dayOrdinal: 5 }); // 기본: week1(최신)

    render(<AnalyticsScreen />);
    await waitFor(() => expect(screen.getByTestId("analytics-week-label")).toHaveTextContent("2주차"));

    fireEvent.click(screen.getByRole("button", { name: "이전 주" }));
    await waitFor(() => expect(screen.getByTestId("analytics-week-label")).toHaveTextContent("1주차"));
    expect(screen.getByTestId("analytics-validSets-back")).toHaveTextContent("3");
    expect(screen.getByTestId("analytics-tonnage-back")).toHaveTextContent("960");

    fireEvent.click(screen.getByRole("button", { name: "다음 주" }));
    await waitFor(() => expect(screen.getByTestId("analytics-week-label")).toHaveTextContent("2주차"));
    expect(screen.getByTestId("analytics-validSets-back")).toHaveTextContent("2");
  });

  it("⑤ 세션 없음 → 빈 상태 메시지", async () => {
    setStoreReady({ cycleIndex: 0, week: 0, dayOrdinal: 5 });

    render(<AnalyticsScreen />);

    expect(await screen.findByText("아직 분석할 세션 데이터가 없습니다")).toBeInTheDocument();
  });

  it("⑥ loadEventLog 실패 → role=alert 에러 표시", async () => {
    setStoreReady({ cycleIndex: 0, week: 0, dayOrdinal: 5 });
    const spy = vi.spyOn(queries, "loadEventLog").mockRejectedValue(new Error("boom"));

    render(<AnalyticsScreen />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    spy.mockRestore();
  });

  it("⑦(Stage1-C3 T4) 외부 세션 추가 → 그 주 빈도 +1(validSets·톤수 불변)", async () => {
    await seedTwoWeeks();
    // recordExternalSession이 내부적으로 get().load()(실제 DB 재조회)를 호출하므로, 다른 테스트와
    // 달리 raw setState만으로는 부족 — library·instanceState도 실제로 채워둬야 load() 후에도
    // status:"ready"·activeProgram이 유지된다(비어있으면 load()가 EMPTY_STATE로 되돌림).
    await addToLibrary(seed.id, "2026-07-01T00:00:00Z");
    await setInstanceState({ programId: seed.id, programVersion: seed.version, mode: "rolling", anchor: {}, schemaVersion: 1 });
    setStoreReady({ cycleIndex: 0, week: 1, dayOrdinal: 5 }); // week1과 정확히 매칭 → todayPos 기준 cyclePos

    render(<AnalyticsScreen />);

    await waitFor(() => expect(screen.getByTestId("analytics-week-label")).toHaveTextContent("2주차"));
    expect(screen.getByTestId("analytics-validSets-back")).toHaveTextContent("2");
    expect(screen.getByTestId("analytics-tonnage-back")).toHaveTextContent("600");
    expect(screen.getByTestId("analytics-frequency-back")).toHaveTextContent("1");

    fireEvent.click(screen.getByTestId("external-group-back"));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(screen.getByTestId("analytics-frequency-back")).toHaveTextContent("2"));
    // 유효세트·톤수는 외부 세션의 영향을 받지 않는다(빈도만 가산).
    expect(screen.getByTestId("analytics-validSets-back")).toHaveTextContent("2");
    expect(screen.getByTestId("analytics-tonnage-back")).toHaveTextContent("600");

    const stored = await listExternalSessions();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      groups: ["back"],
      programId: seed.id,
      cyclePos: { cycleIndex: 0, week: 1 },
    });
  });
});
