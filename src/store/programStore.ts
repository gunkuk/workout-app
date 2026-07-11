import { create } from "zustand";
import {
  loadFoldInput,
  getInstanceState,
  listLibrary,
  appendSet,
  appendCorrection,
  appendSession,
  appendDecision,
  seedOnboarding,
  upsertProgramVersion,
  addToLibrary,
  setInstanceState,
  appendExternalSession,
  appendBodyMetric,
  addInjury as addInjuryRow,
  resolveInjury as resolveInjuryRow,
  upsertSessionNote,
} from "../storage/eventStore";
import type { ExternalSessionRecord } from "../storage/db";
import type { BodyMetric, InjuryLog, SessionNote } from "../storage/trackingTypes";
import { foldState } from "../domain/fold";
import { rollingCyclePos, calendarCyclePos, nextCyclePos } from "../domain/cyclePos";
import { buildWorkoutPlan, type WorkoutPlan } from "../domain/programEngine";
import { USER_PLATES } from "../lib/plateConfig";
import { programKey } from "../domain/foldSupport";
import { sessionIdFor } from "../domain/sessionId";
import { activeSessions } from "./sessionRevocation";
import type {
  ProgramDefinition,
  ProgramInstanceState,
  AccessoryState,
  Proposal,
  CyclePos,
  SetRecord,
  CorrectionRecord,
  SessionCompleted,
  DecisionEvent,
} from "../domain/types.ts";

export type ProgramStoreState = {
  status: "loading" | "ready" | "empty";
  activeProgram?: ProgramDefinition;
  instanceState?: ProgramInstanceState;
  tm: Record<string, number>;
  accessories: Record<string, AccessoryState>;
  pendingProposals: Proposal[];
  todayPos?: CyclePos;
  todayPlan: WorkoutPlan | null;
  /** calendar 모드 휴식일/시작전 상태(Stage1-C3 T3) — rolling 모드는 항상 undefined. */
  restDay?: "rest" | "notStarted";
  load(): Promise<void>;
  refreshAfterWrite(): Promise<void>;
  /** 세트 기록 — 낙관적 UI 시맨틱 보존을 위해 refresh(재fold) 하지 않는다(Stage1-R T3). */
  recordSet(rec: SetRecord): Promise<void>;
  /** 정정 기록 — recordSet과 동일하게 refresh 없음(Stage1-R T3). */
  recordCorrection(rec: CorrectionRecord): Promise<void>;
  /** 세션 완료 기록 후 재fold. */
  completeSession(rec: SessionCompleted): Promise<void>;
  /** 온보딩 최초 시드(트랜잭션) 후 재fold. */
  seedProgram(
    program: ProgramDefinition,
    libraryEntry: { programId: string; addedAt: string },
    instanceState: ProgramInstanceState,
    decisions: DecisionEvent[],
  ): Promise<void>;
  /** 제안 수락 결정 기록 후 재fold. */
  acceptProposal(decision: DecisionEvent): Promise<void>;
  /** 가져오기(파일/URL) — 프로그램 버전 upsert + 라이브러리 등록(idempotent) 후 재fold(Stage1-C3 T2). */
  importProgram(program: ProgramDefinition): Promise<void>;
  /** 라이브러리 전환 — 새 InstanceState 설정 후 재fold. 과거 이력(SetRecord 등)은 불변(Stage1-C3 T2, 스펙 §2-7). */
  switchProgram(instanceState: ProgramInstanceState): Promise<void>;
  /** 진행 위치 조정(Stage1-UI7, 뒤로 이동 Stage1-UI9) — 롤링 커서를 target으로 옮긴다.
   * target이 현재보다 앞(전진)이면: 현재~target(제외) 사이 모든 위치에 SetRecord 없는
   * SessionCompleted(status:"completed")를 append(→ 판정 no-op, TM 불변) — 실제로 훈련했지만
   * 앱에 기록 안 한 기간을 빈 완료로 채우는 것.
   * target이 현재보다 뒤(후진)면: 지나간 SessionCompleted들을 삭제하지 않고 CorrectionRecord
   * (revoked:true, supersedes=session.id)로 취소한다 — append-only 계약·백업 id-union 병합을
   * 보존하기 위함(src/store/sessionRevocation.ts 참고). 반환값 revokedReal은 그 중 실제 기록
   * (warmup 아닌 SetRecord)이 있던 세션 수 — 0이면 전진/no-op.
   * rolling 모드 전용(calendar는 날짜로 커서가 정해져 조정 개념이 없음) — 아니면 throw.
   * target이 이미 현재 위치면 no-op. target 도달 불가(예: 프로그램에 없는 dayOrdinal)면
   * 아무 것도 쓰지 않고 throw. */
  fastForwardTo(target: CyclePos): Promise<{ revokedReal: number }>;
  /** 외부(크로스핏 등) 세션 기록 후 재fold(Stage1-C3 T4) — programStore 파생 상태엔 직접 영향 없지만
   * 다른 mutation과 동일하게 기록 후 load()로 일관 새로고침한다. */
  recordExternalSession(rec: ExternalSessionRecord): Promise<void>;
  /** 체성분 기록 추가(UI5 T2) — fold 입력 밖(§설계원칙 동결)이라 재fold 불필요, eventStore 얇은 위임. */
  addBodyMetric(rec: BodyMetric): Promise<void>;
  /** 부상 기록 추가(UI5 T2) — fold 입력 밖, 재fold 불필요. */
  addInjury(rec: InjuryLog): Promise<void>;
  /** 부상 해소 처리(UI5 T2) — resolvedAt만 갱신, fold 입력 밖. */
  resolveInjury(id: string, resolvedAt: string): Promise<void>;
  /** 세션 코멘트 upsert(UI5 T2) — fold 입력 밖. */
  addSessionNote(rec: SessionNote): Promise<void>;
};

/** program 순서상 CyclePos의 선형 인덱스(Stage1-UI9) — target·현재 위치의 전후(뒤로 이동인지
 * 전진인지) 비교에 쓴다. dayIndexInWeek는 ordinal 값이 아니라 그 주 days 배열 내 인덱스
 * (*100 — 한 주가 100일을 넘는 프로그램은 없다는 가정). 알 수 없는 dayOrdinal(프로그램에 없는
 * 위치)이면 쓰기 전에 throw. */
function linearIndexOf(program: ProgramDefinition, pos: CyclePos): number {
  const days = program.weeks[pos.week]?.days;
  const dayIndex = days ? days.findIndex((d) => d.ordinal === pos.dayOrdinal) : -1;
  if (!days || dayIndex < 0) {
    throw new Error("이동할 수 없는 위치입니다 — 프로그램에 없는 위치(요일)인지 확인해주세요.");
  }
  return (pos.cycleIndex * program.weeks.length + pos.week) * 100 + dayIndex;
}

/** from에서 target까지 SetRecord 없는 SessionCompleted(status:"completed")를 순서대로 만든다
 * (append는 호출부 몫 — 이 함수는 쓰기 없이 목록만 구성). fastForwardTo의 전진 경로와, 후진 후
 * target에 못 미친 나머지 구간을 마저 메우는 경로 둘 다 재사용한다. */
function forwardFillRecords(program: ProgramDefinition, from: CyclePos, target: CyclePos): SessionCompleted[] {
  const samePos = (a: CyclePos, b: CyclePos) =>
    a.cycleIndex === b.cycleIndex && a.week === b.week && a.dayOrdinal === b.dayOrdinal;
  const MAX_STEPS = 200;
  const base = Date.now();
  const records: SessionCompleted[] = [];
  let cursor = from;
  while (!samePos(cursor, target)) {
    if (records.length >= MAX_STEPS) {
      throw new Error("목표 위치로 이동할 수 없습니다 — 프로그램에 없는 위치(요일)인지 확인해주세요.");
    }
    records.push({
      id: crypto.randomUUID(),
      // at을 1ms씩 증가시켜 (at,id) 정렬이 항상 이 순회 순서와 일치하게 한다 — 같은 tick에
      // 여러 건을 append하면 sortByAtId의 id(랜덤 UUID) tie-break로 순서가 뒤섞일 수 있음.
      at: new Date(base + records.length).toISOString(),
      sessionId: sessionIdFor(program.id, program.version, cursor),
      cyclePos: cursor,
      status: "completed",
      programId: program.id,
      programVersion: program.version,
      schemaVersion: 1,
    });
    cursor = nextCyclePos(program, cursor);
  }
  return records;
}

const EMPTY_STATE = {
  status: "empty" as const,
  activeProgram: undefined,
  tm: {},
  accessories: {},
  pendingProposals: [],
  todayPos: undefined,
  todayPlan: null,
  // calendar 모드에서 empty로 전환될 때 이전 값이 잔존하지 않도록 명시 리셋
  restDay: undefined,
};

export const useProgramStore = create<ProgramStoreState>()((set, get) => ({
  status: "loading",
  tm: {},
  accessories: {},
  pendingProposals: [],
  todayPlan: null,

  async load() {
    const [input, instanceState, library] = await Promise.all([
      loadFoldInput(),
      getInstanceState(),
      listLibrary(),
    ]);

    // 라이브러리·인스턴스 둘 다 있어야 ready — 온보딩 전(둘 중 하나라도 없음)은 empty.
    if (library.length === 0 || !instanceState) {
      set({ ...EMPTY_STATE, instanceState });
      return;
    }

    const activeProgram = input.programs.get(programKey(instanceState.programId, instanceState.programVersion));
    if (!activeProgram) {
      set({ ...EMPTY_STATE, instanceState });
      return;
    }

    // foldState는 원본 input을 그대로 받는다 — fold/analytics는 동결 도메인이라 세션 취소(revoked
    // correction)를 모르며, 이는 의도된 한계다(src/store/sessionRevocation.ts JSDoc 참고): 취소된
    // 세션이 이미 반영한 TM 판정·analytics 기여는 그대로 남고, 필요하면 사용자가 설정에서 TM을
    // 수동으로 맞춘다. 롤링 커서(아래)만 활성 세션 기준으로 계산해 "뒤로 이동"이 실제로 커서를
    // 되돌리게 한다.
    const folded = foldState(input);
    const liveSessions = activeSessions(input.sessions, input.corrections);

    if (instanceState.mode === "calendar") {
      const todayISO = new Date().toISOString().slice(0, 10);
      const cursor = calendarCyclePos(activeProgram, instanceState, todayISO);
      if ("notStarted" in cursor) {
        set({
          status: "ready",
          activeProgram,
          instanceState,
          tm: folded.tm,
          accessories: folded.accessories,
          pendingProposals: folded.pendingProposals,
          todayPos: undefined,
          todayPlan: null,
          restDay: "notStarted",
        });
        return;
      }
      if (cursor.candidateDayOrdinal === null) {
        set({
          status: "ready",
          activeProgram,
          instanceState,
          tm: folded.tm,
          accessories: folded.accessories,
          pendingProposals: folded.pendingProposals,
          todayPos: undefined,
          todayPlan: null,
          restDay: "rest",
        });
        return;
      }
      const todayPos: CyclePos = {
        cycleIndex: cursor.cycleIndex,
        week: cursor.week,
        dayOrdinal: cursor.candidateDayOrdinal,
      };
      const todayPlan = buildWorkoutPlan(activeProgram, todayPos, folded.tm, folded.accessories, USER_PLATES);
      set({
        status: "ready",
        activeProgram,
        instanceState,
        tm: folded.tm,
        accessories: folded.accessories,
        pendingProposals: folded.pendingProposals,
        todayPos,
        todayPlan,
        restDay: undefined,
      });
      return;
    }

    const todayPos = rollingCyclePos(activeProgram, liveSessions);
    const todayPlan = buildWorkoutPlan(activeProgram, todayPos, folded.tm, folded.accessories, USER_PLATES);

    set({
      status: "ready",
      activeProgram,
      instanceState,
      tm: folded.tm,
      accessories: folded.accessories,
      pendingProposals: folded.pendingProposals,
      todayPos,
      todayPlan,
      restDay: undefined,
    });
  },

  async refreshAfterWrite() {
    await get().load();
  },

  async recordSet(rec) {
    await appendSet(rec);
  },

  async recordCorrection(rec) {
    await appendCorrection(rec);
  },

  async completeSession(rec) {
    await appendSession(rec);
    await get().load();
  },

  async seedProgram(program, libraryEntry, instanceState, decisions) {
    await seedOnboarding(program, libraryEntry, instanceState, decisions);
    await get().load();
  },

  async acceptProposal(decision) {
    await appendDecision(decision);
    await get().load();
  },

  async importProgram(program) {
    await upsertProgramVersion(program);
    await addToLibrary(program.id, new Date().toISOString());
    await get().load();
  },

  async switchProgram(instanceState) {
    await setInstanceState(instanceState);
    await get().load();
  },

  async fastForwardTo(target) {
    const { activeProgram, instanceState } = get();
    if (!activeProgram || !instanceState || instanceState.mode !== "rolling") {
      throw new Error("진행 위치 조정은 롤링 모드에서 활성 프로그램이 있을 때만 가능합니다.");
    }
    const program = activeProgram;

    // 현재 커서는 저장된 store 상태가 아니라 이벤트 로그에서 다시 계산 — load() 여부와 무관하게 정확.
    // 취소(revoked)된 세션은 커서 계산에서 제외(activeSessions) — 그래야 뒤로 이동이 실제로 커서를
    // 되돌린다.
    const input = await loadFoldInput();
    const liveSessions = activeSessions(input.sessions, input.corrections);
    const current = rollingCyclePos(program, liveSessions);

    // target·current를 먼저 선형 인덱스로 검증 — 프로그램에 없는 위치(예: dayOrdinal 99)면
    // 아무 것도 쓰지 않고 여기서 throw(Stage1-UI9 §2).
    const targetLinear = linearIndexOf(program, target);
    const currentLinear = linearIndexOf(program, current);

    if (targetLinear === currentLinear) return { revokedReal: 0 };

    if (targetLinear > currentLinear) {
      // 전진 — 기존 동작 그대로(빈 완료 세션으로 채움, TM 무영향).
      const records = forwardFillRecords(program, current, target);
      for (const rec of records) {
        await appendSession(rec);
      }
      await get().load();
      return { revokedReal: 0 };
    }

    // 후진 — 삭제 대신 CorrectionRecord(revoked:true)로 취소(설계: append-only + 백업 id-union
    // 병합 보존, src/store/sessionRevocation.ts 참고). target 이상 위치의 이 프로그램 라이브
    // 세션을 전부 취소 대상으로 모은다.
    const toRevoke = liveSessions.filter(
      (s) => s.programId === program.id && linearIndexOf(program, s.cyclePos) >= targetLinear,
    );

    const base = Date.now();
    const corrections: CorrectionRecord[] = toRevoke.map((session, i) => ({
      id: crypto.randomUUID(),
      supersedes: session.id,
      revoked: true,
      // at을 1ms씩 증가 — forward-fill과 동일한 이유(sortByAtId tie-break 안정화).
      at: new Date(base + i).toISOString(),
      schemaVersion: 1,
    }));

    // 실제 기록(warmup 아닌 SetRecord)이 있던 세션 수 — UI가 "TM은 유지" 안내에 쓴다.
    const revokedReal = toRevoke.filter((session) =>
      input.sets.some((s) => s.sessionId === session.sessionId && s.setType !== "warmup"),
    ).length;

    for (const c of corrections) {
      await appendCorrection(c);
    }

    // 취소 후에도 남은 세션들의 커서가 target에 못 미치면(예: 취소 대상 자체가 없었거나, 프로그램
    // 최초 위치까지 되돌아간 경우) 남은 구간을 전진-채움으로 마저 메워 정확히 target에 착지시킨다.
    const remainingLive = liveSessions.filter((s) => !toRevoke.includes(s));
    const cursorAfterRevoke = rollingCyclePos(program, remainingLive);
    if (linearIndexOf(program, cursorAfterRevoke) < targetLinear) {
      const fillRecords = forwardFillRecords(program, cursorAfterRevoke, target);
      for (const rec of fillRecords) {
        await appendSession(rec);
      }
    }

    await get().load();
    return { revokedReal };
  },

  async recordExternalSession(rec) {
    await appendExternalSession(rec);
    await get().load();
  },

  async addBodyMetric(rec) {
    await appendBodyMetric(rec);
  },

  async addInjury(rec) {
    await addInjuryRow(rec);
  },

  async resolveInjury(id, resolvedAt) {
    await resolveInjuryRow(id, resolvedAt);
  },

  async addSessionNote(rec) {
    await upsertSessionNote(rec);
  },
}));
