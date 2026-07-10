import { useEffect, useState, type MouseEvent, type ReactNode, type SyntheticEvent } from "react";
import type { PlannedSet } from "../domain/programEngine";
import type { SetRecord } from "../domain/types.ts";
import type { PlateConfig } from "../domain/plates";
import { SetRowShell } from "./SetRowShell";
import { PlateBreakdown } from "./PlateBreakdown";

export type SteppedSetRowProps = {
  id: string;
  planned: PlannedSet;
  recorded?: SetRecord;
  /** ± 스테퍼의 무게 증감 단위 (stepOf(cfg)) */
  stepWeight: number;
  /** 목표 셀 서브라인(원판 구성) 표시용(Stage1-UI2) */
  cfg: PlateConfig;
  /** SetRow가 계산한 배지(세트번호 또는 AMRAP "F") — 1열 그리드 셀(Stage1-UI2) */
  badge: ReactNode;
  onComplete: (weight: number, reps: number) => void;
  onCorrect: (weight: number, reps: number) => void;
};

/**
 * 타깃 무게 있는 슬롯(planned.weight !== null): 행 전체 탭 = 완료(현재 스테퍼 값으로),
 * ± 스테퍼로 무게/렙 조정, 완료된 세트 재탭 = 정정모드(스테퍼 다시 노출 + 저장 버튼).
 * SetRow에서 분리(Stage1-R T5) — DOM·aria-label·클릭 시맨틱은 원본과 byte-for-byte 동일.
 * UI v2(Stage1-UI2) — SetRowShell이 4열 그리드[배지|목표|조정|체크원]로 렌더하므로, children을
 * 정확히 2개 요소(목표 셀 div, 조정 셀 span)로 순서대로 반환한다(그리드 트랙 매칭 계약).
 */
export function SteppedSetRow({ id, planned, recorded, stepWeight, cfg, badge, onComplete, onCorrect }: SteppedSetRowProps) {
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
    <SetRowShell id={id} onClick={handleRowClick} completed={!!recorded && !editing} badge={badge}>
      <div className="set-target">
        <span className="set-row-value">
          {weight}kg × {reps}
          {amrapLabel}
        </span>
        <PlateBreakdown weight={planned.weight} cfg={cfg} />
      </div>
      <span onClick={stop} className="set-row-adjust">
        {showEditable && (
          <span className="set-row-controls">
            <button
              type="button"
              aria-label="무게 감소"
              className="stepper-btn"
              onClick={() => setWeight((w) => w - stepWeight)}
            >
              −
            </button>
            <button
              type="button"
              aria-label="무게 증가"
              className="stepper-btn"
              onClick={() => setWeight((w) => w + stepWeight)}
            >
              +
            </button>
            <button
              type="button"
              aria-label="렙 감소"
              className="stepper-btn"
              onClick={() => setReps((r) => Math.max(0, r - 1))}
            >
              −렙
            </button>
            <button type="button" aria-label="렙 증가" className="stepper-btn" onClick={() => setReps((r) => r + 1)}>
              +렙
            </button>
          </span>
        )}
        {editing && (
          <button type="button" className="btn btn-secondary btn-compact" onClick={saveCorrection}>
            저장
          </button>
        )}
      </span>
    </SetRowShell>
  );
}
