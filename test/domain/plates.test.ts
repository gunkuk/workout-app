import { describe, it, expect } from "vitest";
import {
  stepOf,
  roundToStep,
  platesFor,
  achievableBelow,
  minHingeLoad,
  DEFAULT_PLATES,
  type PlateConfig,
} from "../../src/domain/plates";

describe("plates", () => {
  it("stepOf(DEFAULT_PLATES) = 2.5 (2 × 최소 원판 1.25)", () => {
    expect(stepOf(DEFAULT_PLATES)).toBe(2.5);
  });

  it("roundToStep half-up 확인", () => {
    expect(roundToStep(78.75, 2.5)).toBe(80);
    expect(roundToStep(73.5, 2.5)).toBe(72.5);
  });

  it("platesFor(100) = [25,15] (한쪽 40)", () => {
    expect(platesFor(DEFAULT_PLATES, 100)).toEqual([25, 15]);
  });

  it("platesFor(19) = null (bar 미만)", () => {
    expect(platesFor(DEFAULT_PLATES, 19)).toBeNull();
  });

  it("minHingeLoad(DEFAULT_PLATES) = 60 (bar20+2×20)", () => {
    expect(minHingeLoad(DEFAULT_PLATES)).toBe(60);
  });

  it("achievableBelow(107.4) = 105 (105 이하 최대 정확 구성)", () => {
    expect(achievableBelow(DEFAULT_PLATES, 107.4)).toBe(105);
  });

  // --- 추가 케이스 (계약의 미정의 edge·경계 문서화) ---

  it("platesFor: target === barWeight → [] (빈 구성, 정확 도달)", () => {
    expect(platesFor(DEFAULT_PLATES, 20)).toEqual([]);
  });

  it("platesFor: pairs 재고를 초과하면 null (정확 조합만 반환)", () => {
    // 한쪽 예산 15, 10kg 원판은 pairs 1개(한쪽 1개)뿐 → 그리디가 10까지만 채우고
    // 남은 5는 더 작은 원판이 없어 잔여로 남는다 → null
    const cfg: PlateConfig = { barWeight: 20, plates: [{ weight: 10, pairs: 1 }] };
    expect(platesFor(cfg, 20 + 2 * 15)).toBeNull();
  });

  it("achievableBelow: target ≤ barWeight → barWeight 반환 (edge 결정: 계약 미정의분)", () => {
    expect(achievableBelow(DEFAULT_PLATES, 20)).toBe(20);
    expect(achievableBelow(DEFAULT_PLATES, 10)).toBe(20);
  });

  it("minHingeLoad: fullDiameter 원판 없으면 barWeight 그대로", () => {
    const cfg: PlateConfig = {
      barWeight: 20,
      plates: [{ weight: 10, pairs: 2 }],
    };
    expect(minHingeLoad(cfg)).toBe(20);
  });
});
