import { platesFor, type PlateConfig } from "../domain/plates";

export type PlateBreakdownProps = {
  /** PlannedSet.weight — missingTM·needsInit 슬롯에서 null 가능. */
  weight: number | null;
  cfg: PlateConfig;
};

const FALLBACK_TEXT = "직접 계산 필요";

/**
 * 세트 옆에 표시할 원판 구성(큰 것부터, 예: "25 + 15").
 * weight===null(계획 무게 자체가 없음)이면 platesFor를 호출하지 않고 바로 안내로 대체한다
 * (plates.ts의 platesFor(cfg, target: number)는 target이 non-nullable — null을 넘기지 않는 것이
 * 이 컴포넌트의 핵심 계약). platesFor가 null(보유 원판으로 구성 불가) 반환 시도 동일 안내.
 */
export function PlateBreakdown({ weight, cfg }: PlateBreakdownProps) {
  if (weight === null) {
    return <span data-testid="plate-breakdown">{FALLBACK_TEXT}</span>;
  }
  const plates = platesFor(cfg, weight);
  if (plates === null) {
    return <span data-testid="plate-breakdown">{FALLBACK_TEXT}</span>;
  }
  if (plates.length === 0) {
    return <span data-testid="plate-breakdown">바만</span>;
  }
  return <span data-testid="plate-breakdown">{plates.join(" + ")}</span>;
}
