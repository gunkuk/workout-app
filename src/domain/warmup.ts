import { stepOf, roundToStep, minHingeLoad, type PlateConfig } from "./plates";

/** 워밍업 세트 — 무게·렙 */
export type PlannedWarmup = { weight: number; reps: number };

const EPS = 1e-6;

/**
 * 상대% 램프 기반 워밍업 자동 생성 (스펙 §2-5, UI15 item1로 3단계+반복 사양 변경).
 * 연산 순서는 불변식의 일부 — 임의 변경 금지:
 * 1) floor/cap 계산 → 2) floor>cap 공통 가드 → 3) 램프 템플릿(힌지는 빈바 스텝 제거)
 * → 4) %스텝 반올림 → floor 하한 클램프 → cap 초과 스텝 제거(이 순서 고정)
 * → 5) 무게 중복 dedupe(첫 스텝만 유지)
 * → 6) 앞에서 3개로 자르고 0번째를 복제해 맨 앞에 추가(총 최대 4줄, 1단계를 2세트 반복).
 */
export function generateWarmup(
  firstWorkWeight: number,
  opts: { hinge: boolean; cfg: PlateConfig }
): PlannedWarmup[] {
  const { hinge, cfg } = opts;
  const step = stepOf(cfg);

  // 1. floor/cap
  const floor = hinge ? minHingeLoad(cfg) : cfg.barWeight;
  const cap = firstWorkWeight - step;

  // 2. 공통 가드 — floor > cap이면 램프 생략
  if (floor > cap) return [];

  // 3. 램프 템플릿: 빈바×10(힌지는 제거) → 50%×5 → 70%×3 → 88%×1
  const template: { weight: number; reps: number; round: boolean }[] = [];
  if (!hinge) {
    template.push({ weight: cfg.barWeight, reps: 10, round: false });
  }
  template.push({ weight: 0.5 * firstWorkWeight, reps: 5, round: true });
  template.push({ weight: 0.7 * firstWorkWeight, reps: 3, round: true });
  template.push({ weight: 0.88 * firstWorkWeight, reps: 1, round: true });

  // 4. 반올림(빈바 제외) → floor 클램프 → cap 초과 제거 (순서 고정)
  const clamped = template.map((s) => {
    const w = s.round ? roundToStep(s.weight, step) : s.weight;
    return { weight: Math.max(w, floor), reps: s.reps };
  });
  const withinCap = clamped.filter((s) => s.weight <= cap + EPS);

  // 5. dedupe — 무게 중복은 첫 스텝만 유지 (오름차순은 구성상 보장)
  const result: PlannedWarmup[] = [];
  for (const s of withinCap) {
    if (!result.some((r) => Math.abs(r.weight - s.weight) < EPS)) {
      result.push(s);
    }
  }

  // 6. 사용자 확정 사양(UI15 item1) — 3단계로 축소 + 1단계 2세트 반복. 먼저 앞에서 3개로 자르고,
  // 그 다음 0번째 항목을 복제해 맨 앞에 하나 더 끼워넣는다(총 최대 4줄). 3개 미만이면 있는 만큼만
  // 자르고 0번째만 복제.
  const trimmed = result.slice(0, 3);
  const first = trimmed[0];
  if (!first) return trimmed;
  return [first, ...trimmed];
}
