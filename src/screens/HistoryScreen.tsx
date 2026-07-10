import { useEffect, useMemo, useState } from "react";
import { loadEventLog } from "../store/queries";
import { sortByAtId } from "../domain/order";
import { applyCorrections } from "../domain/corrections";
import { tmHistory, e1rmSeries } from "../domain/e1rm";
import { EXERCISES } from "../domain/exerciseLibrary";
import { LineChart } from "../components/LineChart";
import type { SessionCompleted, SetRecord, FoldInput } from "../domain/types.ts";

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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const input = await loadEventLog();
        if (cancelled) return;
        setSessions(sortByAtId(input.sessions).reverse());
        setSets(input.sets);
        setFoldInput(input);
      } catch {
        if (cancelled) return;
        setError("불러오기 실패 — 다시 시도해주세요.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    return <div role="alert">{error}</div>;
  }

  if (sessions === null) {
    return <div>로딩 중...</div>;
  }

  if (sessions.length === 0) {
    return <div>아직 기록된 세션이 없습니다</div>;
  }

  const plainSeries = e1rmSeriesForExercise.find((s) => !s.substituted);
  const substitutedSeries = e1rmSeriesForExercise.find((s) => s.substituted);

  return (
    <div>
      <h2>히스토리</h2>

      <section>
        <h3>TM 이력 / e1RM 추이</h3>
        <select
          aria-label="운동 선택"
          data-testid="history-exercise-select"
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
        {sessions.map((session) => {
          const isExpanded = expandedId === session.id;
          const sessionSets = sets.filter((s) => s.sessionId === session.sessionId);
          return (
            <li key={session.id}>
              <div
                data-testid={`session-row-${session.id}`}
                role="button"
                tabIndex={0}
                onClick={() => setExpandedId(isExpanded ? null : session.id)}
              >
                {session.at} — {session.programId} — {session.status === "completed" ? "완료" : "스킵"}
              </div>
              {isExpanded && (
                <ul data-testid={`session-sets-${session.id}`}>
                  {sessionSets.map((s) => (
                    <li key={s.id}>
                      {s.exerciseId} {s.actualWeight}kg × {s.actualReps}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
