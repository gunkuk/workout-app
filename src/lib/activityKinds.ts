import type { ActivityKind, ActivitySegment } from "../storage/trackingTypes";

/** 활동 구간 종류 한글 라벨(UI11) — ActivityTimer(선택 칩)·HistoryScreen(구간별 breakdown) 공용. */
export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  stretch: "스트레칭",
  workout: "운동",
  postStretch: "운동 후 스트레칭",
  running: "러닝",
  abs: "복근",
  other: "기타",
};

/** kind==="other"면 label(빈 문자열이면 "기타" 폴백), 아니면 표준 라벨. */
export function activityKindLabel(seg: Pick<ActivitySegment, "kind" | "label">): string {
  return seg.kind === "other" ? seg.label?.trim() || "기타" : ACTIVITY_KIND_LABELS[seg.kind];
}
