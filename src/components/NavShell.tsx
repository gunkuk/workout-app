/**
 * Task 7 — 하단 탭 네비게이션. status === "ready"일 때만 App이 렌더한다(온보딩 중엔 탭 없음).
 * 탭 클릭은 window.location.hash를 바꾸는 것뿐 — 실제 화면 전환은 App의 hashchange 리스너가 담당한다.
 */

export type NavRoute = "today" | "history";

export type NavShellProps = {
  active: NavRoute;
};

const TABS: { route: NavRoute; label: string; hash: string }[] = [
  { route: "today", label: "오늘", hash: "/today" },
  { route: "history", label: "히스토리", hash: "/history" },
];

export function NavShell({ active }: NavShellProps) {
  return (
    <nav
      aria-label="주요 탐색"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        display: "flex",
        borderTop: "1px solid #ccc",
        background: "#fff",
      }}
    >
      {TABS.map((tab) => (
        <button
          key={tab.route}
          type="button"
          aria-current={active === tab.route ? "page" : undefined}
          onClick={() => {
            window.location.hash = tab.hash;
          }}
          style={{
            flex: 1,
            padding: "12px 0",
            fontWeight: active === tab.route ? "bold" : "normal",
          }}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
