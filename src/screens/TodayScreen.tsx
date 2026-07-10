import { useProgramStore } from "../store/programStore";
import { SetRow } from "../components/SetRow";
import { ProposalCard } from "../components/ProposalCard";
import { PlateBreakdown } from "../components/PlateBreakdown";
import { ExerciseSwap } from "../components/ExerciseSwap";
import { RestTimer } from "../components/RestTimer";
import { DEFAULT_PLATES } from "../domain/plates";
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
  } = useTodaySession(onSessionComplete);

  if (status !== "ready" || !todayPlan || !sessionId) {
    return <div>로딩 중...</div>;
  }

  return (
    <div>
      {pendingProposals.map((p) => (
        <ProposalCard key={`${p.type}-${p.sourceSetRecordId}`} proposal={p} />
      ))}
      <h2>{todayPlan.dayName}</h2>
      {error && <div role="alert">{error}</div>}
      {effectiveSlots.map(({ original, slot, swapped }) => (
        <section key={original.slotId}>
          <h3>{slot.label}</h3>
          <ExerciseSwap
            slot={slot}
            skipped={isSkipped(slot.slotId)}
            onSkip={() => handleSkip(slot.slotId)}
            onUnskip={() => handleUnskip(slot.slotId)}
            swapped={swapped}
            onPainDay={() => handlePainDay(original)}
            onRestoreOriginal={handleRestoreOriginal}
          />
          {slot.missingTM ? (
            <p>TM 필요 — 온보딩에서 시드해주세요.</p>
          ) : (
            <>
              {slot.warmups.map((w, i) => (
                <div key={`warmup-${i}`} data-testid={`warmup-${slot.slotId}-${i}`} style={{ color: "#888" }}>
                  워밍업 {w.weight}kg × {w.reps}
                </div>
              ))}
              {slot.sets.map((s, i) => {
                const id = setIdFor(sessionId, slot.slotId, "work", i);
                return (
                  <div key={id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <SetRow
                      id={id}
                      planned={s}
                      recorded={recorded[id]}
                      stepWeight={STEP_WEIGHT}
                      onComplete={(w, r) => handleComplete(id, slot, s, w, r, swappedSlots[slot.slotId])}
                      onCorrect={(w, r) => handleCorrect(id, w, r)}
                    />
                    <PlateBreakdown weight={s.weight} cfg={DEFAULT_PLATES} />
                  </div>
                );
              })}
              {timerVisibleSlots[slot.slotId] && <RestTimer />}
            </>
          )}
        </section>
      ))}
      {allWorkSetsComplete && (
        <button type="button" onClick={handleSessionComplete} disabled={completing}>
          세션 완료
        </button>
      )}
    </div>
  );
}
