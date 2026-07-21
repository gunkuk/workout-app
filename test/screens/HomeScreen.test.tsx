import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { db } from "../../src/storage/db";
import { appendSession, appendSet, appendCorrection } from "../../src/storage/eventStore";
import { useProgramStore } from "../../src/store/programStore";
import { HomeScreen } from "../../src/screens/HomeScreen";
import { resetDb } from "../helpers/db";
import { loadSeedProgram, seedOnboarded } from "../helpers/seed";
import type { DecisionEvent, SessionCompleted } from "../../src/domain/types.ts";

// 신규 홈/대시보드 화면 — 프로그램 카드(이름+주간 진행률) + 오늘 카드(오늘 세션 미리보기+시작 버튼).
// 실제 nSuns 시드 + eventStore + programStore(zustand, 실제)로 재현(AnalyticsScreen.test.tsx와 동일 패턴).

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

describe("HomeScreen", () => {
  it("① 온보딩 후 활성 프로그램 이름을 렌더한다", async () => {
    await onboard();
    render(<HomeScreen onStartSession={vi.fn()} onLogFreeWorkout={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(seed.name)).toBeInTheDocument());
  });

  it("② 오늘 day의 운동 이름들을 렌더한다", async () => {
    await onboard();
    const todayPos = useProgramStore.getState().todayPos!;
    const day = seed.weeks[todayPos.week]!.days[todayPos.dayOrdinal - 1]!;
    const firstSlot = day.slots[0]!;

    const { exerciseInfo } = await import("../../src/domain/exerciseLibrary");
    const displayName = exerciseInfo(firstSlot.exerciseId)?.name ?? firstSlot.exerciseId;

    render(<HomeScreen onStartSession={vi.fn()} onLogFreeWorkout={vi.fn()} />);

    expect(await screen.findByText(displayName)).toBeInTheDocument();
  });

  it("③ '오늘 운동 시작' 버튼 클릭 시 onStartSession 호출", async () => {
    await onboard();
    const onStartSession = vi.fn();
    render(<HomeScreen onStartSession={onStartSession} onLogFreeWorkout={vi.fn()} />);

    const btn = await screen.findByRole("button", { name: "오늘 운동 시작" });
    fireEvent.click(btn);
    expect(onStartSession).toHaveBeenCalledTimes(1);
  });

  it("⑥ '크로스핏 · 자유 운동 기록' 버튼 클릭 시 onLogFreeWorkout 호출", async () => {
    await onboard();
    const onLogFreeWorkout = vi.fn();
    render(<HomeScreen onStartSession={vi.fn()} onLogFreeWorkout={onLogFreeWorkout} />);

    const btn = await screen.findByRole("button", { name: "크로스핏 · 자유 운동 기록" });
    fireEvent.click(btn);
    expect(onLogFreeWorkout).toHaveBeenCalledTimes(1);
  });

  // UI14 item4 — "이번 주"가 아니라 프로그램 전체 사이클(모든 주 × 주당 일수) 기준 진행도로 변경.
  // nsuns-5day 시드는 1주 반복(week 1개, 5일)이라 "사이클 전체"와 "그 주"가 수치상 같다.
  it("④ 완료된 세션 없을 때 사이클 진행률 0/M 표시", async () => {
    await onboard();
    const totalCycle = seed.weeks.reduce((n, w) => n + w.days.length, 0);

    render(<HomeScreen onStartSession={vi.fn()} onLogFreeWorkout={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(new RegExp(`이번 사이클 0/${totalCycle} 완료`))).toBeInTheDocument());
  });

  it("⑤ 이번 주 세션 1개 완료 후 사이클 진행률 1/M로 갱신", async () => {
    await onboard();
    const todayPos = useProgramStore.getState().todayPos!;
    const totalCycle = seed.weeks.reduce((n, w) => n + w.days.length, 0);

    const completedSession: SessionCompleted = {
      id: "sc-home-test",
      sessionId: "home-test-session",
      at: at(2),
      cyclePos: todayPos,
      status: "completed",
      programId: seed.id,
      programVersion: seed.version,
      schemaVersion: 1,
    };
    await appendSession(completedSession);

    render(<HomeScreen onStartSession={vi.fn()} onLogFreeWorkout={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(new RegExp(`이번 사이클 1/${totalCycle} 완료`))).toBeInTheDocument());
  });

  // UI5 T2 — 체성분/부상·수행능력/출석 스트립 카드 3종 추가 검증.

  it("⑦ 체성분 빠른입력 → 저장 → DB 반영 + 입력값 초기화, 2건째부터 듀얼차트+범례 노출", async () => {
    await onboard();
    render(<HomeScreen onStartSession={vi.fn()} onLogFreeWorkout={vi.fn()} />);
    await screen.findByText("기록이 쌓이면 추이가 표시됩니다");

    const weightInputEl = screen.getByLabelText("몸무게 입력") as HTMLInputElement;
    const bodyFatInputEl = screen.getByLabelText("체지방 입력") as HTMLInputElement;

    fireEvent.change(weightInputEl, { target: { value: "80" } });
    fireEvent.click(screen.getByRole("button", { name: "기록" }));

    await waitFor(async () => expect(await db.bodyMetrics.count()).toBe(1));
    await waitFor(() => expect(weightInputEl.value).toBe(""));

    fireEvent.change(weightInputEl, { target: { value: "79.5" } });
    fireEvent.change(bodyFatInputEl, { target: { value: "17.5" } });
    fireEvent.click(screen.getByRole("button", { name: "기록" }));

    await waitFor(async () => expect(await db.bodyMetrics.count()).toBe(2));
    const legend = await screen.findByTestId("linechart-legend");
    expect(legend).toHaveTextContent("몸무게 79.5");
    expect(legend).toHaveTextContent("체지방 17.5");
  });

  it("⑧ 부상 기록 추가 → 칩 표시(n일째) → 탭+confirm → resolveInjury 반영, 칩 사라짐", async () => {
    await onboard();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<HomeScreen onStartSession={vi.fn()} onLogFreeWorkout={vi.fn()} />);
    await screen.findByText("현재 부상 없음");

    fireEvent.click(screen.getByRole("button", { name: "+ 부상 기록" }));
    fireEvent.change(screen.getByLabelText("부상 부위"), { target: { value: "왼쪽 어깨" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    const chip = await screen.findByRole("button", { name: /왼쪽 어깨 · \d+일째/ });
    expect(chip).toBeInTheDocument();

    fireEvent.click(chip);
    await waitFor(() => expect(screen.queryByRole("button", { name: /왼쪽 어깨/ })).not.toBeInTheDocument());
    await screen.findByText("현재 부상 없음");

    confirmSpy.mockRestore();
  });


/** 날짜 독립 헬퍼(2026-07-20 수정, UI14 item5 date-string으로 업데이트): 오늘이 무슨 요일이든
 *  "이번 주"(월요일 시작) 기준 오프셋 날짜를 로컬 yyyy-mm-dd로 만든다 — 실행 요일에 따라 그 날짜가
 *  지난 주로 밀려도(달력 그리드 자체가 이번 달 전체이므로) 영향 없다. attendance-cell 테스트id는
 *  이제 이 날짜 문자열 그대로 쓴다(HomeScreen.tsx `attendance-cell-${cell.date}`).
 */
function thisWeekDateStr(offsetFromMonday: number): string {
  const now = new Date();
  const dow = now.getDay(); // 0=일
  const mondayDelta = dow === 0 ? -6 : 1 - dow;
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayDelta + offsetFromMonday);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

  it("⑨ 출석 월간 달력 — complete/partial/none 3종 셀 상태 렌더(이번 주 목/금/토)", async () => {
    await onboard();
    const todayPos = useProgramStore.getState().todayPos!;
    // 이번 주 목: 완료 세션 → complete. 이번 주 금: 세트기록만(완료 세션 없음) → partial.
    // 이번 주 토: 아무 기록 없음, 그러나 훈련일(nsuns-5day는 화~토)이므로 → none(off 아님).
    await appendSession({
      id: "att-complete",
      sessionId: "att-complete-session",
      at: `${thisWeekDateStr(3)}T10:00:00`,
      cyclePos: todayPos,
      status: "completed",
      programId: seed.id,
      programVersion: seed.version,
      schemaVersion: 1,
    });
    await appendSet({
      id: "att-partial-set",
      sessionId: "att-partial-session",
      exerciseId: "bench",
      targetWeight: 100,
      targetReps: 5,
      actualWeight: 100,
      actualReps: 5,
      completedAt: `${thisWeekDateStr(4)}T10:00:00`,
      schemaVersion: 1,
    });

    render(<HomeScreen onStartSession={vi.fn()} onLogFreeWorkout={vi.fn()} />);

    const completeCell = await screen.findByTestId(`attendance-cell-${thisWeekDateStr(3)}`); // 목, 이번 주
    const partialCell = screen.getByTestId(`attendance-cell-${thisWeekDateStr(4)}`); // 금, 이번 주
    const noneCell = screen.getByTestId(`attendance-cell-${thisWeekDateStr(5)}`); // 토, 이번 주

    expect(completeCell).toHaveClass("is-complete");
    expect(partialCell).toHaveClass("is-partial");
    expect(partialCell).not.toHaveClass("is-complete");
    expect(noneCell).not.toHaveClass("is-complete");
    expect(noneCell).not.toHaveClass("is-partial");
    expect(noneCell).not.toHaveClass("is-off");
  });

  // UI7 — 수행능력↔프로그램 자동 커플링(TM = 0.9 × 1RM 역산) 검증.

  // UI14 item6 — 수행능력 카드에서 TM 줄(흰색 볼드) 제거, 환산 1RM(≈)·측정 e1RM(teal)만 표시.
  // liftSummary()가 반환하는 tm 필드 자체는 그대로 유지(프로그램 탭 TM 편집, item9가 소비) — 렌더만 안 함.

  // "벤치프레스"라는 텍스트가 홈의 "오늘" 카드(슬롯 목록)에도 등장하므로, 전역 screen 쿼리 대신
  // 수행능력 카드의 그 행(data-testid="lift-summary-bench")으로 스코프를 좁혀 모호성을 없앤다.
  it("⑩ 수행능력 카드 — TM 105(벤치) → 환산 1RM ≈116.7만 표시(TM 숫자 자체는 렌더 안 함, 측정값 없음)", async () => {
    await onboard();
    render(<HomeScreen onStartSession={vi.fn()} onLogFreeWorkout={vi.fn()} />);

    const row = await screen.findByTestId("lift-summary-bench");
    expect(within(row).getByText("벤치프레스")).toBeInTheDocument();
    expect(within(row).getByText("≈116.7")).toBeInTheDocument();
    expect(within(row).queryByText(/벤치프레스\s*105/)).not.toBeInTheDocument();
    expect(within(row).queryByText(/측정/)).not.toBeInTheDocument();
  });

  it("⑪ 실측 AMRAP topSet 존재 → '측정 {e1RM}' 행이 환산 1RM과 함께 표시(TM 숫자는 표시 안 함)", async () => {
    await onboard();
    await appendSet({
      id: "measured-topset",
      sessionId: "measured-session",
      exerciseId: "bench",
      targetWeight: 100,
      targetReps: 1,
      actualWeight: 100,
      actualReps: 3,
      amrapRole: "topSet",
      completedAt: at(3),
      schemaVersion: 1,
    });

    render(<HomeScreen onStartSession={vi.fn()} onLogFreeWorkout={vi.fn()} />);

    const row = await screen.findByTestId("lift-summary-bench");
    expect(within(row).getByText("벤치프레스")).toBeInTheDocument();
    expect(within(row).getByText("≈116.7")).toBeInTheDocument();
    expect(within(row).queryByText(/벤치프레스\s*105/)).not.toBeInTheDocument();
    expect(within(row).getByText("측정 110")).toBeInTheDocument(); // epley(100,3) = 110
  });

  it("⑫ 취소(revoked)된 세션(Stage1-UI9, 진행 위치 뒤로 이동)은 사이클 진행률에서 제외됨", async () => {
    await onboard();
    const todayPos = useProgramStore.getState().todayPos!;
    const totalCycle = seed.weeks.reduce((n, w) => n + w.days.length, 0);

    const completedSession: SessionCompleted = {
      id: "sc-revoked-test",
      sessionId: "revoked-test-session",
      at: at(2),
      cyclePos: todayPos,
      status: "completed",
      programId: seed.id,
      programVersion: seed.version,
      schemaVersion: 1,
    };
    await appendSession(completedSession);
    await appendCorrection({
      id: "corr-revoke-home",
      supersedes: completedSession.id,
      revoked: true,
      at: at(3),
      schemaVersion: 1,
    });

    render(<HomeScreen onStartSession={vi.fn()} onLogFreeWorkout={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(new RegExp(`이번 사이클 0/${totalCycle} 완료`))).toBeInTheDocument());
  });

  // UI14 item4 — 멀티주(mesocycle) 프로그램에서 "이번 사이클" 진행도가 현재 주가 아니라 프로그램
  // 전체(모든 주 × 주당 일수)를 분모로 쓰는지 검증. kk-4day(실제 7주 구조, 매주 5일 = 사이클 전체
  // 35일)를 시드해 분모가 개별 주(5일)가 아니라 전체(35일)인지, 다른 주에 세션 1개 완료 시 분자가
  // 정확히 늘어나는지 확인한다.
  it("⑬ 멀티주 프로그램(kk-4day, 7주×5일=35일 사이클) — 전체 사이클 기준 진행도 + 현재 주차 표시", async () => {
    const { readFileSync } = await import("node:fs");
    const kk4 = JSON.parse(readFileSync("programs/kk-4day.json", "utf8")) as typeof seed;
    const kk4Decisions: DecisionEvent[] = (["bench", "ohp", "squat", "deadlift"] as const).map((exerciseId) => ({
      id: `seed-kk4-${exerciseId}`,
      target: { kind: "tm", exerciseId },
      kind: "seed",
      value: TM[exerciseId],
      at: at(1),
      schemaVersion: 1,
    }));
    await seedOnboarded(kk4, kk4Decisions, at(1));
    await useProgramStore.getState().load();
    await waitFor(() => expect(useProgramStore.getState().status).toBe("ready"));
    const todayPos = useProgramStore.getState().todayPos!;
    const totalCycle = kk4.weeks.reduce((n: number, w: { days: unknown[] }) => n + w.days.length, 0);

    render(<HomeScreen onStartSession={vi.fn()} onLogFreeWorkout={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText(new RegExp(`이번 사이클 0/${totalCycle} 완료`))).toBeInTheDocument(),
    );
    expect(
      screen.getByText(new RegExp(`${todayPos.week + 1}/${kk4.weeks.length}주차`)),
    ).toBeInTheDocument();

    // 다른 주(week 0이 아닌, todayPos와 다른 week)에 완료 세션 1개를 추가해도 "전체 사이클" 분자에 반영돼야 함
    // (이전 "이번 주"방식이었다면 다른 주 세션은 0/M에서 변화가 없었을 것).
    const otherWeek = (todayPos.week + 1) % kk4.weeks.length;
    await appendSession({
      id: "sc-kk4-otherweek",
      sessionId: "kk4-otherweek-session",
      at: at(2),
      cyclePos: { cycleIndex: todayPos.cycleIndex, week: otherWeek, dayOrdinal: 1 },
      status: "completed",
      programId: kk4.id,
      programVersion: kk4.version,
      schemaVersion: 1,
    });

    cleanup();
    render(<HomeScreen onStartSession={vi.fn()} onLogFreeWorkout={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText(new RegExp(`이번 사이클 1/${totalCycle} 완료`))).toBeInTheDocument(),
    );
  });
});
