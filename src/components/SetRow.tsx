import { useEffect, useState, type MouseEvent, type SyntheticEvent } from "react";
import type { PlannedSet } from "../domain/programEngine";
import type { SetRecord } from "../domain/types.ts";

export type SetRowProps = {
  /** 결정론적 SetRecord id (TodayScreen이 세션id 기반으로 계산) — data-testid·복원 매칭용 */
  id: string;
  planned: PlannedSet;
  /** 이미 기록된 값(복원 또는 방금 완료) — 있으면 완료 상태로 렌더 */
  recorded?: SetRecord;
  /** ± 스테퍼의 무게 증감 단위 (stepOf(cfg)) — 자유입력 모드에선 미사용 */
  stepWeight: number;
  /** 최초 완료 제출 */
  onComplete: (weight: number, reps: number) => void;
  /** 이미 완료된 세트의 정정 제출 */
  onCorrect: (weight: number, reps: number) => void;
};

/**
 * 세트 1행.
 * - 타깃 무게 있음(planned.weight !== null): 행 전체 탭 = 완료(현재 스테퍼 값으로),
 *   ± 스테퍼로 무게/렙 조정, 완료된 세트 재탭 = 정정모드(스테퍼 다시 노출 + 저장 버튼).
 * - 타깃 무게 없음(planned.weight === null — needsInit 악세사리): 자유입력 필드(무게·렙 텍스트 입력,
 *   렙 placeholder=스펙 reps) + 완료/저장 버튼으로만 제출(행 탭으로 즉시 제출되지 않음).
 *   (missingTM 슬롯은 TodayScreen이 애초에 SetRow를 렌더하지 않으므로 이 컴포넌트에 들어오지 않는다.)
 */
export function SetRow({ id, planned, recorded, stepWeight, onComplete, onCorrect }: SetRowProps) {
  const isFreeInput = planned.weight === null;
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
  const amrapLabel = planned.amrapRole === "topSet" ? " (AMRAP)" : "";

  if (isFreeInput) {
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
      <div
        role="button"
        tabIndex={0}
        data-testid={`setrow-${id}`}
        onClick={handleRowClick}
        style={{ minHeight: 48, display: "flex", alignItems: "center", gap: 8 }}
      >
        {showEditable ? (
          <span onClick={stop} style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <input
              aria-label="무게 입력"
              type="number"
              placeholder="무게(kg)"
              value={weightText}
              onChange={(e) => setWeightText(e.target.value)}
            />
            <input
              aria-label="렙 입력"
              type="number"
              placeholder={String(planned.reps)}
              value={repsText}
              onChange={(e) => setRepsText(e.target.value)}
            />
            <button type="button" onClick={submitFree}>
              {recorded ? "저장" : "완료"}
            </button>
          </span>
        ) : (
          <>
            <span>
              {weight}kg × {reps}
            </span>
            <span aria-label="완료됨">완료</span>
          </>
        )}
      </div>
    );
  }

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
    <div
      role="button"
      tabIndex={0}
      data-testid={`setrow-${id}`}
      onClick={handleRowClick}
      style={{ minHeight: 48, display: "flex", alignItems: "center", gap: 8 }}
    >
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
    </div>
  );
}
