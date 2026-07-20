import type {
  FoldInput, FoldState, Proposal, DecisionEvent, SessionCompleted, AccessoryState,
} from "./types.ts";
import { sortByAtId, compareByAtId } from "./order";
import { applyCorrections, sessionCyclePosOverride, type EffectiveSet } from "./corrections";
import { programKey, capKey, daySpecFor, judgingSetsForSlot, lastSetOf } from "./foldSupport";
import { judgeTopSet } from "./rules/nsunsTopSet";
import { judgeT2 } from "./rules/t2LastSet";
import { applyAccessorySession, type DoubleProgressionParams } from "./rules/doubleProgression";
import { judgeLinearTopSet } from "./rules/linearTopSet";
import { applyRepLadderSession, type RepLadderParams } from "./rules/repLadder";

type TimelineItem =
  | { type: "decision"; at: string; id: string; ev: DecisionEvent }
  | { type: "session"; at: string; id: string; ev: SessionCompleted };

function targetKeyOf(t: DecisionEvent["target"]): string {
  return t.kind === "tm" ? `tm:${t.exerciseId}` : `acc:${t.slotId}`;
}

export function foldState(input: FoldInput): FoldState {
  const effectiveSets: EffectiveSet[] = applyCorrections(input.sets, input.corrections);

  const timeline: TimelineItem[] = sortByAtId([
    ...input.decisions.map((ev) => ({ type: "decision" as const, at: ev.at, id: ev.id, ev })),
    ...input.sessions
      .filter((s) => s.status === "completed")
      .map((ev) => ({ type: "session" as const, at: ev.at, id: ev.id, ev })),
  ]);

  const tm: Record<string, number> = {};
  const accessories: Record<string, AccessoryState> = {};
  const caps = new Set<string>();
  const t2FailStreak: Record<string, number> = {};
  /** targetKey -> 최신 미결 제안 */
  const proposals = new Map<string, Proposal>();

  for (const item of timeline) {
    if (item.type === "decision") {
      const d = item.ev;
      const key = targetKeyOf(d.target);
      if (d.target.kind === "tm") {
        tm[d.target.exerciseId] = d.value;
      } else {
        const prev = accessories[d.target.slotId];
        accessories[d.target.slotId] = {
          weight: d.value,
          targetReps: d.targetReps ?? prev?.targetReps ?? 0,
          missStreak: 0,
          grace: false,
        };
      }
      // 결정은 해당 target의 미결 제안을 소비
      proposals.delete(key);
      continue;
    }

    // SessionCompleted (completed만 타임라인에 있음)
    const sc = item.ev;
    const pos = sessionCyclePosOverride(sc.id, input.corrections) ?? sc.cyclePos;
    const program = input.programs.get(programKey(sc.programId, sc.programVersion));
    if (!program) continue;
    const day = daySpecFor(program, pos);
    if (!day) continue;

    for (const slot of day.slots) {
      if (!slot.progressionRuleId) continue;
      const slotSets = judgingSetsForSlot(effectiveSets, sc.sessionId, slot.id);
      const params = slot.progressionParams ?? {};

      if (slot.progressionRuleId === "nsunsTopSet") {
        const ts = slotSets.find((s) => s.amrapRole === "topSet");
        if (!ts) continue;
        const key = `tm:${slot.exerciseId}`;
        const ck = capKey(key, pos);
        if (caps.has(ck)) continue;
        caps.add(ck);
        const current = tm[slot.exerciseId];
        if (current === undefined) continue;
        const outcome = judgeTopSet(ts.actualReps, { increment: Number(params["increment"]) });
        if (outcome.kind === "auto") {
          tm[slot.exerciseId] = current + outcome.delta;
        } else if (outcome.kind === "holdOrDeload") {
          proposals.set(key, {
            type: "tmDeload",
            target: { kind: "tm", exerciseId: slot.exerciseId },
            label: `탑세트 ${ts.actualReps}렙 — 동결(기본) 또는 −5kg`,
            sourceSetRecordId: ts.id,
            options: [current, current - 5],
          });
        } else {
          proposals.set(key, {
            type: "tmBonus",
            target: { kind: "tm", exerciseId: slot.exerciseId },
            label: `탑세트 ${ts.actualReps}렙 — 추가 증량 제안`,
            sourceSetRecordId: ts.id,
            options: [current + outcome.suggested],
          });
        }
      } else if (slot.progressionRuleId === "t2LastSet") {
        const last = lastSetOf(slotSets);
        const key = `tm:${slot.exerciseId}`;
        const ck = capKey(key, pos);
        if (caps.has(ck)) continue;
        if (!last) continue;
        caps.add(ck);
        const current = tm[slot.exerciseId];
        if (current === undefined) continue;
        const outcome = judgeT2(
          { actualReps: last.actualReps, targetReps: last.targetReps },
          t2FailStreak[slot.exerciseId] ?? 0,
          { increment: Number(params["increment"]) },
        );
        t2FailStreak[slot.exerciseId] = outcome.failStreak;
        if (outcome.kind === "auto") {
          tm[slot.exerciseId] = current + outcome.delta;
        } else if (outcome.kind === "deloadProposal") {
          proposals.set(key, {
            type: "t2Deload",
            target: { kind: "tm", exerciseId: slot.exerciseId },
            label: `T2 마지막 세트 ${outcome.failStreak}연속 미완수 — 디로드 제안`,
            sourceSetRecordId: last.id,
            options: [Math.round((current * 0.95) / 2.5) * 2.5, current],
          });
        }
      } else if (slot.progressionRuleId === "doubleProgression") {
        const key = `acc:${slot.id}`;
        const ck = capKey(key, pos);
        if (caps.has(ck)) continue;
        const last = lastSetOf(slotSets);
        if (!last) continue;
        caps.add(ck);
        const p = params as unknown as DoubleProgressionParams;
        const prev: AccessoryState =
          accessories[slot.id] ?? { weight: last.actualWeight, targetReps: p.repMin, missStreak: 0, grace: false };
        const { state, rollback } = applyAccessorySession(
          prev,
          { actualWeight: last.actualWeight, actualReps: last.actualReps },
          p,
        );
        accessories[slot.id] = state;
        if (rollback) {
          proposals.set(key, {
            type: "accessoryRollback",
            target: { kind: "accessory", slotId: slot.id },
            label: `2세션 연속 하한 미달 — 이전 무게 롤백 제안`,
            sourceSetRecordId: last.id,
            options: [state.weight - p.weightStep],
          });
        }
      } else if (slot.progressionRuleId === "linearTopSet") {
        const ts = slotSets.find((s) => s.amrapRole === "topSet");
        if (!ts) continue;
        const key = `tm:${slot.exerciseId}`;
        const ck = capKey(key, pos);
        if (caps.has(ck)) continue;
        caps.add(ck);
        const current = tm[slot.exerciseId];
        if (current === undefined) continue;
        const minReps = Number(params["minReps"]);
        const outcome = judgeLinearTopSet(ts.actualReps, {
          increment: Number(params["increment"]),
          minReps,
        });
        if (outcome.kind === "auto") {
          tm[slot.exerciseId] = current + outcome.delta;
        } else {
          proposals.set(key, {
            type: "tmDeload",
            target: { kind: "tm", exerciseId: slot.exerciseId },
            label: `탑세트 ${ts.actualReps}렙(<${minReps}) — 동결(기본) 또는 −5%(반올림)`,
            sourceSetRecordId: ts.id,
            options: [current, Math.round((current * 0.95) / 2.5) * 2.5],
          });
        }
      } else if (slot.progressionRuleId === "repLadder") {
        const key = `acc:${slot.id}`;
        const ck = capKey(key, pos);
        if (caps.has(ck)) continue;
        const p = params as unknown as RepLadderParams;
        if (slotSets.length < p.sets) continue;
        caps.add(ck);
        const last = lastSetOf(slotSets)!;
        const prev: AccessoryState =
          accessories[slot.id] ??
          { weight: last.actualWeight, targetReps: p.sets * p.repMin, missStreak: 0, grace: false };
        const { state } = applyRepLadderSession(
          prev,
          slotSets.map((s) => ({ actualReps: s.actualReps })),
          p,
        );
        accessories[slot.id] = state;
      }
    }
  }

  // 재검토 플래그: sourceSetRecordId 결정 중, 그 세트에 결정보다 늦은 판정필드 정정이 있는 것
  const reviewFlags: string[] = [];
  for (const d of input.decisions) {
    if (!d.sourceSetRecordId) continue;
    const hasLaterJudgingCorrection = input.corrections.some(
      (c) =>
        c.supersedes === d.sourceSetRecordId &&
        compareByAtId(c, d) > 0 &&
        (c.revoked === true || c.patch?.actualReps !== undefined),
    );
    if (hasLaterJudgingCorrection) reviewFlags.push(d.id);
  }

  return {
    tm,
    accessories,
    pendingProposals: [...proposals.values()],
    reviewFlags,
  };
}
