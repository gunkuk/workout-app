import type { PlateConfig } from "../domain/plates";

/** 사용자 플레이트 설정(2026-07-11) — 1.25kg 제외 → stepOf=5kg: 모든 표시 무게가 5kg 단위(원판 교체 최소화, 사용자 지시). 되돌리려면 1.25 쌍을 다시 추가. */
export const USER_PLATES: PlateConfig = {
  barWeight: 20,
  plates: [
    { weight: 25, pairs: 4, fullDiameter: true },
    { weight: 20, pairs: 2, fullDiameter: true },
    { weight: 15, pairs: 2 },
    { weight: 10, pairs: 2 },
    { weight: 5, pairs: 2 },
    { weight: 2.5, pairs: 2 },
  ],
};
