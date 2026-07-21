import { useState } from "react";
import { ProgramLibrary } from "../components/ProgramLibrary";
import { useProgramStore } from "../store/programStore";
import { exerciseInfo } from "../domain/exerciseLibrary";
import { est1RM } from "./home/performance";
import { nowISO } from "../lib/time";
import type { CyclePos, ProgramDefinition, DaySpec, SlotSpec } from "../domain/types.ts";

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

type RoutineRow = { key: string; label: string; slots: SlotSpec[] };

/** 1-based 주차 목록을 사람이 읽는 라벨로: 연속이면 "1~6주차", 아니면 "1·3·5주차". */
function weekListLabel(weekNums: number[]): string {
  const isContiguous = weekNums.every((w, i) => i === 0 || w === weekNums[i - 1]! + 1);
  if (weekNums.length > 2 && isContiguous) return `${weekNums[0]}~${weekNums[weekNums.length - 1]}주차`;
  return `${weekNums.join("·")}주차`;
}

/**
 * program.weeks에서 요일(ordinal)별 행을 만든다 — 같은 ordinal의 날을 **구성(JSON.stringify(slots))별로
 * 그룹핑**한다: 모든 주에서 동일하면 한 행("월"), 구성이 갈리면 같은 구성의 주들을 묶어
 * "화 (1·3·5주차)" / "화 (2·4·6주차)" / "화 (7주차)"처럼 라벨링(7주 메조사이클에서 표가 주별로
 * 폭발하지 않게 — UI9에서 주별 분리 방식을 그룹핑으로 업그레이드). 손으로 쓴 텍스트가 아니라
 * 실제 프로그램 정의에서 매번 다시 계산하므로 프로그램이 바뀌어도 표가 항상 실제 루틴과 일치한다.
 */
function buildRoutineRows(program: ProgramDefinition): RoutineRow[] {
  const weeks = program.weeks;
  const ordinals = Array.from(new Set(weeks.flatMap((w) => w.days.map((d) => d.ordinal)))).sort((a, b) => a - b);

  const rows: RoutineRow[] = [];
  for (const ordinal of ordinals) {
    const daysWithWeek = weeks
      .map((w, weekIdx) => ({ day: w.days.find((d) => d.ordinal === ordinal), weekIdx }))
      .filter((e): e is { day: DaySpec; weekIdx: number } => e.day !== undefined);
    if (daysWithWeek.length === 0) continue;

    // 구성별 그룹핑 (등장 순서 유지)
    const groups = new Map<string, { day: DaySpec; weekNums: number[] }>();
    for (const { day, weekIdx } of daysWithWeek) {
      const key = JSON.stringify(day.slots);
      const g = groups.get(key);
      if (g) g.weekNums.push(weekIdx + 1);
      else groups.set(key, { day, weekNums: [weekIdx + 1] });
    }

    const groupList = [...groups.values()];
    if (groupList.length === 1) {
      const g = groupList[0]!;
      rows.push({ key: `${ordinal}`, label: g.day.weekdayHint ?? g.day.name, slots: g.day.slots });
    } else {
      groupList.forEach((g, gi) => {
        rows.push({
          key: `${ordinal}-${gi}`,
          label: `${g.day.weekdayHint ?? g.day.name} (${weekListLabel(g.weekNums)})`,
          slots: g.day.slots,
        });
      });
    }
  }
  return rows;
}

/** 프로그램 설명 카드 안에 얹는 자동 생성 루틴 표(Stage1-UI8) — buildRoutineRows 참고. */
function RoutineTable({ program }: { program: ProgramDefinition }) {
  const rows = buildRoutineRows(program);
  return (
    <table className="routine-table">
      <thead>
        <tr>
          <th>요일</th>
          <th>구성</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <td>{row.label}</td>
            <td>
              {row.slots.map((slot) => (
                <div key={slot.id}>
                  <span className="slot-label">{slot.label}</span>{" "}
                  {exerciseInfo(slot.exerciseId)?.name ?? slot.exerciseId} ×{slot.sets.length}
                </div>
              ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
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
      `${clampedWeek}주차 ${dayLabel?.weekdayHint ?? ""}로 이동합니다. 건너뛴 날들은 빈 완료로 기록되며 TM은 변하지 않습니다. ` +
        `뒤로 이동하는 경우 지나간 세션들은 취소 처리됩니다(기록이 있던 세션의 TM 반영은 유지). 계속할까요?`
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      const result = await fastForwardTo(target);
      setMessage({
        kind: "success",
        text:
          result.revokedReal > 0
            ? `이동 완료 — 실제 기록이 있던 세션 ${result.revokedReal}개가 취소되었습니다(TM은 유지 — 필요시 설정에서 수동 조정).`
            : "이동 완료.",
      });
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

/**
 * TM/1RM 편집(UI14 item9 — SettingsScreen의 "TM 수동 편집"에서 이관, 원래 Stage1-C3 T4).
 * programStore.tm을 그대로 렌더하고, 저장 시 DecisionEvent{kind:"manual"}을 만들어 기존
 * `acceptProposal` mutation을 재사용한다 — 이름은 "제안 수락"이지만 본질은 appendDecision+refresh라
 * 임의의 결정(수동 편집 포함)에 그대로 맞는다. 대칭성(item9 요구)을 위해 각 행에 읽기전용 환산
 * 1RM(est1RM = TM/0.9)도 함께 보여준다 — liftSummary()와 동일한 환산식(home/performance.ts) 재사용.
 */
function TmEditCard() {
  const tm = useProgramStore((s) => s.tm);
  const acceptProposal = useProgramStore((s) => s.acceptProposal);
  const [tmEdits, setTmEdits] = useState<Record<string, string>>({});
  const [tmError, setTmError] = useState<string | null>(null);

  async function handleTmSave(exerciseId: string) {
    const raw = tmEdits[exerciseId];
    const value = raw === undefined ? NaN : Number(raw);
    if (raw === undefined || raw.trim() === "" || !Number.isFinite(value)) {
      setTmError("올바른 숫자를 입력해주세요.");
      return;
    }
    setTmError(null);
    await acceptProposal({
      id: crypto.randomUUID(),
      target: { kind: "tm", exerciseId },
      kind: "manual",
      value,
      at: nowISO(),
      schemaVersion: 1,
    });
    setTmEdits((prev) => {
      const next = { ...prev };
      delete next[exerciseId];
      return next;
    });
  }

  if (Object.keys(tm).length === 0) return null;

  return (
    <section className="settings-card">
      <h3>TM / 1RM 편집</h3>
      {tmError && (
        <div role="alert" className="alert">
          {tmError}
        </div>
      )}
      <ul>
        {Object.entries(tm).map(([exerciseId, value]) => (
          <li key={exerciseId}>
            {exerciseId}: {value}{" "}
            <span className="form-label" style={{ marginBottom: 0 }}>
              (환산 1RM ≈{est1RM(value)})
            </span>
            <input
              type="number"
              data-testid={`tm-input-${exerciseId}`}
              className="free-input"
              value={tmEdits[exerciseId] ?? ""}
              placeholder={String(value)}
              onChange={(e) => setTmEdits((prev) => ({ ...prev, [exerciseId]: e.target.value }))}
            />
            <button type="button" className="btn btn-secondary" onClick={() => handleTmSave(exerciseId)}>
              저장
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ProgramScreen() {
  const description = useProgramStore((s) => s.activeProgram?.description);
  const activeProgram = useProgramStore((s) => s.activeProgram);
  const instanceMode = useProgramStore((s) => s.instanceState?.mode);
  const [expanded, setExpanded] = useState(false);

  // 설명이 없는 프로그램도 자동 생성 루틴 표는 항상 보여줘야 하므로, 카드 자체는 activeProgram만
  // 있으면 렌더한다 — 토글 라벨만 설명 유무로 갈린다("설명 보기"는 기존 동작 그대로 보존).
  const toggleLabel = description
    ? (expanded ? "설명 접기 ▴" : "설명 보기 ▾")
    : (expanded ? "루틴 표 접기 ▴" : "루틴 표 보기 ▾");

  return (
    <div className="screen">
      <h1 className="screen-title">프로그램</h1>
      {activeProgram && (
        <div className="settings-card program-description-card">
          <button type="button" className="btn btn-secondary" onClick={() => setExpanded((v) => !v)}>
            {toggleLabel}
          </button>
          {expanded && (
            <>
              <h4>운동루틴</h4>
              <RoutineTable program={activeProgram} />
              {description && <DescriptionText text={description} />}
            </>
          )}
        </div>
      )}
      {activeProgram && instanceMode === "rolling" && <FastForwardCard />}
      {activeProgram && <TmEditCard />}
      <ProgramLibrary />
    </div>
  );
}
