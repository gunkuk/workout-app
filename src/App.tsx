import { useEffect, useState } from "react";
import { useProgramStore } from "./store/programStore";
import { TodayScreen } from "./screens/TodayScreen";
import { HistoryScreen } from "./screens/HistoryScreen";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { AnalyticsScreen } from "./screens/AnalyticsScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { NavShell, type NavRoute } from "./components/NavShell";
import { InstallBanner } from "./components/InstallBanner";

type RouteName = "today" | "history" | "analytics" | "settings" | "onboarding";

function parseRoute(hash: string): RouteName {
  const path = hash.replace(/^#/, "");
  if (path === "/history") return "history";
  if (path === "/analytics") return "analytics";
  if (path === "/settings") return "settings";
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
    return (
      <>
        <InstallBanner />
        <OnboardingScreen onComplete={() => navigate("/today")} />
      </>
    );
  }

  // status === "ready": #/today·#/history·#/analytics·#/settings만 실제 화면, 그 외 해시는 오늘 화면으로 취급.
  // settings는 NavShell의 3탭(NavRoute) 어디에도 속하지 않는 별도 화면(T7 — 설정 진입점은 4번째
  // 탭이 아니라 NavShell의 상단 아이콘, T5가 잠근 3탭 구조는 그대로 유지). activeRoute는 하단 탭
  // 하이라이트 전용이라 settings일 때도 "today"로 취급하지만, 실제 렌더링은 route로 먼저 분기한다.
  const activeRoute: NavRoute = route === "history" ? "history" : route === "analytics" ? "analytics" : "today";

  return (
    <div>
      <InstallBanner />
      {route === "settings" ? (
        <SettingsScreen />
      ) : activeRoute === "history" ? (
        <HistoryScreen />
      ) : activeRoute === "analytics" ? (
        <AnalyticsScreen />
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
