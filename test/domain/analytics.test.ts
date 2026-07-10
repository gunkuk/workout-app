import { describe, it, expect } from "vitest";
import { weeklyAnalysis, type ExternalSession } from "../../src/domain/analytics";
import { programKey } from "../../src/domain/foldSupport";
import type {
  ProgramDefinition,
  SetRecord,
  SessionCompleted,
  CorrectionRecord,
} from "../../src/domain/types.ts";
import { loadSeedProgram } from "../helpers/seed";

const seed = loadSeedProgram();
const programs = new Map([[programKey(seed.id, seed.version), seed]]);

function at(day: number, hh = 9, mm = 0): string {
  return `2026-07-${String(day).padStart(2, "0")}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`;
}

function session(
  id: string,
  day: number,
  cyclePos: { cycleIndex: number; week: number; dayOrdinal: number },
  over: Partial<SessionCompleted> = {}
): SessionCompleted {
  return {
    id: `sc-${id}`,
    sessionId: id,
    at: at(day, 8),
    cyclePos,
    status: "completed",
    programId: seed.id,
    programVersion: seed.version,
    schemaVersion: 1,
    ...over,
  };
}

function setRec(
  id: string,
  sessionId: string,
  slotId: string,
  exerciseId: string,
  i: number,
  day: number,
  over: Partial<SetRecord> = {}
): SetRecord {
  return {
    id,
    sessionId,
    slotId,
    exerciseId,
    targetWeight: 100,
    targetReps: 5,
    actualWeight: 100,
    actualReps: 5,
    completedAt: at(day, 9, i),
    schemaVersion: 1,
    ...over,
  };
}

function run(sets: SetRecord[], sessions: SessionCompleted[], corrections: CorrectionRecord[] = [], externalSessions?: ExternalSession[]) {
  return weeklyAnalysis({ sets, corrections, sessions, programs, externalSessions });
}

describe("weeklyAnalysis", () => {
  it("①② day5 벤치 T1 — 유효 세트 정확히 3(topSet+pct0.9+backoff), chest·triceps 톤수 합 2715", () => {
    const s = session("bench5", 10, { cycleIndex: 0, week: 0, dayOrdinal: 5 });
    // 스펙: 0.75r5,0.85r3,0.95r1(topSet),0.90r3,0.85r5,0.80r3,0.75r5,0.70r3,0.65r5(backoff)
    const weights = [80, 90, 100, 95, 90, 85, 80, 72.5, 67.5];
    const reps = [5, 3, 1, 3, 5, 3, 5, 3, 5];
    const sets = weights.map((w, i) =>
      setRec(`b${i}`, "bench5", "w1d5-bench-t1", "bench", i, 10, {
        actualWeight: w,
        actualReps: reps[i],
        amrapRole: i === 2 ? "topSet" : i === 8 ? "backoff" : undefined,
      })
    );
    const buckets = run(sets, [s]);
    expect(buckets).toHaveLength(1);
    const b = buckets[0]!;
    expect(b.groups.chest?.validSets).toBe(3);
    expect(b.groups.triceps?.validSets).toBe(3);
    expect(b.groups.chest?.tonnage).toBe(2715);
    expect(b.groups.triceps?.tonnage).toBe(2715);
  });

  it("③ T2형(CGBP) 8세트 → 후반 4세트만 유효", () => {
    const s = session("cgbp5", 10, { cycleIndex: 0, week: 0, dayOrdinal: 5 });
    const reps = [6, 5, 3, 5, 7, 4, 6, 8];
    const sets = reps.map((r, i) =>
      setRec(`c${i}`, "cgbp5", "w1d5-cgbp-t2", "cgbp", i, 10, { actualWeight: 40, actualReps: r })
    );
    const buckets = run(sets, [s]);
    const b = buckets[0]!;
    expect(b.groups.triceps?.validSets).toBe(4);
    expect(b.groups.chest?.validSets).toBe(4);
  });

  it("④ 악세사리(chestSupportedRow) 3세트 전부 유효", () => {
    const s = session("csr5", 10, { cycleIndex: 0, week: 0, dayOrdinal: 5 });
    const sets = [0, 1, 2].map((i) =>
      setRec(`a${i}`, "csr5", "w1d5-csr-acc", "chestSupportedRow", i, 10, { actualWeight: 50, actualReps: 8 })
    );
    const buckets = run(sets, [s]);
    const b = buckets[0]!;
    expect(b.groups.back?.validSets).toBe(3);
  });

  it("⑤ rir≤4 세트는 T2형 앞세트라도 유효 — OR·중복 없음", () => {
    const s = session("cgbpRir", 10, { cycleIndex: 0, week: 0, dayOrdinal: 5 });
    const reps = [6, 5, 3, 5, 7, 4, 6, 8];
    const sets = reps.map((r, i) =>
      setRec(`r${i}`, "cgbpRir", "w1d5-cgbp-t2", "cgbp", i, 10, {
        actualWeight: 40,
        actualReps: r,
        // idx0: 앞세트인데 rir≤4 → 유효 추가. idx5: 이미 후반4세트로 유효 — rir 중복 부여해도 카운트 불변 확인.
        rir: i === 0 ? 3 : i === 5 ? 2 : undefined,
      })
    );
    const buckets = run(sets, [s]);
    const b = buckets[0]!;
    // 후반4(4,5,6,7) + 앞세트 rir(0) = 5, idx5의 이중 자격이 중복 카운트되지 않음
    expect(b.groups.triceps?.validSets).toBe(5);
  });

  it("⑥ 고아 세트 제외 / skipped 세션 세트 포함", () => {
    const orphan = setRec("orphanSet", "ghost-session", "w1d5-bench-t1", "bench", 0, 10);
    const skippedSession = session("acc1", 10, { cycleIndex: 0, week: 0, dayOrdinal: 1 }, { status: "skipped" });
    const skippedSet = setRec("acc1set", "acc1", "w1d1-latpull-acc", "latPulldown", 0, 10, {
      actualWeight: 40,
      actualReps: 10,
    });
    const buckets = run([orphan, skippedSet], [skippedSession]);
    expect(buckets).toHaveLength(1);
    const b = buckets[0]!;
    // 고아(bench) 그룹은 어디에도 없어야 함
    expect(b.groups.chest).toBeUndefined();
    expect(b.groups.triceps).toBeUndefined();
    // skipped 세션의 세트는 포함(back·biceps, accessory 전부 유효)
    expect(b.groups.back?.validSets).toBe(1);
    expect(b.groups.biceps?.validSets).toBe(1);
    expect(b.groups.back?.tonnage).toBe(400);
  });

  it("⑦ warmup setType 세트 제외", () => {
    const s = session("warmupTest", 10, { cycleIndex: 0, week: 0, dayOrdinal: 1 });
    const warmup = setRec("w0", "warmupTest", "w1d1-latpull-acc", "latPulldown", 0, 10, {
      actualWeight: 999,
      actualReps: 999,
      setType: "warmup",
    });
    const work = setRec("w1", "warmupTest", "w1d1-latpull-acc", "latPulldown", 1, 10, {
      actualWeight: 40,
      actualReps: 10,
      setType: "work",
    });
    const buckets = run([warmup, work], [s]);
    const b = buckets[0]!;
    expect(b.groups.back?.validSets).toBe(1);
    expect(b.groups.back?.tonnage).toBe(400);
  });

  it("⑧ externalSessions은 빈도만 가산 — validSets·tonnage 불변", () => {
    const s = session("extTest", 10, { cycleIndex: 0, week: 0, dayOrdinal: 1 });
    const work = setRec("e1", "extTest", "w1d1-latpull-acc", "latPulldown", 0, 10, {
      actualWeight: 40,
      actualReps: 10,
    });
    const buckets = run([work], [s], [], [
      { cyclePos: { cycleIndex: 0, week: 0 }, groups: ["back"], programId: seed.id },
    ]);
    const b = buckets[0]!;
    expect(b.groups.back?.validSets).toBe(1);
    expect(b.groups.back?.tonnage).toBe(400);
    expect(b.groups.back?.frequency).toBe(2); // 세션 1 + 외부 1
  });

  it("⑧-2(Stage1-C3 T4) 외부 세션만 있고 실세트 0인 주는 버킷 부재로 미표시(도메인 동결 — 알려진 제약 박제)", () => {
    // 실 SetRecord/SessionCompleted가 전혀 없는 주(cycleIndex:1, week:0)에 외부 세션만 넣으면
    // 매칭되는 버킷이 아예 없어 조용히 버려진다 — 외부 세션은 빈도만 가산하는 부가 정보이지
    // 버킷을 새로 만드는 근거가 아니다(analytics.ts weeklyAnalysis 주석에 명시된 계약).
    const s = session("realWeek", 10, { cycleIndex: 0, week: 0, dayOrdinal: 1 });
    const work = setRec("w1", "realWeek", "w1d1-latpull-acc", "latPulldown", 0, 10, {
      actualWeight: 40,
      actualReps: 10,
    });
    const buckets = run([work], [s], [], [
      { cyclePos: { cycleIndex: 1, week: 0 }, groups: ["back"], programId: seed.id },
    ]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]?.cycleIndex).toBe(0);
    expect(buckets.some((b) => b.cycleIndex === 1)).toBe(false);
  });

  it("⑨ day1 벤치 volume 9세트 완주 → chest 유효 정확히 1 (amrap backoff만)", () => {
    const s = session("bench1", 10, { cycleIndex: 0, week: 0, dayOrdinal: 1 });
    const reps = [8, 6, 4, 4, 4, 5, 6, 7, 8];
    const sets = reps.map((r, i) =>
      setRec(`v${i}`, "bench1", "w1d1-bench-t1", "bench", i, 10, {
        actualReps: r,
        amrapRole: i === 8 ? "backoff" : undefined,
      })
    );
    const buckets = run(sets, [s]);
    const b = buckets[0]!;
    expect(b.groups.chest?.validSets).toBe(1);
    expect(b.groups.triceps?.validSets).toBe(1);
  });

  it("⑩ 프로그램 전환: programId 다른 두 세션이 같은 {cycleIndex:0,week:0}이어도 버킷 2개로 분리", () => {
    const progB: ProgramDefinition = { ...seed, id: "other-program" };
    const twoProgs = new Map([
      [programKey(seed.id, seed.version), seed],
      [programKey(progB.id, progB.version), progB],
    ]);
    const sA = session("progA", 10, { cycleIndex: 0, week: 0, dayOrdinal: 5 });
    const sB: SessionCompleted = { ...session("progB", 5, { cycleIndex: 0, week: 0, dayOrdinal: 5 }), programId: progB.id };
    const setA = setRec("pa1", "progA", "w1d5-csr-acc", "chestSupportedRow", 0, 10, { actualWeight: 30, actualReps: 8 });
    const setB = setRec("pb1", "progB", "w1d5-csr-acc", "chestSupportedRow", 0, 5, { actualWeight: 30, actualReps: 8 });
    const buckets = weeklyAnalysis({ sets: [setA, setB], corrections: [], sessions: [sA, sB], programs: twoProgs });
    expect(buckets).toHaveLength(2);
    const bA = buckets.find((b) => b.programId === seed.id)!;
    const bB = buckets.find((b) => b.programId === progB.id)!;
    expect(bA.firstAt).toBe(sA.at);
    expect(bB.firstAt).toBe(sB.at);
    expect(bA.cycleIndex).toBe(0);
    expect(bB.cycleIndex).toBe(0);
  });
});
