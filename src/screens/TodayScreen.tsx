import { useCallback, useEffect, useState } from "react";
import { useProgramStore } from "../store/programStore";
import { appendSet, appendCorrection, appendSession, loadFoldInput } from "../storage/eventStore";
import { applyCorrections } from "../domain/corrections";
import { stepOf, DEFAULT_PLATES } from "../domain/plates";
import { lightConventionalPreset } from "../domain/programEngine";
import { SetRow } from "../components/SetRow";
import { ProposalCard } from "../components/ProposalCard";
import { PlateBreakdown } from "../components/PlateBreakdown";
import { ExerciseSwap } from "../components/ExerciseSwap";
import { RestTimer } from "../components/RestTimer";
import type { SetRecord, SessionCompleted, CorrectionRecord, CyclePos } from "../domain/types.ts";
import type { PlannedSlot, PlannedSet } from "../domain/programEngine";

export type TodayScreenProps = {
  /** SessionCompleted append + refreshAfterWrite 완료 후 호출 — 라우팅은 호출부(T7의 App) 책임 */
  onSessionComplete?: () => void;
};

/**
 * sessionId 결정론적 생성 — SetRecord.sessionId와 SessionCompleted.sessionId 양쪽에 반드시
 * 이 동일한 문자열을 재사용해야 한다. fold.ts의 judgingSetsForSlot이 그날 SetRecord.sessionId와
 * 정확히 매치되어야 TM 자동증량·주간분석이 작동한다(계획 "필수(fold 조인 계약)" 참조) —
 * 다른 id(예: 새 UUID)를 쓰면 판정이 전부 no-op으로 조용히 실패한다.
 * rolling 모드 가정이라 같은 사이클-주-요일을 재방문해도 같은 세션 id.
 */
export function sessionIdFor(programId: string, programVersion: number, pos: CyclePos): string {
  return `${programId}@${programVersion}:${pos.cycleIndex}-${pos.week}-${pos.dayOrdinal}`;
}

/** 슬롯 내 세트 1개의 결정론적 SetRecord id — 복원 시 매칭 키 겸 중복 자동기록 방지 키 */
function setIdFor(sessionId: string, slotId: string, setType: "work" | "warmup", index: number): string {
  return `${sessionId}-${slotId}-${setType}-${index}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

const STEP_WEIGHT = stepOf(DEFAULT_PLATES);

/** lightConventionalPreset(programEngine.ts)이 하드코딩한 slotId — 데드리프트 슬롯 1개 가정(계획 "참고" 항목). */
const LIGHT_DEADLIFT_SLOT_ID = "lightConventionalDeadlift";

export function TodayScreen({ onSessionComplete }: TodayScreenProps) {
  const status = useProgramStore((s) => s.status);
  const todayPlan = useProgramStore((s) => s.todayPlan);
  const todayPos = useProgramStore((s) => s.todayPos);
  const activeProgram = useProgramStore((s) => s.activeProgram);
  const refreshAfterWrite = useProgramStore((s) => s.refreshAfterWrite);
  const pendingProposals = useProgramStore((s) => s.pendingProposals);
  const tm = useProgramStore((s) => s.tm);

  const [recorded, setRecorded] = useState<Record<string, SetRecord>>({});
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  /** slotId(현재 표시 중인, 스왑 후 슬롯) -> 원래 exerciseId. handleComplete의 5번째 인자(substitutedFrom) 배선용. */
  const [swappedSlots, setSwappedSlots] = useState<Record<string, string>>({});
  /** slotId -> 스킵 여부. sessionStorage(브라우저 세션 한정)로 마운트 시 복원. */
  const [skippedSlotIds, setSkippedSlotIds] = useState<Record<string, boolean>>({});
  /** slotId -> 그 슬롯에서 작업세트가 1개 이상 완료되어 휴식타이머를 노출 중인지(순수 로컬 state,
   *  새로고침 시 리셋 — 계획 Task 6 계약: "세트 완료 콜백에서 showTimer 로컬 상태 true"). 한 번 true가 되면
   *  그 슬롯 하단에 RestTimer 1개가 계속 표시된다(세트마다 새로 마운트하지 않음). */
  const [timerVisibleSlots, setTimerVisibleSlots] = useState<Record<string, boolean>>({});

  const sessionId =
    activeProgram && todayPos ? sessionIdFor(activeProgram.id, activeProgram.version, todayPos) : null;

  // 복원(오늘 세션에 이미 기록된 SetRecord를 loadFoldInput().sets에서 sessionId로 필터해 체크된 상태로 반영)
  // + 워밍업 자동기록(읽기전용 표시 — 통계엔 포함되어야 하므로 미기록이면 마운트 시 1회 기록).
  useEffect(() => {
    if (!sessionId || !todayPlan) return;
    let cancelled = false;
    (async () => {
      const input = await loadFoldInput();
      const effective = applyCorrections(input.sets, input.corrections);
      const map: Record<string, SetRecord> = {};
      for (const s of effective) {
        if (s.sessionId !== sessionId || s.revoked) continue;
        const { corrected: _corrected, revoked: _revoked, ...rec } = s;
        map[rec.id] = rec;
      }

      const toAppend: SetRecord[] = [];
      for (const slot of todayPlan.slots) {
        slot.warmups.forEach((w, i) => {
          if (w.weight === null) return;
          const id = setIdFor(sessionId, slot.slotId, "warmup", i);
          if (map[id]) return;
          const rec: SetRecord = {
            id,
            sessionId,
            slotId: slot.slotId,
            exerciseId: slot.exerciseId,
            setType: "warmup",
            targetWeight: w.weight,
            targetReps: w.reps,
            actualWeight: w.weight,
            actualReps: w.reps,
            completedAt: nowISO(),
            schemaVersion: 1,
          };
          toAppend.push(rec);
          map[id] = rec;
        });
      }
      if (toAppend.length > 0) {
        await Promise.all(toAppend.map((r) => appendSet(r)));
      }
      if (!cancelled) setRecorded(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, todayPlan]);

  // 스킵 상태 복원 — sessionStorage(브라우저 세션 한정, C3에서 이벤트화로 정식 영속 예정)에서
  // 오늘 슬롯들의 스킵 플래그를 읽어온다(키 형식: `skip:${sessionId}:${slotId}`).
  useEffect(() => {
    if (!sessionId || !todayPlan) return;
    const restored: Record<string, boolean> = {};
    for (const slot of todayPlan.slots) {
      if (sessionStorage.getItem(`skip:${sessionId}:${slot.slotId}`) === "1") {
        restored[slot.slotId] = true;
      }
    }
    setSkippedSlotIds(restored);
  }, [sessionId, todayPlan]);

  const handleComplete = useCallback(
    (id: string, slot: PlannedSlot, planned: PlannedSet, weight: number, reps: number, swappedFrom?: string) => {
      if (!sessionId) return;
      const rec: SetRecord = {
        id,
        sessionId,
        slotId: slot.slotId,
        exerciseId: slot.exerciseId,
        setType: "work",
        targetWeight: planned.weight,
        targetReps: planned.reps,
        actualWeight: weight,
        actualReps: reps,
        amrapRole: planned.amrapRole,
        substitutedFrom: swappedFrom,
        completedAt: nowISO(),
        schemaVersion: 1,
      };
      // 낙관적 UI 갱신 — DB write는 await하되 UI를 블로킹하지 않는다.
      setRecorded((prev) => ({ ...prev, [id]: rec }));
      // 이 슬롯의 첫 작업세트 완료 트리거 — 휴식타이머를 그 슬롯 하단에 노출(이후 세트 완료는 no-op).
      setTimerVisibleSlots((prev) => (prev[slot.slotId] ? prev : { ...prev, [slot.slotId]: true }));
      appendSet(rec).catch(() => {
        setError("세트 저장 실패 — 다시 시도해주세요.");
        setRecorded((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      });
    },
    [sessionId],
  );

  const handleCorrect = useCallback((id: string, weight: number, reps: number) => {
    const correction: CorrectionRecord = {
      id: crypto.randomUUID(),
      supersedes: id,
      patch: { actualWeight: weight, actualReps: reps },
      at: nowISO(),
      schemaVersion: 1,
    };
    setRecorded((prev) => {
      const existing = prev[id];
      if (!existing) return prev;
      return { ...prev, [id]: { ...existing, actualWeight: weight, actualReps: reps } };
    });
    appendCorrection(correction).catch(() => setError("정정 저장 실패 — 다시 시도해주세요."));
  }, []);

  const handleSessionComplete = useCallback(async () => {
    if (!sessionId || !todayPos || !activeProgram) return;
    setCompleting(true);
    setError(null);
    const rec: SessionCompleted = {
      id: crypto.randomUUID(),
      // 필수: SetRecord들과 동일한 결정론적 sessionId — fold의 judgingSetsForSlot 조인 계약.
      sessionId,
      at: nowISO(),
      cyclePos: todayPos,
      status: "completed",
      programId: activeProgram.id,
      programVersion: activeProgram.version,
      schemaVersion: 1,
    };
    try {
      await appendSession(rec);
      await refreshAfterWrite();
      onSessionComplete?.();
    } catch {
      setError("세션 완료 저장 실패 — 다시 시도해주세요.");
    } finally {
      setCompleting(false);
    }
  }, [sessionId, todayPos, activeProgram, refreshAfterWrite, onSessionComplete]);

  const isSkipped = useCallback((slotId: string) => skippedSlotIds[slotId] === true, [skippedSlotIds]);

  const handleSkip = useCallback(
    (slotId: string) => {
      if (!sessionId) return;
      sessionStorage.setItem(`skip:${sessionId}:${slotId}`, "1");
      setSkippedSlotIds((prev) => ({ ...prev, [slotId]: true }));
    },
    [sessionId],
  );

  const handleUnskip = useCallback(
    (slotId: string) => {
      if (!sessionId) return;
      sessionStorage.removeItem(`skip:${sessionId}:${slotId}`);
      setSkippedSlotIds((prev) => {
        const next = { ...prev };
        delete next[slotId];
        return next;
      });
    },
    [sessionId],
  );

  /** 통증일(경량) 프리셋 적용. tm[exerciseId] 미시드면 무동작(데드리프트는 항상 4개 시드 TM에 포함되므로
   *  실사용에서 도달하지 않는 방어적 가드 — lightConventionalPreset에 undefined가 흘러가는 것을 막는다). */
  const handlePainDay = useCallback(
    (originalSlot: PlannedSlot) => {
      if (tm[originalSlot.exerciseId] === undefined) return;
      setSwappedSlots((prev) => ({ ...prev, [LIGHT_DEADLIFT_SLOT_ID]: originalSlot.exerciseId }));
    },
    [tm],
  );

  const handleRestoreOriginal = useCallback(() => {
    setSwappedSlots((prev) => {
      const next = { ...prev };
      delete next[LIGHT_DEADLIFT_SLOT_ID];
      return next;
    });
  }, []);

  if (status !== "ready" || !todayPlan || !sessionId) {
    return <div>로딩 중...</div>;
  }

  // 원본 슬롯 옆에, 통증일로 교체된 경우 그 대체 슬롯을 함께 들고 있는 표시용 목록.
  // swapped=true인 항목만 slot !== original (참조가 다른 lightConventionalPreset 결과).
  const effectiveSlots = todayPlan.slots.map((original) => {
    if (original.exerciseId !== "deadlift" || swappedSlots[LIGHT_DEADLIFT_SLOT_ID] === undefined) {
      return { original, slot: original, swapped: false };
    }
    const tmDeadlift = tm.deadlift;
    if (tmDeadlift === undefined) return { original, slot: original, swapped: false };
    return { original, slot: lightConventionalPreset(tmDeadlift, DEFAULT_PLATES), swapped: true };
  });

  const allWorkSetsComplete = effectiveSlots.every(
    ({ slot }) =>
      slot.missingTM ||
      isSkipped(slot.slotId) ||
      slot.sets.every((_, i) => recorded[setIdFor(sessionId, slot.slotId, "work", i)] !== undefined),
  );

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
