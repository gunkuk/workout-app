import { describe, it, expect } from "vitest";
import { generateWarmup } from "../../src/domain/warmup";
import { DEFAULT_PLATES } from "../../src/domain/plates";

describe("generateWarmup", () => {
  it("① base 80 비힌지 → 빈바10·50%·70%·88% 램프에서 3단계로 축소 + 1단계 2세트 반복 (UI15 item1)", () => {
    expect(generateWarmup(80, { hinge: false, cfg: DEFAULT_PLATES })).toEqual([
      { weight: 20, reps: 10 },
      { weight: 20, reps: 10 },
      { weight: 40, reps: 5 },
      { weight: 55, reps: 3 },
    ]);
  });

  it("② base 105 힌지 → 빈바 없음, 3스텝 그대로 + 1단계 2세트 반복", () => {
    expect(generateWarmup(105, { hinge: true, cfg: DEFAULT_PLATES })).toEqual([
      { weight: 60, reps: 5 },
      { weight: 60, reps: 5 },
      { weight: 72.5, reps: 3 },
      { weight: 92.5, reps: 1 },
    ]);
  });

  it("③ base 25 비힌지 → cap 22.5, dedupe 후 2스텝 → 1단계 2세트 반복(총 3줄)", () => {
    expect(generateWarmup(25, { hinge: false, cfg: DEFAULT_PLATES })).toEqual([
      { weight: 20, reps: 10 },
      { weight: 20, reps: 10 },
      { weight: 22.5, reps: 1 },
    ]);
  });

  it("④ base 55 힌지 → floor 60 > cap 52.5 → []", () => {
    expect(generateWarmup(55, { hinge: true, cfg: DEFAULT_PLATES })).toEqual([]);
  });

  it("⑤ 불변식 property: 모든 스텝 ≤ base − 2.5 (base ∈ {40,60,80,100,120,140}, hinge/비힌지 둘 다)", () => {
    const bases = [40, 60, 80, 100, 120, 140];
    for (const base of bases) {
      for (const hinge of [false, true]) {
        const steps = generateWarmup(base, { hinge, cfg: DEFAULT_PLATES });
        for (const s of steps) {
          expect(s.weight).toBeLessThanOrEqual(base - 2.5);
        }
      }
    }
  });

  it("⑥ 오름차순 + 최대 4줄 + 1단계만 정확히 2회 반복(그 뒤는 중복 없음) property (UI15 item1 사양)", () => {
    const bases = [40, 60, 80, 100, 120, 140];
    for (const base of bases) {
      for (const hinge of [false, true]) {
        const steps = generateWarmup(base, { hinge, cfg: DEFAULT_PLATES });
        const weights = steps.map((s) => s.weight);
        expect(weights.length).toBeLessThanOrEqual(4);
        if (weights.length === 0) continue;
        // 비내림차순
        const sorted = [...weights].sort((a, b) => a - b);
        expect(weights).toEqual(sorted);
        // 0번째(=1단계)는 정확히 2회 반복
        expect(weights[0]).toBe(weights[1]);
        // 2번째 인덱스부터는 서로 다르고, 1단계 무게와도 겹치지 않음
        const rest = weights.slice(2);
        expect(new Set(rest).size).toBe(rest.length);
        expect(rest.every((w) => w !== weights[0])).toBe(true);
      }
    }
  });

  it("⑦ base = bar+step(22.5) 비힌지 → cap=20=floor → 빈바 1스텝만 생존 → 2세트 반복", () => {
    expect(generateWarmup(22.5, { hinge: false, cfg: DEFAULT_PLATES })).toEqual([
      { weight: 20, reps: 10 },
      { weight: 20, reps: 10 },
    ]);
  });

  it("⑧ base 21 비힌지 → floor 20 > cap 18.5 → [] (공통 가드)", () => {
    expect(generateWarmup(21, { hinge: false, cfg: DEFAULT_PLATES })).toEqual([]);
  });
});
