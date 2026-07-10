import { useEffect, useState } from "react";
import { loadFoldInput } from "../storage/eventStore";
import { sortByAtId } from "../domain/order";
import type { SessionCompleted, SetRecord } from "../domain/types.ts";

/**
 * Task 6 — 최소 히스토리 화면: 캘린더 없이 세션 리스트만.
 * 정렬: sortByAtId(order.ts, 나머지 화면들과 동일한 (at,id) 비교자)를 그대로 쓰고 reverse()해
 * 최신순(내림차순)으로 만든다 — 별도 비교자 재구현 없음.
 * 캘린더 뷰·TM 이력 차트·주간 분석 대시보드는 Plan C2로 이월.
 */
export function HistoryScreen() {
  const [sessions, setSessions] = useState<SessionCompleted[] | null>(null);
  const [sets, setSets] = useState<SetRecord[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const input = await loadFoldInput();
      if (cancelled) return;
      setSessions(sortByAtId(input.sessions).reverse());
      setSets(input.sets);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (sessions === null) {
    return <div>로딩 중...</div>;
  }

  if (sessions.length === 0) {
    return <div>아직 기록된 세션이 없습니다</div>;
  }

  return (
    <div>
      <h2>히스토리</h2>
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
