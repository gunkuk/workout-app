import { useCallback, useEffect, useRef, useState } from "react";
import type { ActivitySegment } from "../store/queries";
import { formatDuration } from "../lib/duration";

export type SessionSpanTimerProps = {
  /** 이 세션에 연결된 "모든" 활동 구간(진행 중 포함) — ActivityTimer의 onSessionSpanSegmentsChange로 공급. */
  segments: ActivitySegment[];
};

const TICK_MS = 1000;

/**
 * UI14 item7 — 우상단 통합 표시: "첫 구간이 시작된 순간부터 마지막 구간이 끝난 순간(또는 아직
 * 진행 중이면 지금)까지"의 wall-clock span. 기존 `today-total-time`(구간 durationSec의 합)과는
 * 다른 지표 — 합이 아니라 처음~끝 사이 실제 경과 시간(중간에 쉰 시간도 포함)이다.
 * RestTimer/ActivityTimer와 동일한 timestamp 기반 설계: 목표 시각을 고정하지 않고 매 tick마다
 * "now - firstStartedAt"(진행 중) 또는 "lastEndedAt - firstStartedAt"(전부 종료)을 재계산 —
 * drift 없음. visibilitychange 복귀 시에도 즉시 재계산.
 */
export function SessionSpanTimer({ segments }: SessionSpanTimerProps) {
  const [, forceTick] = useState(0);
  const runningRef = useRef(false);

  const recompute = useCallback(() => {
    forceTick((n) => n + 1);
  }, []);

  const hasRunning = segments.some((s) => s.endedAt === undefined);
  runningRef.current = hasRunning;

  useEffect(() => {
    if (!hasRunning) return;
    recompute();
    const intervalId = setInterval(recompute, TICK_MS);
    return () => clearInterval(intervalId);
  }, [hasRunning, recompute]);

  useEffect(() => {
    if (!hasRunning) return;
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") recompute();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [hasRunning, recompute]);

  if (segments.length === 0) return null;

  const firstStart = segments.reduce(
    (min, s) => (Date.parse(s.startedAt) < min ? Date.parse(s.startedAt) : min),
    Date.parse(segments[0]!.startedAt),
  );
  const endedTimes = segments.filter((s) => s.endedAt !== undefined).map((s) => Date.parse(s.endedAt!));
  const lastEnd = hasRunning ? Date.now() : endedTimes.length > 0 ? Math.max(...endedTimes) : firstStart;
  const spanSec = Math.max(0, Math.round((lastEnd - firstStart) / 1000));

  return (
    <span className="today-span-time" data-testid="today-span-time">
      {formatDuration(spanSec)}
    </span>
  );
}
