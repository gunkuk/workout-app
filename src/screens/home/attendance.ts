import type { ProgramDefinition, SessionCompleted, SetRecord } from "../../domain/types.ts";

/**
 * UI5 T2 — 홈 대시보드 "출석" 카드 순수 파생 로직. 날짜 버킷팅(로컬 타임존, Monday-start 주)이
 * 까다로워 렌더 코드에서 분리해 직접 단위 테스트한다(계획 §4번 항목 "date bucketing is fiddly").
 *
 * UI14 item5 — 주간/4주 스트립을 실제 "월간 달력" 그리드로 교체(buildMonthGrid). 열 = 요일
 * (월~일 7열 고정), 행 = 그 달의 주차, 셀은 날짜 숫자 없이 색상만(완료/부분/없음/훈련일 아님
 * 4종) — 렌더러(HomeScreen)가 숫자를 그리지 않는다는 계약이므로 여기선 상태만 계산해 넘긴다.
 */

export type AttendanceStatus = "complete" | "partial" | "none";
/** 월간 달력 셀 상태 — 기존 3종 + 그 요일이 활성 프로그램의 훈련일이 아닌 경우("off", 은은한 4번째 스타일). */
export type MonthDayStatus = AttendanceStatus | "off";
/** date=null이면 이번 달 밖(주 앞/뒤 패딩) — 렌더러가 빈 칸으로 표시. */
export type MonthCell = { date: string | null; status: MonthDayStatus };
export type MonthGrid = { weekdayLabels: string[]; weeks: MonthCell[][] };

/** Monday-start 요일 표준 순서. */
const WEEKDAY_ORDER = ["월", "화", "수", "목", "금", "토", "일"];

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

/** 로컬 요일 라벨(월~일). */
function weekdayLabelOf(d: Date): string {
  const dow = d.getDay(); // 0=일..6=토
  return WEEKDAY_ORDER[dow === 0 ? 6 : dow - 1]!;
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
 * today가 속한 달의 실제 달력 그리드 — 열은 항상 월~일 7열 고정(요일 라벨), 행은 그 달이 걸치는
 * 주차 수(보통 5~6행). 이번 달 밖 날짜(첫 주 앞/마지막 주 뒤 패딩)는 date:null로 표시해 렌더러가
 * 빈 칸을 그리게 한다. 이번 달 안의 날짜는: 완료/부분/없음(기존 3상태) 중 하나이거나, 그 요일이
 * trainingWeekdaysList에 없으면(활성 프로그램이 그 요일엔 훈련 안 함) "off".
 */
export function buildMonthGrid(
  sessions: SessionCompleted[],
  sets: SetRecord[],
  trainingWeekdaysList: string[],
  today: Date,
): MonthGrid {
  const statusByDate = dayStatusMap(sessions, sets);
  const year = today.getFullYear();
  const month = today.getMonth();

  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  const gridStart = mondayOf(firstOfMonth);
  const gridEndMonday = mondayOf(lastOfMonth);
  const gridEnd = new Date(gridEndMonday);
  gridEnd.setDate(gridEnd.getDate() + 6); // 마지막 주의 일요일까지

  const weeks: MonthCell[][] = [];
  let cursor = new Date(gridStart);
  while (cursor <= gridEnd) {
    const row: MonthCell[] = [];
    for (let i = 0; i < 7; i++) {
      if (cursor.getMonth() !== month) {
        row.push({ date: null, status: "none" });
      } else {
        const dateStr = localDateStr(cursor);
        const recorded = statusByDate.get(dateStr);
        const status: MonthDayStatus =
          recorded ?? (trainingWeekdaysList.includes(weekdayLabelOf(cursor)) ? "none" : "off");
        row.push({ date: dateStr, status });
      }
      cursor = new Date(cursor);
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(row);
  }
  return { weekdayLabels: WEEKDAY_ORDER, weeks };
}

/** 이번 달 요약 — "이번 달 n/m 완료 · 수행률 p%"(m = 이번 달 훈련일 수, off 칸 제외, 패딩 칸 제외). */
export function monthSummary(grid: MonthGrid): { completed: number; total: number; percent: number } {
  let completed = 0;
  let total = 0;
  for (const week of grid.weeks) {
    for (const cell of week) {
      if (cell.date === null || cell.status === "off") continue;
      total += 1;
      if (cell.status === "complete") completed += 1;
    }
  }
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { completed, total, percent };
}
