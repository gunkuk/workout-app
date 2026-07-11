import type { ProgramDefinition, SessionCompleted, SetRecord } from "../../domain/types.ts";

/**
 * UI5 T2 — 홈 대시보드 "출석·수행 스트립" 순수 파생 로직. 날짜 버킷팅(로컬 타임존, Monday-start 주)이
 * 까다로워 렌더 코드에서 분리해 직접 단위 테스트한다(계획 §4번 항목 "date bucketing is fiddly").
 */

export type AttendanceStatus = "complete" | "partial" | "none";
export type AttendanceWeekColumn = { weekStart: string; cells: AttendanceStatus[] };
export type AttendanceGrid = { weekdays: string[]; weeks: AttendanceWeekColumn[] };

/** Monday-start 요일 표준 순서. */
const WEEKDAY_ORDER = ["월", "화", "수", "목", "금", "토", "일"];
const WEEKDAY_OFFSET: Record<string, number> = Object.fromEntries(WEEKDAY_ORDER.map((w, i) => [w, i]));

/** nSuns 5일 시드 프로그램 관례(화~토) — 활성 프로그램에 weekdayHint가 하나도 없을 때의 기본값. */
const DEFAULT_WEEKDAYS = ["화", "수", "목", "금", "토"];

/**
 * 활성 프로그램의 day.weekdayHint들을 Monday-start 순서로 유일화해 반환.
 * 프로그램이 없거나 hint가 하나도 없으면 기본값(화~토)으로 폴백.
 */
export function trainingWeekdays(program: ProgramDefinition | undefined): string[] {
  if (!program) return DEFAULT_WEEKDAYS;
  const hints = new Set<string>();
  for (const week of program.weeks) {
    for (const day of week.days) {
      if (day.weekdayHint) hints.add(day.weekdayHint);
    }
  }
  if (hints.size === 0) return DEFAULT_WEEKDAYS;
  return WEEKDAY_ORDER.filter((w) => hints.has(w));
}

function localDateStr(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** 로컬 기준 그 날이 속한 주의 월요일 00:00 (Monday-start — 일요일은 "전주" 마지막 날로 취급). */
function mondayOf(d: Date): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = copy.getDay(); // 0=일 .. 6=토
  const diff = dow === 0 ? -6 : 1 - dow;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

/**
 * 날짜별 상태 맵 — 완료 세션이 있으면 "complete"(최우선), 없고 세트기록 또는 skipped 세션이 있으면
 * "partial", 아무 기록도 없으면 (맵에 없음 → 호출부가 "none"으로 취급).
 */
function dayStatusMap(sessions: SessionCompleted[], sets: SetRecord[]): Map<string, AttendanceStatus> {
  const map = new Map<string, AttendanceStatus>();
  for (const s of sets) {
    const key = localDateStr(new Date(s.completedAt));
    if (!map.has(key)) map.set(key, "partial");
  }
  for (const s of sessions) {
    const key = localDateStr(new Date(s.at));
    if (s.status === "completed") {
      map.set(key, "complete");
    } else if (map.get(key) !== "complete") {
      map.set(key, "partial");
    }
  }
  return map;
}

/**
 * 최근 weeksCount(기본 8)주 × 훈련요일 그리드. 오래된 주 → 최신 주(오늘이 속한 주 포함) 순.
 * 주 경계는 Monday-start(월요일 시작) — 일요일은 그 전 월요일이 속한 주의 마지막 칸.
 */
export function buildAttendanceGrid(
  sessions: SessionCompleted[],
  sets: SetRecord[],
  weekdays: string[],
  today: Date,
  weeksCount = 8,
): AttendanceGrid {
  const statusByDate = dayStatusMap(sessions, sets);
  const currentMonday = mondayOf(today);

  const weeks: AttendanceWeekColumn[] = [];
  for (let w = weeksCount - 1; w >= 0; w--) {
    const weekMonday = new Date(currentMonday);
    weekMonday.setDate(weekMonday.getDate() - w * 7);
    const cells: AttendanceStatus[] = weekdays.map((wd) => {
      const offset = WEEKDAY_OFFSET[wd] ?? 0;
      const cellDate = new Date(weekMonday);
      cellDate.setDate(cellDate.getDate() + offset);
      return statusByDate.get(localDateStr(cellDate)) ?? "none";
    });
    weeks.push({ weekStart: localDateStr(weekMonday), cells });
  }
  return { weekdays, weeks };
}

/** 이번 주(그리드 마지막 열) 요약 — "이번 주 n/5 완료 · 수행률 m%" 헤더용(m = completed/전체 훈련일). */
export function thisWeekSummary(grid: AttendanceGrid): { completed: number; total: number; percent: number } {
  const total = grid.weekdays.length;
  const lastWeek = grid.weeks.at(-1);
  if (!lastWeek) return { completed: 0, total, percent: 0 };
  const completed = lastWeek.cells.filter((c) => c === "complete").length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { completed, total, percent };
}
