/** 부위 분류 */
export type MuscleGroup =
  | "chest"
  | "back"
  | "shoulders"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "calves"
  | "biceps"
  | "triceps"
  | "core";

/** 운동 메타데이터 */
export type ExerciseInfo = {
  id: string;
  name: string; // 한글
  groups: MuscleGroup[]; // primary 1~3개
  hinge?: true;
};

/** 운동 라이브러리 — 13종 (nSuns 기준) */
export const EXERCISES: Record<string, ExerciseInfo> = {
  bench: {
    id: "bench",
    name: "벤치프레스",
    groups: ["chest", "triceps"],
  },
  inclineBench: {
    id: "inclineBench",
    name: "인클라인 벤치",
    groups: ["chest", "shoulders"],
  },
  cgbp: {
    id: "cgbp",
    name: "클로즈그립 벤치",
    groups: ["triceps", "chest"],
  },
  ohp: {
    id: "ohp",
    name: "오버헤드프레스",
    groups: ["shoulders", "triceps"],
  },
  squat: {
    id: "squat",
    name: "스쿼트",
    groups: ["quads", "glutes"],
  },
  frontSquat: {
    id: "frontSquat",
    name: "프론트 스쿼트",
    groups: ["quads", "core"],
  },
  deadlift: {
    id: "deadlift",
    name: "데드리프트",
    groups: ["hamstrings", "back", "glutes"],
    hinge: true,
  },
  sumoDeadlift: {
    id: "sumoDeadlift",
    name: "스모 데드리프트",
    groups: ["glutes", "hamstrings", "quads"],
    hinge: true,
  },
  latPulldown: {
    id: "latPulldown",
    name: "랫풀다운",
    groups: ["back", "biceps"],
  },
  chestSupportedRow: {
    id: "chestSupportedRow",
    name: "체스트서포티드 로우",
    groups: ["back"],
  },
  machineCurl: {
    id: "machineCurl",
    name: "머신 컬",
    groups: ["biceps"],
  },
  calfRaise: {
    id: "calfRaise",
    name: "카프 레이즈",
    groups: ["calves"],
  },
  rearDeltFly: {
    id: "rearDeltFly",
    name: "리어델트 플라이",
    groups: ["shoulders"],
  },
  tbarRow: {
    id: "tbarRow",
    name: "티바 로우",
    groups: ["back"],
  },
  pullup: {
    id: "pullup",
    name: "풀업",
    groups: ["back", "biceps"],
  },
  backExtension: {
    id: "backExtension",
    name: "백 익스텐션",
    groups: ["hamstrings", "glutes"],
  },
  hipThrust: {
    id: "hipThrust",
    name: "힙 쓰러스트",
    groups: ["glutes"],
  },
  lateralRaise: {
    id: "lateralRaise",
    name: "레터럴 레이즈",
    groups: ["shoulders"],
  },
  legRaise: {
    id: "legRaise",
    name: "행잉 레그레이즈",
    groups: ["core"],
  },
  dumbbellRow: {
    id: "dumbbellRow",
    name: "덤벨로우",
    groups: ["back", "biceps"],
  },
  bulgarianSplitSquat: {
    id: "bulgarianSplitSquat",
    name: "불가리안 스플릿 스쿼트",
    groups: ["quads", "glutes"],
  },
  oneArmRow: {
    id: "oneArmRow",
    name: "원암 덤벨로우",
    groups: ["back", "biceps"],
  },
};

/** 운동 정보 조회 */
export function exerciseInfo(id: string): ExerciseInfo | undefined {
  return EXERCISES[id];
}
