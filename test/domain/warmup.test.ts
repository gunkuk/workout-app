import { describe, it, expect } from "vitest";
import { generateWarmup } from "../../src/domain/warmup";
import { DEFAULT_PLATES } from "../../src/domain/plates";

describe("generateWarmup", () => {
  it("① base 80 비힌지 → 빈바10·50%·70%·88% (56→55, 70.4→70 반올림 확인)", () => {
    expect(generateWarmup(80, { hinge: false, cfg: DEFAULT_PLATES })).toEqual([
      { weight: 20, reps: 10 },
      { weight: 40, reps: 5 },
      { weight: 55, reps: 3 },
      { weight: 70, reps: 1 },
    ]);
  });

  it("② base 105 힌지 → 빈바 없음, 52.5→60 클램프", () => {
    expect(generateWarmup(105, { hinge: true, cfg: DEFAULT_PLATES })).toEqual([
      { weight: 60, reps: 5 },
      { weight: 72.5, reps: 3 },
      { weight: 92.5, reps: 1 },
    ]);
  });

  it("③ base 25 비힌지 → cap 22.5, 50%·70%는 bar로 클램프되어 dedupe, 88%는 cap과 동률 생존", () => {
    expect(generateWarmup(25, { hinge: false, cfg: DEFAULT_PLATES })).toEqual([
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

  it("⑥ 오름차순·중복 없음 property (같은 base 집합)", () => {
    const bases = [40, 60, 80, 100, 120, 140];
    for (const base of bases) {
      for (const hinge of [false, true]) {
        const steps = generateWarmup(base, { hinge, cfg: DEFAULT_PLATES });
        const weights = steps.map((s) => s.weight);
        const sorted = [...weights].sort((a, b) => a - b);
        expect(weights).toEqual(sorted);
        expect(new Set(weights).size).toBe(weights.length);
      }
    }
  });

  it("⑦ base = bar+step(22.5) 비힌지 → cap=20=floor → 빈바만 생존", () => {
    expect(generateWarmup(22.5, { hinge: false, cfg: DEFAULT_PLATES })).toEqual([
      { weight: 20, reps: 10 },
    ]);
  });

  it("⑧ base 21 비힌지 → floor 20 > cap 18.5 → [] (공통 가드)", () => {
    expect(generateWarmup(21, { hinge: false, cfg: DEFAULT_PLATES })).toEqual([]);
  });
});
