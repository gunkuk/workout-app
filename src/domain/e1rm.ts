import type { DecisionEvent, FoldInput, SessionCompleted } from "./types.ts";
import type { EffectiveSet } from "./corrections";
import { sortByAtId } from "./order";
import { foldState } from "./fold";

/** Epley 공식 — 소수 1자리 반올림 (스펙 §2-6) */
export function epley(w: number, reps: number): number {
  return Math.round(w * (1 + reps / 30) * 10) / 10;
}

export type E1rmPoint = { at: string; value: number };
export type E1rmSeries = { exerciseId: string; substituted: boolean; points: E1rmPoint[] };

/**
 * topSet 세트만으로 e1RM 시계열 계산 (스펙 §2-6).
 * actualReps > 10 또는 < 1은 제외. substitutedFrom 유무로 exerciseId별 시리즈를 분리한다
 * (원 종목 수행분과 대체 종목 수행분이 섞이지 않게).
 */
export function e1rmSeries(sets: EffectiveSet[]): E1rmSeries[] {
  const groups = new Map<string, E1rmSeries>();
  for (const s of sets) {
    if (s.revoked) continue;
    if (s.amrapRole !== "topSet") continue;
    if (s.actualReps > 10 || s.actualReps < 1) continue;
    const substituted = s.substitutedFrom !== undefined;
    const key = `${s.exerciseId}::${substituted}`;
    let g = groups.get(key);
    if (!g) {
      g = { exerciseId: s.exerciseId, substituted, points: [] };
      groups.set(key, g);
    }
    g.points.push({ at: s.completedAt, value: epley(s.actualWeight, s.actualReps) });
  }
  for (const g of groups.values()) {
    g.points.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  }
  return [...groups.values()];
}

type TimelineItem =
  | { type: "decision"; at: string; id: string; ev: DecisionEvent }
  | { type: "session"; at: string; id: string; ev: SessionCompleted };

/**
 * TM 이력 — 타임라인(결정+완료 세션) prefix마다 foldState를 다시 돌려(O(n²), 개인 규모라
 * 무시 가능) tm[exerciseId]를 읽고, 값이 바뀐 시점만 기록한다(연속 중복 압축).
 * sets·corrections는 매 prefix에 그대로(whole) 넘긴다 — 세션의 증량 판정은 그 세션의
 * 세트가 이미 존재해야 하고, 정정은 전역 적용이라 이렇게 해도 결정적이다.
 */
export function tmHistory(input: FoldInput, exerciseId: string): E1rmPoint[] {
  const timeline: TimelineItem[] = sortByAtId([
    ...input.decisions.map((ev) => ({ type: "decision" as const, at: ev.at, id: ev.id, ev })),
    ...input.sessions
      .filter((s) => s.status === "completed")
      .map((ev) => ({ type: "session" as const, at: ev.at, id: ev.id, ev })),
  ]);

  const points: E1rmPoint[] = [];
  let prev: number | undefined;

  for (let i = 1; i <= timeline.length; i++) {
    const prefix = timeline.slice(0, i);
    const prefixDecisions = prefix
      .filter((t): t is Extract<TimelineItem, { type: "decision" }> => t.type === "decision")
      .map((t) => t.ev);
    const prefixSessions = prefix
      .filter((t): t is Extract<TimelineItem, { type: "session" }> => t.type === "session")
      .map((t) => t.ev);

    const state = foldState({
      sets: input.sets,
      corrections: input.corrections,
      decisions: prefixDecisions,
      sessions: prefixSessions,
      programs: input.programs,
    });

    const value = state.tm[exerciseId];
    if (value !== undefined && value !== prev) {
      points.push({ at: timeline[i - 1]!.at, value });
      prev = value;
    }
  }

  return points;
}
