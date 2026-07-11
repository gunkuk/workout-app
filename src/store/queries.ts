import {
  loadFoldInput,
  listLibrary,
  listExternalSessions as listExternalSessionsStore,
  listBodyMetrics,
  listInjuries,
  getSessionNote,
} from "../storage/eventStore";
import type { FoldInput, ProgramDefinition } from "../domain/types.ts";
export type { ExternalSessionRecord } from "../storage/db";

/**
 * 이벤트 로그 읽기 포털 — loadFoldInput 1:1 위임(Stage1-R T3). 화면들이 storage/eventStore를
 * 직접 import하지 않고 store 경유로 읽게 하는 단일 창구. 소비자 재배선은 T4/T5.
 */
export function loadEventLog(): Promise<FoldInput> {
  return loadFoldInput();
}

/** 라이브러리 목록(각 프로그램 최신 버전) — listLibrary 위임(Stage1-C3 T2). */
export function listPrograms(): Promise<ProgramDefinition[]> {
  return listLibrary();
}

/** 외부(크로스핏 등) 세션 전체 조회 — listExternalSessions 위임(Stage1-C3 T4). */
export function listExternalSessions() {
  return listExternalSessionsStore();
}

/** 체성분 기록 전체 조회 — listBodyMetrics 위임(UI5 T1, 홈 대시보드 카드용). */
export function loadBodyMetrics() {
  return listBodyMetrics();
}

/** 부상 기록 전체 조회 — listInjuries 위임(UI5 T1, 홈 대시보드 카드용). */
export function loadInjuries() {
  return listInjuries();
}

/** 특정 세션의 코멘트 조회 — getSessionNote 위임(UI5 T1). 계획 문서의 "loadSessionNotes"를
 * getSessionNote(sessionId) 실제 시그니처(단일 세션 조회)에 맞춰 단수형으로 명명. */
export function loadSessionNote(sessionId: string) {
  return getSessionNote(sessionId);
}
