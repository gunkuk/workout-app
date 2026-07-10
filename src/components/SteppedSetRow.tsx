import { useEffect, useState, type MouseEvent, type SyntheticEvent } from "react";
import type { PlannedSet } from "../domain/programEngine";
import type { SetRecord } from "../domain/types.ts";
import { SetRowShell } from "./SetRowShell";

export type SteppedSetRowProps = {
  id: string;
  planned: PlannedSet;
  recorded?: SetRecord;
  /** ± 스테퍼의 무게 증감 단위 (stepOf(cfg)) */
  stepWeight: number;
  onComplete: (weight: number, reps: number) => void;
  onCorrect: (weight: number, reps: number) => void;
};

/**
 * 타깃 무게 있는 슬롯(planned.weight !== null): 행 전체 탭 = 완료(현재 스테퍼 값으로),
 * ± 스테퍼로 무게/렙 조정, 완료된 세트 재탭 = 정정모드(스테퍼 다시 노출 + 저장 버튼).
 * SetRow에서 분리(Stage1-R T5) — DOM·aria-label·클릭 시맨틱은 원본과 byte-for-byte 동일.
 */
export function SteppedSetRow({ id, planned, recorded, stepWeight, onComplete, onCorrect }: SteppedSetRowProps) {
  const [editing, setEditing] = useState(false);
  const [weight, setWeight] = useState<number>(recorded?.actualWeight ?? planned.weight ?? 0);
  const [reps, setReps] = useState<number>(recorded?.actualReps ?? planned.reps);

  useEffect(() => {
    if (editing) return;
    setWeight(recorded?.actualWeight ?? planned.weight ?? 0);
    setReps(recorded?.actualReps ?? planned.reps);
  }, [recorded, planned, editing]);

  function stop(e: SyntheticEvent) {
    e.stopPropagation();
  }

  const showEditable = !recorded || editing;
  const amrapLabel = planned.amrapRole === "topSet" ? " (AMRAP)" : "";

  function handleRowClick() {
    if (!recorded) {
      onComplete(weight, reps);
      return;
    }
    if (!editing) setEditing(true);
  }

  function saveCorrection(e: MouseEvent) {
    stop(e);
    onCorrect(weight, reps);
    setEditing(false);
  }

  return (
    <SetRowShell id={id} onClick={handleRowClick}>
      <span>
        {weight}kg × {reps}
        {amrapLabel}
      </span>
      {showEditable && (
        <span onClick={stop} style={{ display: "flex", gap: 4 }}>
          <button type="button" aria-label="무게 감소" onClick={() => setWeight((w) => w - stepWeight)}>
            −
          </button>
          <button type="button" aria-label="무게 증가" onClick={() => setWeight((w) => w + stepWeight)}>
            +
          </button>
          <button type="button" aria-label="렙 감소" onClick={() => setReps((r) => Math.max(0, r - 1))}>
            −렙
          </button>
          <button type="button" aria-label="렙 증가" onClick={() => setReps((r) => r + 1)}>
            +렙
          </button>
        </span>
      )}
      {editing && (
        <button type="button" onClick={saveCorrection}>
          저장
        </button>
      )}
      {recorded && !editing && <span aria-label="완료됨">완료</span>}
    </SetRowShell>
  );
}
