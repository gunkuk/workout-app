import { describe, it, expect, beforeEach } from "vitest";
import {
  appendBodyMetric,
  listBodyMetrics,
  addInjury,
  resolveInjury,
  listInjuries,
  upsertSessionNote,
  getSessionNote,
  listSessionNotes,
  upsertExerciseComment,
  listExerciseComments,
  getExerciseCommentForSlot,
  upsertDailyCheckin,
  getDailyCheckin,
} from "../../src/storage/eventStore";
import type { BodyMetric, InjuryLog, SessionNote, ExerciseComment, DailyCheckin } from "../../src/storage/trackingTypes";
import { resetDb } from "../helpers/db";
import { db } from "../../src/storage/db";

// UI5 T1 — 추적 엔티티 4종(체성분/부상/세션노트/운동코멘트) storage 레이어 테스트.
// fold 입력 밖(§설계원칙 동결 유지)이므로 loadFoldInput/fold 관련 검증은 없음 — 순수 CRUD·정렬·병합 계약만.

function bodyMetric(id: string, over: Partial<BodyMetric> = {}): BodyMetric {
  return { id, at: "2026-07-10T09:00:00Z", weightKg: 80, bodyFatPct: 18, schemaVersion: 1, ...over };
}

function injury(id: string, over: Partial<InjuryLog> = {}): InjuryLog {
  return { id, bodyPart: "왼쪽 어깨", startedAt: "2026-07-01T00:00:00Z", schemaVersion: 1, ...over };
}

function sessionNote(id: string, over: Partial<SessionNote> = {}): SessionNote {
  return { id, sessionId: "s1", note: "오늘 컨디션 좋음", at: "2026-07-10T09:00:00Z", schemaVersion: 1, ...over };
}

function exerciseComment(id: string, over: Partial<ExerciseComment> = {}): ExerciseComment {
  return { id, exerciseId: "bench", note: "그립 좁게가 잘 맞음", at: "2026-07-10T09:00:00Z", schemaVersion: 1, ...over };
}

function dailyCheckin(id: string, over: Partial<DailyCheckin> = {}): DailyCheckin {
  return { id, date: "2026-07-10", at: "2026-07-10T09:00:00Z", schemaVersion: 1, ...over };
}

beforeEach(async () => {
  await resetDb();
});

describe("tracking — BodyMetric", () => {
  it("① CRUD — appendBodyMetric 후 listBodyMetrics에 반영", async () => {
    const m = bodyMetric("m1");
    await appendBodyMetric(m);
    expect(await listBodyMetrics()).toEqual([m]);
  });

  it("② partial fields — weightKg만 있어도 저장/조회 가능(bodyFatPct 없음)", async () => {
    const m = bodyMetric("m1", { weightKg: 79.5, bodyFatPct: undefined });
    await appendBodyMetric(m);
    const [got] = await listBodyMetrics();
    expect(got?.weightKg).toBe(79.5);
    expect(got?.bodyFatPct).toBeUndefined();
  });

  it("③ partial fields — bodyFatPct만 있어도 저장/조회 가능(weightKg 없음)", async () => {
    const m = bodyMetric("m1", { weightKg: undefined, bodyFatPct: 17.2 });
    await appendBodyMetric(m);
    const [got] = await listBodyMetrics();
    expect(got?.bodyFatPct).toBe(17.2);
    expect(got?.weightKg).toBeUndefined();
  });

  it("④ list ordering — listBodyMetrics는 at 오름차순 반환", async () => {
    await appendBodyMetric(bodyMetric("late", { at: "2026-07-10T09:00:00Z" }));
    await appendBodyMetric(bodyMetric("early", { at: "2026-07-01T09:00:00Z" }));
    await appendBodyMetric(bodyMetric("mid", { at: "2026-07-05T09:00:00Z" }));

    const ids = (await listBodyMetrics()).map((m) => m.id);
    expect(ids).toEqual(["early", "mid", "late"]);
  });

  it("⑤ 같은 id로 두 번 append → 마지막 값으로 upsert(put 의미론)", async () => {
    await appendBodyMetric(bodyMetric("m1", { weightKg: 80 }));
    await appendBodyMetric(bodyMetric("m1", { weightKg: 81 }));

    const all = await listBodyMetrics();
    expect(all).toHaveLength(1);
    expect(all[0]?.weightKg).toBe(81);
  });
});

describe("tracking — InjuryLog", () => {
  it("⑥ CRUD — addInjury 후 listInjuries에 반영", async () => {
    const i = injury("i1");
    await addInjury(i);
    expect(await listInjuries()).toEqual([i]);
  });

  it("⑦ 부상 해소 플로우 — resolveInjury가 resolvedAt만 갱신, 나머지 필드 보존", async () => {
    await addInjury(injury("i1", { bodyPart: "무릎", note: "스쿼트 중 통증" }));

    let [got] = await listInjuries();
    expect(got?.resolvedAt).toBeUndefined();

    await resolveInjury("i1", "2026-07-15T00:00:00Z");

    [got] = await listInjuries();
    expect(got?.resolvedAt).toBe("2026-07-15T00:00:00Z");
    expect(got?.bodyPart).toBe("무릎");
    expect(got?.note).toBe("스쿼트 중 통증");
    expect(got?.startedAt).toBe("2026-07-01T00:00:00Z");
  });

  it("⑧ list ordering — listInjuries는 startedAt 오름차순 반환", async () => {
    await addInjury(injury("late", { startedAt: "2026-07-10T00:00:00Z" }));
    await addInjury(injury("early", { startedAt: "2026-07-01T00:00:00Z" }));

    const ids = (await listInjuries()).map((i) => i.id);
    expect(ids).toEqual(["early", "late"]);
  });
});

describe("tracking — SessionNote", () => {
  it("⑨ CRUD — upsertSessionNote 후 getSessionNote(sessionId)로 조회", async () => {
    const n = sessionNote("n1", { sessionId: "s1" });
    await upsertSessionNote(n);
    expect(await getSessionNote("s1")).toEqual(n);
  });

  it("⑩ 존재하지 않는 sessionId 조회 → undefined", async () => {
    await upsertSessionNote(sessionNote("n1", { sessionId: "s1" }));
    expect(await getSessionNote("s-없음")).toBeUndefined();
  });

  it("⑪ 같은 sessionId로 두 번 upsert(다른 id) → getSessionNote는 가장 최근(at) 1건 반환", async () => {
    await upsertSessionNote(sessionNote("n1", { sessionId: "s1", note: "먼저 씀", at: "2026-07-10T09:00:00Z" }));
    await upsertSessionNote(sessionNote("n2", { sessionId: "s1", note: "나중에 씀", at: "2026-07-10T10:00:00Z" }));

    const got = await getSessionNote("s1");
    expect(got?.id).toBe("n2");
    expect(got?.note).toBe("나중에 씀");
  });

  it("⑫ listSessionNotes — 전체 세션 코멘트를 at 오름차순으로 반환(백업 export용)", async () => {
    await upsertSessionNote(sessionNote("n1", { sessionId: "s1", at: "2026-07-10T10:00:00Z" }));
    await upsertSessionNote(sessionNote("n2", { sessionId: "s2", at: "2026-07-10T09:00:00Z" }));

    const ids = (await listSessionNotes()).map((n) => n.id);
    expect(ids).toEqual(["n2", "n1"]);
  });
});

describe("tracking — ExerciseComment", () => {
  it("⑬ CRUD — upsertExerciseComment 후 listExerciseComments()(무인자)로 전체 조회", async () => {
    const c = exerciseComment("c1");
    await upsertExerciseComment(c);
    expect(await listExerciseComments()).toEqual([c]);
  });

  it("⑭ listExerciseComments(exerciseId) — 해당 운동만 필터링", async () => {
    await upsertExerciseComment(exerciseComment("c1", { exerciseId: "bench" }));
    await upsertExerciseComment(exerciseComment("c2", { exerciseId: "squat" }));

    const benchOnly = await listExerciseComments("bench");
    expect(benchOnly.map((c) => c.id)).toEqual(["c1"]);
  });

  it("⑮ list ordering — at 오름차순 반환", async () => {
    await upsertExerciseComment(exerciseComment("late", { exerciseId: "bench", at: "2026-07-10T09:00:00Z" }));
    await upsertExerciseComment(exerciseComment("early", { exerciseId: "bench", at: "2026-07-01T09:00:00Z" }));

    const ids = (await listExerciseComments("bench")).map((c) => c.id);
    expect(ids).toEqual(["early", "late"]);
  });

  it("⑯ getExerciseCommentForSlot — 같은 slotId의 최신 메모 우선(UI15 item3)", async () => {
    await upsertExerciseComment(
      exerciseComment("mon", { exerciseId: "bench", slotId: "w1d1-bench-t1", note: "월요일 메모", at: "2026-07-06T09:00:00Z" }),
    );
    await upsertExerciseComment(
      exerciseComment("wed", { exerciseId: "bench", slotId: "w1d3-bench-t1", note: "수요일 메모", at: "2026-07-08T09:00:00Z" }),
    );

    const got = await getExerciseCommentForSlot("bench", "w1d1-bench-t1");
    expect(got?.id).toBe("mon");
    expect(got?.note).toBe("월요일 메모");
  });

  it("⑰ getExerciseCommentForSlot — 같은 slotId 메모 없으면 같은 exerciseId(다른 요일) 최신 메모로 폴백", async () => {
    await upsertExerciseComment(
      exerciseComment("mon", { exerciseId: "bench", slotId: "w1d1-bench-t1", note: "월요일 메모", at: "2026-07-06T09:00:00Z" }),
    );
    await upsertExerciseComment(
      exerciseComment("wed", { exerciseId: "bench", slotId: "w1d3-bench-t1", note: "수요일 메모", at: "2026-07-08T09:00:00Z" }),
    );

    // w1d5(금요일) 슬롯엔 기록이 없으므로 exerciseId=bench 최신(수요일) 메모로 폴백.
    const got = await getExerciseCommentForSlot("bench", "w1d5-bench-t1");
    expect(got?.id).toBe("wed");
    expect(got?.note).toBe("수요일 메모");
  });

  it("⑱ getExerciseCommentForSlot — slotId도 exerciseId도 기록 없으면 undefined", async () => {
    expect(await getExerciseCommentForSlot("squat", "w1d2-squat-t1")).toBeUndefined();
  });
});

describe("tracking — DailyCheckin(UI15 item4)", () => {
  it("⑲ CRUD — upsertDailyCheckin 후 getDailyCheckin(date)로 조회", async () => {
    const c = dailyCheckin("c1", { condition: 4 });
    await upsertDailyCheckin(c);
    expect(await getDailyCheckin("2026-07-10")).toEqual(c);
  });

  it("⑳ 존재하지 않는 날짜 조회 → undefined", async () => {
    await upsertDailyCheckin(dailyCheckin("c1"));
    expect(await getDailyCheckin("2026-07-11")).toBeUndefined();
  });

  it("㉑ 같은 날짜에 항목별로 여러 번 upsert — 한 항목만 갱신되고 나머지는 보존(병합 계약)", async () => {
    await upsertDailyCheckin(dailyCheckin("c1", { condition: 3 }));
    await upsertDailyCheckin(dailyCheckin("c2", { sleep: 5 }));
    await upsertDailyCheckin(dailyCheckin("c3", { lastMeal: 2 }));

    const got = await getDailyCheckin("2026-07-10");
    expect(got?.condition).toBe(3);
    expect(got?.sleep).toBe(5);
    expect(got?.lastMeal).toBe(2);
    // 병합 후에도 같은 날짜는 레코드 1건(id는 최초 것 유지).
    const all = await db.dailyCheckins.toArray();
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe("c1");
  });
});
