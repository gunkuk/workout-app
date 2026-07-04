export type TopSetOutcome =
  | { kind: "holdOrDeload" }
  | { kind: "auto"; delta: number }
  | { kind: "bonusProposal"; suggested: number };

/** 스펙 §2-3 T1 진리표. 판정 입력 = 탑세트 실제 reps. */
export function judgeTopSet(actualReps: number, params: { increment: number }): TopSetOutcome {
  if (actualReps <= 1) return { kind: "holdOrDeload" };
  if (actualReps <= 3) return { kind: "auto", delta: params.increment };
  return { kind: "bonusProposal", suggested: params.increment * 2 };
}
