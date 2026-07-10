import { useEffect, useState } from "react";
import { useProgramStore } from "./store/programStore";
import { TodayScreen } from "./screens/TodayScreen";
import { HistoryScreen } from "./screens/HistoryScreen";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { NavShell, type NavRoute } from "./components/NavShell";

type RouteName = "today" | "history" | "onboarding";

function parseRoute(hash: string): RouteName {
  const path = hash.replace(/^#/, "");
  if (path === "/history") return "history";
  if (path === "/onboarding") return "onboarding";
  return "today";
}

function navigate(path: string): void {
  window.location.hash = path;
}

export default function App() {
  const status = useProgramStore((s) => s.status);
  const load = useProgramStore((s) => s.load);
  const [route, setRoute] = useState<RouteName>(() => parseRoute(window.location.hash));

  // programStore.status의 초기값을 확립 — 앱 마운트 시 1회.
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (status === "loading") {
    return <div>로딩 중...</div>;
  }

  // 온보딩 전(라이브러리·인스턴스 없음) — 현재 해시가 무엇이든 온보딩으로 강제.
  if (status === "empty") {
    return <OnboardingScreen onComplete={() => navigate("/today")} />;
  }

  // status === "ready": #/today·#/history만 실제 화면, 그 외 해시는 오늘 화면으로 취급.
  const activeRoute: NavRoute = route === "history" ? "history" : "today";

  return (
    <div>
      {activeRoute === "history" ? (
        <HistoryScreen />
      ) : (
        // 세션 완료 → 히스토리로 이동(선택 근거는 리포트 .superpowers/sdd/c1-task-7-report.md 참조:
        // 방금 끝낸 세션을 바로 확인하는 편이 데모상 더 만족스럽고, 자동전진 자체는 히스토리에서
        // 다시 오늘 탭으로 돌아왔을 때 todayPlan이 이미 다음 날로 갱신돼 있음으로 증명된다).
        <TodayScreen onSessionComplete={() => navigate("/history")} />
      )}
      <NavShell active={activeRoute} />
    </div>
  );
}
