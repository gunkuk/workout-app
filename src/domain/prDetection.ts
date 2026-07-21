import type { SetRecord } from "./types.ts";

/**
 * PR(자기기록) 감지(UI15 item2) — 순수 함수, fold.ts(동결)는 건드리지 않는다. 이 파일은 TM/증량
 * 판정에 영향을 주지 않는 순수 UI 파생 계산(감사 §설계원칙: 추적/알림 목적은 fold 입력 밖).
 *
 * estimateOneRM — Epley 공식. home/performance.ts의 est1RM(tm) = tm/0.9(TM→환산1RM 역산)와는
 * 이름·용도가 다르다(그건 TM 기반 역산, 이건 실제 완료 세트 weight×reps 기반 추정) — 혼동 주의.
 */
export function estimateOneRM(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

export type PrCheckResult = {
  /** 이번에 완료한 세트의 추정 1RM이 과거(이 세트 이전) 모든 기록의 추정 1RM 최댓값을 초과했는지. */
  isOneRmPr: boolean;
  /** 이번 세션(completedSet.sessionId)의 누적 볼륨(이 세트 포함)이 과거 다른 세션들의 세션별
   *  볼륨 합 최댓값을 초과했는지. */
  isVolumePr: boolean;
};

/**
 * history — 판정 대상 exerciseId의 전체 work-set 기록(SetRecord[], corrections 반영된 effective
 * 기록, 워밍업 포함 여부 무관 — 이 함수가 setType==="warmup"을 걸러낸다). completedSet — 이번에
 * 완료한 work 세트(호출부가 워밍업이면 이 함수를 호출하지 않는 것을 전제). completedSet이 history에
 * 이미 포함돼 있어도(id로 매칭) 자기 자신은 "이전 기록" 비교에서 제외된다 — 동률(==)은 신기록 아님.
 */
export function detectPr(history: SetRecord[], completedSet: SetRecord): PrCheckResult {
  const workHistory = history.filter((s) => s.setType !== "warmup");

  // (a) 1RM PR — completedSet 자신을 제외한, completedAt이 더 이른 기록들의 추정1RM 최댓값과 비교.
  const priorOneRms = workHistory
    .filter((s) => s.id !== completedSet.id && s.completedAt < completedSet.completedAt)
    .map((s) => estimateOneRM(s.actualWeight, s.actualReps));
  const bestPriorOneRm = priorOneRms.length > 0 ? Math.max(...priorOneRms) : 0;
  const thisOneRm = estimateOneRM(completedSet.actualWeight, completedSet.actualReps);
  const isOneRmPr = thisOneRm > bestPriorOneRm;

  // (b) 볼륨 PR — 세션별 볼륨 합(weight×reps 합)을 집계한 뒤, 이번 세션 합(completedSet 포함) vs
  // 다른 세션들 합 최댓값.
  const sessionVolumes = new Map<string, number>();
  const accumulate = (s: SetRecord) => {
    const vol = s.actualWeight * s.actualReps;
    sessionVolumes.set(s.sessionId, (sessionVolumes.get(s.sessionId) ?? 0) + vol);
  };
  for (const s of workHistory) {
    if (s.id === completedSet.id) continue; // completedSet은 아래서 명시적으로 1회만 합산
    accumulate(s);
  }
  accumulate(completedSet);

  const thisSessionVolume = sessionVolumes.get(completedSet.sessionId) ?? 0;
  const bestOtherVolume = Math.max(
    0,
    ...[...sessionVolumes.entries()].filter(([sid]) => sid !== completedSet.sessionId).map(([, v]) => v),
  );
  const isVolumePr = thisSessionVolume > bestOtherVolume;

  return { isOneRmPr, isVolumePr };
}
