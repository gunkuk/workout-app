import type { PlannedSlot } from "../domain/programEngine";

export type ExerciseSwapProps = {
  /** 현재 이 헤더가 표시 중인 슬롯(원본 또는 이미 통증일 프리셋으로 교체된 슬롯) */
  slot: PlannedSlot;
  skipped: boolean;
  onSkip: () => void;
  onUnskip: () => void;
  /** 현재 통증일(경량) 프리셋으로 교체되어 렌더 중인지 */
  swapped: boolean;
  onPainDay: () => void;
  onRestoreOriginal: () => void;
};

/**
 * 슬롯 헤더 컨트롤 — 스킵 / 통증일(경량) 대체.
 * RDL 등 다른 대체 옵션은 없다(스펙 D5-⑥, 영구 제외 — exerciseLibrary에도 등록 안 됨).
 * 통증일 옵션은 데드리프트 슬롯에만 노출(programEngine.lightConventionalPreset이 데드리프트 전용 프리셋).
 */
export function ExerciseSwap({
  slot,
  skipped,
  onSkip,
  onUnskip,
  swapped,
  onPainDay,
  onRestoreOriginal,
}: ExerciseSwapProps) {
  const showPainDayOption = slot.exerciseId === "deadlift" && !swapped;

  return (
    <div data-testid={`exercise-swap-${slot.slotId}`} className="exercise-swap">
      {skipped ? (
        <>
          <span aria-label="스킵됨" className="skipped-pill">
            스킵됨
          </span>
          <button type="button" className="btn btn-ghost" onClick={onUnskip}>
            스킵 해제
          </button>
        </>
      ) : (
        <button type="button" className="btn btn-ghost" onClick={onSkip}>
          스킵
        </button>
      )}
      {swapped && (
        <button type="button" className="btn btn-ghost" onClick={onRestoreOriginal}>
          원래대로
        </button>
      )}
      {showPainDayOption && (
        <button type="button" className="btn btn-ghost" onClick={onPainDay}>
          통증일(경량)
        </button>
      )}
    </div>
  );
}
