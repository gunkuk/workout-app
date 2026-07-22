import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { useProgramStore } from "../../src/store/programStore";
import { ProgramScreen } from "../../src/screens/ProgramScreen";
import type { DecisionEvent, ProgramDefinition } from "../../src/domain/types.ts";
import { resetDb } from "../helpers/db";
import { loadSeedProgram, seedOnboarded as seedOnboardedHelper } from "../helpers/seed";

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

// 항목3 — SettingsScreen 폐지에 따라 백업 내보내기/가져오기 UI를 이 화면 맨 하단으로 이관
// (원래 SettingsScreen.test.tsx의 "백업" 헤딩 검증을 그대로 옮겨왔다, 로직은 lib/backup.ts 그대로).
describe("ProgramScreen — 백업(항목3, 구 SettingsScreen)", () => {
  it("맨 하단에 백업 카드(내보내기 버튼 + 가져오기 파일input)가 렌더된다", async () => {
    await seedOnboarded();
    await useProgramStore.getState().load();
    render(<ProgramScreen />);

    expect(await screen.findByRole("heading", { name: "백업" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "내보내기" })).toBeInTheDocument();
    expect(screen.getByTestId("import-file-input")).toBeInTheDocument();
  });
});
