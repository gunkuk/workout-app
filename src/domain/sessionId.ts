import type { CyclePos } from "./types.ts";

/**
 * sessionId 결정론적 생성 — SetRecord.sessionId와 SessionCompleted.sessionId 양쪽에 반드시
 * 이 동일한 문자열을 재사용해야 한다. fold.ts의 judgingSetsForSlot이 그날 SetRecord.sessionId와
 * 정확히 매치되어야 TM 자동증량·주간분석이 작동한다(계획 "필수(fold 조인 계약)" 참조) —
 * 다른 id(예: 새 UUID)를 쓰면 판정이 전부 no-op으로 조용히 실패한다.
 * rolling 모드 가정이라 같은 사이클-주-요일을 재방문해도 같은 세션 id.
 *
 * domain/으로 이동(Stage1-UI7) — programStore(fastForwardTo)도 재사용해야 하는데 store는
 * screens를 import할 수 없다(import/no-restricted-paths) — 애초에 React 의존 없는 순수 함수라
 * domain이 원래 자리. src/screens/today/sessionId.ts는 하위호환 re-export만 남긴다.
 */
export function sessionIdFor(programId: string, programVersion: number, pos: CyclePos): string {
  return `${programId}@${programVersion}:${pos.cycleIndex}-${pos.week}-${pos.dayOrdinal}`;
}

/** 슬롯 내 세트 1개의 결정론적 SetRecord id — 복원 시 매칭 키 겸 중복 자동기록 방지 키 */
export function setIdFor(sessionId: string, slotId: string, setType: "work" | "warmup", index: number): string {
  return `${sessionId}-${slotId}-${setType}-${index}`;
}
