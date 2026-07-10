import { useEffect, useMemo, useState } from "react";
import { useProgramStore } from "../store/programStore";
import { loadEventLog, listExternalSessions, type ExternalSessionRecord } from "../store/queries";
import { weeklyAnalysis, type GroupStats, type WeekBucket } from "../domain/analytics";
import type { MuscleGroup } from "../domain/exerciseLibrary";
import type { FoldInput } from "../domain/types.ts";
import { nowISO } from "../lib/time";

const GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: "가슴",
  back: "등",
  shoulders: "어깨",
  quads: "대퇴사두",
  hamstrings: "햄스트링",
  glutes: "둔근",
  calves: "종아리",
  biceps: "이두",
  triceps: "삼두",
  core: "코어",
};

/** 스펙 §2-4 ⚠️ 고정 문구 — 표가 있을 때 항상 표 하단에 그대로 노출(paraphrase 금지). */
const LOWER_BODY_FOOTNOTE = "nSuns 구조상 하체 유효세트는 상체보다 낮게 표시됩니다(프로그램 특성)";

function sortByFirstAt(buckets: WeekBucket[]): WeekBucket[] {
  return [...buckets].sort((a, b) => (a.firstAt < b.firstAt ? -1 : a.firstAt > b.firstAt ? 1 : 0));
}

/**
 * Task 5(C2) — 주간 부위별 분석 대시보드. weeklyAnalysis(domain/analytics.ts)의 결과를
 * 표로 렌더한다(라이브러리 없는 순수 테이블 — 차트 아님, 계획 범위 밖).
 *
 * 버킷 선택 계약(계획 원문의 "activeProgram.id + 현재 cycleIndex/week, 없으면 최신 firstAt" 해석):
 * "같은 programId 내에서 이전/다음을 순회한다"는 계획 문구를 따라, 버킷 목록을 먼저
 * activeProgram.id로 좁힌 뒤(firstAt 오름차순 정렬) 그 안에서 현재 위치 매칭·fallback·
 * prev/next를 전부 수행한다 — "최신"의 기준도 이 좁혀진 목록 안에서의 최신을 뜻한다.
 */
export function AnalyticsScreen() {
  const activeProgram = useProgramStore((s) => s.activeProgram);
  const todayPos = useProgramStore((s) => s.todayPos);
  const recordExternalSession = useProgramStore((s) => s.recordExternalSession);
  const [foldInput, setFoldInput] = useState<FoldInput | null>(null);
  const [manualIndex, setManualIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [externalSessions, setExternalSessions] = useState<ExternalSessionRecord[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<MuscleGroup[]>([]);
  const [extBusy, setExtBusy] = useState(false);

  async function loadExternal() {
    setExternalSessions(await listExternalSessions());
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [input] = await Promise.all([loadEventLog(), loadExternal()]);
        if (cancelled) return;
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

  const mappedExternal = useMemo(
    () => externalSessions.map((e) => ({ cyclePos: e.cyclePos, groups: e.groups, programId: e.programId })),
    [externalSessions],
  );

  const programBuckets = useMemo(() => {
    if (!foldInput || !activeProgram) return [];
    const buckets = weeklyAnalysis({
      sets: foldInput.sets,
      corrections: foldInput.corrections,
      sessions: foldInput.sessions,
      programs: foldInput.programs,
      externalSessions: mappedExternal,
    });
    return sortByFirstAt(buckets.filter((b) => b.programId === activeProgram.id));
  }, [foldInput, activeProgram, mappedExternal]);

  /** 외부 세션 저장 시 쓸 cyclePos — "현재 위치(todayPos) 없으면 활성 프로그램의 최신 버킷" 계약. */
  const externalCyclePos = todayPos
    ? { cycleIndex: todayPos.cycleIndex, week: todayPos.week }
    : programBuckets.length > 0
      ? { cycleIndex: programBuckets[programBuckets.length - 1]!.cycleIndex, week: programBuckets[programBuckets.length - 1]!.week }
      : undefined;

  function toggleGroup(g: MuscleGroup) {
    setSelectedGroups((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  }

  async function handleAddExternal() {
    if (!activeProgram || !externalCyclePos || selectedGroups.length === 0) return;
    setExtBusy(true);
    try {
      await recordExternalSession({
        id: crypto.randomUUID(),
        at: nowISO(),
        groups: selectedGroups,
        programId: activeProgram.id,
        cyclePos: externalCyclePos,
      });
      setSelectedGroups([]);
      await loadExternal();
    } finally {
      setExtBusy(false);
    }
  }

  const externalSection = activeProgram && (
    <section>
      <h3>외부 세션 추가</h3>
      {(Object.entries(GROUP_LABELS) as [MuscleGroup, string][]).map(([group, label]) => (
        <label key={group}>
          <input
            type="checkbox"
            data-testid={`external-group-${group}`}
            checked={selectedGroups.includes(group)}
            onChange={() => toggleGroup(group)}
          />
          {label}
        </label>
      ))}
      <button
        type="button"
        onClick={handleAddExternal}
        disabled={extBusy || !externalCyclePos || selectedGroups.length === 0}
      >
        저장
      </button>
    </section>
  );

  const defaultIndex = useMemo(() => {
    if (programBuckets.length === 0) return -1;
    const currentIdx = todayPos
      ? programBuckets.findIndex((b) => b.cycleIndex === todayPos.cycleIndex && b.week === todayPos.week)
      : -1;
    return currentIdx >= 0 ? currentIdx : programBuckets.length - 1; // fallback: 최신(firstAt 마지막)
  }, [programBuckets, todayPos]);

  const index =
    manualIndex !== null && manualIndex >= 0 && manualIndex < programBuckets.length ? manualIndex : defaultIndex;

  if (error) {
    return <div role="alert">{error}</div>;
  }

  if (foldInput === null || !activeProgram) {
    return <div>로딩 중...</div>;
  }

  if (index === -1) {
    return (
      <div>
        <h2>주간 분석</h2>
        <p>아직 분석할 세션 데이터가 없습니다</p>
        {externalSection}
      </div>
    );
  }

  const bucket = programBuckets[index]!;
  const groupEntries = Object.entries(bucket.groups) as [MuscleGroup, GroupStats][];

  return (
    <div>
      <h2>주간 분석</h2>
      <div>
        <button
          type="button"
          onClick={() => setManualIndex(Math.max(0, index - 1))}
          disabled={index === 0}
        >
          이전 주
        </button>
        <span data-testid="analytics-week-label">
          {" "}
          {bucket.cycleIndex + 1}사이클 {bucket.week + 1}주차{" "}
        </span>
        <button
          type="button"
          onClick={() => setManualIndex(Math.min(programBuckets.length - 1, index + 1))}
          disabled={index === programBuckets.length - 1}
        >
          다음 주
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th>부위</th>
            <th>유효세트</th>
            <th>톤수</th>
            <th>빈도</th>
          </tr>
        </thead>
        <tbody>
          {groupEntries.map(([group, stats]) => (
            <tr key={group} data-testid={`analytics-row-${group}`}>
              <td>{GROUP_LABELS[group]}</td>
              <td data-testid={`analytics-validSets-${group}`}>{stats.validSets}</td>
              <td data-testid={`analytics-tonnage-${group}`}>{stats.tonnage}</td>
              <td data-testid={`analytics-frequency-${group}`}>{stats.frequency}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>{LOWER_BODY_FOOTNOTE}</p>
      {externalSection}
    </div>
  );
}
