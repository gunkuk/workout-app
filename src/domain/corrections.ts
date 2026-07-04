import type { SetRecord, CorrectionRecord, CyclePos } from "./types.ts";
import { compareByAtId } from "./order";

export type EffectiveSet = SetRecord & { corrected: boolean; revoked: boolean };

/** 정정 체인을 따라 루트 대상 id를 찾는다 (순환 방지) */
function rootTargetOf(c: CorrectionRecord, byId: Map<string, CorrectionRecord>): string {
  let cur = c;
  const seen = new Set<string>([c.id]);
  while (byId.has(cur.supersedes)) {
    const next = byId.get(cur.supersedes)!;
    if (seen.has(next.id)) break;
    seen.add(next.id);
    cur = next;
  }
  return cur.supersedes;
}

/** 대상 id별 승자 정정 (at 최신 승, 동률 id 큰 쪽) */
function winnersByRoot(corrections: CorrectionRecord[]): Map<string, CorrectionRecord> {
  const byId = new Map(corrections.map((c) => [c.id, c]));
  const winners = new Map<string, CorrectionRecord>();
  for (const c of corrections) {
    const root = rootTargetOf(c, byId);
    const w = winners.get(root);
    if (!w || compareByAtId(c, w) > 0) winners.set(root, c);
  }
  return winners;
}

export function applyCorrections(sets: SetRecord[], corrections: CorrectionRecord[]): EffectiveSet[] {
  const winners = winnersByRoot(corrections);
  return sets.map((s) => {
    const w = winners.get(s.id);
    if (!w) return { ...s, corrected: false, revoked: false };
    if (w.revoked) return { ...s, corrected: true, revoked: true };
    const { cyclePos: _ignored, ...patch } = w.patch ?? {};
    return { ...s, ...patch, corrected: true, revoked: false };
  });
}

/** SessionCompleted.cyclePos 정정의 승자 (없으면 undefined) */
export function sessionCyclePosOverride(
  sessionCompletedId: string,
  corrections: CorrectionRecord[],
): CyclePos | undefined {
  const winners = winnersByRoot(corrections);
  return winners.get(sessionCompletedId)?.patch?.cyclePos;
}
