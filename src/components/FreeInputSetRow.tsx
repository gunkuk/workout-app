import { useEffect, useState, type MouseEvent, type ReactNode, type SyntheticEvent } from "react";
import type { PlannedSet } from "../domain/programEngine";
import type { SetRecord } from "../domain/types.ts";
import type { PlateConfig } from "../domain/plates";
import { SetRowShell } from "./SetRowShell";
import { PlateBreakdown } from "./PlateBreakdown";
import { formatDuration } from "../lib/duration";

export type FreeInputSetRowProps = {
  id: string;
  planned: PlannedSet;
  recorded?: SetRecord;
  /** 목표 셀 서브라인(원판 구성) 표시용(Stage1-UI2) — planned.weight가 항상 null이라 실제로는
   *  PlateBreakdown의 폴백 문구("직접 계산 필요")로만 귀결되지만, SteppedSetRow와 동일 계약 유지. */
  cfg: PlateConfig;
  /** SetRow가 계산한 배지 — 1열 그리드 셀(Stage1-UI2) */
  badge: ReactNode;
  /** 이 세트의 기록된 소요시간(초, UI11) — 없으면 표시 생략 */
  durationSec?: number;
  onComplete: (weight: number, reps: number) => void;
  onCorrect: (weight: number, reps: number) => void;
};

/**
 * 자유입력 모드(planned.weight === null — needsInit 악세사리): 무게·렙 텍스트 입력 +
 * 완료/저장 버튼으로만 제출(행 탭으로 즉시 제출되지 않음). SetRow에서 분리(Stage1-R T5) —
 * DOM·aria-label·클릭 시맨틱은 원본과 byte-for-byte 동일.
 * UI v2(Stage1-UI2) — SetRowShell이 4열 그리드[배지|목표|조정|체크원]로 렌더하므로, children을
 * 정확히 2개 요소(목표 셀, 조정 셀)로 순서대로 반환한다(그리드 트랙 매칭 계약). 입력모드에선 목표
 * 셀=무게·렙 입력, 조정 셀=제출 버튼; 완료(읽기전용) 모드에선 목표 셀=값 텍스트+원판 서브라인,
 * 조정 셀=빈 자리표시자(그리드 정렬 유지).
 */
export function FreeInputSetRow({ id, planned, recorded, cfg, badge, durationSec, onComplete, onCorrect }: FreeInputSetRowProps) {
  const [editing, setEditing] = useState(false);
  const [weight, setWeight] = useState<number>(recorded?.actualWeight ?? planned.weight ?? 0);
  const [reps, setReps] = useState<number>(recorded?.actualReps ?? planned.reps);
  const [weightText, setWeightText] = useState<string>(recorded ? String(recorded.actualWeight) : "");
  const [repsText, setRepsText] = useState<string>(recorded ? String(recorded.actualReps) : "");

  useEffect(() => {
    if (editing) return;
    setWeight(recorded?.actualWeight ?? planned.weight ?? 0);
    setReps(recorded?.actualReps ?? planned.reps);
    setWeightText(recorded ? String(recorded.actualWeight) : "");
    setRepsText(recorded ? String(recorded.actualReps) : "");
  }, [recorded, planned, editing]);

  function stop(e: SyntheticEvent) {
    e.stopPropagation();
  }

  const showEditable = !recorded || editing;

  function handleRowClick() {
    if (recorded && !editing) setEditing(true);
  }

  function submitFree(e: MouseEvent) {
    stop(e);
    const w = Number(weightText);
    const r = Number(repsText);
    if (!Number.isFinite(w) || !Number.isFinite(r)) return;
    if (recorded) {
      onCorrect(w, r);
      setEditing(false);
    } else {
      onComplete(w, r);
    }
  }

  return (
    <SetRowShell id={id} onClick={handleRowClick} completed={!!recorded && !editing} badge={badge}>
      {showEditable ? (
        <>
          <span onClick={stop} className="set-target set-target-inputs">
            <input
              aria-label="무게 입력"
              type="number"
              placeholder="kg"
              className="free-input"
              value={weightText}
              onChange={(e) => setWeightText(e.target.value)}
            />
            <input
              aria-label="렙 입력"
              type="number"
              placeholder={String(planned.reps)}
              className="free-input"
              value={repsText}
              onChange={(e) => setRepsText(e.target.value)}
            />
          </span>
          <span onClick={stop} className="set-row-adjust">
            <button type="button" className="btn btn-secondary btn-compact" onClick={submitFree}>
              {recorded ? "저장" : "완료"}
            </button>
          </span>
        </>
      ) : (
        <>
          <div className="set-target">
            <span className="set-row-value">
              {weight}kg × {reps}
            </span>
            <PlateBreakdown weight={planned.weight} cfg={cfg} />
            {recorded && durationSec !== undefined && (
              <span className="set-duration" data-testid={`set-duration-${id}`}>
                {formatDuration(durationSec)}
              </span>
            )}
          </div>
          <span className="set-row-adjust" />
        </>
      )}
    </SetRowShell>
  );
}
