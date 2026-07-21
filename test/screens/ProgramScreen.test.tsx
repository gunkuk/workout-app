import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { useProgramStore } from "../../src/store/programStore";
import { loadFoldInput } from "../../src/storage/eventStore";
import { tmHistory } from "../../src/domain/e1rm";
import { ProgramScreen } from "../../src/screens/ProgramScreen";
import type { DecisionEvent, ProgramDefinition } from "../../src/domain/types.ts";
import { resetDb } from "../helpers/db";
import { loadSeedProgram, seedOnboarded as seedOnboardedHelper } from "../helpers/seed";

/** input이 속한 <li> 안의 "저장" 버튼만 클릭 — Object.entries(tm) 순서에 의존하지 않음. */
function saveButtonFor(input: HTMLElement): HTMLElement {
  const li = input.closest("li");
  if (!li) throw new Error("fixture 오류: input이 li 안에 없음");
  return within(li as HTMLElement).getByRole("button", { name: "저장" });
}

// Task — ProgramScreen: 활성 프로그램 description을 토글로 보여주는 섹션 검증
// (ProgramLibrary.test.tsx와 동일한 실 nSuns 시드 + 실 store/eventStore fixture 패턴).

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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(async () => {
  await resetDb();
  useProgramStore.setState(useProgramStore.getInitialState(), true);
});

describe("ProgramScreen", () => {
  it("설명 토글 버튼 클릭 시 프로그램 설명이 펼쳐진다", async () => {
    await seedOnboarded();
    await useProgramStore.getState().load();

    render(<ProgramScreen />);

    const toggle = await screen.findByRole("button", { name: /설명 보기/ });
    expect(toggle).toBeInTheDocument();
    expect(screen.queryByText(/T1 = 강도/)).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(screen.getByText(/왜 T2는 저중량 고볼륨/)).toBeInTheDocument();
    expect(screen.getByText(/T1 = 강도/)).toBeInTheDocument();
  });

  // Stage1-UI7 — 진행 위치 조정 카드(rolling 모드 전용).
  it("⑤ 진행 위치 카드 — 현재 위치 라인과 이동 버튼이 렌더된다", async () => {
    await seedOnboarded();
    await useProgramStore.getState().load();

    render(<ProgramScreen />);

    expect(await screen.findByText(/다음 세션: 1주차 화 — 벤치 volume \+ OHP/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이 위치로 이동" })).toBeInTheDocument();
  });

  it("⑥ 주차·요일 선택 후 이동 → 확인 다이얼로그 수락 시 커서가 이동하고 완료 메시지가 뜬다", async () => {
    await seedOnboarded();
    await useProgramStore.getState().load();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<ProgramScreen />);
    await screen.findByText(/다음 세션:/);

    const weekInput = screen.getByLabelText("주차") as HTMLInputElement;
    fireEvent.change(weekInput, { target: { value: "2" } });
    const daySelect = screen.getByLabelText("요일") as HTMLSelectElement;
    fireEvent.change(daySelect, { target: { value: "3" } }); // 목 — OHP + 인클라인

    fireEvent.click(screen.getByRole("button", { name: "이 위치로 이동" }));

    expect(confirmSpy).toHaveBeenCalled();
    await screen.findByText("이동 완료.");
    expect(useProgramStore.getState().todayPos).toEqual({ cycleIndex: 1, week: 0, dayOrdinal: 3 });

    confirmSpy.mockRestore();
  });

  // Stage1-UI8 — 자동 생성 루틴 표(RoutineTable). kk4day-seed.test.mjs와 동일한 readFileSync 패턴으로
  // kk-4day(2주 사이클, 화요일만 주차별 상이)를 로드해 병합·분기 로직을 검증한다.
  it("⑦ 루틴 표 — kk-4day(7주 메조): 화요일은 구성별 그룹(볼륨/헤비/디로드), 월요일은 1~6주차 병합+디로드 분리", async () => {
    const kk4day = JSON.parse(readFileSync("programs/kk-4day.json", "utf8")) as ProgramDefinition;
    const kk4dayDecisions: DecisionEvent[] = (["bench", "ohp", "squat", "deadlift"] as const).map((exerciseId) => ({
      id: `seed-${exerciseId}`,
      target: { kind: "tm", exerciseId },
      kind: "seed",
      value: TM[exerciseId],
      at: at(1, 8),
      schemaVersion: 1,
    }));
    await seedOnboardedHelper(kk4day, kk4dayDecisions, at(1, 8));
    await useProgramStore.getState().load();

    render(<ProgramScreen />);

    const toggle = await screen.findByRole("button", { name: /루틴 표 보기|설명 보기/ });
    fireEvent.click(toggle);

    expect(screen.getAllByText(/티바 로우/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/데드리프트/).length).toBeGreaterThan(0);
    // 7주 메조: 화 = 볼륨(1·3·5주차) / 헤비(2·4·6주차) / 디로드(7주차) 3그룹
    expect(screen.getByText("화 (1·3·5주차)")).toBeInTheDocument();
    expect(screen.getByText("화 (2·4·6주차)")).toBeInTheDocument();
    expect(screen.getByText("화 (7주차)")).toBeInTheDocument();
    // 월 = 누적 6주 동일 구성 병합 + 디로드 주 분리
    expect(screen.getByText("월 (1~6주차)")).toBeInTheDocument();
    expect(screen.getByText("월 (7주차)")).toBeInTheDocument();
  });

  it("⑧ 루틴 표 — nsuns-5day(단일 주): 주차 접미사 없이 렌더된다", async () => {
    await seedOnboarded();
    await useProgramStore.getState().load();

    render(<ProgramScreen />);

    const toggle = await screen.findByRole("button", { name: /설명 보기/ });
    fireEvent.click(toggle);

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.queryByText(/주차\)/)).not.toBeInTheDocument();
  });
});

// UI14 item9 — TM 수동 편집 섹션을 SettingsScreen에서 이관(원래 Stage1-C3 T4). programStore.tm을
// 렌더하고, 저장 시 DecisionEvent{kind:"manual"}을 만들어 acceptProposal(=appendDecision+refresh)을
// 재사용한다. 테스트도 SettingsScreen.test.tsx에서 그대로 옮겨왔다(동일 시맨틱, 화면만 이동).
describe("ProgramScreen — TM/1RM 편집(item9, 구 SettingsScreen Stage1-C3 T4)", () => {
  it("① TM 수동 편집 → fold 반영(programStore.tm 변경) + 읽기전용 환산 1RM 동시 표시", async () => {
    await seedOnboarded();
    await useProgramStore.getState().load();
    render(<ProgramScreen />);

    expect(await screen.findByRole("heading", { name: "TM / 1RM 편집" })).toBeInTheDocument();
    // 대칭성(item9) — 편집 가능한 TM 입력 옆에 읽기전용 환산 1RM(est1RM = TM/0.9)도 표시.
    expect(screen.getByText(/환산 1RM ≈116.7/)).toBeInTheDocument(); // 105 / 0.9 = 116.67 → 116.7

    const input = screen.getByTestId("tm-input-bench");
    fireEvent.change(input, { target: { value: "110" } });
    fireEvent.click(saveButtonFor(input));

    await waitFor(() => expect(useProgramStore.getState().tm.bench).toBe(110));
  });

  it("② manual 결정이 이력(tmHistory)에 나타남", async () => {
    await seedOnboarded();
    await useProgramStore.getState().load();
    render(<ProgramScreen />);

    const input = await screen.findByTestId("tm-input-squat");
    fireEvent.change(input, { target: { value: "90" } });
    fireEvent.click(saveButtonFor(input));

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
    await seedOnboarded();
    await useProgramStore.getState().load();
    render(<ProgramScreen />);

    const input = await screen.findByTestId("tm-input-ohp");
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.click(saveButtonFor(input));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    const foldInput = await loadFoldInput();
    expect(foldInput.decisions.some((d) => d.kind === "manual")).toBe(false);
  });
});
