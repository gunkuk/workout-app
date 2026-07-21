import { useState } from "react";
import { useProgramStore } from "../store/programStore";
import { SetRow } from "../components/SetRow";
import { ProposalCard } from "../components/ProposalCard";
import { ExerciseSwap } from "../components/ExerciseSwap";
import { RestTimer } from "../components/RestTimer";
import { ActivityTimer } from "../components/ActivityTimer";
import { SessionSpanTimer } from "../components/SessionSpanTimer";
import { USER_PLATES } from "../lib/plateConfig";
import { exerciseInfo } from "../domain/exerciseLibrary";
import { formatDuration } from "../lib/duration";
import type { ActivitySegment } from "../store/queries";
import type { PlannedSet } from "../domain/programEngine";
import { useTodaySession, STEP_WEIGHT } from "./today/useTodaySession";
import { setIdFor } from "./today/sessionId";

export type TodayScreenProps = {
  /** SessionCompleted append + refreshAfterWrite 완료 후 호출 — 라우팅은 호출부(T7의 App) 책임 */
  onSessionComplete?: () => void;
};

// 테스트 의존 export 유지(Global Constraint 4) — 구현은 today/sessionId.ts로 이동, 여기서 re-export.
export { sessionIdFor } from "./today/sessionId";

export function TodayScreen({ onSessionComplete }: TodayScreenProps) {
  const status = useProgramStore((s) => s.status);
  const todayPlan = useProgramStore((s) => s.todayPlan);
  const pendingProposals = useProgramStore((s) => s.pendingProposals);
  const restDay = useProgramStore((s) => s.restDay);
  const instanceState = useProgramStore((s) => s.instanceState);

  const {
    recorded,
    error,
    completing,
    sessionId,
    effectiveSlots,
    allWorkSetsComplete,
    swappedSlots,
    timerVisibleSlots,
    setTimings,
    isSkipped,
    handleComplete,
    handleCorrect,
    handleSessionComplete,
    handleSkip,
    handleUnskip,
    handlePainDay,
    handleRestoreOriginal,
    wakeLockNotice,
    autoStartTrigger,
  } = useTodaySession(onSessionComplete);

  // 세션 코멘트(UI5 T2) — 전부 완료(allWorkSetsComplete)됐을 때만 노출되는 1줄 입력, 완료 버튼과 함께 제출.
  const [note, setNote] = useState("");
  // 활동 구간 타이머(UI11) — 이 세션에 연결된, 이미 종료된 구간들(ActivityTimer가 콜백으로 올림).
  // "세션 총 시간" = 이 구간들의 durationSec 합(세트 첫~끝 wall-clock이 아니라 사용자가 명시적으로
  // 잰 활동 구간의 합 — 스펙 §C). 이 방식은 UI14 item7에서도 그대로 유지(변경 안 함) — 새로 추가되는
  // 건 별도 span 지표(today-span-time, 아래).
  const [sessionSegments, setSessionSegments] = useState<ActivitySegment[]>([]);
  const totalSessionSec = sessionSegments.reduce((n, s) => n + (s.durationSec ?? 0), 0);
  // UI14 item7 — 우상단 통합 표시용: 이 세션에 연결된 "모든"(진행 중 포함) 구간. SessionSpanTimer가
  // 이걸로 "첫 구간 시작~마지막 구간 종료(또는 지금)" span을 계산.
  const [sessionSpanSegments, setSessionSpanSegments] = useState<ActivitySegment[]>([]);

  if (restDay === "rest") {
    return <div className="loading-state">오늘은 휴식일입니다</div>;
  }
  if (restDay === "notStarted") {
    return (
      <div className="loading-state">프로그램 시작 전입니다 (시작일: {instanceState?.anchor.startDate})</div>
    );
  }

  if (status !== "ready" || !todayPlan || !sessionId) {
    return <div className="loading-state">로딩 중...</div>;
  }

  // UI v2(Boostcamp 클론, Stage1-UI2) — 전체 진행률("N/M"). missingTM 슬롯은 체크오프 자체가 없으므로 분모에서 제외.
  const totalWork = effectiveSlots.reduce((n, { slot }) => n + (slot.missingTM ? 0 : slot.sets.length), 0);
  const doneWork = effectiveSlots.reduce((n, { slot }) => {
    if (slot.missingTM) return n;
    return n + slot.sets.filter((_, i) => recorded[setIdFor(sessionId, slot.slotId, "work", i)] !== undefined).length;
  }, 0);

  return (
    <div>
      {/* 스티키 헤더(스펙 §"오늘 화면"): day명 + (전부 완료 시)골드 "세션 완료" pill, 아니면 muted 진행 카운트.
          ⚙는 NavShell의 전역 고정 아이콘을 그대로 재사용(문서화: 이 헤더에 별도로 두지 않고, InstallBanner에
          우측 여백을 확보해 겹침만 해소했다 — index.css .install-banner 참조, "구현자 판단" 조항). */}
      <div className="today-sticky-header">
        <h2 className="day-header">{todayPlan.dayName}</h2>
        {/* UI14 item7 — 우상단 통합 표시(today-span-time)는 진행 카운트/완료 pill과 별개로 항상 그
            옆에 노출(데이터가 있을 때만, SessionSpanTimer 내부에서 판단). */}
        <div className="today-header-right">
          <SessionSpanTimer segments={sessionSpanSegments} />
          {allWorkSetsComplete ? (
            <div className="session-complete-row">
              <input
                aria-label="세션 코멘트"
                type="text"
                className="session-note-input"
                placeholder="세션 코멘트"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <button
                type="button"
                className="btn-complete-session"
                onClick={() => handleSessionComplete(note)}
                disabled={completing}
              >
                세션 완료
              </button>
            </div>
          ) : (
            <span className="today-progress">
              {doneWork}/{totalWork}
            </span>
          )}
        </div>
      </div>
      {/* 활동 구간 타이머(UI11, 스펙 §A) — 스티키 헤더 바로 아래. 세션 총 시간(§C, 이 세션에 연결된
          구간 durationSec 합)은 데이터가 있을 때만 그 옆에 노출. */}
      <div className="today-activity-row">
        <ActivityTimer
          sessionId={sessionId}
          onSessionSegmentsChange={setSessionSegments}
          onSessionSpanSegmentsChange={setSessionSpanSegments}
          autoStartTrigger={autoStartTrigger}
        />
        {totalSessionSec > 0 && (
          <span className="today-total-time" data-testid="today-total-time">
            총 {formatDuration(totalSessionSec)}
          </span>
        )}
      </div>
      {pendingProposals.map((p) => (
        <ProposalCard key={`${p.type}-${p.sourceSetRecordId}`} proposal={p} />
      ))}
      {wakeLockNotice && (
        <div role="status" className="status-banner">
          {wakeLockNotice}
        </div>
      )}
      {error && <div role="alert" className="alert">{error}</div>}
      {effectiveSlots.map(({ original, slot, swapped }) => {
        const slotDone = slot.sets.filter((_, i) => recorded[setIdFor(sessionId, slot.slotId, "work", i)] !== undefined).length;
        return (
          <section key={original.slotId} className="slot-section">
            <div className="exercise-card">
              {/* 우선순위1: 운동명 골드 볼드 + N/M 진행 카운트(스펙 "운동 섹션" 헤더 행) */}
              <div className="exercise-header-row">
                <h4 className="exercise-name">{exerciseInfo(slot.exerciseId)?.name ?? slot.exerciseId}</h4>
                {!slot.missingTM && (
                  <span className="exercise-progress">
                    {slotDone}/{slot.sets.length}
                  </span>
                )}
              </div>
              <div className="slot-meta-row">
                <h3 className="slot-eyebrow">{slot.label}</h3>
                <ExerciseSwap
                  slot={slot}
                  skipped={isSkipped(slot.slotId)}
                  onSkip={() => handleSkip(slot.slotId)}
                  onUnskip={() => handleUnskip(slot.slotId)}
                  swapped={swapped}
                  onPainDay={() => handlePainDay(original)}
                  onRestoreOriginal={handleRestoreOriginal}
                />
              </div>
              {slot.missingTM ? (
                <p>TM 필요 — 온보딩에서 시드해주세요.</p>
              ) : (
                <>
                  {/* 우선순위2: 세트 테이블 — 워밍업(W 배지)과 작업세트가 한 테이블에 통합, 4열 그리드.
                      UI14 item2 — 워밍업도 작업세트와 동일한 SetRow 완료 메커니즘으로 렌더한다: 마운트 시
                      자동 기록(useTodaySession의 워밍업 자동기록 effect)은 그대로 유지하되, 사용자가
                      탭해서 재확인/정정(완료 표시 재탭 → 정정모드)할 수 있게 됐다("자동기록만 되고 탭
                      불가"였던 기존 read-only 표시에서 업그레이드). 바깥에 기존 data-testid
                      `warmup-${slotId}-${i}` 래퍼를 유지해 그 스킴에 의존하는 기존 테스트(워밍업 개수
                      카운트)를 그대로 보존한다 — 안쪽 SetRow는 독립적으로 `setrow-${id}` testid를 낸다. */}
                  <div className="set-table">
                    {slot.warmups.map((w, i) => {
                      const id = setIdFor(sessionId, slot.slotId, "warmup", i);
                      const planned: PlannedSet = { weight: w.weight, reps: w.reps, setType: "warmup" };
                      return (
                        <div key={`warmup-${i}`} data-testid={`warmup-${slot.slotId}-${i}`} className="is-warmup-row">
                          <SetRow
                            id={id}
                            planned={planned}
                            recorded={recorded[id]}
                            stepWeight={STEP_WEIGHT}
                            index={i + 1}
                            cfg={USER_PLATES}
                            durationSec={setTimings[id]?.durationSec}
                            onComplete={(w2, r2) => handleComplete(id, slot, planned, w2, r2)}
                            onCorrect={(w2, r2) => handleCorrect(id, w2, r2)}
                          />
                        </div>
                      );
                    })}
                    {slot.sets.map((s, i) => {
                      const id = setIdFor(sessionId, slot.slotId, "work", i);
                      return (
                        <SetRow
                          key={id}
                          id={id}
                          planned={s}
                          recorded={recorded[id]}
                          stepWeight={STEP_WEIGHT}
                          index={i + 1}
                          cfg={USER_PLATES}
                          durationSec={setTimings[id]?.durationSec}
                          onComplete={(w, r) => handleComplete(id, slot, s, w, r, swappedSlots[slot.slotId])}
                          onCorrect={(w, r) => handleCorrect(id, w, r)}
                        />
                      );
                    })}
                  </div>
                  {/* 우선순위5: 휴식 타이머 — 컴포넌트/마운트 조건은 그대로, index.css에서 화면 하단 고정
                      플로팅 pill로 위치·스타일만 변경(.rest-timer position:fixed). */}
                  {timerVisibleSlots[slot.slotId] && <RestTimer />}
                </>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
