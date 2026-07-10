import {
  loadFoldInput,
  getLibraryEntries,
  getAllProgramVersions,
  getInstanceState,
  appendSet,
  appendCorrection,
  appendDecision,
  appendSession,
  upsertProgramVersion,
  addToLibrary,
  setInstanceState,
  listExternalSessions,
  appendExternalSession,
} from "../storage/eventStore";
import { isIOS } from "./platform";
import type {
  SetRecord,
  CorrectionRecord,
  DecisionEvent,
  SessionCompleted,
  ProgramDefinition,
  ProgramInstanceState,
} from "../domain/types.ts";
import type { ExternalSessionRecord } from "../storage/db";

/**
 * Task 7(C2) — JSON 백업 내보내기/가져오기(스펙 §2-8, §3.3).
 * 스토리지 캡슐화 유지(db 직접 참조 없음) — eventStore.ts의 함수만 조합한다.
 */

const SCHEMA_VERSION = 1 as const;

export type BackupSnapshot = {
  schemaVersion: 1;
  sets: SetRecord[];
  corrections: CorrectionRecord[];
  decisions: DecisionEvent[];
  sessions: SessionCompleted[];
  /** 프로그램 정의 전 버전(fork 포함) — getAllProgramVersions() 원본. */
  programs: ProgramDefinition[];
  /** library 테이블 원본(programId/addedAt) — listLibrary()의 조인 병합 결과가 아님(무손실 왕복). */
  library: { programId: string; addedAt: string }[];
  instanceState?: ProgramInstanceState;
  /** 외부(크로스핏 등) 세션 원본(Stage1-C3 T4). schemaVersion은 그대로 1 유지 — 옛 백업(이 필드
   * 없음)도 importSnapshot에서 `?? []`로 하위호환 수용한다. */
  externalSessions: ExternalSessionRecord[];
};

/**
 * 전체 백업 스냅샷 생성. loadFoldInput()에서 sets/corrections/decisions/sessions를 가져오고,
 * "programs" 필드는 loadFoldInput().programs(Map)를 직접 순회해 변환하는 대신 getAllProgramVersions()를
 * 그대로 쓴다 — 둘 다 근본적으로 같은 원본(db.programVersions.toArray(), 무필터)에서 나오므로
 * 동일 쿼리를 두 번 다른 형태로 담을 필요가 없다(Map→array 변환 요구는 이미-배열인 소스 재사용으로 충족).
 */
export async function exportSnapshot(): Promise<BackupSnapshot> {
  const [foldInput, library, programs, instanceState, externalSessions] = await Promise.all([
    loadFoldInput(),
    getLibraryEntries(),
    getAllProgramVersions(),
    getInstanceState(),
    listExternalSessions(),
  ]);
  const snapshot: BackupSnapshot = {
    schemaVersion: SCHEMA_VERSION,
    sets: foldInput.sets,
    corrections: foldInput.corrections,
    decisions: foldInput.decisions,
    sessions: foldInput.sessions,
    programs,
    library,
    externalSessions,
  };
  if (instanceState) snapshot.instanceState = instanceState;
  return snapshot;
}

/**
 * 백업 스냅샷 가져오기. schemaVersion !== 1이면 마이그레이션 없이 즉시 거부(DB 변경 없음 — 이 체크가
 * 어떤 upsert보다 먼저 실행된다). 통과 시 각 레코드를 기존 upsert 함수로 재-append —
 * Dexie put 업서트 의미론으로 id 합집합 병합(덮어쓰지 않음, T1/C1에서 확립된 계약 재사용).
 */
export async function importSnapshot(data: object): Promise<void> {
  const snapshot = data as Partial<BackupSnapshot>;
  if (snapshot.schemaVersion !== 1) {
    throw new Error(
      `지원하지 않는 백업 형식입니다(schemaVersion=${String(snapshot.schemaVersion)}). ` +
        "이 앱은 schemaVersion 1만 지원하며 별도 마이그레이션 없이 가져오기를 거부합니다.",
    );
  }

  const sets = snapshot.sets ?? [];
  const corrections = snapshot.corrections ?? [];
  const decisions = snapshot.decisions ?? [];
  const sessions = snapshot.sessions ?? [];
  const programs = snapshot.programs ?? [];
  const library = snapshot.library ?? [];
  // 하위호환: 이 필드가 없는 옛 백업(externalSessions 도입 전, schemaVersion은 그대로 1)도
  // `?? []`로 그대로 수용 — 스냅샷 schemaVersion은 올리지 않는다.
  const externalSessions = snapshot.externalSessions ?? [];

  await Promise.all([
    ...sets.map((s) => appendSet(s)),
    ...corrections.map((c) => appendCorrection(c)),
    ...decisions.map((d) => appendDecision(d)),
    ...sessions.map((s) => appendSession(s)),
    ...programs.map((p) => upsertProgramVersion(p)),
    ...library.map((l) => addToLibrary(l.programId, l.addedAt)),
    ...externalSessions.map((e) => appendExternalSession(e)),
  ]);

  if (snapshot.instanceState) {
    await setInstanceState(snapshot.instanceState);
  }
}

/**
 * 스냅샷을 파일로 내보내기 — iOS: Web Share API(파일 첨부, navigator.canShare가 지원할 때만) 시도 →
 * 미지원 시 클립보드 텍스트 복사 → 클립보드 API도 없으면(구형 Safari 등) 아래 다운로드 분기로 폴스루.
 * 그 외 플랫폼(또는 위 iOS 분기가 전부 불가한 경우): <a download> blob URL 클릭.
 * 순수 로직만 담당(호출부인 SettingsScreen이 에러 표시를 맡는다) — 실패 시 그대로 throw.
 */
export async function shareOrDownloadSnapshot(snapshot: BackupSnapshot): Promise<void> {
  const json = JSON.stringify(snapshot, null, 2);
  const fileName = "workout-backup.json";

  if (isIOS()) {
    const file = new File([json], fileName, { type: "application/json" });
    const canShareFiles =
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] });
    if (canShareFiles) {
      await navigator.share({ files: [file], title: "운동 백업" });
      return;
    }
    if (typeof navigator.clipboard?.writeText === "function") {
      await navigator.clipboard.writeText(json);
      return;
    }
  }

  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/** JSON 문자열 파싱 — 실패 시 크래시 대신 명시적 에러를 throw(호출부가 catch해 인라인 안내로 표시). */
export function parseSnapshotJSON(text: string): object {
  try {
    return JSON.parse(text) as object;
  } catch {
    throw new Error("올바른 JSON 파일이 아닙니다 — 백업 파일을 다시 확인해주세요.");
  }
}
