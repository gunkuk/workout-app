import { useEffect, useMemo, useState } from "react";
import { useProgramStore } from "../store/programStore";
import { loadEventLog, loadBodyMetrics, loadInjuries, type BodyMetric, type InjuryLog } from "../store/queries";
import { exerciseInfo } from "../domain/exerciseLibrary";
import { LineChart } from "../components/LineChart";
import { nowISO } from "../lib/time";
import { trainingWeekdays, buildAttendanceGrid, thisWeekSummary } from "./home/attendance";
import { combinedT1Performance } from "./home/performance";
import type { FoldInput } from "../domain/types.ts";

export type HomeScreenProps = {
  onStartSession: () => void;
  onLogFreeWorkout: () => void;
};

const MODE_LABELS: Record<string, string> = {
  rolling: "롤링 모드",
  calendar: "캘린더 모드",
};

/** 부상 시작일 기준 "n일째" — 시작일 당일=1일째(로컬 자정 기준 일수 차이 + 1). */
function daysSince(startedAt: string): number {
  const start = new Date(startedAt);
  const startMidnight = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const now = new Date();
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((nowMidnight - startMidnight) / 86_400_000) + 1;
}

/** 빈 문자열/숫자 아님 → undefined, 그 외 숫자 파싱(체성분 빠른입력 — 둘 중 하나만 입력해도 허용). */
function parseOptionalNumber(s: string): number | undefined {
  const t = s.trim();
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** Boostcamp 스타일 홈/대시보드 — 신규 랜딩 화면. 도메인 로직 변경 없이 기존 store/queries만 소비.
 *  UI5 T2 — 프로그램·오늘 카드 아래, 크로스핏 자유운동 카드(Stage1-UI6) 위에 체성분/출석·수행/
 *  부상·수행능력 카드 3종 추가. */
export function HomeScreen({ onStartSession, onLogFreeWorkout }: HomeScreenProps) {
  const activeProgram = useProgramStore((s) => s.activeProgram);
  const todayPos = useProgramStore((s) => s.todayPos);
  const instanceState = useProgramStore((s) => s.instanceState);
  const restDay = useProgramStore((s) => s.restDay);
  const todayPlan = useProgramStore((s) => s.todayPlan);
  const addBodyMetric = useProgramStore((s) => s.addBodyMetric);
  const addInjuryMutation = useProgramStore((s) => s.addInjury);
  const resolveInjuryMutation = useProgramStore((s) => s.resolveInjury);

  const [completedThisWeek, setCompletedThisWeek] = useState(0);
  const [foldInput, setFoldInput] = useState<FoldInput | null>(null);
  const [bodyMetrics, setBodyMetrics] = useState<BodyMetric[] | null>(null);
  const [injuries, setInjuries] = useState<InjuryLog[] | null>(null);

  const [weightInput, setWeightInput] = useState("");
  const [bodyFatInput, setBodyFatInput] = useState("");
  const [injuryFormOpen, setInjuryFormOpen] = useState(false);
  const [injuryBodyPart, setInjuryBodyPart] = useState("");
  const [injuryNote, setInjuryNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const input = await loadEventLog();
      if (cancelled) return;
      setFoldInput(input);
      if (!todayPos) {
        setCompletedThisWeek(0);
        return;
      }
      const ids = new Set(
        input.sessions
          .filter(
            (s) =>
              s.status === "completed" &&
              s.cyclePos.cycleIndex === todayPos.cycleIndex &&
              s.cyclePos.week === todayPos.week,
          )
          .map((s) => s.sessionId),
      );
      setCompletedThisWeek(ids.size);
    })();
    return () => {
      cancelled = true;
    };
  }, [todayPos]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [metrics, injuryRows] = await Promise.all([loadBodyMetrics(), loadInjuries()]);
      if (cancelled) return;
      setBodyMetrics(metrics);
      setInjuries(injuryRows);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshBodyMetrics(): Promise<void> {
    setBodyMetrics(await loadBodyMetrics());
  }

  async function refreshInjuries(): Promise<void> {
    setInjuries(await loadInjuries());
  }

  async function handleSaveBodyMetric(): Promise<void> {
    const weightKg = parseOptionalNumber(weightInput);
    const bodyFatPct = parseOptionalNumber(bodyFatInput);
    if (weightKg === undefined && bodyFatPct === undefined) return;
    await addBodyMetric({ id: crypto.randomUUID(), at: nowISO(), weightKg, bodyFatPct, schemaVersion: 1 });
    setWeightInput("");
    setBodyFatInput("");
    await refreshBodyMetrics();
  }

  async function handleSaveInjury(): Promise<void> {
    const bodyPart = injuryBodyPart.trim();
    if (!bodyPart) return;
    await addInjuryMutation({
      id: crypto.randomUUID(),
      bodyPart,
      note: injuryNote.trim() || undefined,
      startedAt: nowISO(),
      schemaVersion: 1,
    });
    setInjuryBodyPart("");
    setInjuryNote("");
    setInjuryFormOpen(false);
    await refreshInjuries();
  }

  async function handleResolveInjury(inj: InjuryLog): Promise<void> {
    if (!window.confirm(`"${inj.bodyPart}" 부상을 해소 처리할까요?`)) return;
    await resolveInjuryMutation(inj.id, nowISO());
    await refreshInjuries();
  }

  const weekdays = useMemo(() => trainingWeekdays(activeProgram), [activeProgram]);
  const grid = useMemo(
    () => (foldInput ? buildAttendanceGrid(foldInput.sessions, foldInput.sets, weekdays, new Date()) : null),
    [foldInput, weekdays],
  );
  const summary = grid ? thisWeekSummary(grid) : null;
  const performancePoints = useMemo(() => (foldInput ? combinedT1Performance(foldInput) : []), [foldInput]);
  const activeInjuries = injuries?.filter((i) => !i.resolvedAt) ?? [];

  if (!activeProgram) {
    return <div className="loading-state">로딩 중...</div>;
  }

  const weekDays = activeProgram.weeks[todayPos?.week ?? 0]?.days ?? activeProgram.weeks[0]?.days ?? [];
  const totalThisWeek = weekDays.length;
  const percent = totalThisWeek > 0 ? Math.round((completedThisWeek / totalThisWeek) * 100) : 0;

  return (
    <div>
      <div className="settings-card">
        <h3 style={{ color: "var(--gold)", fontWeight: "bold", fontSize: "20px" }}>{activeProgram.name}</h3>
        <p className="form-label">{MODE_LABELS[instanceState?.mode ?? ""] ?? ""}</p>
        <div style={{ background: "var(--surface2)", borderRadius: "999px", height: "8px", overflow: "hidden" }}>
          <div
            style={{ background: "var(--gold)", height: "100%", width: `${percent}%` }}
          />
        </div>
        <p className="form-label">
          이번 주 {completedThisWeek}/{totalThisWeek} 완료
        </p>
        <span style={{ color: "var(--gold)", fontWeight: "bold", fontSize: "32px" }}>{percent}%</span>
      </div>

      <div className="settings-card">
        {restDay === "rest" ? (
          <p className="form-label">오늘은 휴식일입니다</p>
        ) : restDay === "notStarted" ? (
          <p className="form-label">아직 시작 전입니다 — 설정에서 시작일을 확인하세요</p>
        ) : todayPlan ? (
          <>
            <h3>{todayPlan.dayName}</h3>
            <ul>
              {todayPlan.slots.map((slot) => (
                <li key={slot.slotId}>
                  <span className="slot-eyebrow">{slot.label}</span>{" "}
                  {exerciseInfo(slot.exerciseId)?.name ?? slot.exerciseId}
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-primary" onClick={onStartSession}>
              오늘 운동 시작
            </button>
          </>
        ) : (
          <p className="form-label">오늘 계획을 불러오는 중</p>
        )}
      </div>

      <div className="settings-card">
        <h3>체성분</h3>
        {bodyMetrics && bodyMetrics.length >= 2 ? (
          <LineChart
            points={bodyMetrics
              .filter((m) => m.weightKg !== undefined)
              .map((m) => ({ at: m.at, value: m.weightKg! }))}
            series2={bodyMetrics
              .filter((m) => m.bodyFatPct !== undefined)
              .map((m) => ({ at: m.at, value: m.bodyFatPct! }))}
            labels={{ s1: "몸무게", s2: "체지방" }}
          />
        ) : (
          <p className="form-label">기록이 쌓이면 추이가 표시됩니다</p>
        )}
        <div className="session-complete-row" style={{ marginTop: 8 }}>
          <input
            aria-label="몸무게 입력"
            type="number"
            placeholder="몸무게 kg"
            className="session-note-input"
            value={weightInput}
            onChange={(e) => setWeightInput(e.target.value)}
          />
          <input
            aria-label="체지방 입력"
            type="number"
            placeholder="체지방 %"
            className="session-note-input"
            value={bodyFatInput}
            onChange={(e) => setBodyFatInput(e.target.value)}
          />
          <button type="button" className="btn btn-secondary btn-compact" onClick={handleSaveBodyMetric}>
            기록
          </button>
        </div>
      </div>

      <div className="settings-card">
        <h3>출석·수행</h3>
        {summary && (
          <p className="form-label">
            이번 주 {summary.completed}/{summary.total} 완료 · 수행률 {summary.percent}%
          </p>
        )}
        {grid && (
          <div className="attendance-strip">
            {grid.weekdays.map((wd, rowIdx) => (
              <div className="attendance-row" key={wd}>
                <span className="attendance-row-label">{wd}</span>
                {grid.weeks.map((week, colIdx) => {
                  const status = week.cells[rowIdx];
                  return (
                    <span
                      key={colIdx}
                      data-testid={`attendance-cell-${rowIdx}-${colIdx}`}
                      className={`attendance-cell${status === "complete" ? " is-complete" : status === "partial" ? " is-partial" : ""}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="settings-card">
        <h3>부상·수행능력</h3>
        {activeInjuries.length === 0 ? (
          <p className="form-label">현재 부상 없음</p>
        ) : (
          <div>
            {activeInjuries.map((inj) => (
              <button
                key={inj.id}
                type="button"
                className="injury-chip"
                onClick={() => handleResolveInjury(inj)}
              >
                {inj.bodyPart} · {daysSince(inj.startedAt)}일째
              </button>
            ))}
          </div>
        )}
        {injuryFormOpen ? (
          <div className="form-field">
            <input
              aria-label="부상 부위"
              type="text"
              placeholder="부위"
              className="form-input"
              value={injuryBodyPart}
              onChange={(e) => setInjuryBodyPart(e.target.value)}
            />
            <input
              aria-label="부상 메모"
              type="text"
              placeholder="메모(선택)"
              className="form-input"
              style={{ marginTop: 6 }}
              value={injuryNote}
              onChange={(e) => setInjuryNote(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-secondary btn-compact"
              style={{ marginTop: 6 }}
              onClick={handleSaveInjury}
            >
              저장
            </button>
          </div>
        ) : (
          <button type="button" className="btn-ghost" onClick={() => setInjuryFormOpen(true)}>
            + 부상 기록
          </button>
        )}

        <h4>수행능력</h4>
        <LineChart points={performancePoints} />
      </div>

      <div className="settings-card">
        <button type="button" className="btn btn-secondary" onClick={onLogFreeWorkout}>
          크로스핏 · 자유 운동 기록
        </button>
      </div>
    </div>
  );
}
