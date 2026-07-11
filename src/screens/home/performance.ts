import type { FoldInput } from "../../domain/types.ts";
import { tmHistory, type E1rmPoint } from "../../domain/e1rm";

/**
 * UI5 T2 — 홈 대시보드 "수행능력" 미니 차트 순수 파생 로직. 4대 T1 리프트(벤치/OHP/스쿼트/데드) TM을
 * 하나의 추이로 합산한다. 리프트마다 TM이 바뀌는 시점이 서로 다르므로, 각 리프트의 tmHistory(기존
 * domain/e1rm.ts 함수 재사용)를 구해 전체 시점 집합에서 리프트별 "그 시점까지 알려진 최신값"을
 * carry-forward해 합산한다(단순 시점별 합이면 그 시점에 변경 안 된 리프트가 누락돼 값이 튄다).
 */

const T1_LIFTS = ["bench", "ohp", "squat", "deadlift"] as const;

export type PerformancePoint = { at: string; value: number };

export function combinedT1Performance(input: FoldInput): PerformancePoint[] {
  const seriesByLift = new Map<string, E1rmPoint[]>(T1_LIFTS.map((id) => [id, tmHistory(input, id)]));

  const allAts = new Set<string>();
  for (const points of seriesByLift.values()) {
    for (const p of points) allAts.add(p.at);
  }
  const sortedAts = [...allAts].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const latest: Partial<Record<(typeof T1_LIFTS)[number], number>> = {};
  const result: PerformancePoint[] = [];
  for (const at of sortedAts) {
    for (const lift of T1_LIFTS) {
      const hit = seriesByLift.get(lift)!.find((p) => p.at === at);
      if (hit) latest[lift] = hit.value;
    }
    const known = T1_LIFTS.map((lift) => latest[lift]).filter((v): v is number => v !== undefined);
    if (known.length === 0) continue;
    result.push({ at, value: known.reduce((a, b) => a + b, 0) });
  }
  return result;
}
