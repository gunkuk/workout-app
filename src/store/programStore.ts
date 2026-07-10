import { create } from "zustand";
import { loadFoldInput, getInstanceState, listLibrary } from "../storage/eventStore";
import { foldState } from "../domain/fold";
import { rollingCyclePos } from "../domain/cyclePos";
import { buildWorkoutPlan, type WorkoutPlan } from "../domain/programEngine";
import { DEFAULT_PLATES } from "../domain/plates";
import { programKey } from "../domain/foldSupport";
import type {
  ProgramDefinition,
  ProgramInstanceState,
  AccessoryState,
  Proposal,
  CyclePos,
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
  load(): Promise<void>;
  refreshAfterWrite(): Promise<void>;
};

const EMPTY_STATE = {
  status: "empty" as const,
  activeProgram: undefined,
  tm: {},
  accessories: {},
  pendingProposals: [],
  todayPos: undefined,
  todayPlan: null,
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
    // MVP는 rolling 모드만 (calendar UI는 Plan C2).
    const todayPos = rollingCyclePos(activeProgram, input.sessions);
    const todayPlan = buildWorkoutPlan(activeProgram, todayPos, folded.tm, folded.accessories, DEFAULT_PLATES);

    set({
      status: "ready",
      activeProgram,
      instanceState,
      tm: folded.tm,
      accessories: folded.accessories,
      pendingProposals: folded.pendingProposals,
      todayPos,
      todayPlan,
    });
  },

  async refreshAfterWrite() {
    await get().load();
  },
}));
