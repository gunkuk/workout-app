import { useEffect, useState, type MouseEvent, type SyntheticEvent } from "react";
import type { PlannedSet } from "../domain/programEngine";
import type { SetRecord } from "../domain/types.ts";
import { SetRowShell } from "./SetRowShell";

export type FreeInputSetRowProps = {
  id: string;
  planned: PlannedSet;
  recorded?: SetRecord;
  onComplete: (weight: number, reps: number) => void;
  onCorrect: (weight: number, reps: number) => void;
};

/**
 * 자유입력 모드(planned.weight === null — needsInit 악세사리): 무게·렙 텍스트 입력 +
 * 완료/저장 버튼으로만 제출(행 탭으로 즉시 제출되지 않음). SetRow에서 분리(Stage1-R T5) —
 * DOM·aria-label·클릭 시맨틱은 원본과 byte-for-byte 동일.
 */
export function FreeInputSetRow({ id, planned, recorded, onComplete, onCorrect }: FreeInputSetRowProps) {
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
    <SetRowShell id={id} onClick={handleRowClick} completed={!!recorded && !editing}>
      {showEditable ? (
        <span onClick={stop} className="set-row-controls">
          <input
            aria-label="무게 입력"
            type="number"
            placeholder="무게(kg)"
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
          <button type="button" className="btn btn-secondary" onClick={submitFree}>
            {recorded ? "저장" : "완료"}
          </button>
        </span>
      ) : (
        <>
          <span className="set-row-value">
            {weight}kg × {reps}
          </span>
          <span aria-label="완료됨" className="completed-pill">
            완료
          </span>
        </>
      )}
    </SetRowShell>
  );
}
