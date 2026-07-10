import { describe, it, expect, afterEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PlateBreakdown } from "../../src/components/PlateBreakdown";
import { DEFAULT_PLATES } from "../../src/domain/plates";
import * as platesModule from "../../src/domain/plates";

// Task 3 — PlateBreakdown: platesFor(cfg, target: number)는 target이 non-nullable이므로
// PlannedSet.weight(number | null)를 받는 이 컴포넌트가 null을 걸러내는 것이 핵심 계약(계획 검증에서
// 발견되어 patch된 항목). weight===null·platesFor가 null 반환(구성 불가) 둘 다 동일 안내문으로 대체한다.

afterEach(() => {
  cleanup();
});

describe("PlateBreakdown", () => {
  it("① 정상 구성 렌더 — 100kg(바20 + 보유 원판) → 큰 것부터 '25 + 15'", () => {
    render(<PlateBreakdown weight={100} cfg={DEFAULT_PLATES} />);
    expect(screen.getByTestId("plate-breakdown")).toHaveTextContent("25 + 15");
  });

  it("② null weight → 안내문, platesFor 호출 안 됨(null을 domain 함수에 넘기지 않는 것이 핵심)", () => {
    const spy = vi.spyOn(platesModule, "platesFor");
    render(<PlateBreakdown weight={null} cfg={DEFAULT_PLATES} />);
    expect(screen.getByTestId("plate-breakdown")).toHaveTextContent("직접 계산 필요");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("③ platesFor가 null 반환(target < barWeight, 구성 불가) → 별도 안내(동일 문구)", () => {
    // barWeight=20인데 target=10 — platesFor 자체 계약(plates.ts)상 target < barWeight면 null.
    render(<PlateBreakdown weight={10} cfg={DEFAULT_PLATES} />);
    expect(screen.getByTestId("plate-breakdown")).toHaveTextContent("직접 계산 필요");
  });
});
