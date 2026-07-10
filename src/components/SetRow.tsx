import type { PlannedSet } from "../domain/programEngine";
import type { SetRecord } from "../domain/types.ts";
import { FreeInputSetRow } from "./FreeInputSetRow";
import { SteppedSetRow } from "./SteppedSetRow";

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
 * 세트 1행 — 얇은 디스패처(Stage1-R T5). planned.weight가 null이면(needsInit 악세사리)
 * FreeInputSetRow, 아니면 SteppedSetRow로 위임. 두 leaf가 공유하는 바깥 셸은 SetRowShell.
 * (missingTM 슬롯은 TodayScreen이 애초에 SetRow를 렌더하지 않으므로 이 컴포넌트에 들어오지 않는다.)
 */
export function SetRow({ id, planned, recorded, stepWeight, onComplete, onCorrect }: SetRowProps) {
  if (planned.weight === null) {
    return <FreeInputSetRow id={id} planned={planned} recorded={recorded} onComplete={onComplete} onCorrect={onCorrect} />;
  }
  return (
    <SteppedSetRow
      id={id}
      planned={planned}
      recorded={recorded}
      stepWeight={stepWeight}
      onComplete={onComplete}
      onCorrect={onCorrect}
    />
  );
}
