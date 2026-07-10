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
});
