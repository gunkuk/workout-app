import { useCallback, useEffect, useState } from "react";
import { useProgramStore } from "../../store/programStore";
import { loadEventLog, loadSetTimings, type SessionNote, type SetTiming } from "../../store/queries";
import { nowISO } from "../../lib/time";
import { applyCorrections } from "../../domain/corrections";
import { stepOf } from "../../domain/plates";
import { USER_PLATES } from "../../lib/plateConfig";
import { acquireWakeLock, type WakeLockHandle } from "../../lib/wakeLock";
import type { PlannedSlot, PlannedSet } from "../../domain/programEngine";
import type { SetRecord, SessionCompleted, CorrectionRecord } from "../../domain/types.ts";
import { sessionIdFor, setIdFor } from "./sessionId";
import { deriveEffectiveSlots, isSessionComplete, LIGHT_DEADLIFT_SLOT_ID, type EffectiveSlot } from "./derive";

export const STEP_WEIGHT = stepOf(USER_PLATES);

export type UseTodaySessionResult = {
  recorded: Record<string, SetRecord>;
  error: string | null;
  completing: boolean;
  sessionId: string | null;
  effectiveSlots: EffectiveSlot[];
  allWorkSetsComplete: boolean;
  swappedSlots: Record<string, string>;
  timerVisibleSlots: Record<string, boolean>;
  /** SetRecord.id -> 기록된 소요시간(UI11) — SetRow의 muted 시간 표시용(없는 id는 미기록, 첫 세트 등). */
  setTimings: Record<string, SetTiming>;
  isSkipped: (slotId: string) => boolean;
  handleComplete: (
    id: string,
    slot: PlannedSlot,
    planned: PlannedSet,
    weight: number,
    reps: number,
    swappedFrom?: string,
  ) => void;
  handleCorrect: (id: string, weight: number, reps: number) => void;
  /** note가 non-empty면 세션 완료와 함께 SessionNote도 저장(UI5 T2). */
  handleSessionComplete: (note?: string) => Promise<void>;
  handleSkip: (slotId: string) => void;
  handleUnskip: (slotId: string) => void;
  handlePainDay: (originalSlot: PlannedSlot) => void;
  handleRestoreOriginal: () => void;
  /** iOS<18.4 등 Wake Lock 미지원 안내(1회) — 지원 환경/알 수 없는 UA면 null. */
  wakeLockNotice: string | null;
};

/**
 * TodayScreen의 모든 state/effect/callback을 기계적으로 이동한 훅(Stage1-R T5). 렌더는 TodayScreen이
 * 담당하고, 이 훅은 세션 진행 상태와 핸들러만 반환한다. 쓰기는 programStore mutation
 * (recordSet/recordCorrection/completeSession) 경유 — eventStore 직접 import 제거.
 */
export function useTodaySession(onSessionComplete?: () => void): UseTodaySessionResult {
  const todayPlan = useProgramStore((s) => s.todayPlan);
  const todayPos = useProgramStore((s) => s.todayPos);
  const activeProgram = useProgramStore((s) => s.activeProgram);
  const tm = useProgramStore((s) => s.tm);
  const recordSet = useProgramStore((s) => s.recordSet);
  const recordCorrection = useProgramStore((s) => s.recordCorrection);
  const completeSession = useProgramStore((s) => s.completeSession);
  const addSessionNote = useProgramStore((s) => s.addSessionNote);
  const recordSetTimingMutation = useProgramStore((s) => s.recordSetTiming);

  const [recorded, setRecorded] = useState<Record<string, SetRecord>>({});
  /** UI11 — SetRecord.id -> 기록된 SetTiming(표시용). */
  const [setTimings, setSetTimings] = useState<Record<string, SetTiming>>({});
  /** UI11 — slotId -> "armed" 시작시각(직전 세트 완료 시각). 그 슬롯의 다음 세트가 완료되면 이
   *  시각~완료시각을 SetTiming으로 기록한 뒤 자신의 완료시각으로 재무장한다. 슬롯의 첫 세트는
   *  armed 값이 없으므로 스킵(허구 시작시각 생성 금지 — set-to-set interval만 잰다는 계약). */
  const [setStartedAt, setSetStartedAt] = useState<Record<string, string>>({});
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
  const [wakeLockNotice, setWakeLockNotice] = useState<string | null>(null);

  // Wake Lock — 세션 화면 마운트 시 획득, 언마운트 시 해제(스펙 §2-5). iOS<18.4는 API 자체가 없어
  // acquireWakeLock이 조용히 no-op하므로, 그 경우에만 1회 안내 문구를 노출한다.
  useEffect(() => {
    let handle: WakeLockHandle | null = null;
    let cancelled = false;
    acquireWakeLock().then((h) => {
      if (cancelled) {
        h.release();
        return;
      }
      handle = h;
      if (h.iosTooOld) {
        setWakeLockNotice("iOS 18.4 미만은 화면 유지가 지원되지 않습니다");
      }
    });
    return () => {
      cancelled = true;
      handle?.release();
    };
  }, []);

  const sessionId =
    activeProgram && todayPos ? sessionIdFor(activeProgram.id, activeProgram.version, todayPos) : null;

  // 복원(오늘 세션에 이미 기록된 SetRecord를 loadEventLog().sets에서 sessionId로 필터해 체크된 상태로 반영)
  // + 워밍업 자동기록(읽기전용 표시 — 통계엔 포함되어야 하므로 미기록이면 마운트 시 1회 기록).
  useEffect(() => {
    if (!sessionId || !todayPlan) return;
    let cancelled = false;
    (async () => {
      const input = await loadEventLog();
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
        await Promise.all(toAppend.map((r) => recordSet(r)));
      }

      // UI11 — 세트 타이밍 복원: 기록된 SetTiming 맵 + 아직 다음 세트가 안 온 슬롯의 armed
      // 시작시각(그 슬롯에서 이미 완료된 마지막 작업세트의 completedAt)을 재구성한다. 새로고침
      // 이전에 armed됐지만 아직 안 쓰인 시각은 유실될 수 있으나(로컬 state), 그 경우 다음 완료가
      // "첫 세트"로 취급되어 스킵될 뿐 허구 데이터가 생기지는 않는다(설계상 안전한 쪽으로 열화).
      const timingRows = await loadSetTimings(sessionId);
      const timingsMap: Record<string, SetTiming> = {};
      for (const t of timingRows) timingsMap[t.id] = t;

      const armedMap: Record<string, string> = {};
      for (const slot of todayPlan.slots) {
        const slotWorkSets = Object.values(map).filter((r) => r.slotId === slot.slotId && r.setType === "work");
        if (slotWorkSets.length === 0) continue;
        const latest = slotWorkSets.reduce((a, b) => (a.completedAt > b.completedAt ? a : b));
        armedMap[slot.slotId] = latest.completedAt;
      }

      if (!cancelled) {
        setRecorded(map);
        setSetTimings(timingsMap);
        setSetStartedAt(armedMap);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, todayPlan, recordSet]);

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
      const now = nowISO();
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
        completedAt: now,
        schemaVersion: 1,
      };
      // 낙관적 UI 갱신 — DB write는 await하되 UI를 블로킹하지 않는다.
      setRecorded((prev) => ({ ...prev, [id]: rec }));
      // 이 슬롯의 첫 작업세트 완료 트리거 — 휴식타이머를 그 슬롯 하단에 노출(이후 세트 완료는 no-op).
      setTimerVisibleSlots((prev) => (prev[slot.slotId] ? prev : { ...prev, [slot.slotId]: true }));
      recordSet(rec).catch(() => {
        setError("세트 저장 실패 — 다시 시도해주세요.");
        setRecorded((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      });

      // UI11 — 세트별 타이머: 같은 슬롯의 직전 세트 완료 시각(armed)이 있으면 그 간격을 SetTiming으로
      // 기록(set-to-set interval = 작업+휴식). 첫 세트(armed 없음)는 기록하지 않는다(허구 데이터 금지).
      const armed = setStartedAt[slot.slotId];
      if (armed) {
        const durationSec = Math.max(0, Math.round((Date.parse(now) - Date.parse(armed)) / 1000));
        const timingRec: SetTiming = { id, sessionId, durationSec, startedAt: armed, endedAt: now, schemaVersion: 1 };
        setSetTimings((prev) => ({ ...prev, [id]: timingRec }));
        recordSetTimingMutation(timingRec).catch(() => setError("세트 시간 저장 실패 — 다시 시도해주세요."));
      }
      setSetStartedAt((prev) => ({ ...prev, [slot.slotId]: now }));
    },
    [sessionId, recordSet, setStartedAt, recordSetTimingMutation],
  );

  const handleCorrect = useCallback(
    (id: string, weight: number, reps: number) => {
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
      recordCorrection(correction).catch(() => setError("정정 저장 실패 — 다시 시도해주세요."));
    },
    [recordCorrection],
  );

  const handleSessionComplete = useCallback(
    async (note?: string) => {
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
        await completeSession(rec);
        const trimmed = note?.trim();
        if (trimmed) {
          const noteRec: SessionNote = {
            id: crypto.randomUUID(),
            sessionId,
            note: trimmed,
            at: nowISO(),
            schemaVersion: 1,
          };
          await addSessionNote(noteRec);
        }
        onSessionComplete?.();
      } catch {
        setError("세션 완료 저장 실패 — 다시 시도해주세요.");
      } finally {
        setCompleting(false);
      }
    },
    [sessionId, todayPos, activeProgram, completeSession, addSessionNote, onSessionComplete],
  );

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

  /** 통증일 "원래대로" 복원 — 그 세션·경량 슬롯에 이미 기록된 SetRecord들을 revoked correction으로
   *  무효화(analytics 이중집계 차단, 감사 robustness-medium)한 뒤 swappedSlots를 클리어한다. */
  const handleRestoreOriginal = useCallback(() => {
    if (sessionId) {
      const toRevoke = Object.values(recorded).filter(
        (r) => r.sessionId === sessionId && r.slotId === LIGHT_DEADLIFT_SLOT_ID,
      );
      for (const rec of toRevoke) {
        const correction: CorrectionRecord = {
          id: crypto.randomUUID(),
          supersedes: rec.id,
          revoked: true,
          at: nowISO(),
          schemaVersion: 1,
        };
        recordCorrection(correction).catch(() => setError("정정 저장 실패 — 다시 시도해주세요."));
      }
      if (toRevoke.length > 0) {
        setRecorded((prev) => {
          const next = { ...prev };
          for (const rec of toRevoke) delete next[rec.id];
          return next;
        });
      }
    }
    setSwappedSlots((prev) => {
      const next = { ...prev };
      delete next[LIGHT_DEADLIFT_SLOT_ID];
      return next;
    });
  }, [sessionId, recorded, recordCorrection]);

  const effectiveSlots = todayPlan
    ? deriveEffectiveSlots(todayPlan.slots, swappedSlots, tm, USER_PLATES)
    : [];

  const allWorkSetsComplete =
    sessionId !== null && isSessionComplete(effectiveSlots, sessionId, recorded, isSkipped);

  return {
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
  };
}
