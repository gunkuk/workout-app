export type LinearTopSetOutcome =
  | { kind: "auto"; delta: number }
  | { kind: "holdOrDeload" };

/**
 * 선형 T1 진리표(사용자 스펙: 매 세션 점진적 과부하). nsunsTopSet과 달리 구간 판정이 아니라
 * 단일 경계값(minReps) 이진 판정 — 이상이면 무조건 자동 증량, 미만이면 디로드 제안(동결/−5%).
 * 판정 입력 = 탑세트 실제 reps.
 */
export function judgeLinearTopSet(
  actualReps: number,
  params: { increment: number; minReps: number },
): LinearTopSetOutcome {
  if (actualReps >= params.minReps) return { kind: "auto", delta: params.increment };
  return { kind: "holdOrDeload" };
}
