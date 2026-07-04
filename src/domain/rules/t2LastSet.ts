export type T2Outcome =
  | { kind: "auto"; delta: number; failStreak: 0 }
  | { kind: "none"; failStreak: number }
  | { kind: "deloadProposal"; failStreak: number };

/** 스펙 §2-3(b). 완수 = actualReps >= targetReps. 2연속 미완수 → 디로드 제안. */
export function judgeT2(
  lastSet: { actualReps: number; targetReps: number } | undefined,
  prevFailStreak: number,
  params: { increment: number },
): T2Outcome {
  if (!lastSet) return { kind: "none", failStreak: prevFailStreak };
  if (lastSet.actualReps >= lastSet.targetReps) return { kind: "auto", delta: params.increment, failStreak: 0 };
  const failStreak = prevFailStreak + 1;
  if (failStreak >= 2) return { kind: "deloadProposal", failStreak };
  return { kind: "none", failStreak };
}
