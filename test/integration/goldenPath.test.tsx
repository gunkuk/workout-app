import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { db } from "../../src/storage/db";
import { useProgramStore } from "../../src/store/programStore";
import App from "../../src/App";
import { resetDb } from "../helpers/db";
import { mockMatchMedia } from "../helpers/dom";
import { completeAllRows, waitForWarmupSettled } from "../helpers/todayScreenInteractions";

// Task 8 — 통합 골든패스(자동): 온보딩→오늘 세션 완주→히스토리 반영→새로고침 후 영속 확인.
// TodayScreen.test.tsx·OnboardingScreen.test.tsx·App.test.tsx와 동일한 픽스처 패턴(실제 nSuns 시드,
// eventStore/programStore/App 전부 실제 — mock 없음, fake-indexeddb 위에서 진짜 앱 렌더).
// 이 테스트만 온보딩 폼에서 T1·T2 8종 TM 전부를 채운다(다른 화면 테스트들은 missingTM/needsInit UX를
// 검증하려 일부러 T2를 비워두지만, 골든패스는 "정상 완주" 경로이므로 전부 채워 T2도 missingTM이 아니게 한다).

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

const TM_VALUES: Record<string, string> = {
  bench: "105",
  ohp: "67.5",
  squat: "85",
  deadlift: "140",
  sumoDeadlift: "120",
  frontSquat: "70",
  inclineBench: "70",
  cgbp: "70",
};

afterEach(() => {
  cleanup();
});

beforeEach(async () => {
  await resetDb();
  useProgramStore.setState(useProgramStore.getInitialState(), true);
  mockMatchMedia(false);
  window.location.hash = "";
});

describe("골든패스(통합)", () => {
  it(
    "온보딩 제출 → 오늘 세션 완주 → 세션완료 → 히스토리 반영 → 새로고침 후 다음 사이클-주로 영속",
    async () => {
      // 1. 빈 DB로 App을 첫 렌더 — status "empty" → 온보딩 강제 라우팅(App.tsx).
      const { container } = render(<App />);
      await screen.findByText("온보딩 — 트레이닝 맥스(TM) 설정");

      // 2. 8개 TM 전부 입력 후 제출.
      for (const id of EXERCISE_IDS) {
        const input = screen.getByTestId(`tm-input-${id}`) as HTMLInputElement;
        fireEvent.change(input, { target: { value: TM_VALUES[id] } });
      }
      fireEvent.click(screen.getByRole("button", { name: "시작하기" }));

      // 3. status "ready" 전환 확인 — 온보딩이 seed+library+instance 저장 후 programStore.load()까지 마쳤음.
      await waitFor(() => expect(useProgramStore.getState().status).toBe("ready"));
      const day1Plan = useProgramStore.getState().todayPlan!;
      expect(day1Plan.pos).toEqual({ cycleIndex: 0, week: 0, dayOrdinal: 1 });

      // 3-b. UI3: 온보딩 완료 후엔 홈(대시보드)에 진입 — "오늘 운동 시작"으로 세션에 들어간다.
      fireEvent.click(await screen.findByRole("button", { name: "오늘 운동 시작" }));
      await waitFor(() => expect(window.location.hash).toBe("#/today"));

      // 4. 오늘 화면(day1: 벤치T1+OHP T2+랫풀 accessory) 렌더 확인 — 워밍업+작업세트 전부 존재.
      await screen.findByRole("heading", { level: 2, name: day1Plan.dayName });
      const totalWork = day1Plan.slots.reduce((n, s) => n + s.sets.length, 0);
      const totalWarmup = day1Plan.slots.reduce((n, s) => n + s.warmups.length, 0);
      expect(totalWork).toBeGreaterThan(0);
      expect(totalWarmup).toBeGreaterThan(0);
      await waitForWarmupSettled();
      // UI14 item2 — 워밍업도 이제 SetRow(같은 setrow- testid)로 렌더되므로 총 개수는 작업세트+워밍업.
      expect(container.querySelectorAll('[data-testid^="setrow-"]').length).toBe(totalWork + totalWarmup);
      expect(container.querySelectorAll('[data-testid^="warmup-"]').length).toBe(totalWarmup);

      // 5. 전 작업세트 체크오프(일반 세트는 탭, needsInit 악세사리는 자유입력 후 제출).
      await completeAllRows(container);

      // 6. "세션 완료" 탭 → SessionCompleted append + 히스토리로 라우팅(App.tsx의 onSessionComplete).
      const completeBtn = await screen.findByRole("button", { name: "세션 완료" });
      fireEvent.click(completeBtn);

      await waitFor(() => expect(window.location.hash).toBe("#/history"));
      const sessionsAfterComplete = await db.sessions.toArray();
      expect(sessionsAfterComplete).toHaveLength(1);
      const completedSession = sessionsAfterComplete[0]!;
      expect(completedSession.cyclePos).toEqual({ cycleIndex: 0, week: 0, dayOrdinal: 1 });

      // 7. 히스토리 화면에 방금 끝낸 세션이 나타나는지 확인.
      await screen.findByRole("heading", { level: 2, name: "히스토리" });
      expect(screen.getByTestId(`session-row-${completedSession.id}`)).toBeInTheDocument();

      // 8. "새로고침" 시뮬레이션 — 실제 페이지 새로고침은 JS 메모리(zustand 모듈 싱글턴 포함)를 전부
      //    지우고 IndexedDB만 남긴다. 컴포넌트 unmount만으로는 zustand 상태가 그대로 남으므로(모듈
      //    싱글턴은 언마운트로 리셋되지 않음), 진짜 "새로고침 후에도 영속" 여부를 증명하려면 store도
      //    명시적으로 초기 상태로 되돌린 뒤 다시 마운트해야 한다(URL 해시는 새로고침에도 보존되므로
      //    그대로 둔다 — 실제로도 #/history인 채로 새로고침되는 상황).
      cleanup();
      useProgramStore.setState(useProgramStore.getInitialState(), true);

      const reloaded = render(<App />);
      await waitFor(() => expect(useProgramStore.getState().status).toBe("ready"));

      // 9. 해시가 #/history로 보존된 채 새로고침됐으므로 히스토리 화면이 먼저 뜬다 — 세션이 여전히
      //    남아있는지(진짜 영속) 확인한 뒤, 오늘 탭으로 이동해 다음 사이클-주 계획을 확인한다.
      await reloaded.findByRole("heading", { level: 2, name: "히스토리" });
      expect(reloaded.getByTestId(`session-row-${completedSession.id}`)).toBeInTheDocument();

      // UI3: "오늘"은 더 이상 탭이 아니다 — 세션 화면(#/today)으로 직접 이동해 다음 날 계획을 확인한다.
      act(() => {
        window.location.hash = "#/today";
      });

      await waitFor(() => {
        expect(useProgramStore.getState().todayPos).toEqual({ cycleIndex: 0, week: 0, dayOrdinal: 2 });
      });
      const day2Plan = useProgramStore.getState().todayPlan!;
      expect(day2Plan.pos).toEqual({ cycleIndex: 0, week: 0, dayOrdinal: 2 });
      expect(day2Plan.dayName).not.toBe(day1Plan.dayName);
      await reloaded.findByRole("heading", { level: 2, name: day2Plan.dayName });
    },
    15000
  );
});
