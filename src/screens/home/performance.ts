import type { FoldInput } from "../../domain/types.ts";
import { tmHistory, e1rmSeries, type E1rmPoint } from "../../domain/e1rm";
import { applyCorrections } from "../../domain/corrections";
import { exerciseInfo } from "../../domain/exerciseLibrary";

/**
 * UI5 T2 — 홈 대시보드 "수행능력" 미니 차트 순수 파생 로직. 4대 T1 리프트(벤치/OHP/스쿼트/데드) TM을
 * 하나의 추이로 합산한다. 리프트마다 TM이 바뀌는 시점이 서로 다르므로, 각 리프트의 tmHistory(기존
 * domain/e1rm.ts 함수 재사용)를 구해 전체 시점 집합에서 리프트별 "그 시점까지 알려진 최신값"을
 * carry-forward해 합산한다(단순 시점별 합이면 그 시점에 변경 안 된 리프트가 누락돼 값이 튄다).
 *
 * UI7 — 수행능력↔프로그램 자동 커플링. nSuns 관례상 TM = 0.9 × 1RM(트레이닝 맥스는 1RM의 90%로
 * 잡는 것이 표준)이므로 역산하면 추정 1RM = TM / 0.9. est1RM()이 이 환산을 맡고, liftSummary()가
 * 4대 T1 리프트별로 (TM, 환산 1RM, 실측 e1RM)을 한 행씩 묶어 홈 대시보드 "현재 무게" 리스트에 공급한다.
 * 실측값은 기존 e1rmSeries()가 만드는 리프트별 시리즈 중 substituted=false(원 종목) 시리즈의 마지막
 * 포인트 — 대체 종목 수행분은 원 종목 1RM과 근력이 다르므로 섞지 않는다(e1rm.ts 자체 계약 재사용).
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

/** nSuns 관례 TM = 0.9 × 1RM의 역산 — 추정 1RM = TM / 0.9(소수 1자리 반올림). */
export function est1RM(tm: number): number {
  return Math.round((tm / 0.9) * 10) / 10;
}

export type LiftSummaryRow = {
  exerciseId: string;
  name: string;
  tm: number;
  est1RM: number;
  measuredE1RM?: number;
};

/**
 * 4대 T1 리프트 "현재 무게" 요약 — TM 없는 리프트는 스킵(아직 시드 안 된 리프트를 0으로 보여주지
 * 않기 위함). measuredE1RM은 e1rmSeries의 원 종목(substituted=false) 시리즈 마지막 포인트(가장 최근
 * 실측 AMRAP topSet) — 기록이 없으면 undefined(호출부가 "측정" 라벨을 조건부 렌더).
 */
export function liftSummary(input: FoldInput, tm: Record<string, number>): LiftSummaryRow[] {
  const effectiveSets = applyCorrections(input.sets, input.corrections);
  const series = e1rmSeries(effectiveSets);

  const rows: LiftSummaryRow[] = [];
  for (const exerciseId of T1_LIFTS) {
    const tmValue = tm[exerciseId];
    if (tmValue === undefined) continue;
    const measured = series.find((s) => s.exerciseId === exerciseId && !s.substituted);
    rows.push({
      exerciseId,
      name: exerciseInfo(exerciseId)?.name ?? exerciseId,
      tm: tmValue,
      est1RM: est1RM(tmValue),
      measuredE1RM: measured?.points.at(-1)?.value,
    });
  }
  return rows;
}
