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
import { rollingCyclePos, calendarCyclePos } from "../domain/cyclePos";
import { buildWorkoutPlan, type WorkoutPlan } from "../domain/programEngine";
import { USER_PLATES } from "../lib/plateConfig";
import { programKey } from "../domain/foldSupport";
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

    const folded = foldState(input);

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

    const todayPos = rollingCyclePos(activeProgram, input.sessions);
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
