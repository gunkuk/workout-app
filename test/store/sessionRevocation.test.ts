import { describe, it, expect } from "vitest";
import { revokedSessionIds, activeSessions } from "../../src/store/sessionRevocation";
import type { SessionCompleted, CorrectionRecord } from "../../src/domain/types.ts";

// Stage1-UI9 — sessionRevocation 헬퍼: SessionCompleted를 삭제하지 않고 CorrectionRecord
// (supersedes=session.id, revoked:true)로 "취소" 판정하는 순수 함수. latest-wins(그 세션을
// 직접 대상으로 한 정정들 중 (at,id) 최신 1건)를 단위로 검증한다.

function session(id: string, over: Partial<SessionCompleted> = {}): SessionCompleted {
  return {
    id,
    sessionId: id,
    at: "2026-07-01T08:00:00Z",
    cyclePos: { cycleIndex: 0, week: 0, dayOrdinal: 1 },
    status: "completed",
    programId: "p1",
    programVersion: 1,
    schemaVersion: 1,
    ...over,
  };
}

function corr(id: string, supersedes: string, over: Partial<CorrectionRecord> = {}): CorrectionRecord {
  return { id, supersedes, at: "2026-07-02T08:00:00Z", schemaVersion: 1, ...over };
}

describe("revokedSessionIds / activeSessions", () => {
  it("정정 없으면 취소된 세션 없음 — 전부 active", () => {
    const sessions = [session("s1"), session("s2")];
    expect(revokedSessionIds(sessions, [])).toEqual(new Set());
    expect(activeSessions(sessions, [])).toEqual(sessions);
  });

  it("revoked:true 정정 1건 → 그 세션만 취소, 나머지는 active", () => {
    const sessions = [session("s1"), session("s2")];
    const corrections = [corr("c1", "s1", { revoked: true })];
    expect(revokedSessionIds(sessions, corrections)).toEqual(new Set(["s1"]));
    expect(activeSessions(sessions, corrections).map((s) => s.id)).toEqual(["s2"]);
  });

  it("latest-wins — 취소 후 더 최신 정정(revoked 없음)이 오면 un-revoke", () => {
    const sessions = [session("s1")];
    const corrections: CorrectionRecord[] = [
      corr("c1", "s1", { revoked: true, at: "2026-07-02T08:00:00Z" }),
      corr("c2", "s1", { at: "2026-07-03T08:00:00Z" }), // revoked 없음 — 더 최신이므로 되돌림
    ];
    expect(revokedSessionIds(sessions, corrections)).toEqual(new Set());
    expect(activeSessions(sessions, corrections)).toEqual(sessions);
  });

  it("latest-wins — un-revoke 후 다시 최신 취소가 오면 재취소", () => {
    const sessions = [session("s1")];
    const corrections: CorrectionRecord[] = [
      corr("c1", "s1", { revoked: true, at: "2026-07-02T08:00:00Z" }),
      corr("c2", "s1", { at: "2026-07-03T08:00:00Z" }),
      corr("c3", "s1", { revoked: true, at: "2026-07-04T08:00:00Z" }),
    ];
    expect(revokedSessionIds(sessions, corrections)).toEqual(new Set(["s1"]));
  });

  it("at 동률이면 id 큰 쪽 승 (sortByAtId 계약 그대로)", () => {
    const sessions = [session("s1")];
    const corrections: CorrectionRecord[] = [
      corr("c-a", "s1", { revoked: true, at: "2026-07-02T08:00:00Z" }),
      corr("c-b", "s1", { at: "2026-07-02T08:00:00Z" }), // 동일 at, id가 더 큼 → 승
    ];
    expect(revokedSessionIds(sessions, corrections)).toEqual(new Set());
  });

  it("다른 세션을 대상으로 한 정정(supersedes가 세션 목록에 없는 id)은 무시", () => {
    const sessions = [session("s1")];
    const corrections = [corr("c1", "unknown-target", { revoked: true })];
    expect(revokedSessionIds(sessions, corrections)).toEqual(new Set());
    expect(activeSessions(sessions, corrections)).toEqual(sessions);
  });
});
