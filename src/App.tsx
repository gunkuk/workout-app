import { useEffect, useState } from "react";
import { useProgramStore } from "./store/programStore";
import { HomeScreen } from "./screens/HomeScreen";
import { TodayScreen } from "./screens/TodayScreen";
import { ProgramScreen } from "./screens/ProgramScreen";
import { HistoryScreen } from "./screens/HistoryScreen";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { AnalyticsScreen } from "./screens/AnalyticsScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { NavShell, type NavRoute } from "./components/NavShell";
import { InstallBanner } from "./components/InstallBanner";

type RouteName = "home" | "session" | "program" | "history" | "analytics" | "settings" | "onboarding";

function parseRoute(hash: string): RouteName {
  const path = hash.replace(/^#/, "");
  if (path === "/today" || path === "/session") return "session";
  if (path === "/program") return "program";
  if (path === "/history") return "history";
  if (path === "/analytics") return "analytics";
  if (path === "/settings") return "settings";
  if (path === "/onboarding") return "onboarding";
  return "home";
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
    return <div className="loading-state">로딩 중...</div>;
  }

  // 온보딩 전(라이브러리·인스턴스 없음) — 현재 해시가 무엇이든 온보딩으로 강제.
  if (status === "empty") {
    return (
      <>
        <InstallBanner />
        <div className="app-content">
          <OnboardingScreen onComplete={() => navigate("/home")} />
        </div>
      </>
    );
  }

  // status === "ready" (UI3): 홈(대시보드)이 기본 화면. 세션 로깅(TodayScreen)은 탭이 아니라
  // 홈의 "오늘 운동 시작"에서 진입하고, 완료 시 홈으로 돌아와 갱신된 달성률을 보여준다.
  // 하단 탭 하이라이트(NavRoute)는 home/program/history/analytics 4개 — session·settings는
  // home 하이라이트로 취급하되 실제 렌더는 route로 먼저 분기한다.
  const activeRoute: NavRoute =
    route === "history" ? "history" : route === "analytics" ? "analytics" : route === "program" ? "program" : "home";

  return (
    <div>
      <InstallBanner />
      <div className="app-content">
        {route === "settings" ? (
          <SettingsScreen />
        ) : route === "session" ? (
          // 세션 완료 → 히스토리로 이동(방금 끝낸 세션을 바로 확인). 홈으로 돌아가면 갱신된 달성률을 본다.
          <TodayScreen onSessionComplete={() => navigate("/history")} />
        ) : route === "program" ? (
          <ProgramScreen />
        ) : route === "history" ? (
          <HistoryScreen />
        ) : route === "analytics" ? (
          <AnalyticsScreen />
        ) : (
          <HomeScreen onStartSession={() => navigate("/today")} />
        )}
      </div>
      <NavShell active={activeRoute} />
    </div>
  );
}
