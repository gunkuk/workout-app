import type { SetRecord } from "./types.ts";

/**
 * 종목별 "최고 기록 달성 시점" 인덱스(Stage1-UI19) — 순수 함수. TM 개념이 없는 종목(doubleProgression/
 * repLadder류, 예: kk-6day의 pullup/legPress)도 실측 기록에서 "최고 무게"를 유도해 보여주기 위한 용도.
 *
 * domain/prDetection.ts(UI15, 세트 완료 시점 실시간 PR 1건 판정)와 개념은 비슷하지만 목적이 다르다
 * (그건 "방금 이 세트가 PR인가", 이건 "종목별 역대 최고치가 언제 처음 세워졌나"라는 전체 이력 인덱스) —
 * 별개 파일로 유지, 합치지 않음.
 */
export type ExerciseHistoryEntry = {
  exerciseId: string;
  bestWeight?: number;
  bestWeightAt?: string;
  bestVolume?: number;
  bestVolumeAt?: string;
};

/**
 * effectiveWorkSets — applyCorrections 적용 + revoked 제외 + setType==="work"만 필터된 SetRecord[]
 * (호출부 책임, 이 함수는 필터링하지 않는다). completedAt 오름차순으로 스캔하며 "새 최고치를 처음
 * 세운 시점"만 기록(동률은 갱신 아님 — 그 이후 같은 값이 반복돼도 최초 날짜 유지). 볼륨은
 * exerciseId+sessionId로 그룹핑한 세션별 합계 중 러닝 맥스.
 */
export function computeExerciseHistory(effectiveWorkSets: SetRecord[]): Map<string, ExerciseHistoryEntry> {
  const sorted = [...effectiveWorkSets].sort((a, b) => (a.completedAt < b.completedAt ? -1 : a.completedAt > b.completedAt ? 1 : 0));

  const entries = new Map<string, ExerciseHistoryEntry>();
  const sessionVolume = new Map<string, number>(); // `${exerciseId}::${sessionId}` -> running volume

  function entryFor(exerciseId: string): ExerciseHistoryEntry {
    let e = entries.get(exerciseId);
    if (!e) {
      e = { exerciseId };
      entries.set(exerciseId, e);
    }
    return e;
  }

  for (const s of sorted) {
    const e = entryFor(s.exerciseId);

    if (e.bestWeight === undefined || s.actualWeight > e.bestWeight) {
      e.bestWeight = s.actualWeight;
      e.bestWeightAt = s.completedAt;
    }

    const volKey = `${s.exerciseId}::${s.sessionId}`;
    const vol = (sessionVolume.get(volKey) ?? 0) + s.actualWeight * s.actualReps;
    sessionVolume.set(volKey, vol);

    if (e.bestVolume === undefined || vol > e.bestVolume) {
      e.bestVolume = vol;
      e.bestVolumeAt = s.completedAt;
    }
  }

  return entries;
}
