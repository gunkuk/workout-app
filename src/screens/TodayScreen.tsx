import { useCallback, useEffect, useState } from "react";
import { useProgramStore } from "../store/programStore";
import { appendSet, appendCorrection, appendSession, loadFoldInput } from "../storage/eventStore";
import { applyCorrections } from "../domain/corrections";
import { stepOf, DEFAULT_PLATES } from "../domain/plates";
import { SetRow } from "../components/SetRow";
import { ProposalCard } from "../components/ProposalCard";
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

export function TodayScreen({ onSessionComplete }: TodayScreenProps) {
  const status = useProgramStore((s) => s.status);
  const todayPlan = useProgramStore((s) => s.todayPlan);
  const todayPos = useProgramStore((s) => s.todayPos);
  const activeProgram = useProgramStore((s) => s.activeProgram);
  const refreshAfterWrite = useProgramStore((s) => s.refreshAfterWrite);
  const pendingProposals = useProgramStore((s) => s.pendingProposals);

  const [recorded, setRecorded] = useState<Record<string, SetRecord>>({});
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);

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

  const handleComplete = useCallback(
    (id: string, slot: PlannedSlot, planned: PlannedSet, weight: number, reps: number) => {
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
        completedAt: nowISO(),
        schemaVersion: 1,
      };
      // 낙관적 UI 갱신 — DB write는 await하되 UI를 블로킹하지 않는다.
      setRecorded((prev) => ({ ...prev, [id]: rec }));
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

  if (status !== "ready" || !todayPlan || !sessionId) {
    return <div>로딩 중...</div>;
  }

  const allWorkSetsComplete = todayPlan.slots.every(
    (slot) =>
      slot.missingTM ||
      slot.sets.every((_, i) => recorded[setIdFor(sessionId, slot.slotId, "work", i)] !== undefined),
  );

  return (
    <div>
      {pendingProposals.map((p) => (
        <ProposalCard key={`${p.type}-${p.sourceSetRecordId}`} proposal={p} />
      ))}
      <h2>{todayPlan.dayName}</h2>
      {error && <div role="alert">{error}</div>}
      {todayPlan.slots.map((slot) => (
        <section key={slot.slotId}>
          <h3>{slot.label}</h3>
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
                  <SetRow
                    key={id}
                    id={id}
                    planned={s}
                    recorded={recorded[id]}
                    stepWeight={STEP_WEIGHT}
                    onComplete={(w, r) => handleComplete(id, slot, s, w, r)}
                    onCorrect={(w, r) => handleCorrect(id, w, r)}
                  />
                );
              })}
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
