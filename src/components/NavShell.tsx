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

/**
 * Task 7(C2) — 설정 진입점. T5가 하단 3탭 구조를 최종 배선으로 확정했으므로(소유권 참조) 4번째 탭을
 * 추가하지 않고, 화면 상단 우측 고정 아이콘 1개로 최소화했다(계획 "구현자 판단" 조항 — 문서화):
 * 하단 nav의 flex-1 탭 3개와 폭을 나누지 않는 별도 fixed 요소라 기존 3탭의 레이아웃·테스트(App.test.tsx의
 * "히스토리" 버튼 role 조회 등)에 영향이 없다. NavShell이 status==="ready"인 모든 화면에서 항상
 * 렌더되므로, 오늘/히스토리/분석 어디서든 설정에 접근 가능(오늘 화면 상단이 아니라 화면 전역 상단으로
 * 넓혔다 — 셋 중 하나에만 있으면 다른 탭에서 되돌아와야 하는 불편이 있어 사소한 확장이지만 더 단순함).
 */
function SettingsEntry() {
  return (
    <button
      type="button"
      aria-label="설정"
      data-testid="settings-entry"
      className="settings-entry"
      onClick={() => {
        window.location.hash = "/settings";
      }}
    >
      ⚙
    </button>
  );
}

export function NavShell({ active }: NavShellProps) {
  return (
    <>
      <SettingsEntry />
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
