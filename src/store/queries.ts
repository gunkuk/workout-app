import { loadFoldInput, listLibrary } from "../storage/eventStore";
import type { FoldInput, ProgramDefinition } from "../domain/types.ts";

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
