import { describe, it, expect, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { LineChart } from "../../src/components/LineChart";

// Task 4 — LineChart: 범용 경량 SVG 라인차트(의존성 없음). 0~1개 점은 폴리라인을 그릴 수 없으므로
// "데이터 부족" 안내로 대체하는 것이 핵심 계약(HistoryScreen이 이 빈 상태를 재사용해 중복 메시지를 피한다).

afterEach(() => {
  cleanup();
});

describe("LineChart", () => {
  it("① 빈 데이터(0개) → '데이터 부족' 안내", () => {
    render(<LineChart points={[]} />);
    expect(screen.getByText("데이터 부족")).toBeInTheDocument();
  });

  it("① 1개 점 → '데이터 부족' 안내(선을 그릴 수 없음)", () => {
    render(<LineChart points={[{ at: "2026-07-01T09:00:00Z", value: 100 }]} />);
    expect(screen.getByText("데이터 부족")).toBeInTheDocument();
  });

  it("② 정상 렌더 — points 개수만큼 폴리라인 좌표 생성", () => {
    const points = [
      { at: "2026-07-01T09:00:00Z", value: 100 },
      { at: "2026-07-03T09:00:00Z", value: 102.5 },
      { at: "2026-07-08T09:00:00Z", value: 105 },
      { at: "2026-07-15T09:00:00Z", value: 110 },
    ];
    render(<LineChart points={points} />);
    const polyline = screen.getByTestId("linechart-polyline");
    const coords = polyline.getAttribute("points")!.trim().split(" ");
    expect(coords).toHaveLength(points.length);
  });

  // UI5 T2 — 듀얼 시리즈(series2, opt-in) 확장. 위 ①·②는 series2 없이 그대로 통과해야
  // 기존 단일 시리즈 호출부(TM/e1RM 차트 등) 무영향 계약이 지켜진다.

  it("③ series2 + labels 제공 → 폴리라인 2개(골드/틸) + 범례(최신값 포함) 렌더", () => {
    const points = [
      { at: "2026-07-01T09:00:00Z", value: 80 },
      { at: "2026-07-08T09:00:00Z", value: 79.5 },
    ];
    const series2 = [
      { at: "2026-07-01T09:00:00Z", value: 18 },
      { at: "2026-07-08T09:00:00Z", value: 17.5 },
    ];
    render(<LineChart points={points} series2={series2} labels={{ s1: "몸무게", s2: "체지방" }} />);

    const p1 = screen.getByTestId("linechart-polyline");
    const p2 = screen.getByTestId("linechart-polyline-s2");
    expect(p1.getAttribute("points")!.trim().split(" ")).toHaveLength(2);
    expect(p2.getAttribute("points")!.trim().split(" ")).toHaveLength(2);
    expect(p1).toHaveStyle({ stroke: "var(--gold)" });
    expect(p2).toHaveStyle({ stroke: "var(--teal)" });

    const legend = screen.getByTestId("linechart-legend");
    expect(legend).toHaveTextContent("몸무게 79.5");
    expect(legend).toHaveTextContent("체지방 17.5");
  });

  it("④ series2 데이터 없음(빈 배열) → series1만 그려지고 범례엔 '-' 표시", () => {
    const points = [
      { at: "2026-07-01T09:00:00Z", value: 80 },
      { at: "2026-07-08T09:00:00Z", value: 79.5 },
    ];
    render(<LineChart points={points} series2={[]} labels={{ s1: "몸무게", s2: "체지방" }} />);

    expect(screen.getByTestId("linechart-polyline")).toBeInTheDocument();
    expect(screen.queryByTestId("linechart-polyline-s2")).not.toBeInTheDocument();
    expect(screen.getByTestId("linechart-legend")).toHaveTextContent("체지방 -");
  });

  it("④-2 series2가 1개뿐(선은 못 그림)이어도 범례엔 그 최신값을 그대로 노출(선 여부와 무관하게 '최신값'을 보여주는 계약)", () => {
    const points = [
      { at: "2026-07-01T09:00:00Z", value: 80 },
      { at: "2026-07-08T09:00:00Z", value: 79.5 },
    ];
    render(
      <LineChart
        points={points}
        series2={[{ at: "2026-07-01T09:00:00Z", value: 18 }]}
        labels={{ s1: "몸무게", s2: "체지방" }}
      />,
    );
    expect(screen.queryByTestId("linechart-polyline-s2")).not.toBeInTheDocument();
    expect(screen.getByTestId("linechart-legend")).toHaveTextContent("체지방 18");
  });

  it("⑤ series2/labels 미제공(기존 단일 시리즈 호출) → 범례 없음 + 골드 강제 스타일 없음(기존 CSS 클래스 색 그대로)", () => {
    const points = [
      { at: "2026-07-01T09:00:00Z", value: 80 },
      { at: "2026-07-08T09:00:00Z", value: 79.5 },
    ];
    render(<LineChart points={points} />);
    expect(screen.queryByTestId("linechart-legend")).not.toBeInTheDocument();
    expect(screen.getByTestId("linechart-polyline")).not.toHaveStyle({ stroke: "var(--gold)" });
  });
});
