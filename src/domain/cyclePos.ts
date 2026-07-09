import type { CyclePos, ProgramDefinition, ProgramInstanceState, SessionCompleted } from "./types.ts";
import { sortByAtId } from "./order";

/** getDay() 0~6 → 한글 요일 (일~토) */
const WEEKDAY_KR = ["일", "월", "화", "수", "목", "금", "토"] as const;

/**
 * dateISO(YYYY-MM-DD)의 로컬 요일.
 * `T00:00:00`(타임존 미지정)을 붙여 로컬 자정으로 파싱 — UTC-shift로 요일이 하루
 * 밀리는 것을 방지한다(`new Date("2026-07-09")`는 UTC 자정이라 서편 타임존에서 하루 전으로 읽힘).
 */
function weekdayKrOf(dateISO: string): string {
  const day = new Date(`${dateISO}T00:00:00`).getDay(); // 0~6, 항상 유효 범위
  return WEEKDAY_KR[day]!;
}

/** 두 YYYY-MM-DD 사이의 정수 일수 차 (로컬 자정 기준, to − from) */
function diffDaysLocal(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO}T00:00:00`).getTime();
  const to = new Date(`${toISO}T00:00:00`).getTime();
  return Math.floor((to - from) / 86400000);
}

/**
 * 그 주 days 배열 순서상 다음 ordinal → 없으면 week+1 첫 day
 * → 없으면 cycleIndex+1, week0 첫 day (스펙 §3.3).
 */
export function nextCyclePos(program: ProgramDefinition, pos: CyclePos): CyclePos {
  const days = program.weeks[pos.week]?.days ?? [];
  const idx = days.findIndex((d) => d.ordinal === pos.dayOrdinal);
  const nextInWeek = idx >= 0 ? days[idx + 1] : undefined;
  if (nextInWeek) {
    return { cycleIndex: pos.cycleIndex, week: pos.week, dayOrdinal: nextInWeek.ordinal };
  }

  const nextWeekDays = program.weeks[pos.week + 1]?.days;
  if (nextWeekDays && nextWeekDays.length > 0) {
    return { cycleIndex: pos.cycleIndex, week: pos.week + 1, dayOrdinal: nextWeekDays[0]!.ordinal };
  }

  const week0FirstDay = program.weeks[0]?.days[0];
  return { cycleIndex: pos.cycleIndex + 1, week: 0, dayOrdinal: week0FirstDay ? week0FirstDay.ordinal : 1 };
}

/**
 * program.id와 programId가 일치하는 세션만 사용(내부 필터 — 프로그램 전환 후 이전
 * 프로그램 세션의 cyclePos 오적용 차단, 스펙 §2-7). completed·skipped 불문 (at,id)
 * 최대 세션의 cyclePos 다음. 없으면 {cycleIndex:0, week:0, dayOrdinal: 첫 day ordinal}.
 */
export function rollingCyclePos(program: ProgramDefinition, sessions: SessionCompleted[]): CyclePos {
  const matching = sessions.filter((s) => s.programId === program.id);
  if (matching.length === 0) {
    const firstDay = program.weeks[0]?.days[0];
    return { cycleIndex: 0, week: 0, dayOrdinal: firstDay ? firstDay.ordinal : 1 };
  }
  const sorted = sortByAtId(matching);
  const last = sorted[sorted.length - 1]!;
  return nextCyclePos(program, last.cyclePos);
}

/**
 * calendar 모드 커서. diffDays = floor((today − startDate)/일) — 음수면 notStarted.
 * wkIdx = floor(diffDays/7); week = wkIdx % weeks.length; cycleIndex = floor(wkIdx / weeks.length).
 * candidateDayOrdinal = 오늘 요일(로컬)과 weekdayHint 일치하는 day의 ordinal, 없으면 null(휴식일).
 * startDate 미설정(anchor.startDate undefined)도 notStarted로 처리(계산 불가).
 */
export function calendarCyclePos(
  program: ProgramDefinition,
  state: ProgramInstanceState,
  todayISO: string
): { cycleIndex: number; week: number; candidateDayOrdinal: number | null } | { notStarted: true } {
  const startDate = state.anchor.startDate;
  if (startDate === undefined) return { notStarted: true };

  const diffDays = diffDaysLocal(startDate, todayISO);
  if (diffDays < 0) return { notStarted: true };

  const totalWeeks = program.weeks.length;
  const wkIdx = Math.floor(diffDays / 7);
  const week = totalWeeks > 0 ? wkIdx % totalWeeks : 0;
  const cycleIndex = totalWeeks > 0 ? Math.floor(wkIdx / totalWeeks) : 0;

  const todayWeekday = weekdayKrOf(todayISO);
  const matchDay = program.weeks[week]?.days.find((d) => d.weekdayHint === todayWeekday);

  return { cycleIndex, week, candidateDayOrdinal: matchDay ? matchDay.ordinal : null };
}

/**
 * 스펙 §3.3 제약 "startDate = 사이클-주 첫 훈련일": startDate 요일 == 첫 week 첫
 * day의 weekdayHint. 힌트 없는 프로그램이거나 startDate 미설정이면 true(검증할 불일치
 * 자체가 없음). 생성 시 강제는 UI(Plan C) 몫 — 여기선 판정 함수만 제공.
 */
export function validateAnchor(program: ProgramDefinition, state: ProgramInstanceState): boolean {
  const firstDayHint = program.weeks[0]?.days[0]?.weekdayHint;
  if (!firstDayHint) return true;
  const startDate = state.anchor.startDate;
  if (startDate === undefined) return true;
  return weekdayKrOf(startDate) === firstDayHint;
}
