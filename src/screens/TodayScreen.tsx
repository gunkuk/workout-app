import { useProgramStore } from "../store/programStore";
import { SetRow } from "../components/SetRow";
import { ProposalCard } from "../components/ProposalCard";
import { ExerciseSwap } from "../components/ExerciseSwap";
import { RestTimer } from "../components/RestTimer";
import { DEFAULT_PLATES } from "../domain/plates";
import { exerciseInfo } from "../domain/exerciseLibrary";
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
    isSkipped,
    handleComplete,
    handleCorrect,
    handleSessionComplete,
    handleSkip,
    handleUnskip,
    handlePainDay,
    handleRestoreOriginal,
    wakeLockNotice,
  } = useTodaySession(onSessionComplete);

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
        {allWorkSetsComplete ? (
          <button type="button" className="btn-complete-session" onClick={handleSessionComplete} disabled={completing}>
            세션 완료
          </button>
        ) : (
          <span className="today-progress">
            {doneWork}/{totalWork}
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
                  {/* 우선순위2: 세트 테이블 — 워밍업(W 배지)과 작업세트가 한 테이블에 통합, 4열 그리드 */}
                  <div className="set-table">
                    {slot.warmups.map((w, i) => (
                      <div
                        key={`warmup-${i}`}
                        data-testid={`warmup-${slot.slotId}-${i}`}
                        className="set-row-shell is-warmup"
                      >
                        <span className="set-badge badge-warmup">W</span>
                        <div className="set-target">
                          <span className="set-row-value">
                            워밍업 {w.weight}kg × {w.reps}
                          </span>
                        </div>
                        <span className="set-row-adjust" />
                        <span className="set-check set-check-static" />
                      </div>
                    ))}
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
                          cfg={DEFAULT_PLATES}
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
