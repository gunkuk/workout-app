/**
 * Task 7(C1)/Task 5(C2) — 하단 탭 네비게이션. status === "ready"일 때만 App이 렌더한다(온보딩 중엔 탭 없음).
 * 탭 클릭은 window.location.hash를 바꾸는 것뿐 — 실제 화면 전환은 App의 hashchange 리스너가 담당한다.
 */

export type NavRoute = "home" | "program" | "history" | "analytics";

export type NavShellProps = {
  active: NavRoute;
};

// UI3 — Boostcamp식 IA: 홈(대시보드)이 첫 탭, 프로그램(라이브러리)을 하단 탭으로 승격.
// 세션 로깅 화면(TodayScreen)은 탭이 아니라 홈의 "오늘 운동 시작"에서 진입한다.
const TABS: { route: NavRoute; label: string; hash: string }[] = [
  { route: "home", label: "홈", hash: "/home" },
  { route: "program", label: "프로그램", hash: "/program" },
  { route: "history", label: "히스토리", hash: "/history" },
  { route: "analytics", label: "분석", hash: "/analytics" },
];

export function NavShell({ active }: NavShellProps) {
  return (
    <>
      <nav aria-label="주요 탐색" className="nav-shell">
        {TABS.map((tab) => (
          <button
            key={tab.route}
            type="button"
            aria-current={active === tab.route ? "page" : undefined}
            className={`nav-tab${active === tab.route ? " nav-tab-active" : ""}`}
            onClick={() => {
              window.location.hash = tab.hash;
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </>
  );
}
