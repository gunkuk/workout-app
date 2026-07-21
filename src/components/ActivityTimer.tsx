import { useCallback, useEffect, useRef, useState } from "react";
import { useProgramStore } from "../store/programStore";
import { loadActivitySegments, type ActivityKind, type ActivitySegment } from "../store/queries";
import { nowISO } from "../lib/time";
import { formatDuration } from "../lib/duration";
import { ACTIVITY_KIND_LABELS, activityKindLabel } from "../lib/activityKinds";

export type ActivityTimerProps = {
  /** 오늘 세션의 결정론적 sessionId — 있으면 새 구간에 연결, 없으면(세션 시작 전 등) 독립 기록. */
  sessionId: string | null;
  /** 오늘 세션에 연결된, 이미 종료된 구간 목록이 바뀔 때마다 호출(TodayScreen이 "총 시간" 합산용) —
   *  ActivityTimer 자체는 sessionId 무관 전체 구간(현재 진행 중 복원 + 오늘 완료 요약)을 다루므로,
   *  세션 총 시간처럼 sessionId 한정 집계가 필요한 상위 화면에 이 콜백으로 필터링된 값을 올려보낸다. */
  onSessionSegmentsChange?: (segments: ActivitySegment[]) => void;
  /** UI14 item7 — 이 세션(sessionId)에 연결된 "모든" 구간(진행 중 포함, 종료 여부 무관)이 바뀔 때마다
   *  호출. onSessionSegmentsChange(종료된 것만, 합산용)와 달리, 상위 화면이 "첫 구간 시작~마지막 구간
   *  종료(또는 진행 중이면 지금)"의 span을 계산하려면 진행 중인 구간의 startedAt도 필요하다. */
  onSessionSpanSegmentsChange?: (segments: ActivitySegment[]) => void;
  /** UI14 item7 — 세션의 첫 세트가 완료될 때마다(useTodaySession) 증가하는 트리거. 이 값이 바뀌고
   *  현재 진행 중인 활동 구간이 없으면(사용자가 이미 수동으로 킨 kind가 있으면 존중해 건드리지 않음)
   *  "운동"(workout) kind로 자동 시작한다 — kind 칩은 계속 노출돼 수동 전환 가능(자동시작은 편의
   *  초기값일 뿐). */
  autoStartTrigger?: number;
};

const SELECTABLE_KINDS: ActivityKind[] = ["stretch", "workout", "postStretch", "running", "abs", "other"];

const TICK_MS = 1000;

/**
 * 활동 구간 타이머(UI11, 스펙 §A) — 스트레칭/운동/운동 후 스트레칭/러닝/복근/기타 중 선택해 구간을
 * 기록. **동시 1개만 진행** — 새 kind를 시작하면 진행 중이던 구간을 자동 종료한다(규칙은
 * programStore.startActivity가 강제, 여기선 호출만). RestTimer와 동일한 timestamp 기반 설계
 * (startedAt 고정 → 매 tick마다 Date.now()-startedAt 재계산, drift 없음) + visibilitychange 복귀 시
 * 즉시 재계산.
 */
export function ActivityTimer({
  sessionId,
  onSessionSegmentsChange,
  onSessionSpanSegmentsChange,
  autoStartTrigger,
}: ActivityTimerProps) {
  const startActivity = useProgramStore((s) => s.startActivity);
  const endActivity = useProgramStore((s) => s.endActivity);

  const [running, setRunning] = useState<ActivitySegment | null>(null);
  const [todaySegments, setTodaySegments] = useState<ActivitySegment[]>([]);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [otherLabel, setOtherLabel] = useState("");
  const runningRef = useRef<ActivitySegment | null>(null);

  const refresh = useCallback(async () => {
    const all = await loadActivitySegments();
    const runningRow = all.find((s) => s.endedAt === undefined) ?? null;
    runningRef.current = runningRow;
    setRunning(runningRow);

    const todayStr = new Date().toDateString();
    const completedToday = all.filter(
      (s) => s.endedAt !== undefined && new Date(s.startedAt).toDateString() === todayStr,
    );
    setTodaySegments(completedToday);
    onSessionSegmentsChange?.(sessionId ? completedToday.filter((s) => s.sessionId === sessionId) : []);
    // UI14 item7 — 진행 중 포함, 이 세션에 연결된 전체 구간(span 계산용).
    onSessionSpanSegmentsChange?.(sessionId ? all.filter((s) => s.sessionId === sessionId) : []);
  }, [sessionId, onSessionSegmentsChange, onSessionSpanSegmentsChange]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // UI14 item7 — 첫 세트 완료 시 자동 시작(편의 초기값). 이미 뭔가 진행 중이면(사용자가 먼저 킨
  // kind가 있으면) 건드리지 않는다 — "자동시작은 편의 초기값일 뿐, 수동 전환 여전히 가능".
  useEffect(() => {
    if (!autoStartTrigger) return;
    if (runningRef.current) return;
    handleStart("workout");
  }, [autoStartTrigger]);

  const recompute = useCallback(() => {
    const r = runningRef.current;
    if (!r) return;
    setElapsedSec((Date.now() - Date.parse(r.startedAt)) / 1000);
  }, []);

  useEffect(() => {
    if (!running) return;
    recompute();
    const intervalId = setInterval(recompute, TICK_MS);
    return () => clearInterval(intervalId);
  }, [running, recompute]);

  useEffect(() => {
    if (!running) return;
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") recompute();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [running, recompute]);

  async function handleStart(kind: ActivityKind, label?: string) {
    const rec: ActivitySegment = {
      id: crypto.randomUUID(),
      sessionId: sessionId ?? undefined,
      kind,
      label,
      startedAt: nowISO(),
      schemaVersion: 1,
    };
    await startActivity(rec);
    setShowOtherInput(false);
    setOtherLabel("");
    await refresh();
  }

  async function handleEnd() {
    const r = runningRef.current;
    if (!r) return;
    const endedAt = nowISO();
    const durationSec = Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(r.startedAt)) / 1000));
    await endActivity(r.id, endedAt, durationSec);
    await refresh();
  }

  return (
    <div data-testid="activity-timer" className="activity-timer">
      {running ? (
        <div className="activity-timer-running">
          <span className="activity-timer-kind">{activityKindLabel(running)}</span>
          <span data-testid="activity-timer-elapsed" className="activity-timer-elapsed">
            {formatDuration(elapsedSec)}
          </span>
          <button type="button" className="btn btn-secondary btn-compact" onClick={handleEnd}>
            종료
          </button>
        </div>
      ) : (
        <div className="activity-timer-chips">
          {SELECTABLE_KINDS.filter((k) => k !== "other").map((kind) => (
            <button key={kind} type="button" className="activity-kind-chip" onClick={() => handleStart(kind)}>
              {ACTIVITY_KIND_LABELS[kind]}
            </button>
          ))}
          {showOtherInput ? (
            <span className="activity-other-input">
              <input
                aria-label="기타 활동 이름"
                className="free-input"
                value={otherLabel}
                onChange={(e) => setOtherLabel(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-secondary btn-compact"
                disabled={!otherLabel.trim()}
                onClick={() => handleStart("other", otherLabel.trim())}
              >
                시작
              </button>
            </span>
          ) : (
            <button type="button" className="activity-kind-chip" onClick={() => setShowOtherInput(true)}>
              기타
            </button>
          )}
        </div>
      )}
      {todaySegments.length > 0 && (
        <div className="activity-timer-summary" data-testid="activity-timer-summary">
          {todaySegments.map((s) => (
            <span key={s.id} className="activity-summary-chip">
              {activityKindLabel(s)} {formatDuration(s.durationSec ?? 0)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
