import type { FoldInput, ProgramDefinition } from "../../domain/types.ts";
import { tmHistory, e1rmSeries, type E1rmPoint } from "../../domain/e1rm";
import { applyCorrections } from "../../domain/corrections";
import { exerciseInfo } from "../../domain/exerciseLibrary";
import type { ExerciseHistoryEntry } from "../../domain/exerciseHistory";

/**
 * UI5 T2 — 홈 대시보드 "수행능력" 미니 차트 순수 파생 로직. T1 리프트 TM들을 하나의 추이로 합산한다.
 * 리프트마다 TM이 바뀌는 시점이 서로 다르므로, 각 리프트의 tmHistory(기존 domain/e1rm.ts 함수 재사용)를
 * 구해 전체 시점 집합에서 리프트별 "그 시점까지 알려진 최신값"을 carry-forward해 합산한다(단순 시점별
 * 합이면 그 시점에 변경 안 된 리프트가 누락돼 값이 튄다).
 *
 * UI7 — 수행능력↔프로그램 자동 커플링. nSuns 관례상 TM = 0.9 × 1RM(트레이닝 맥스는 1RM의 90%로
 * 잡는 것이 표준)이므로 역산하면 추정 1RM = TM / 0.9. est1RM()이 이 환산을 맡고, liftSummary()가
 * T1 리프트별로 (TM, 환산 1RM, 실측 e1RM)을 한 행씩 묶어 홈 대시보드 "현재 무게" 리스트에 공급한다.
 * 실측값은 기존 e1rmSeries()가 만드는 리프트별 시리즈 중 substituted=false(원 종목) 시리즈의 마지막
 * 포인트 — 대체 종목 수행분은 원 종목 1RM과 근력이 다르므로 섞지 않는다(e1rm.ts 자체 계약 재사용).
 *
 * UI19 — 하드코딩 T1_LIFTS(bench/ohp/squat/deadlift) 제거. 프로그램이 바뀌면(예: kk-6day는
 * T1=pullup/ohp/legPress/tbarRow/bench) 홈 대시보드도 그 실제 T1/T2를 따라가야 하므로, 활성
 * 프로그램에서 종목 목록을 동적으로 뽑는 programT1ExerciseIds/programT2ExerciseIds를 추가하고
 * combinedT1Performance/liftSummary가 이 목록을 파라미터로 받게 바꿨다. TM 개념이 없는 종목
 * (doubleProgression/repLadder 슬롯)은 liftSummary에서 더 이상 스킵하지 않고, 실측 history에서
 * 유도한 bestWeight를 대신 보여준다.
 */

/** program.weeks의 모든 day.slots를 순서대로 훑어 label이 일치하는 슬롯의 exerciseId를 등장 순서로
 *  dedup한 목록으로 반환한다(같은 종목이 여러 요일에 같은 label로 나와도 1번만). */
function programExerciseIdsByLabel(program: ProgramDefinition, label: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const week of program.weeks) {
    for (const day of week.days) {
      for (const slot of day.slots) {
        if (slot.label !== label) continue;
        if (seen.has(slot.exerciseId)) continue;
        seen.add(slot.exerciseId);
        ids.push(slot.exerciseId);
      }
    }
  }
  return ids;
}

export function programT1ExerciseIds(program: ProgramDefinition): string[] {
  return programExerciseIdsByLabel(program, "T1");
}

export function programT2ExerciseIds(program: ProgramDefinition): string[] {
  return programExerciseIdsByLabel(program, "T2");
}

export type PerformancePoint = { at: string; value: number };

export function combinedT1Performance(input: FoldInput, exerciseIds: string[]): PerformancePoint[] {
  const seriesByLift = new Map<string, E1rmPoint[]>(exerciseIds.map((id) => [id, tmHistory(input, id)]));

  const allAts = new Set<string>();
  for (const points of seriesByLift.values()) {
    for (const p of points) allAts.add(p.at);
  }
  const sortedAts = [...allAts].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const latest: Record<string, number> = {};
  const result: PerformancePoint[] = [];
  for (const at of sortedAts) {
    for (const lift of exerciseIds) {
      const hit = seriesByLift.get(lift)!.find((p) => p.at === at);
      if (hit) latest[lift] = hit.value;
    }
    const known = exerciseIds.map((lift) => latest[lift]).filter((v): v is number => v !== undefined);
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
  /** TM이 있는 종목만 값 존재(nSuns류 T1/T2). 없는 종목(doubleProgression/repLadder)은 undefined. */
  tm?: number;
  est1RM?: number;
  measuredE1RM?: number;
  /** TM 없는 종목의 실측 최고 무게(exerciseHistory에서 유도) — 기록이 아예 없으면 undefined. */
  bestWeight?: number;
};

/**
 * 활성 프로그램의 T1(또는 T2) 종목 목록 "현재 무게" 요약. TM이 있는 종목은 기존처럼 (TM, 환산 1RM,
 * 실측 e1RM)을 채운다. TM이 없는 종목(kk-6day의 pullup/legPress 등)은 더 이상 스킵하지 않고, history
 * (computeExerciseHistory 결과)에서 유도한 bestWeight만 채운다(기록이 없으면 이름만, 무게 필드는
 * undefined — 호출부가 "기록 없음"을 조건부 렌더).
 */
export function liftSummary(
  input: FoldInput,
  tm: Record<string, number>,
  exerciseIds: string[],
  history: Map<string, ExerciseHistoryEntry>,
): LiftSummaryRow[] {
  const effectiveSets = applyCorrections(input.sets, input.corrections);
  const series = e1rmSeries(effectiveSets);

  const rows: LiftSummaryRow[] = [];
  for (const exerciseId of exerciseIds) {
    const name = exerciseInfo(exerciseId)?.name ?? exerciseId;
    const tmValue = tm[exerciseId];
    if (tmValue !== undefined) {
      const measured = series.find((s) => s.exerciseId === exerciseId && !s.substituted);
      rows.push({
        exerciseId,
        name,
        tm: tmValue,
        est1RM: est1RM(tmValue),
        measuredE1RM: measured?.points.at(-1)?.value,
      });
    } else {
      rows.push({
        exerciseId,
        name,
        bestWeight: history.get(exerciseId)?.bestWeight,
      });
    }
  }
  return rows;
}
