import type { ProgramDefinition, DaySpec, CyclePos } from "./types.ts";
import type { EffectiveSet } from "./corrections";

export function programKey(programId: string, version: number): string {
  return `${programId}@${version}`;
}

/** 발효 상한 키 — target당 사이클-주 1회 (스펙 §2-3) */
export function capKey(targetKey: string, pos: CyclePos): string {
  return `${targetKey}|c${pos.cycleIndex}w${pos.week}`;
}

export function daySpecFor(program: ProgramDefinition, pos: CyclePos): DaySpec | undefined {
  const week = program.weeks[pos.week];
  if (!week) return undefined;
  return week.days.find((d) => d.ordinal === pos.dayOrdinal);
}

/** 판정 대상 세트: 해당 세션·슬롯의 작업 세트만 (revoked·warmup·대체 제외), completedAt 오름차순 */
export function judgingSetsForSlot(sets: EffectiveSet[], sessionId: string, slotId: string): EffectiveSet[] {
  return sets
    .filter(
      (s) =>
        s.sessionId === sessionId &&
        s.slotId === slotId &&
        !s.revoked &&
        s.setType !== "warmup" &&
        s.substitutedFrom === undefined,
    )
    .sort((a, b) => (a.completedAt < b.completedAt ? -1 : a.completedAt > b.completedAt ? 1 : 0));
}

export function lastSetOf(sets: EffectiveSet[]): EffectiveSet | undefined {
  return sets.length ? sets[sets.length - 1] : undefined;
}
