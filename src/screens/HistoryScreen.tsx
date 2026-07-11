import { useEffect, useMemo, useState } from "react";
import { loadEventLog, listExternalSessions, type ExternalSessionRecord } from "../store/queries";
import { sortByAtId } from "../domain/order";
import { applyCorrections } from "../domain/corrections";
import { tmHistory, e1rmSeries } from "../domain/e1rm";
import { EXERCISES } from "../domain/exerciseLibrary";
import { LineChart } from "../components/LineChart";
import type { SessionCompleted, SetRecord, FoldInput } from "../domain/types.ts";
import "../styles/history-analytics.css";

const WEEKDAY_KR = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * UI 백로그 항목 3 — 세션 행 표시용 날짜를 "YYYY-MM-DD (요일)"(예: "2026-07-10 (금)")로 표시.
 * ISO 원문은 렌더링에서 버리지 않고 title 속성으로 보존한다(호출부). 파싱 실패 시 원문을 그대로 반환.
 * (repo 전체 grep 확인 — 이 포맷 문자열을 검증하는 테스트 없음, testid만 검증하므로 포맷 변경 안전.)
 */
function formatKoreanDate(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} (${WEEKDAY_KR[d.getDay()]})`;
}

/**
 * Task 6(C1) — 최소 히스토리 화면: 캘린더 없이 세션 리스트만.
 * 정렬: sortByAtId(order.ts, 나머지 화면들과 동일한 (at,id) 비교자)를 그대로 쓰고 reverse()해
 * 최신순(내림차순)으로 만든다 — 별도 비교자 재구현 없음.
 * 캘린더 뷰·주간 분석 대시보드는 Plan C2 Task 5로 이월.
 *
 * Task 4(C2) — TM 이력 + e1RM 차트: 운동 선택 드롭다운은 exerciseLibrary.EXERCISES 전체(13개)를
 * 나열한다. T1/T2 8종 외 악세사리 5종도 함께 뜨지만 별도로 걸러내지 않는다(단순화) — 악세사리를
 * 선택해도 tmHistory는 그 exerciseId에 결정된 TM이 없어 자연히 빈 배열([])을 반환하고, LineChart가
 * 0~1개 점을 "데이터 부족"으로 표시하는 자체 빈 상태를 그대로 재사용한다(화면이 별도 안내를 중복
 * 만들지 않음). e1RM 시리즈는 substituted(대체 종목 여부)로 분리된 각 시리즈를 별도 LineChart로
 * 나란히 렌더하고 헤더 텍스트로 "원 종목"/"대체 종목"을 구분한다(점선 스타일 대신 선택 — SVG에
 * stroke-dasharray를 추가하는 것보다 별도 카드 제목이 더 명확하고 두 접근 모두 의존성이 없어 단순함
 * 기준으로는 동등하나, 헤더 라벨 쪽이 좁은 화면에서도 가독성이 낫다고 판단).
 */
export function HistoryScreen() {
  const [sessions, setSessions] = useState<SessionCompleted[] | null>(null);
  const [sets, setSets] = useState<SetRecord[]>([]);
  const [foldInput, setFoldInput] = useState<FoldInput | null>(null);
  const [externalSessions, setExternalSessions] = useState<ExternalSessionRecord[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [input, external] = await Promise.all([loadEventLog(), listExternalSessions()]);
        if (cancelled) return;
        setSessions(sortByAtId(input.sessions).reverse());
        setSets(input.sets);
        setFoldInput(input);
        setExternalSessions(external);
      } catch {
        if (cancelled) return;
        setError("불러오기 실패 — 다시 시도해주세요.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** 프로그램 세션 + 외부(크로스핏 등) 세션을 at 내림차순으로 병합한 표시용 행 목록(Stage1-UI6). */
  type HistoryRow =
    | { kind: "program"; id: string; at: string; session: SessionCompleted }
    | { kind: "external"; id: string; at: string; session: ExternalSessionRecord };

  const mergedRows: HistoryRow[] = useMemo(() => {
    const programRows: HistoryRow[] = (sessions ?? []).map((s) => ({ kind: "program", id: s.id, at: s.at, session: s }));
    const externalRows: HistoryRow[] = externalSessions.map((s) => ({ kind: "external", id: s.id, at: s.at, session: s }));
    return [...programRows, ...externalRows].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  }, [sessions, externalSessions]);

  const tmPoints = useMemo(() => {
    if (!foldInput || !selectedExerciseId) return [];
    return tmHistory(foldInput, selectedExerciseId);
  }, [foldInput, selectedExerciseId]);

  const e1rmSeriesForExercise = useMemo(() => {
    if (!foldInput || !selectedExerciseId) return [];
    const effective = applyCorrections(foldInput.sets, foldInput.corrections);
    return e1rmSeries(effective).filter((s) => s.exerciseId === selectedExerciseId);
  }, [foldInput, selectedExerciseId]);

  if (error) {
    return (
      <div role="alert" className="alert">
        {error}
      </div>
    );
  }

  if (sessions === null) {
    return <div className="loading-state">로딩 중...</div>;
  }

  if (sessions.length === 0 && externalSessions.length === 0) {
    return (
      <div className="loading-state">
        <p>아직 기록된 세션이 없습니다</p>
        <p className="ha-empty-hint">오늘 세션을 기록하면 이력과 TM·e1RM 추이를 여기서 확인할 수 있어요</p>
        <button
          type="button"
          className="btn btn-primary ha-empty-cta"
          onClick={() => {
            window.location.hash = "/home";
          }}
        >
          오늘 운동 시작하기
        </button>
      </div>
    );
  }

  const plainSeries = e1rmSeriesForExercise.find((s) => !s.substituted);
  const substitutedSeries = e1rmSeriesForExercise.find((s) => s.substituted);

  return (
    <div>
      <h2 className="day-header">히스토리</h2>

      <section className="slot-section">
        <h3 className="slot-eyebrow">TM 이력 / e1RM 추이</h3>
        <select
          aria-label="운동 선택"
          data-testid="history-exercise-select"
          className="form-input"
          value={selectedExerciseId}
          onChange={(e) => setSelectedExerciseId(e.target.value)}
        >
          <option value="">— 운동 선택 —</option>
          {Object.values(EXERCISES).map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.name}
            </option>
          ))}
        </select>

        {selectedExerciseId && (
          <div>
            <div data-testid="tm-history-chart">
              <h4>TM 추이</h4>
              <LineChart points={tmPoints} />
            </div>

            {e1rmSeriesForExercise.length === 0 ? (
              <div data-testid="e1rm-chart-empty">
                <h4>e1RM 추이</h4>
                <LineChart points={[]} />
              </div>
            ) : (
              <>
                {plainSeries && (
                  <div data-testid="e1rm-chart-plain">
                    <h4>e1RM 추이 (원 종목)</h4>
                    <LineChart points={plainSeries.points} />
                  </div>
                )}
                {substitutedSeries && (
                  <div data-testid="e1rm-chart-substituted">
                    <h4>e1RM 추이 (대체 종목)</h4>
                    <LineChart points={substitutedSeries.points} />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </section>

      <ul>
        {mergedRows.map((row) => {
          const isExpanded = expandedId === row.id;
          if (row.kind === "program") {
            const session = row.session;
            const sessionSets = sets.filter((s) => s.sessionId === session.sessionId);
            return (
              <li key={session.id}>
                <div
                  data-testid={`session-row-${session.id}`}
                  role="button"
                  tabIndex={0}
                  className="session-row"
                  title={session.at}
                  onClick={() => setExpandedId(isExpanded ? null : session.id)}
                >
                  {formatKoreanDate(session.at)} — {session.programId} — {session.status === "completed" ? "완료" : "스킵"}
                </div>
                {isExpanded && (
                  <ul data-testid={`session-sets-${session.id}`} className="session-sets">
                    {sessionSets.map((s) => (
                      <li key={s.id}>
                        {s.exerciseId} {s.actualWeight}kg × {s.actualReps}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          }

          const ext = row.session;
          const label = ext.label ?? "크로스핏";
          const exerciseCount = ext.exercises?.length ?? 0;
          const cardioCount = ext.cardio?.length ?? 0;
          return (
            <li key={ext.id}>
              <div
                data-testid={`session-row-${ext.id}`}
                role="button"
                tabIndex={0}
                className="session-row"
                title={ext.at}
                onClick={() => setExpandedId(isExpanded ? null : ext.id)}
              >
                {formatKoreanDate(ext.at)} — {label} — 자유운동 {exerciseCount} · 유산소 {cardioCount}
              </div>
              {isExpanded && (
                <ul data-testid={`session-sets-${ext.id}`} className="session-sets">
                  {(ext.exercises ?? []).map((ex, i) => {
                    const parts: string[] = [];
                    if (ex.weightKg !== undefined) parts.push(`${ex.weightKg}kg`);
                    if (ex.reps !== undefined) parts.push(`${ex.reps}회`);
                    if (ex.sets !== undefined) parts.push(`${ex.sets}세트`);
                    return (
                      <li key={`ex-${i}`}>
                        {ex.name}
                        {parts.length > 0 ? ` ${parts.join("×")}` : ""}
                      </li>
                    );
                  })}
                  {(ext.cardio ?? []).map((c, i) => {
                    const parts: string[] = [];
                    if (c.minutes !== undefined) parts.push(`${c.minutes}분`);
                    if (c.distanceKm !== undefined) parts.push(`${c.distanceKm}km`);
                    return (
                      <li key={`cardio-${i}`}>
                        {c.kind}
                        {parts.length > 0 ? ` ${parts.join(" · ")}` : ""}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
