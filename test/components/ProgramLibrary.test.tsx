import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, within, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { useProgramStore } from "../../src/store/programStore";
import { loadFoldInput } from "../../src/storage/eventStore";
import { listPrograms } from "../../src/store/queries";
import { foldState } from "../../src/domain/fold";
import { ProgramLibrary } from "../../src/components/ProgramLibrary";
import type { DecisionEvent, ProgramDefinition } from "../../src/domain/types.ts";
import { resetDb } from "../helpers/db";
import { loadSeedProgram, seedOnboarded as seedOnboardedHelper } from "../helpers/seed";

// Task 2(Stage1-C3) — ProgramLibrary: 목록·전환·가져오기(파일/URL).
// 실 nSuns 시드 + 실 store/eventStore(fake-indexeddb)로 온보딩 완료 상태를 재현해 검증한다
// (ExerciseSwap.test.tsx·programStore.test.ts와 동일 패턴).

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

/** 시드 프로그램을 복제해 id/name/version만 바꾼 두 번째(유효한) 프로그램 — 가져오기 fixture. */
function secondProgram(overrides: Partial<ProgramDefinition> = {}): ProgramDefinition {
  return { ...seed, id: "second-prog", name: "두 번째 프로그램", version: 1, ...overrides };
}

/** 스키마 위반(slots 누락) — validate 실패 경로 fixture. */
function invalidProgramJson(): string {
  const p = {
    id: "bad-prog",
    name: "잘못된 프로그램",
    version: 1,
    schemaVersion: 1,
    weeks: [{ days: [{ ordinal: 1, name: "day1" }] }], // slots 누락
  };
  return JSON.stringify(p);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(async () => {
  await resetDb();
  useProgramStore.setState(useProgramStore.getInitialState(), true);
});

describe("ProgramLibrary", () => {
  it("① 목록 렌더 + 활성 프로그램 표시", async () => {
    await seedOnboarded();
    await useProgramStore.getState().importProgram(secondProgram());
    await useProgramStore.getState().load();

    render(<ProgramLibrary />);

    // "내장 프로그램" 섹션에도 동일한 프로그램명이 나타날 수 있으므로(Task3) 활성 목록(program-library-list)으로 스코핑.
    const libraryList = screen.getByTestId("program-library-list");
    const seedItem = await within(libraryList).findByText((text) => text.includes(seed.name));
    const li = seedItem.closest("li")!;
    expect(li.textContent).toContain("활성");
    expect(li.textContent).toContain(`v${seed.version}`);

    const secondItem = within(libraryList).getByText(/두 번째 프로그램/);
    const secondLi = secondItem.closest("li")!;
    expect(secondLi.textContent).not.toContain("활성");
    expect(screen.getByRole("button", { name: "이 프로그램으로 전환" })).toBeInTheDocument();
  });

  it("② 전환 → 기존 이력(foldState 결과) 불변", async () => {
    await seedOnboarded();
    await useProgramStore.getState().importProgram(secondProgram());
    await useProgramStore.getState().load();

    const beforeFold = foldState(await loadFoldInput());

    render(<ProgramLibrary />);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(await screen.findByRole("button", { name: "이 프로그램으로 전환" }));

    await waitFor(() => {
      expect(useProgramStore.getState().activeProgram?.id).toBe("second-prog");
    });

    const afterFold = foldState(await loadFoldInput());
    expect(afterFold.tm).toEqual(beforeFold.tm);
    confirmSpy.mockRestore();
  });

  it("③ 파일 가져오기 성공 → 라이브러리 등록", async () => {
    await seedOnboarded();
    await useProgramStore.getState().load();

    render(<ProgramLibrary />);

    const file = new File([JSON.stringify(secondProgram())], "program.json", { type: "application/json" });
    const input = screen.getByTestId("program-import-file-input") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await screen.findByText(/두 번째 프로그램/);
  });

  it("④ validate 실패 파일 → 에러 나열, 미등록", async () => {
    await seedOnboarded();
    await useProgramStore.getState().load();

    render(<ProgramLibrary />);

    const file = new File([invalidProgramJson()], "bad.json", { type: "application/json" });
    const input = screen.getByTestId("program-import-file-input") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.queryByText(/잘못된 프로그램/)).not.toBeInTheDocument();
  });

  it("⑤ URL 가져오기(fetch mock) 성공", async () => {
    await seedOnboarded();
    await useProgramStore.getState().load();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify(secondProgram()) }),
    );

    render(<ProgramLibrary />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "https://example.com/program.json" } });
    fireEvent.click(screen.getByRole("button", { name: "URL로 가져오기" }));

    await screen.findByText(/두 번째 프로그램/);
  });

  it("⑦(Stage1-C3 T3) calendar 모드 전환 — validateAnchor 불일치 startDate → 에러·전환 안 됨", async () => {
    await seedOnboarded();
    await useProgramStore.getState().load();

    render(<ProgramLibrary />);

    fireEvent.click(screen.getByRole("radio", { name: "calendar" }));
    // 시드 첫 훈련 요일은 화(2026-07-07) — 수요일(2026-07-08)은 불일치.
    fireEvent.change(screen.getByPlaceholderText("YYYY-MM-DD"), { target: { value: "2026-07-08" } });
    fireEvent.click(screen.getByRole("button", { name: "모드 적용" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByText(/시작일은 프로그램 첫 훈련 요일이어야 합니다/)).toBeInTheDocument();
    expect(useProgramStore.getState().instanceState?.mode).toBe("rolling");
  });

  it("⑧ 내장 프로그램 섹션 렌더 + 온보딩 완료 상태(이미 라이브러리에 있음) → '추가됨' 표시", async () => {
    await seedOnboarded();
    await useProgramStore.getState().load();

    render(<ProgramLibrary />);

    // "프로그램 라이브러리" 활성 목록에도 같은 이름이 나타나므로 bundled-programs-list로 스코핑.
    const bundledList = screen.getByTestId("bundled-programs-list");
    const bundledItem = await within(bundledList).findByText((text) => text.includes(seed.name));
    const li = bundledItem.closest("li")!;
    // isAdded 여부는 refresh()의 비동기 listPrograms() 완료 후 반영되므로 waitFor로 대기.
    await waitFor(() => {
      expect(li.textContent).toContain("추가됨");
    });
  });

  it("⑨ 내장 프로그램 '라이브러리에 추가' 클릭 → listPrograms 증가 + '추가됨'으로 전환", async () => {
    await useProgramStore.getState().load(); // 온보딩 전(라이브러리 비어있음)
    expect(await listPrograms()).toHaveLength(0);

    render(<ProgramLibrary />);

    const bundledList = screen.getByTestId("bundled-programs-list");
    const bundledItem = await within(bundledList).findByText((text) => text.includes(seed.name));
    const li = bundledItem.closest("li")!;
    const addButton = within(li).getByRole("button", { name: "라이브러리에 추가" });
    fireEvent.click(addButton);

    await waitFor(async () => {
      expect(await listPrograms()).toHaveLength(1);
    });
    await waitFor(() => {
      expect(li.textContent).toContain("추가됨");
    });
  });

  it("⑥ 활성 프로그램 재전환(같은 프로그램)도 새 InstanceState 생성 — no-op 아님", async () => {
    await seedOnboarded();
    await useProgramStore.getState().load();
    expect(useProgramStore.getState().instanceState?.anchor).toEqual({});

    await useProgramStore.getState().switchProgram({
      programId: seed.id,
      programVersion: seed.version,
      mode: "rolling",
      anchor: { startDate: "2099-01-01" },
      schemaVersion: 1,
    });

    expect(useProgramStore.getState().instanceState?.anchor).toEqual({ startDate: "2099-01-01" });
  });
});
