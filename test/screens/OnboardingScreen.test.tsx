import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { getInstanceState, listLibrary, loadFoldInput, getProgram } from "../../src/storage/eventStore";
import { useProgramStore } from "../../src/store/programStore";
import { OnboardingScreen } from "../../src/screens/OnboardingScreen";
import { resetDb } from "../helpers/db";
import { mockMatchMedia } from "../helpers/dom";

// Task 5 — 온보딩: TM 시드(8종) + 최초 인스턴스 생성 + 설치 배너.
// 실제 nSuns 시드(component가 ?raw import로 읽는 것과 동일 파일)를 대상으로,
// 폼 제출 → eventStore(fake-indexeddb) 반영을 통합 검증한다(TodayScreen.test.tsx와 동일 픽스처 패턴).

const EXERCISE_IDS = [
  "bench",
  "ohp",
  "squat",
  "deadlift",
  "sumoDeadlift",
  "frontSquat",
  "inclineBench",
  "cgbp",
];

const VALID_VALUES: Record<string, string> = {
  bench: "100",
  ohp: "60",
  squat: "80",
  deadlift: "120",
  sumoDeadlift: "110",
  frontSquat: "70",
  inclineBench: "60",
  cgbp: "70",
};

function fillAll(values: Record<string, string>) {
  for (const id of EXERCISE_IDS) {
    const input = screen.getByTestId(`tm-input-${id}`) as HTMLInputElement;
    fireEvent.change(input, { target: { value: values[id] ?? "" } });
  }
}

afterEach(() => {
  cleanup();
});

beforeEach(async () => {
  await resetDb();
  useProgramStore.setState(useProgramStore.getInitialState(), true);
  mockMatchMedia(false); // 기본값: standalone 아님(배너 표시) — ④ 테스트에서만 true로 override
});

describe("OnboardingScreen", () => {
  it("① 폼 검증: 빈 값 제출 방지 (DB에 아무것도 안 쓰임, 에러 메시지 표시)", async () => {
    render(<OnboardingScreen />);

    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(await listLibrary()).toHaveLength(0);
    expect(await getInstanceState()).toBeUndefined();
    const input = await loadFoldInput();
    expect(input.decisions).toHaveLength(0);
  });

  it("② 제출 → DB에 8개 seed DecisionEvent + library + instanceState 생성", async () => {
    render(<OnboardingScreen />);
    fillAll(VALID_VALUES);
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));

    await waitFor(async () => {
      expect(await listLibrary()).toHaveLength(1);
    });

    const library = await listLibrary();
    expect(library[0]!.id).toBe("nsuns-5day");

    const program = await getProgram("nsuns-5day", 1);
    expect(program).toBeDefined();
    expect(program!.name).toContain("nSuns");

    const instance = await getInstanceState();
    expect(instance).toEqual({
      programId: "nsuns-5day",
      programVersion: 1,
      mode: "rolling",
      anchor: {},
      schemaVersion: 1,
    });

    const { decisions } = await loadFoldInput();
    expect(decisions).toHaveLength(8);
    for (const id of EXERCISE_IDS) {
      const d = decisions.find((dec) => dec.target.kind === "tm" && dec.target.exerciseId === id);
      expect(d).toBeDefined();
      expect(d!.kind).toBe("seed");
      expect(d!.value).toBe(Number(VALID_VALUES[id]));
    }
  });

  it("③ 제출 성공 후 onComplete 콜백 호출", async () => {
    const onComplete = vi.fn();
    render(<OnboardingScreen onComplete={onComplete} />);
    fillAll(VALID_VALUES);
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });

  it("④ standalone 감지에 따른 설치 배너 표시/숨김 분기", () => {
    mockMatchMedia(false);
    const notStandalone = render(<OnboardingScreen />);
    expect(notStandalone.getByTestId("install-banner")).toBeInTheDocument();
    notStandalone.unmount();

    mockMatchMedia(true);
    const standalone = render(<OnboardingScreen />);
    expect(standalone.queryByTestId("install-banner")).not.toBeInTheDocument();
  });
});
