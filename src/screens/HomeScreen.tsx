import { useEffect, useMemo, useState } from "react";
import { useProgramStore } from "../store/programStore";
import { loadEventLog, loadBodyMetrics, loadInjuries, type BodyMetric, type InjuryLog } from "../store/queries";
import { exerciseInfo } from "../domain/exerciseLibrary";
import { LineChart } from "../components/LineChart";
import { nowISO } from "../lib/time";
import { trainingWeekdays, buildMonthGrid, monthSummary } from "./home/attendance";
import { combinedT1Performance, est1RM, liftSummary, programT1ExerciseIds, programT2ExerciseIds } from "./home/performance";
import { activeSessions } from "../store/sessionRevocation";
import { applyCorrections } from "../domain/corrections";
import { computeExerciseHistory, type ExerciseHistoryEntry } from "../domain/exerciseHistory";
import type { FoldInput } from "../domain/types.ts";

/** TM 패널 "기본 운동들" 그룹 — T1/T2 어디에도 안 속하면 이 정적 목록에서 채운다(항목3). */
const BASE_LIFT_IDS = ["squat", "deadlift", "bench", "ohp", "pullup"];

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
 *  부상·수행능력 카드 3종 추가.
 *  UI7 — Boostcamp풍 2컬럼 재배치(좌상 출석·좌하 몸무게·우측 tall 수행능력) + 수행능력↔프로그램
 *  자동 커플링(TM↔환산 1RM, home/performance.ts의 est1RM·liftSummary). */
export function HomeScreen({ onStartSession, onLogFreeWorkout }: HomeScreenProps) {
  const activeProgram = useProgramStore((s) => s.activeProgram);
  const todayPos = useProgramStore((s) => s.todayPos);
  const instanceState = useProgramStore((s) => s.instanceState);
  const restDay = useProgramStore((s) => s.restDay);
  const todayPlan = useProgramStore((s) => s.todayPlan);
  const tm = useProgramStore((s) => s.tm);
  const addBodyMetric = useProgramStore((s) => s.addBodyMetric);
  const addInjuryMutation = useProgramStore((s) => s.addInjury);
  const resolveInjuryMutation = useProgramStore((s) => s.resolveInjury);
  const acceptProposal = useProgramStore((s) => s.acceptProposal);

  const [cycleCompleted, setCycleCompleted] = useState(0);
  const [foldInput, setFoldInput] = useState<FoldInput | null>(null);
  const [bodyMetrics, setBodyMetrics] = useState<BodyMetric[] | null>(null);
  const [injuries, setInjuries] = useState<InjuryLog[] | null>(null);

  const [weightInput, setWeightInput] = useState("");
  const [bodyFatInput, setBodyFatInput] = useState("");
  const [injuryFormOpen, setInjuryFormOpen] = useState(false);
  const [injuryBodyPart, setInjuryBodyPart] = useState("");
  const [injuryNote, setInjuryNote] = useState("");

  // 항목2a — TM/1RM 편집(구 ProgramScreen.TmEditCard, 원래 SettingsScreen Stage1-C3 T4)을
  // 여기(수행능력 대시보드 맨 밑)로 이관: "수정" 버튼을 눌러야 인라인 편집 폼이 펼쳐진다.
  const [tmEditOpen, setTmEditOpen] = useState(false);
  const [tmEdits, setTmEdits] = useState<Record<string, string>>({});
  const [tmError, setTmError] = useState<string | null>(null);
  // 항목3 — TM 패널 "전체 보기"(T1/T2/기본 운동 어디에도 안 속하지만 실측 기록이 있는 종목) 토글.
  const [showAllExercises, setShowAllExercises] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const input = await loadEventLog();
      if (cancelled) return;
      setFoldInput(input);
      if (!todayPos) {
        setCycleCompleted(0);
        return;
      }
      // UI14 item4 — "이번 주"가 아니라 "이번 사이클"(현재 cycleIndex 전체, 모든 주) 진행도.
      // (week,dayOrdinal) 쌍 단위로 유일화한다 — 같은 날에 세션이 여러 개(재시작 등) 있어도 1로
      // 센다. 취소(revoked)된 세션은 제외(Stage1-UI9와 동일 원칙).
      const pairs = new Set(
        activeSessions(input.sessions, input.corrections)
          .filter((s) => s.status === "completed" && s.cyclePos.cycleIndex === todayPos.cycleIndex)
          .map((s) => `${s.cyclePos.week}-${s.cyclePos.dayOrdinal}`),
      );
      setCycleCompleted(pairs.size);
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

  /** TM 수동 편집 저장 — DecisionEvent{kind:"manual"}을 만들어 acceptProposal(=appendDecision+refresh)
   *  을 재사용한다(원래 ProgramScreen.TmEditCard와 동일 로직, 위치만 이관). */
  async function handleTmSave(exerciseId: string): Promise<void> {
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

  const weekdays = useMemo(() => trainingWeekdays(activeProgram), [activeProgram]);
  // UI7 — 좌상 "출석" 카드는 Boostcamp풍 4주 미니 스트립(기존 buildAttendanceGrid의 weeksCount 파라미터
  // 재사용, 신규 헬퍼 불필요).
  // UI14 item5 — 주간/4주 스트립 대신 실제 월간 달력(이번 달, 요일 7열 고정) 그리드로 교체.
  const grid = useMemo(
    () => (foldInput ? buildMonthGrid(foldInput.sessions, foldInput.sets, weekdays, new Date()) : null),
    [foldInput, weekdays],
  );
  const summary = grid ? monthSummary(grid) : null;

  // UI19 — 하드코딩 T1_LIFTS 제거: 활성 프로그램에서 실제 T1/T2 exerciseId를 동적으로 뽑는다(등장
  // 순서 dedup). T2는 T1과 겹치는 종목을 뺀 목록(TM 패널 그룹핑에서 중복 표시 방지, 항목3).
  const t1ExerciseIds = useMemo(() => (activeProgram ? programT1ExerciseIds(activeProgram) : []), [activeProgram]);
  const t2ExerciseIdsRaw = useMemo(() => (activeProgram ? programT2ExerciseIds(activeProgram) : []), [activeProgram]);
  const t2ExerciseIds = useMemo(
    () => t2ExerciseIdsRaw.filter((id) => !t1ExerciseIds.includes(id)),
    [t2ExerciseIdsRaw, t1ExerciseIds],
  );
  const baseLiftIds = useMemo(
    () => BASE_LIFT_IDS.filter((id) => !t1ExerciseIds.includes(id) && !t2ExerciseIds.includes(id)),
    [t1ExerciseIds, t2ExerciseIds],
  );
  // 항목3 — 실측 기록(SetRecord) 기반 종목별 최고 무게/볼륨 + 최초 달성일 인덱스. TM 개념이 없는
  // 종목(doubleProgression/repLadder)의 "현재 무게" 표시와, TM 패널의 모든 행 "PR 날짜" 표시에 재사용.
  const exerciseHistory = useMemo((): Map<string, ExerciseHistoryEntry> => {
    if (!foldInput) return new Map();
    const effectiveWorkSets = applyCorrections(foldInput.sets, foldInput.corrections).filter(
      (s) => s.setType === "work" && !s.revoked,
    );
    return computeExerciseHistory(effectiveWorkSets);
  }, [foldInput]);

  // 항목3 "전체 보기" — 위 세 그룹 어디에도 안 속하지만 실측 기록(exerciseHistory)이 있는 나머지 종목.
  const shownExerciseIds = useMemo(
    () => new Set([...t1ExerciseIds, ...t2ExerciseIds, ...baseLiftIds]),
    [t1ExerciseIds, t2ExerciseIds, baseLiftIds],
  );
  const otherExerciseIds = useMemo(
    () => [...exerciseHistory.keys()].filter((id) => !shownExerciseIds.has(id)),
    [exerciseHistory, shownExerciseIds],
  );

  const performancePoints = useMemo(
    () => (foldInput ? combinedT1Performance(foldInput, t1ExerciseIds) : []),
    [foldInput, t1ExerciseIds],
  );
  const activeInjuries = injuries?.filter((i) => !i.resolvedAt) ?? [];

  const weightPoints = useMemo(
    () => (bodyMetrics ?? []).filter((m) => m.weightKg !== undefined).map((m) => ({ at: m.at, value: m.weightKg! })),
    [bodyMetrics],
  );
  const bodyFatPoints = useMemo(
    () =>
      (bodyMetrics ?? []).filter((m) => m.bodyFatPct !== undefined).map((m) => ({ at: m.at, value: m.bodyFatPct! })),
    [bodyMetrics],
  );
  const latestWeight = weightPoints.at(-1)?.value;
  const latestBodyFat = bodyFatPoints.at(-1)?.value;

  // UI7 — 수행능력↔프로그램 자동 커플링: TM(store, foldState 결과) → liftSummary가 T1 리프트별
  // (TM, 환산 1RM, 실측 e1RM)을 묶어 "현재 무게" 리스트에 공급. 증량 그래프(TM합) 카드 동반 스탯은
  // 같은 환산식(est1RM)을 합계에 재적용. UI19 — TM 없는 T1 종목은 liftSummary가 exerciseHistory에서
  // 유도한 bestWeight로 대체 표시(스킵하지 않음).
  const liftRows = useMemo(
    () => (foldInput ? liftSummary(foldInput, tm, t1ExerciseIds, exerciseHistory) : []),
    [foldInput, tm, t1ExerciseIds, exerciseHistory],
  );
  const estSum = performancePoints.length > 0 ? est1RM(performancePoints.at(-1)!.value) : undefined;

  if (!activeProgram) {
    return <div className="loading-state">로딩 중...</div>;
  }

  // UI14 item4 — "이번 주"가 아니라 프로그램 전체 사이클(activeProgram.weeks 전부 × 주당 일수) 기준
  // 진행도. kk-6day처럼 1주 반복 프로그램은 "전체"와 "이번 주"가 우연히 같아지므로 별도 분기 불필요.
  const totalThisCycle = activeProgram.weeks.reduce((n, w) => n + w.days.length, 0);
  const totalWeeks = activeProgram.weeks.length;
  const currentWeekNum = (todayPos?.week ?? 0) + 1;
  const percent = totalThisCycle > 0 ? Math.round((cycleCompleted / totalThisCycle) * 100) : 0;

  /** 항목3 — TM 패널 한 행. TM이 있는 종목만 편집 UI(입력+저장)를 붙이고, 없는 종목은 이름+PR 날짜만
   *  읽기전용 표시(그 종목엔 "TM" 개념 자체가 없으므로 편집을 만들지 않는다). */
  function renderTmPanelRow(exerciseId: string) {
    const name = exerciseInfo(exerciseId)?.name ?? exerciseId;
    const h = exerciseHistory.get(exerciseId);
    const tmValue = tm[exerciseId];
    return (
      <li key={exerciseId} data-testid={`tm-panel-row-${exerciseId}`}>
        <span className="lift-summary-name">{name}</span>{" "}
        {h?.bestWeightAt !== undefined ? (
          <span className="form-label" style={{ marginBottom: 0 }}>
            최고 무게 {h.bestWeight}kg ({h.bestWeightAt.slice(0, 10)})
          </span>
        ) : (
          <span className="form-label" style={{ marginBottom: 0 }}>
            기록 없음
          </span>
        )}
        {tmValue !== undefined && (
          <>
            {" "}
            <span className="form-label" style={{ marginBottom: 0 }}>
              (환산 1RM ≈{est1RM(tmValue)})
            </span>
            <input
              type="number"
              data-testid={`tm-input-${exerciseId}`}
              className="free-input"
              value={tmEdits[exerciseId] ?? ""}
              placeholder={String(tmValue)}
              onChange={(e) => setTmEdits((prev) => ({ ...prev, [exerciseId]: e.target.value }))}
            />
            <button type="button" className="btn btn-secondary" onClick={() => handleTmSave(exerciseId)}>
              저장
            </button>
          </>
        )}
      </li>
    );
  }

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
          이번 사이클 {cycleCompleted}/{totalThisCycle} 완료 · {percent}% · {currentWeekNum}/{totalWeeks}주차
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

      {/* UI7 — Boostcamp풍 2컬럼 대시보드: 좌상 출석 / 좌하 몸무게 / 우측(tall) 수행능력. */}
      <div className="dashboard-grid">
        <div className="settings-card dashboard-cell dashboard-cell-attendance">
          <h3>출석</h3>
          {summary && (
            <>
              <div className="dashboard-stat-big">
                {summary.completed}/{summary.total}
              </div>
              <p className="form-label">이번 달 · 수행률 {summary.percent}%</p>
            </>
          )}
          {/* UI14 item5 — 실제 월간 달력(요일 7열 고정, 이번 달만). 숫자 없이 색상만(완료/부분/없음/
              훈련일 아님 4종) — 날짜 라벨은 의도적으로 렌더하지 않는다(요구사항: "색상만"). */}
          {grid && (
            <div className="attendance-calendar">
              <div className="attendance-calendar-header">
                {grid.weekdayLabels.map((wd) => (
                  <span key={wd} className="attendance-calendar-weekday">
                    {wd}
                  </span>
                ))}
              </div>
              {grid.weeks.map((week, weekIdx) => (
                <div className="attendance-calendar-row" key={weekIdx}>
                  {week.map((cell, dayIdx) => (
                    <span
                      key={dayIdx}
                      data-testid={`attendance-cell-${cell.date ?? `pad-${weekIdx}-${dayIdx}`}`}
                      className={`attendance-cell${
                        cell.date === null
                          ? " is-empty"
                          : cell.status === "complete"
                            ? " is-complete"
                            : cell.status === "partial"
                              ? " is-partial"
                              : cell.status === "off"
                                ? " is-off"
                                : ""
                      }`}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="settings-card dashboard-cell dashboard-cell-weight">
          <h3>몸무게</h3>
          {latestWeight !== undefined && <div className="dashboard-stat-big">{latestWeight}kg</div>}
          {latestBodyFat !== undefined && <p className="dashboard-stat-teal">체지방 {latestBodyFat}%</p>}
          {bodyMetrics && bodyMetrics.length >= 2 ? (
            <LineChart
              points={weightPoints}
              series2={bodyFatPoints}
              labels={{ s1: "몸무게", s2: "체지방" }}
              width={150}
              height={90}
            />
          ) : (
            <p className="form-label">기록이 쌓이면 추이가 표시됩니다</p>
          )}
          <div className="session-complete-row dashboard-quick-input" style={{ marginTop: 8 }}>
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

        <div className="settings-card dashboard-cell dashboard-cell-performance">
          <h3>수행능력</h3>
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

          <LineChart points={performancePoints} width={150} height={70} />
          {estSum !== undefined && <p className="form-label">환산 1RM 합 ≈ {estSum}kg</p>}

          {liftRows.length > 0 && (
            <ul className="lift-summary-list">
              {liftRows.map((row) => (
                <li key={row.exerciseId} className="lift-summary-row" data-testid={`lift-summary-${row.exerciseId}`}>
                  {/* UI14 item6 — TM 표시 제거, 환산 1RM만(TM 편집은 아래 "TM/1RM 수정하기" 버튼, 항목2a).
                      UI19 — TM 없는 T1 종목(row.tm===undefined)은 est1RM 대신 실측 최고 무게(bestWeight)를
                      보여준다(스킵하지 않음, 기록 자체가 없으면 이름만). */}
                  <span className="lift-summary-name">{row.name}</span>
                  {row.tm !== undefined ? (
                    <span className="lift-summary-est">≈{row.est1RM}</span>
                  ) : row.bestWeight !== undefined ? (
                    <span className="lift-summary-est">{row.bestWeight}kg</span>
                  ) : (
                    <span className="lift-summary-est">기록 없음</span>
                  )}
                  {row.measuredE1RM !== undefined && (
                    <span className="lift-summary-measured">측정 {row.measuredE1RM}</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* 항목2a — TM/1RM 편집(구 ProgramScreen.TmEditCard 이관). 기본은 접혀 있고 버튼으로 연다.
              UI19 항목1 — 버튼을 눈에 띄는 btn-secondary로, 라벨을 "TM/1RM 수정하기"로 명확화. */}
          <button
            type="button"
            className="btn btn-secondary"
            data-testid="tm-edit-toggle"
            onClick={() => setTmEditOpen((v) => !v)}
          >
            {tmEditOpen ? "TM/1RM 수정 접기" : "TM/1RM 수정하기"}
          </button>
          {tmEditOpen && (
            <div className="form-field">
              {tmError && (
                <div role="alert" className="alert">
                  {tmError}
                </div>
              )}
              {/* UI19 항목3 — 종목을 T1 → T2(T1과 중복 제외) → 기본 운동(정적 목록, 위와 중복 제외) →
                  "전체 보기"(그 외 실측 기록 있는 종목, 기본은 접힘) 순서로 그룹핑. */}
              {t1ExerciseIds.length > 0 && (
                <>
                  <p className="form-label">T1</p>
                  <ul>{t1ExerciseIds.map(renderTmPanelRow)}</ul>
                </>
              )}
              {t2ExerciseIds.length > 0 && (
                <>
                  <p className="form-label">T2</p>
                  <ul>{t2ExerciseIds.map(renderTmPanelRow)}</ul>
                </>
              )}
              {baseLiftIds.length > 0 && (
                <>
                  <p className="form-label">기본 운동</p>
                  <ul>{baseLiftIds.map(renderTmPanelRow)}</ul>
                </>
              )}
              <button
                type="button"
                className="btn-ghost"
                data-testid="tm-show-all-toggle"
                onClick={() => setShowAllExercises((v) => !v)}
              >
                {showAllExercises ? "전체 보기 접기" : "전체 보기"}
              </button>
              {showAllExercises && <ul>{otherExerciseIds.map(renderTmPanelRow)}</ul>}
            </div>
          )}
        </div>
      </div>

      <div className="settings-card">
        <button type="button" className="btn btn-secondary" onClick={onLogFreeWorkout}>
          크로스핏 · 자유 운동 기록
        </button>
      </div>
    </div>
  );
}
