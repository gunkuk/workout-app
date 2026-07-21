import { useCallback, useEffect, useRef, useState } from "react";
import { useProgramStore } from "../store/programStore";
import { SetRow } from "../components/SetRow";
import { ProposalCard } from "../components/ProposalCard";
import { ExerciseSwap } from "../components/ExerciseSwap";
import { RestTimer } from "../components/RestTimer";
import { ActivityTimer } from "../components/ActivityTimer";
import { SessionSpanTimer } from "../components/SessionSpanTimer";
import { AchievementToast, type Achievement } from "../components/AchievementToast";
import { USER_PLATES } from "../lib/plateConfig";
import { exerciseInfo } from "../domain/exerciseLibrary";
import { formatDuration } from "../lib/duration";
import { detectPr } from "../domain/prDetection";
import { applyCorrections } from "../domain/corrections";
import { loadExerciseComment, loadDailyCheckin, loadEventLog, type ActivitySegment } from "../store/queries";
import type { PlannedSet, PlannedSlot } from "../domain/programEngine";
import type { SetRecord } from "../domain/types.ts";
import { useTodaySession, STEP_WEIGHT } from "./today/useTodaySession";
import { setIdFor } from "./today/sessionId";
import { nowISO } from "../lib/time";

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

  // 운동별 메모(UI15 item3) — 슬롯(=요일별 슬롯, original.slotId) 기준 저장, 없으면 exerciseId
  // 폴백(loadExerciseComment). 마운트 시 이전 메모를 불러와 회색으로 미리 채우고(isPlaceholder),
  // 사용자가 타이핑하면 검정(기본)으로 전환(isPlaceholder=false). blur 시 값이 바뀐 경우만 upsert.
  const addExerciseComment = useProgramStore((s) => s.addExerciseComment);
  const [comments, setComments] = useState<
    Record<string, { value: string; isPlaceholder: boolean; saved: string }>
  >({});
  const commentIdsRef = useRef<Record<string, string>>({});
  const loadedCommentSlotsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!todayPlan) return;
    let cancelled = false;
    (async () => {
      for (const slot of todayPlan.slots) {
        if (loadedCommentSlotsRef.current.has(slot.slotId)) continue;
        loadedCommentSlotsRef.current.add(slot.slotId);
        const prev = await loadExerciseComment(slot.exerciseId, slot.slotId);
        if (cancelled) return;
        const value = prev?.note ?? "";
        setComments((p) => ({ ...p, [slot.slotId]: { value, isPlaceholder: value !== "", saved: value } }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [todayPlan]);

  const handleCommentChange = (slotId: string, value: string) => {
    setComments((p) => ({ ...p, [slotId]: { value, isPlaceholder: false, saved: p[slotId]?.saved ?? "" } }));
  };

  const handleCommentBlur = (slotId: string, exerciseId: string) => {
    const entry = comments[slotId];
    if (!entry || entry.value === entry.saved) return;
    if (!commentIdsRef.current[slotId]) {
      commentIdsRef.current[slotId] = crypto.randomUUID();
    }
    const id = commentIdsRef.current[slotId];
    addExerciseComment({ id, exerciseId, slotId, note: entry.value, at: nowISO(), schemaVersion: 1 }).catch(
      () => {},
    );
    setComments((p) => ({
      ...p,
      [slotId]: { value: entry.value, isPlaceholder: entry.isPlaceholder, saved: entry.value },
    }));
  };

  // 요일별 컨디션/수면/직전식사 체크인(UI15 item4) — 오늘 날짜(YYYY-MM-DD) 1건, 탭한 항목만 즉시 저장
  // (programStore.addDailyCheckin이 date 기준 병합 — 나머지 필드는 보존). 오늘 이미 값이 있으면 그
  // 값으로 초기화.
  const addDailyCheckin = useProgramStore((s) => s.addDailyCheckin);
  const todayDate = new Date().toISOString().slice(0, 10);
  const [checkin, setCheckin] = useState<{
    condition?: 1 | 2 | 3 | 4 | 5;
    sleep?: 1 | 2 | 3 | 4 | 5;
    lastMeal?: 1 | 2 | 3 | 4 | 5;
  }>({});

  useEffect(() => {
    let cancelled = false;
    loadDailyCheckin(todayDate).then((row) => {
      if (cancelled || !row) return;
      setCheckin({ condition: row.condition, sleep: row.sleep, lastMeal: row.lastMeal });
    });
    return () => {
      cancelled = true;
    };
  }, [todayDate]);

  const handleCheckinTap = (field: "condition" | "sleep" | "lastMeal", value: 1 | 2 | 3 | 4 | 5) => {
    setCheckin((p) => ({ ...p, [field]: value }));
    addDailyCheckin({ id: crypto.randomUUID(), date: todayDate, [field]: value, at: nowISO(), schemaVersion: 1 }).catch(
      () => {},
    );
  };

  // PR/증량/최대볼륨 알림(UI15 item2) — fold.ts(동결)는 건드리지 않는 순수 UI 파생 판정
  // (domain/prDetection.ts) + TM 증량은 store의 tm 값 변화를 ref로 비교. 워밍업 세트는 판정 제외.
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const pushAchievement = useCallback((text: string) => {
    setAchievements((prev) => [...prev, { id: crypto.randomUUID(), text }]);
  }, []);
  const dismissAchievement = useCallback((id: string) => {
    setAchievements((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const tm = useProgramStore((s) => s.tm);
  // 최초 로드(마운트) 시점엔 "증량"이 아니라 그냥 초기값 채움이므로 알림을 쏘지 않는다 —
  // prevTmRef가 null인 최초 1회만 비교를 건너뛴다.
  const prevTmRef = useRef<Record<string, number> | null>(null);
  useEffect(() => {
    if (prevTmRef.current) {
      for (const [exerciseId, value] of Object.entries(tm)) {
        const prev = prevTmRef.current[exerciseId];
        if (prev !== undefined && value > prev) {
          const name = exerciseInfo(exerciseId)?.name ?? exerciseId;
          pushAchievement(`🎉 TM 증량! ${name} ${prev}→${value}kg`);
        }
      }
    }
    prevTmRef.current = tm;
  }, [tm, pushAchievement]);

  const handleWorkSetComplete = useCallback(
    (id: string, slot: PlannedSlot, planned: PlannedSet, weight: number, reps: number, swappedFrom?: string) => {
      handleComplete(id, slot, planned, weight, reps, swappedFrom);
      if (planned.setType === "warmup" || !sessionId) return;
      (async () => {
        try {
          const input = await loadEventLog();
          const effective = applyCorrections(input.sets, input.corrections).filter(
            (s) => !s.revoked && s.exerciseId === slot.exerciseId,
          );
          const completedSet: SetRecord = {
            id,
            sessionId,
            slotId: slot.slotId,
            exerciseId: slot.exerciseId,
            setType: planned.setType,
            targetWeight: planned.weight,
            targetReps: planned.reps,
            actualWeight: weight,
            actualReps: reps,
            completedAt: nowISO(),
            schemaVersion: 1,
          };
          const { isOneRmPr, isVolumePr } = detectPr(effective, completedSet);
          const name = exerciseInfo(slot.exerciseId)?.name ?? slot.exerciseId;
          if (isOneRmPr) pushAchievement(`🎉 1RM 신기록! ${name}`);
          if (isVolumePr) pushAchievement(`🎉 볼륨 신기록! ${name}`);
        } catch {
          // PR 감지 실패는 조용히 무시 — 세트 기록 자체(handleComplete)는 이미 처리됨, 사용자 흐름을 막지 않는다.
        }
      })();
    },
    [handleComplete, sessionId, pushAchievement],
  );

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
      <AchievementToast items={achievements} onDismiss={dismissAchievement} />
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
      {/* 요일별 컨디션/수면/직전식사 체크인(UI15 item4) — 스티키 헤더 바로 아래, 활동 타이머 근처. */}
      <div className="daily-checkin-row" data-testid="daily-checkin">
        {(
          [
            { field: "condition" as const, label: "컨디션" },
            { field: "sleep" as const, label: "수면" },
            { field: "lastMeal" as const, label: "직전식사" },
          ]
        ).map(({ field, label }) => (
          <div key={field} className="checkin-item">
            <span className="checkin-label">{label}</span>
            <div className="checkin-segment" role="group" aria-label={label}>
              {([1, 2, 3, 4, 5] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`checkin-btn${checkin[field] === v ? " is-selected" : ""}`}
                  aria-label={`${label} ${v}`}
                  aria-pressed={checkin[field] === v}
                  onClick={() => handleCheckinTap(field, v)}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        ))}
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
              <input
                type="text"
                aria-label={`${exerciseInfo(slot.exerciseId)?.name ?? slot.exerciseId} 메모`}
                data-testid={`exercise-comment-${original.slotId}`}
                className={`exercise-comment-input${comments[original.slotId]?.isPlaceholder ? " is-placeholder" : ""}`}
                placeholder="메모"
                value={comments[original.slotId]?.value ?? ""}
                onChange={(e) => handleCommentChange(original.slotId, e.target.value)}
                onBlur={() => handleCommentBlur(original.slotId, slot.exerciseId)}
              />
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
                          onComplete={(w, r) => handleWorkSetComplete(id, slot, s, w, r, swappedSlots[slot.slotId])}
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
