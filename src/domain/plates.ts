/** 원판 종류 — 무게·보유 쌍 수(=한쪽에 사용 가능한 개수)·풀다이아 여부 */
export type PlateEntry = {
  weight: number;
  pairs: number; // 보유 쌍 수 = 한쪽에 사용 가능한 개수
  fullDiameter?: true;
};

/** 플레이트 설정 — 바 무게 + 보유 원판 */
export type PlateConfig = {
  barWeight: number;
  plates: PlateEntry[];
};

const EPS = 1e-6;

/** 반올림 단위 = 2 × 최소 원판 무게 (보유 원판에서 파생 — 스펙 §2-1) */
export function stepOf(cfg: PlateConfig): number {
  return 2 * Math.min(...cfg.plates.map((p) => p.weight));
}

/** 정본 반올림 — lib/render.mjs의 roundToStep과 동일 semantics */
export function roundToStep(w: number, step: number): number {
  return Math.round(w / step) * step;
}

/** 내림차순 greedy로 한쪽(half) 예산을 채운다. pairs 재고 준수. */
function greedySide(
  plates: PlateEntry[],
  budget: number
): { used: number[]; sum: number; remainder: number } {
  const sorted = [...plates].sort((a, b) => b.weight - a.weight);
  const used: number[] = [];
  let remaining = budget;
  let sum = 0;
  for (const p of sorted) {
    let count = 0;
    while (count < p.pairs && p.weight <= remaining + EPS) {
      used.push(p.weight);
      remaining -= p.weight;
      sum += p.weight;
      count++;
    }
  }
  return { used, sum, remainder: remaining };
}

/**
 * 한쪽 구성 — 내림차순 greedy, pairs 재고 준수.
 * target < barWeight → null. 정확 도달 불가(그리디 잔여 > 0)면 null(정확 조합만).
 */
export function platesFor(cfg: PlateConfig, target: number): number[] | null {
  if (target < cfg.barWeight - EPS) return null;
  const budget = (target - cfg.barWeight) / 2;
  const { used, remainder } = greedySide(cfg.plates, budget);
  if (remainder > EPS) return null;
  return used;
}

/**
 * target 이하로 도달 가능한 최대 무게 (워밍업 내림용) — greedy 최대 한쪽 합의 2배 + bar.
 * 계약 미정의 edge(target ≤ barWeight)는 barWeight를 반환하도록 정의(리포트에 명시).
 */
export function achievableBelow(cfg: PlateConfig, target: number): number {
  if (target <= cfg.barWeight) return cfg.barWeight;
  const budget = (target - cfg.barWeight) / 2;
  const { sum } = greedySide(cfg.plates, budget);
  return cfg.barWeight + 2 * sum;
}

/** 힌지 운동 하한 = barWeight + 2×min(fullDiameter 원판). fullDiameter 없으면 barWeight. */
export function minHingeLoad(cfg: PlateConfig): number {
  const fullDiameterWeights = cfg.plates
    .filter((p) => p.fullDiameter)
    .map((p) => p.weight);
  if (fullDiameterWeights.length === 0) return cfg.barWeight;
  return cfg.barWeight + 2 * Math.min(...fullDiameterWeights);
}

/** 기본 플레이트 설정 — bar 20kg + 표준 원판 재고 */
export const DEFAULT_PLATES: PlateConfig = {
  barWeight: 20,
  plates: [
    { weight: 25, pairs: 4, fullDiameter: true },
    { weight: 20, pairs: 2, fullDiameter: true },
    { weight: 15, pairs: 2 },
    { weight: 10, pairs: 2 },
    { weight: 5, pairs: 2 },
    { weight: 2.5, pairs: 2 },
    { weight: 1.25, pairs: 2 },
  ],
};
