import { useCallback, useEffect, useRef, useState } from "react";

export type RestTimerProps = {
  /** 잔여시간이 0에 도달한 순간 정확히 1회 호출(재도달·재렌더로 중복 호출되지 않음) */
  onDone?: () => void;
};

const DEFAULT_DURATION_MS = 90_000;
const STEP_MS = 15_000;
const MIN_DURATION_MS = STEP_MS;
const TICK_MS = 250;

function toSeconds(ms: number): number {
  return Math.ceil(ms / 1000);
}

/**
 * 휴식 타이머(스펙 §2-5) — store/domain/storage 의존 없는 독립 컴포넌트.
 * timestamp 기반: 시작 시 endTime = Date.now() + duration을 한 번 고정하고, 매 tick마다
 * "endTime - Date.now()"로 잔여시간을 재계산한다(카운터를 tick마다 감소시키지 않음 —
 * setInterval 자체는 드리프트/백그라운드 스로틀링에 취약하지만, 매번 실제 시각과의 차로
 * 재계산하므로 그 오차가 표시값에 누적되지 않는다).
 * visibilitychange로 화면이 다시 보일 때도 동일한 recompute를 즉시 실행 — 백그라운드 동안
 * interval이 스로틀링/정지되어 있었어도 복귀 즉시 정확한 잔여시간을 반영한다.
 * ± 조정은 시작 전(duration 설정)에만 허용한다 — 시작 후 조정은 이 태스크 범위 밖으로 판단
 * (계획 "구현자 판단, 문서화" 조항): 진행 중 타깃을 바꾸면 endTime 재계산 시맨틱이 모호해지고,
 * SetRow의 "정정" 같은 명확한 기존 패턴이 없어 이번 태스크(독립 컴포넌트)에서는 미제공.
 * 자동 시작 배선(SetRow 완료 시 트리거)은 Task 6(TodayScreen 통합)의 책임.
 */
export function RestTimer({ onDone }: RestTimerProps) {
  const [durationMs, setDurationMs] = useState(DEFAULT_DURATION_MS);
  const [started, setStarted] = useState(false);
  const [endTime, setEndTime] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState(DEFAULT_DURATION_MS);
  const [done, setDone] = useState(false);
  const doneFiredRef = useRef(false);

  const recompute = useCallback(
    (end: number) => {
      const rem = Math.max(0, end - Date.now());
      setRemainingMs(rem);
      if (rem === 0 && !doneFiredRef.current) {
        doneFiredRef.current = true;
        setDone(true);
        onDone?.();
      }
    },
    [onDone],
  );

  // 카운트다운 tick — 표시만 갱신, 값의 근거는 항상 endTime(고정 목표시각) - Date.now().
  useEffect(() => {
    if (!started || endTime === null) return;
    recompute(endTime);
    const intervalId = setInterval(() => recompute(endTime), TICK_MS);
    return () => clearInterval(intervalId);
  }, [started, endTime, recompute]);

  // 백그라운드 복귀 시 재계산 — 이 태스크의 핵심 검증 대상(interval 드리프트 없음을 증명).
  useEffect(() => {
    if (!started || endTime === null) return;
    const target = endTime;
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") recompute(target);
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [started, endTime, recompute]);

  function adjust(deltaMs: number) {
    setDurationMs((d) => Math.max(MIN_DURATION_MS, d + deltaMs));
  }

  function handleStart() {
    doneFiredRef.current = false;
    setDone(false);
    const end = Date.now() + durationMs;
    setRemainingMs(durationMs);
    setEndTime(end);
    setStarted(true);
  }

  if (!started) {
    return (
      <div data-testid="rest-timer" className="rest-timer">
        <span data-testid="rest-timer-display" className="rest-timer-display">
          {toSeconds(durationMs)}초
        </span>
        <div className="rest-timer-controls">
          <button type="button" aria-label="휴식시간 감소" className="stepper-btn" onClick={() => adjust(-STEP_MS)}>
            −15초
          </button>
          <button type="button" aria-label="휴식시간 증가" className="stepper-btn" onClick={() => adjust(STEP_MS)}>
            +15초
          </button>
          <button type="button" className="btn btn-primary" onClick={handleStart}>
            시작
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="rest-timer" className="rest-timer">
      {done ? (
        <span data-testid="rest-timer-display" aria-label="휴식 완료" className="rest-timer-display">
          완료
        </span>
      ) : (
        <span data-testid="rest-timer-display" className="rest-timer-display">
          {toSeconds(remainingMs)}초
        </span>
      )}
    </div>
  );
}
