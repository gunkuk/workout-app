import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  appendSet,
  appendCorrection,
  appendDecision,
  appendSession,
  upsertProgramVersion,
  addToLibrary,
  setInstanceState,
  loadFoldInput,
  getLibraryEntries,
  getInstanceState,
  appendExternalSession,
  listExternalSessions,
} from "../../src/storage/eventStore";
import { programKey } from "../../src/domain/foldSupport";
import {
  exportSnapshot,
  importSnapshot,
  shareOrDownloadSnapshot,
  parseSnapshotJSON,
  type BackupSnapshot,
} from "../../src/lib/backup";
import type { SetRecord, ProgramDefinition } from "../../src/domain/types.ts";
import { resetDb } from "../helpers/db";

// Task 7(C2) — 백업 내보내기/가져오기. eventStore.test.ts와 동일 픽스처 패턴(fake-indexeddb,
// beforeEach로 7개 테이블 clear). Web Share/다운로드/클립보드는 jsdom이 기본 구현하지 않으므로
// (probe 확인됨: navigator.share·navigator.clipboard·URL.createObjectURL 전부 undefined) 매
// 테스트에서 필요한 만큼만 mock하고 afterEach에서 되돌린다.

function program(id: string, version: number, over: Partial<ProgramDefinition> = {}): ProgramDefinition {
  return {
    id,
    name: `프로그램 ${id}`,
    version,
    schemaVersion: 1,
    weeks: [{ days: [{ ordinal: 1, name: "월", slots: [] }] }],
    ...over,
  };
}

function setRec(id: string, over: Partial<SetRecord> = {}): SetRecord {
  return {
    id,
    sessionId: "s1",
    exerciseId: "bench",
    targetWeight: 100,
    targetReps: 5,
    actualWeight: 100,
    actualReps: 5,
    completedAt: "2026-07-10T09:00:00Z",
    schemaVersion: 1,
    ...over,
  };
}

const EMPTY_SNAPSHOT: BackupSnapshot = {
  schemaVersion: 1,
  sets: [],
  corrections: [],
  decisions: [],
  sessions: [],
  programs: [],
  library: [],
  externalSessions: [],
};

const ORIGINAL_UA = navigator.userAgent;

function mockUA(ua: string): void {
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
}

/** 왕복 테스트용 최소 전종류 데이터 1세트(세트/정정/결정/세션/프로그램/라이브러리/인스턴스상태). */
async function seedFullSnapshotData(): Promise<void> {
  await appendSet(setRec("set1"));
  await appendCorrection({
    id: "c1",
    supersedes: "set1",
    patch: { actualReps: 4 },
    at: "2026-07-10T09:05:00Z",
    schemaVersion: 1,
  });
  await appendDecision({
    id: "d1",
    target: { kind: "tm", exerciseId: "bench" },
    kind: "seed",
    value: 100,
    at: "2026-07-10T08:00:00Z",
    schemaVersion: 1,
  });
  await appendSession({
    id: "sc1",
    sessionId: "s1",
    at: "2026-07-10T09:30:00Z",
    cyclePos: { cycleIndex: 0, week: 0, dayOrdinal: 1 },
    status: "completed",
    programId: "p1",
    programVersion: 1,
    schemaVersion: 1,
  });
  await upsertProgramVersion(program("p1", 1));
  await addToLibrary("p1", "2026-07-10T00:00:00Z");
  await appendExternalSession({
    id: "ext1",
    at: "2026-07-10T09:15:00Z",
    groups: ["back"],
    programId: "p1",
    cyclePos: { cycleIndex: 0, week: 0 },
  });
  await setInstanceState({
    programId: "p1",
    programVersion: 1,
    mode: "rolling",
    anchor: {},
    schemaVersion: 1,
  });
}

beforeEach(async () => {
  await resetDb();
  mockUA(ORIGINAL_UA);
});

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
  Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true });
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
  Object.defineProperty(URL, "createObjectURL", { value: undefined, configurable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: undefined, configurable: true });
  mockUA(ORIGINAL_UA);
});

describe("backup", () => {
  it("① exportSnapshot 왕복 — DB clear 후 import하면 loadFoldInput 결과가 export 이전과 동일", async () => {
    await seedFullSnapshotData();
    const before = await loadFoldInput();

    const snapshot = await exportSnapshot();
    expect(snapshot.schemaVersion).toBe(1);

    await resetDb();
    expect((await loadFoldInput()).sets).toHaveLength(0);

    await importSnapshot(snapshot);

    const after = await loadFoldInput();
    expect(after.sets).toEqual(before.sets);
    expect(after.corrections).toEqual(before.corrections);
    expect(after.decisions).toEqual(before.decisions);
    expect(after.sessions).toEqual(before.sessions);
    expect(after.programs.size).toBe(before.programs.size);
    expect(after.programs.get(programKey("p1", 1))).toEqual(program("p1", 1));
    expect(await getLibraryEntries()).toEqual([{ programId: "p1", addedAt: "2026-07-10T00:00:00Z" }]);
    expect(await getInstanceState()).toEqual({
      programId: "p1",
      programVersion: 1,
      mode: "rolling",
      anchor: {},
      schemaVersion: 1,
    });
  });

  it("⑦(Stage1-C3 T4) 백업 왕복에 externalSessions 포함", async () => {
    await seedFullSnapshotData();
    const snapshot = await exportSnapshot();
    expect(snapshot.externalSessions).toEqual([
      { id: "ext1", at: "2026-07-10T09:15:00Z", groups: ["back"], programId: "p1", cyclePos: { cycleIndex: 0, week: 0 } },
    ]);

    await resetDb();
    expect(await listExternalSessions()).toEqual([]);

    await importSnapshot(snapshot);
    expect(await listExternalSessions()).toEqual(snapshot.externalSessions);
  });

  it("⑦-2(Stage1-C3 T4) externalSessions 필드 없는 옛 백업도 가져오기 성공(하위호환, `?? []`)", async () => {
    const legacySnapshot = { ...EMPTY_SNAPSHOT } as Partial<BackupSnapshot>;
    delete legacySnapshot.externalSessions;
    await expect(importSnapshot(legacySnapshot)).resolves.not.toThrow();
    expect(await listExternalSessions()).toEqual([]);
  });

  it("② schemaVersion 불일치 → 명시 에러 던짐, DB 변경 없음", async () => {
    await seedFullSnapshotData();
    const before = await loadFoldInput();

    const bogus = { schemaVersion: 2, sets: [setRec("intruder")] };
    await expect(importSnapshot(bogus)).rejects.toThrow(/schemaVersion/);

    const after = await loadFoldInput();
    expect(after.sets).toEqual(before.sets);
    expect(after.sets.find((s) => s.id === "intruder")).toBeUndefined();
  });

  it("③ 가져오기는 기존 데이터를 덮어쓰지 않고 병합(id 합집합)", async () => {
    await appendSet(setRec("existing", { actualReps: 3 }));

    const importedSnapshot: BackupSnapshot = {
      ...EMPTY_SNAPSHOT,
      sets: [setRec("imported", { actualReps: 9 })],
    };
    await importSnapshot(importedSnapshot);

    const { sets } = await loadFoldInput();
    expect(sets).toHaveLength(2);
    expect(sets.find((s) => s.id === "existing")?.actualReps).toBe(3);
    expect(sets.find((s) => s.id === "imported")?.actualReps).toBe(9);
  });

  it("④ iOS + Web Share(파일) 지원 환경 → navigator.share가 파일과 함께 호출됨(클립보드 미사용)", async () => {
    mockUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15");
    const shareMock = vi.fn().mockResolvedValue(undefined);
    const canShareMock = vi.fn().mockReturnValue(true);
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: shareMock, configurable: true });
    Object.defineProperty(navigator, "canShare", { value: canShareMock, configurable: true });
    Object.defineProperty(navigator, "clipboard", { value: { writeText: writeTextMock }, configurable: true });

    await shareOrDownloadSnapshot(EMPTY_SNAPSHOT);

    expect(shareMock).toHaveBeenCalledTimes(1);
    const shareArg = shareMock.mock.calls[0]?.[0] as { files: File[] };
    expect(shareArg.files).toHaveLength(1);
    expect(shareArg.files[0]?.name).toBe("workout-backup.json");
    expect(writeTextMock).not.toHaveBeenCalled();
  });

  it("⑤ 비-iOS 환경 → <a download> blob URL 다운로드 fallback(anchor.click 호출)", async () => {
    mockUA("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
    const createObjectURLMock = vi.fn().mockReturnValue("blob:mock-url");
    const revokeObjectURLMock = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { value: createObjectURLMock, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectURLMock, configurable: true });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await shareOrDownloadSnapshot(EMPTY_SNAPSHOT);

    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLMock).toHaveBeenCalledTimes(1);
  });

  it("⑤-2 iOS + Web Share(파일) 미지원 + 클립보드 API 부재 → <a download> blob URL 다운로드로 폴스루", async () => {
    mockUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15");
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    const createObjectURLMock = vi.fn().mockReturnValue("blob:mock-url");
    const revokeObjectURLMock = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { value: createObjectURLMock, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectURLMock, configurable: true });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await shareOrDownloadSnapshot(EMPTY_SNAPSHOT);

    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLMock).toHaveBeenCalledTimes(1);
  });

  it("⑥ 잘못된 JSON → 파싱 실패를 명시 에러로 던짐(크래시 없음)", () => {
    expect(() => parseSnapshotJSON("{이건 JSON이 아님")).toThrow(/JSON/);
  });
});
