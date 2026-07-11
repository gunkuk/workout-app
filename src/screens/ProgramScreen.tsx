import { useState } from "react";
import { ProgramLibrary } from "../components/ProgramLibrary";
import { useProgramStore } from "../store/programStore";
import type { CyclePos } from "../domain/types.ts";

/**
 * 프로그램 탭(UI3) — 라이브러리를 하단 탭의 독립 화면으로 승격. 목록·전환·가져오기(파일/URL)·
 * 모드 설정은 기존 ProgramLibrary 컴포넌트가 전부 담당하므로, 이 화면은 제목만 얹은 얇은 래퍼다
 * (이전엔 설정 화면 안에 묻혀 있었음 — 사용자 요청으로 탭 승격).
 */

/** description 텍스트를 줄 단위로 나눠 가벼운 마크다운 스타일을 입힌다 (마크다운 라이브러리 없이). */
function DescriptionText({ text }: { text: string }) {
  return (
    <div style={{ lineHeight: 1.6 }}>
      {text.split("\n").map((line, i) => {
        if (line.startsWith("## ")) {
          return (
            <div key={i} style={{ fontWeight: 700, fontSize: "1.05em", marginTop: i === 0 ? 0 : "0.8em" }}>
              {line.slice(3)}
            </div>
          );
        }
        if (line.startsWith("### ")) {
          return (
            <div key={i} style={{ fontWeight: 600, fontSize: "0.95em", marginTop: "0.5em" }}>
              {line.slice(4)}
            </div>
          );
        }
        return <div key={i}>{line}</div>;
      })}
    </div>
  );
}

/**
 * 진행 위치 조정(Stage1-UI7) — 실제로는 N주차까지 훈련했는데 앱의 롤링 커서가 뒤처져 있을 때
 * (기록을 미루다 몰아 쓰는 경우) 커서를 원하는 위치로 빨리 감는다. 건너뛴 날들은 빈 완료
 * (SetRecord 없음)로 채워져 TM 판정엔 전혀 영향 없다 — programStore.fastForwardTo 참고.
 * rolling 모드 + activeProgram 있을 때만 부모(ProgramScreen)가 렌더한다.
 */
function FastForwardCard() {
  const activeProgram = useProgramStore((s) => s.activeProgram)!;
  const todayPos = useProgramStore((s) => s.todayPos);
  const fastForwardTo = useProgramStore((s) => s.fastForwardTo);

  const weeksPerCycle = activeProgram.weeks.length;
  const currentOverallWeek = todayPos ? todayPos.cycleIndex * weeksPerCycle + todayPos.week + 1 : 1;
  const currentDay = todayPos
    ? activeProgram.weeks[todayPos.week]?.days.find((d) => d.ordinal === todayPos.dayOrdinal)
    : undefined;

  const [weekInput, setWeekInput] = useState(currentOverallWeek);
  const [dayOrdinalInput, setDayOrdinalInput] = useState(todayPos?.dayOrdinal ?? 1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  // 주차 입력이 1 미만·비정수면 1로 취급 — 그 주차가 속한 사이클 내 week index로 변환.
  const clampedWeek = Number.isFinite(weekInput) && weekInput >= 1 ? Math.floor(weekInput) : 1;
  const weekIdx = (clampedWeek - 1) % weeksPerCycle;
  const dayOptions = activeProgram.weeks[weekIdx]?.days ?? [];
  // 주차를 바꿔 그 주에 없는 요일이 선택돼 있으면 첫 요일로 대체(렌더 시점 보정 — 별도 effect 없이).
  const safeDayOrdinal = dayOptions.some((d) => d.ordinal === dayOrdinalInput)
    ? dayOrdinalInput
    : (dayOptions[0]?.ordinal ?? dayOrdinalInput);

  async function handleMove() {
    setMessage(null);
    const target: CyclePos = { cycleIndex: Math.floor((clampedWeek - 1) / weeksPerCycle), week: weekIdx, dayOrdinal: safeDayOrdinal };
    const dayLabel = dayOptions.find((d) => d.ordinal === safeDayOrdinal);
    const confirmed = window.confirm(
      `${clampedWeek}주차 ${dayLabel?.weekdayHint ?? ""}로 이동합니다. 건너뛴 날들은 빈 완료로 기록되며 TM은 변하지 않습니다. 계속할까요?`
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      await fastForwardTo(target);
      setMessage({ kind: "success", text: "이동 완료." });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-card">
      <h3>진행 위치</h3>
      <p>
        다음 세션: {currentOverallWeek}주차 {currentDay?.weekdayHint ?? "-"} — {currentDay?.name ?? ""}
      </p>
      {message && (
        <div role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? "alert" : "status-banner"}>
          {message.text}
        </div>
      )}
      <div className="form-field">
        <label className="form-label">
          주차
          <input
            type="number"
            min={1}
            className="form-input"
            value={weekInput}
            onChange={(e) => setWeekInput(Number(e.target.value))}
          />
        </label>
        <label className="form-label">
          요일
          <select
            className="form-input"
            value={safeDayOrdinal}
            onChange={(e) => setDayOrdinalInput(Number(e.target.value))}
          >
            {dayOptions.map((d) => (
              <option key={d.ordinal} value={d.ordinal}>
                {d.weekdayHint ?? ""} — {d.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button type="button" className="btn btn-primary" onClick={handleMove} disabled={busy}>
        이 위치로 이동
      </button>
      <p style={{ fontSize: 13, color: "var(--muted)" }}>
        TM은 자동으로 바뀌지 않습니다 — 실제로 증량했다면 설정 → TM 수동 편집에서 맞춰주세요.
      </p>
    </section>
  );
}

export function ProgramScreen() {
  const description = useProgramStore((s) => s.activeProgram?.description);
  const activeProgram = useProgramStore((s) => s.activeProgram);
  const instanceMode = useProgramStore((s) => s.instanceState?.mode);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="screen">
      <h1 className="screen-title">프로그램</h1>
      {description && (
        <div className="settings-card program-description-card">
          <button type="button" className="btn btn-secondary" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "설명 접기 ▴" : "설명 보기 ▾"}
          </button>
          {expanded && <DescriptionText text={description} />}
        </div>
      )}
      {activeProgram && instanceMode === "rolling" && <FastForwardCard />}
      <ProgramLibrary />
    </div>
  );
}
