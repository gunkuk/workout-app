import { useEffect, useState } from "react";
import { useProgramStore } from "../store/programStore";
import { loadEventLog } from "../store/queries";
import { exerciseInfo } from "../domain/exerciseLibrary";

export type HomeScreenProps = {
  onStartSession: () => void;
};

const MODE_LABELS: Record<string, string> = {
  rolling: "롤링 모드",
  calendar: "캘린더 모드",
};

/** Boostcamp 스타일 홈/대시보드 — 신규 랜딩 화면. 도메인 로직 변경 없이 기존 store/queries만 소비. */
export function HomeScreen({ onStartSession }: HomeScreenProps) {
  const activeProgram = useProgramStore((s) => s.activeProgram);
  const todayPos = useProgramStore((s) => s.todayPos);
  const instanceState = useProgramStore((s) => s.instanceState);
  const restDay = useProgramStore((s) => s.restDay);
  const todayPlan = useProgramStore((s) => s.todayPlan);

  const [completedThisWeek, setCompletedThisWeek] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const input = await loadEventLog();
      if (cancelled) return;
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
    </div>
  );
}
