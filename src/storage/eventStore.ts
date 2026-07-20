import { db, type ExternalSessionRecord } from "./db";
import { programKey } from "../domain/foldSupport";
import { sortByAtId } from "../domain/order";
import type {
  SetRecord,
  CorrectionRecord,
  DecisionEvent,
  SessionCompleted,
  ProgramDefinition,
  ProgramInstanceState,
  FoldInput,
} from "../domain/types.ts";
import type {
  BodyMetric,
  InjuryLog,
  SessionNote,
  ExerciseComment,
  ActivitySegment,
  SetTiming,
} from "./trackingTypes";

export async function appendSet(rec: SetRecord): Promise<void> {
  await db.setRecords.put(rec);
}

export async function appendCorrection(rec: CorrectionRecord): Promise<void> {
  await db.corrections.put(rec);
}

export async function appendDecision(rec: DecisionEvent): Promise<void> {
  await db.decisions.put(rec);
}

export async function appendSession(rec: SessionCompleted): Promise<void> {
  await db.sessions.put(rec);
}

export async function upsertProgramVersion(program: ProgramDefinition): Promise<void> {
  await db.programVersions.put({ ...program, _key: programKey(program.id, program.version) });
}

export async function getProgram(id: string, version: number): Promise<ProgramDefinition | undefined> {
  const row = await db.programVersions.get(programKey(id, version));
  if (!row) return undefined;
  const { _key, ...program } = row;
  return program;
}

export async function listLibrary(): Promise<ProgramDefinition[]> {
  const entries = await db.library.toArray();
  const allVersions = await db.programVersions.toArray();
  const result: ProgramDefinition[] = [];
  for (const entry of entries) {
    const versions = allVersions.filter((v) => v.id === entry.programId);
    if (versions.length === 0) continue;
    const latest = versions.reduce((a, b) => (b.version > a.version ? b : a));
    const { _key, ...program } = latest;
    result.push(program);
  }
  return result;
}

/** 라이브러리에 프로그램 등록 — Task 5(온보딩) 최초 시드용, 스토어 캡슐화 유지(스크린이 db 직접 참조 안 함) */
export async function addToLibrary(programId: string, addedAt: string): Promise<void> {
  await db.library.put({ programId, addedAt });
}

/**
 * Task 7(C2, 백업) — library 테이블 원본 그대로(programId/addedAt, listLibrary()처럼 programVersions와
 * 조인해 병합하지 않음). listLibrary()는 이 둘을 합쳐 최신 버전만 남기며 addedAt을 버려 무손실 왕복이
 * 안 되므로, 백업 내보내기는 이 원본 함수를 쓴다.
 */
export async function getLibraryEntries(): Promise<{ programId: string; addedAt: string }[]> {
  return db.library.toArray();
}

/** Task 7(C2, 백업) — programVersions 테이블 전 버전(fork 포함) 그대로, 조인 없음. */
export async function getAllProgramVersions(): Promise<ProgramDefinition[]> {
  return db.programVersions.toArray();
}

export async function getInstanceState(): Promise<ProgramInstanceState | undefined> {
  const row = await db.instanceState.get("active");
  if (!row) return undefined;
  const { _id, ...state } = row;
  return state;
}

export async function setInstanceState(s: ProgramInstanceState): Promise<void> {
  await db.instanceState.put({ ...s, _id: "active" });
}

/**
 * 온보딩 최초 시드 — programVersions upsert → library 등록 → instanceState 설정 → TM 시드 결정 N개를
 * 하나의 Dexie 트랜잭션으로 묶는다(Stage1-R T3, 감사 robustness-high). 중간 실패 시 4테이블 전부
 * 롤백되어 부분쓰기·중복 seed 오염을 막는다. 트랜잭션 내부는 기존 export 함수를 그대로 호출 —
 * Dexie의 ambient transaction이 자동 전파되므로 각 함수는 무변경.
 */
export async function seedOnboarding(
  program: ProgramDefinition,
  libraryEntry: { programId: string; addedAt: string },
  instanceState: ProgramInstanceState,
  decisions: DecisionEvent[],
): Promise<void> {
  await db.transaction(
    "rw",
    [db.programVersions, db.library, db.instanceState, db.decisions],
    async () => {
      await upsertProgramVersion(program);
      await addToLibrary(libraryEntry.programId, libraryEntry.addedAt);
      await setInstanceState(instanceState);
      for (const decision of decisions) {
        await appendDecision(decision);
      }
    },
  );
}

/** 외부(크로스핏 등) 세션 기록(Stage1-C3 T4). */
export async function appendExternalSession(rec: ExternalSessionRecord): Promise<void> {
  await db.externalSessions.put(rec);
}

/** 외부 세션 전체 조회(Stage1-C3 T4) — 저장 원본 그대로(id/at 포함). */
export async function listExternalSessions(): Promise<ExternalSessionRecord[]> {
  return db.externalSessions.toArray();
}

/** 체성분 기록 추가(UI5 T1) — 몸무게·체지방 중 하나만 있어도 허용, fold 입력 밖(동결 대상 아님). */
export async function appendBodyMetric(rec: BodyMetric): Promise<void> {
  await db.bodyMetrics.put(rec);
}

/** 체성분 기록 전체 조회, at 오름차순(오래된 것부터 — 대시보드 라인차트가 시간순으로 소비). */
export async function listBodyMetrics(): Promise<BodyMetric[]> {
  return sortByAtId(await db.bodyMetrics.toArray());
}

/** 부상 기록 추가(UI5 T1). */
export async function addInjury(rec: InjuryLog): Promise<void> {
  await db.injuries.put(rec);
}

/** 부상 해소 처리 — 기존 레코드의 resolvedAt만 갱신(나머지 필드 보존). */
export async function resolveInjury(id: string, resolvedAt: string): Promise<void> {
  await db.injuries.update(id, { resolvedAt });
}

/** 부상 기록 전체 조회, startedAt 오름차순(동률이면 id로 타이브레이크). */
export async function listInjuries(): Promise<InjuryLog[]> {
  const rows = await db.injuries.toArray();
  return [...rows].sort((a, b) =>
    a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
}

/** 세션 코멘트 upsert(UI5 T1) — id 기준 put(Dexie 업서트 의미론, 기존 append 계열과 동일 구현). */
export async function upsertSessionNote(rec: SessionNote): Promise<void> {
  await db.sessionNotes.put(rec);
}

/** 특정 세션의 코멘트 조회 — 동일 sessionId로 여러 번 upsert된 경우 가장 최근(at) 1건을 반환한다. */
export async function getSessionNote(sessionId: string): Promise<SessionNote | undefined> {
  const rows = await db.sessionNotes.toArray();
  const matching = rows.filter((r) => r.sessionId === sessionId);
  if (matching.length === 0) return undefined;
  return sortByAtId(matching).at(-1);
}

/** 세션 코멘트 전체 조회(UI5 T1, 백업 export용 — getSessionNote는 단일 sessionId 조회라 전체 스냅샷에
 * 쓸 수 없다), at 오름차순. */
export async function listSessionNotes(): Promise<SessionNote[]> {
  return sortByAtId(await db.sessionNotes.toArray());
}

/** 운동 코멘트 upsert(UI5 T1) — id 기준 put. */
export async function upsertExerciseComment(rec: ExerciseComment): Promise<void> {
  await db.exerciseComments.put(rec);
}

/** 운동 코멘트 조회 — exerciseId 지정 시 해당 운동만, 미지정 시 전체(둘 다 at 오름차순). */
export async function listExerciseComments(exerciseId?: string): Promise<ExerciseComment[]> {
  const rows = await db.exerciseComments.toArray();
  const filtered = exerciseId ? rows.filter((r) => r.exerciseId === exerciseId) : rows;
  return sortByAtId(filtered);
}

/** 활동 구간 시작(UI11) — 새 구간 put. "동시 1개만 진행" 규칙은 여기서 강제하지 않는다(단순 CRUD) —
 * programStore.startActivity가 기존 진행 구간을 먼저 종료시키는 오케스트레이션을 담당. */
export async function startActivitySegment(rec: ActivitySegment): Promise<void> {
  await db.activitySegments.put(rec);
}

/** 활동 구간 종료(UI11) — endedAt·durationSec만 갱신(나머지 필드 보존), resolveInjury와 동일 패턴. */
export async function endActivitySegment(id: string, endedAt: string, durationSec: number): Promise<void> {
  await db.activitySegments.update(id, { endedAt, durationSec });
}

/** 활동 구간 조회(UI11) — sessionId 지정 시 해당 세션만, 미지정 시 전체. startedAt 오름차순(동률이면 id). */
export async function listActivitySegments(sessionId?: string): Promise<ActivitySegment[]> {
  const rows = await db.activitySegments.toArray();
  const filtered = sessionId !== undefined ? rows.filter((r) => r.sessionId === sessionId) : rows;
  return [...filtered].sort((a, b) =>
    a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
}

/** 세트 소요시간 upsert(UI11) — id(=대상 SetRecord.id) 기준 put, 1:1. */
export async function upsertSetTiming(rec: SetTiming): Promise<void> {
  await db.setTimings.put(rec);
}

/** 세트 소요시간 조회(UI11) — sessionId 지정 시 해당 세션만, 미지정 시 전체. startedAt 오름차순. */
export async function listSetTimings(sessionId?: string): Promise<SetTiming[]> {
  const rows = await db.setTimings.toArray();
  const filtered = sessionId !== undefined ? rows.filter((r) => r.sessionId === sessionId) : rows;
  return [...filtered].sort((a, b) =>
    a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
}

export async function loadFoldInput(): Promise<FoldInput> {
  const [sets, corrections, decisions, sessions, programVersions] = await Promise.all([
    db.setRecords.toArray(),
    db.corrections.toArray(),
    db.decisions.toArray(),
    db.sessions.toArray(),
    db.programVersions.toArray(),
  ]);
  const programs = new Map<string, ProgramDefinition>();
  for (const row of programVersions) {
    const { _key, ...program } = row;
    programs.set(_key, program);
  }
  return { sets, corrections, decisions, sessions, programs };
}
