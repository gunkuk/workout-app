import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { db } from "../../src/storage/db";
import { appendSession, appendSet, appendCorrection, loadFoldInput } from "../../src/storage/eventStore";
import { tmHistory } from "../../src/domain/e1rm";
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

  // 항목2a — TM/1RM 편집을 ProgramScreen.TmEditCard(구 SettingsScreen Stage1-C3 T4)에서 수행능력
  // 대시보드 맨 밑으로 이관. "TM/1RM 수정하기" 버튼을 눌러야 인라인 폼이 펼쳐진다(기본은 접혀 있음).
  // UI19 항목1 — 버튼을 btn-secondary로 더 눈에 띄게, 라벨을 "TM/1RM 수정하기"로 명확화(testid는 유지).
  describe("TM/1RM 편집(항목2a, 구 ProgramScreen.TmEditCard)", () => {
    it("① 기본은 접혀 있다가 'TM/1RM 수정하기' 클릭 시 펼쳐지고, 저장 → fold 반영 + 읽기전용 환산 1RM 표시", async () => {
      await onboard();
      render(<HomeScreen onStartSession={vi.fn()} onLogFreeWorkout={vi.fn()} />);

      const toggle = await screen.findByTestId("tm-edit-toggle");
      expect(screen.queryByTestId("tm-input-bench")).not.toBeInTheDocument();

      fireEvent.click(toggle);
      expect(await screen.findByTestId("tm-input-bench")).toBeInTheDocument();
      // 대칭성(항목2a) — 편집 가능한 TM 입력 옆에 읽기전용 환산 1RM(est1RM = TM/0.9)도 표시.
      expect(screen.getByText(/환산 1RM ≈116.7/)).toBeInTheDocument(); // 105 / 0.9 = 116.67 → 116.7

      const input = screen.getByTestId("tm-input-bench");
      fireEvent.change(input, { target: { value: "110" } });
      fireEvent.click(within(input.closest("li") as HTMLElement).getByRole("button", { name: "저장" }));

      await waitFor(() => expect(useProgramStore.getState().tm.bench).toBe(110));
    });

    it("② manual 결정이 이력(tmHistory)에 나타남", async () => {
      await onboard();
      render(<HomeScreen onStartSession={vi.fn()} onLogFreeWorkout={vi.fn()} />);

      fireEvent.click(await screen.findByTestId("tm-edit-toggle"));
      const input = await screen.findByTestId("tm-input-squat");
      fireEvent.change(input, { target: { value: "90" } });
      fireEvent.click(within(input.closest("li") as HTMLElement).getByRole("button", { name: "저장" }));

      await waitFor(() => expect(useProgramStore.getState().tm.squat).toBe(90));

      const foldInput = await loadFoldInput();
      const manualDecision = foldInput.decisions.find(
        (d) => d.kind === "manual" && d.target.kind === "tm" && d.target.exerciseId === "squat",
      );
      expect(manualDecision).toBeDefined();
      expect(manualDecision?.value).toBe(90);

      const history = tmHistory(foldInput, "squat");
      expect(history.at(-1)?.value).toBe(90);
    });

    it("올바르지 않은 숫자 입력 → role=alert 에러, 결정 미기록", async () => {
      await onboard();
      render(<HomeScreen onStartSession={vi.fn()} onLogFreeWorkout={vi.fn()} />);

      fireEvent.click(await screen.findByTestId("tm-edit-toggle"));
      const input = await screen.findByTestId("tm-input-ohp");
      fireEvent.change(input, { target: { value: "abc" } });
      fireEvent.click(within(input.closest("li") as HTMLElement).getByRole("button", { name: "저장" }));

      expect(await screen.findByRole("alert")).toBeInTheDocument();
      const foldInput = await loadFoldInput();
      expect(foldInput.decisions.some((d) => d.kind === "manual")).toBe(false);
    });
  });

  // UI19 항목1 — "TM 수정" 버튼을 btn-secondary(눈에 띄는 스타일) + "TM/1RM 수정하기" 라벨로.
  describe("항목1 — TM 수정 버튼 가시성", () => {
    it("btn-secondary 클래스 + 'TM/1RM 수정하기' 라벨, 펼치면 'TM/1RM 수정 접기'로 바뀐다", async () => {
      await onboard();
      render(<HomeScreen onStartSession={vi.fn()} onLogFreeWorkout={vi.fn()} />);

      const toggle = await screen.findByTestId("tm-edit-toggle");
      expect(toggle).toHaveClass("btn-secondary");
      expect(toggle).toHaveTextContent("TM/1RM 수정하기");

      fireEvent.click(toggle);
      expect(toggle).toHaveTextContent("TM/1RM 수정 접기");
    });
  });

  // UI19 항목2 — kk-6day(T1 = pullup/ohp/legPress/tbarRow/bench, TM 없는 종목 pullup/legPress 포함)로
  // 활성화했을 때 대시보드가 하드코딩 4대 리프트가 아니라 실제 프로그램 T1을 동적으로 보여주는지 검증.
  describe("항목2 — 프로그램 동적 T1 표시(kk-6day)", () => {
    async function onboardKk6day(): Promise<{ decisions: DecisionEvent[] }> {
      const { readFileSync } = await import("node:fs");
      const kk6 = JSON.parse(readFileSync("programs/kk-6day.json", "utf8")) as typeof seed;
      // kk-6day의 tbarRow는 tmSeeds(ref: deadlift, pct: 0.65)로 자동 시드되므로 별도 decision 불필요.
      const kk6Decisions: DecisionEvent[] = (["bench", "ohp", "squat", "deadlift"] as const).map((exerciseId) => ({
        id: `seed-kk6-${exerciseId}`,
        target: { kind: "tm", exerciseId },
        kind: "seed",
        value: TM[exerciseId],
        at: at(1),
        schemaVersion: 1,
      }));
      // tbarRow는 kk-6day.json의 tmSeeds(ref: deadlift, pct: 0.65)로 실 서비스에선 자동 시드되지만,
      // 그건 switchProgram() 경로(applyTmSeeds)에서만 적용된다 — 여기선 seedOnboarded+load()만 쓰므로
      // 테스트 목적상 명시적으로 같은 값(140*0.65=91)을 시드해 실제 활성화 결과와 동등하게 만든다.
      kk6Decisions.push({
        id: "seed-kk6-tbarRow",
        target: { kind: "tm", exerciseId: "tbarRow" },
        kind: "seed",
        value: 91,
        at: at(1),
        schemaVersion: 1,
      });
      await seedOnboarded(kk6, kk6Decisions, at(1));
      await useProgramStore.getState().load();
      await waitFor(() => expect(useProgramStore.getState().status).toBe("ready"));
      return { decisions: kk6Decisions };
    }

    it("수행능력 카드에 pullup/ohp/legPress/tbarRow/bench 5종이 모두 나타난다(하드코딩 4종이 아님)", async () => {
      await onboardKk6day();
      render(<HomeScreen onStartSession={vi.fn()} onLogFreeWorkout={vi.fn()} />);

      for (const id of ["pullup", "ohp", "legPress", "tbarRow", "bench"]) {
        expect(await screen.findByTestId(`lift-summary-${id}`)).toBeInTheDocument();
      }
      // squat/deadlift는 kk-6day의 T1이 아니므로 수행능력 카드에 나타나지 않는다.
      expect(screen.queryByTestId("lift-summary-squat")).not.toBeInTheDocument();
      expect(screen.queryByTestId("lift-summary-deadlift")).not.toBeInTheDocument();
    });

    it("TM 없는 종목(pullup/legPress)은 스킵되지 않고 '기록 없음'으로 표시된다", async () => {
      await onboardKk6day();
      render(<HomeScreen onStartSession={vi.fn()} onLogFreeWorkout={vi.fn()} />);

      const pullupRow = await screen.findByTestId("lift-summary-pullup");
      expect(within(pullupRow).getByText("풀업")).toBeInTheDocument();
      expect(within(pullupRow).getByText("기록 없음")).toBeInTheDocument();

      const legPressRow = screen.getByTestId("lift-summary-legPress");
      expect(within(legPressRow).getByText("레그 프레스")).toBeInTheDocument();
      expect(within(legPressRow).getByText("기록 없음")).toBeInTheDocument();
    });

    it("TM 없는 종목(pullup)에 실측 기록이 있으면 최고 무게(kg)를 표시한다", async () => {
      await onboardKk6day();
      await appendSet({
        id: "pullup-set-1",
        sessionId: "pullup-sess-1",
        exerciseId: "pullup",
        setType: "work",
        targetWeight: 20,
        targetReps: 5,
        actualWeight: 20,
        actualReps: 5,
        completedAt: at(2),
        schemaVersion: 1,
      });

      render(<HomeScreen onStartSession={vi.fn()} onLogFreeWorkout={vi.fn()} />);

      const pullupRow = await screen.findByTestId("lift-summary-pullup");
      expect(within(pullupRow).getByText("20kg")).toBeInTheDocument();
    });

    it("TM 있는 종목(ohp/bench/tbarRow)은 환산 1RM(≈)을 표시한다", async () => {
      await onboardKk6day();
      render(<HomeScreen onStartSession={vi.fn()} onLogFreeWorkout={vi.fn()} />);

      const ohpRow = await screen.findByTestId("lift-summary-ohp");
      expect(within(ohpRow).getByText(/^≈/)).toBeInTheDocument();
      const tbarRow = screen.getByTestId("lift-summary-tbarRow");
      expect(within(tbarRow).getByText(/^≈/)).toBeInTheDocument();
    });
  });

  // UI19 항목3 — TM 패널 종목 그룹핑(T1 → T2(T1 중복 제외) → 기본 운동(중복 제외) → 전체 보기) + PR 날짜.
  describe("항목3 — TM 패널 재구성(kk-6day)", () => {
    async function onboardKk6day(): Promise<void> {
      const { readFileSync } = await import("node:fs");
      const kk6 = JSON.parse(readFileSync("programs/kk-6day.json", "utf8")) as typeof seed;
      const kk6Decisions: DecisionEvent[] = (["bench", "ohp", "squat", "deadlift"] as const).map((exerciseId) => ({
        id: `seed-kk6-${exerciseId}`,
        target: { kind: "tm", exerciseId },
        kind: "seed",
        value: TM[exerciseId],
        at: at(1),
        schemaVersion: 1,
      }));
      // tbarRow는 kk-6day.json의 tmSeeds(ref: deadlift, pct: 0.65)로 실 서비스에선 자동 시드되지만,
      // 그건 switchProgram() 경로(applyTmSeeds)에서만 적용된다 — 여기선 seedOnboarded+load()만 쓰므로
      // 테스트 목적상 명시적으로 같은 값(140*0.65=91)을 시드해 실제 활성화 결과와 동등하게 만든다.
      kk6Decisions.push({
        id: "seed-kk6-tbarRow",
        target: { kind: "tm", exerciseId: "tbarRow" },
        kind: "seed",
        value: 91,
        at: at(1),
        schemaVersion: 1,
      });
      await seedOnboarded(kk6, kk6Decisions, at(1));
      await useProgramStore.getState().load();
      await waitFor(() => expect(useProgramStore.getState().status).toBe("ready"));
    }

    it("T1 5종 모두 행으로 나타나고, T2 중 bench(T1과 중복)는 T2 그룹에서 빠진다", async () => {
      await onboardKk6day();
      render(<HomeScreen onStartSession={vi.fn()} onLogFreeWorkout={vi.fn()} />);

      fireEvent.click(await screen.findByTestId("tm-edit-toggle"));

      for (const id of ["pullup", "ohp", "legPress", "tbarRow", "bench"]) {
        expect(await screen.findByTestId(`tm-panel-row-${id}`)).toBeInTheDocument();
      }
      // T2 종목은 dumbbellRow/bench/oneArmRow/cgbp인데, bench는 T1에도 있으므로 T2 그룹에서는 1번만
      // (T1 쪽에 이미 렌더) — 같은 exerciseId로 두 번 나타나면 data-testid 중복이라 테스트가 즉시
      // 실패한다(getByTestId는 유일 매치를 요구). T2 전용 종목(dumbbellRow 등)은 그대로 나타난다.
      expect(screen.getAllByTestId("tm-panel-row-bench")).toHaveLength(1);
      expect(await screen.findByTestId("tm-panel-row-dumbbellRow")).toBeInTheDocument();
      expect(await screen.findByTestId("tm-panel-row-oneArmRow")).toBeInTheDocument();
      expect(await screen.findByTestId("tm-panel-row-cgbp")).toBeInTheDocument();
    });

    it("TM 없는 종목(pullup) 행은 읽기전용(입력/저장 버튼 없음), TM 있는 종목(ohp)은 편집 UI 포함", async () => {
      await onboardKk6day();
      render(<HomeScreen onStartSession={vi.fn()} onLogFreeWorkout={vi.fn()} />);

      fireEvent.click(await screen.findByTestId("tm-edit-toggle"));

      const pullupRow = await screen.findByTestId("tm-panel-row-pullup");
      expect(within(pullupRow).queryByTestId("tm-input-pullup")).not.toBeInTheDocument();
      expect(within(pullupRow).queryByRole("button", { name: "저장" })).not.toBeInTheDocument();
      expect(within(pullupRow).getByText("기록 없음")).toBeInTheDocument();

      const ohpRow = await screen.findByTestId("tm-panel-row-ohp");
      expect(within(ohpRow).getByTestId("tm-input-ohp")).toBeInTheDocument();
      expect(within(ohpRow).getByRole("button", { name: "저장" })).toBeInTheDocument();
    });

    it("최고 무게를 실제로 기록하면 그 날짜가 TM 패널 행에 표시된다(PR 날짜)", async () => {
      await onboardKk6day();
      await appendSet({
        id: "pullup-set-pr",
        sessionId: "pullup-sess-pr",
        exerciseId: "pullup",
        setType: "work",
        targetWeight: 22,
        targetReps: 5,
        actualWeight: 22,
        actualReps: 5,
        completedAt: at(2),
        schemaVersion: 1,
      });

      render(<HomeScreen onStartSession={vi.fn()} onLogFreeWorkout={vi.fn()} />);
      fireEvent.click(await screen.findByTestId("tm-edit-toggle"));

      const pullupRow = await screen.findByTestId("tm-panel-row-pullup");
      expect(within(pullupRow).getByText(new RegExp(`최고 무게 22kg \\(${at(2).slice(0, 10)}\\)`))).toBeInTheDocument();
    });

    it("기본 운동 그룹 — T1/T2에 없는 squat/deadlift가 표시된다(kk-6day는 T1/T2에 squat/deadlift 없음)", async () => {
      await onboardKk6day();
      render(<HomeScreen onStartSession={vi.fn()} onLogFreeWorkout={vi.fn()} />);

      fireEvent.click(await screen.findByTestId("tm-edit-toggle"));

      expect(await screen.findByTestId("tm-panel-row-squat")).toBeInTheDocument();
      expect(await screen.findByTestId("tm-panel-row-deadlift")).toBeInTheDocument();
    });

    it("'전체 보기' — 기본은 접혀 있고, 클릭하면 T1/T2/기본운동 어디에도 없는 실측 기록 종목(예: machineCurl)이 나타난다", async () => {
      await onboardKk6day();
      await appendSet({
        id: "curl-set-1",
        sessionId: "curl-sess-1",
        exerciseId: "machineCurl",
        setType: "work",
        targetWeight: 15,
        targetReps: 10,
        actualWeight: 15,
        actualReps: 10,
        completedAt: at(2),
        schemaVersion: 1,
      });

      render(<HomeScreen onStartSession={vi.fn()} onLogFreeWorkout={vi.fn()} />);
      fireEvent.click(await screen.findByTestId("tm-edit-toggle"));

      expect(screen.queryByTestId("tm-panel-row-machineCurl")).not.toBeInTheDocument();

      const showAllToggle = screen.getByTestId("tm-show-all-toggle");
      expect(showAllToggle).toHaveTextContent("전체 보기");
      fireEvent.click(showAllToggle);

      expect(await screen.findByTestId("tm-panel-row-machineCurl")).toBeInTheDocument();
      expect(showAllToggle).toHaveTextContent("전체 보기 접기");
    });
  });
});
