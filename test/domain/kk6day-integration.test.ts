import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { validateProgramWithSchema } from "../../lib/validationCore.mjs";
import { buildWorkoutPlan } from "../../src/domain/programEngine";
import { foldState } from "../../src/domain/fold";
import { programKey } from "../../src/domain/foldSupport";
import { DEFAULT_PLATES } from "../../src/domain/plates";
import type { ProgramDefinition, SetRecord, DecisionEvent, SessionCompleted } from "../../src/domain/types.ts";

const schema = JSON.parse(readFileSync("schema/program.schema.json", "utf8"));

function loadKk6day(): ProgramDefinition {
  return JSON.parse(readFileSync("programs/kk-6day.json", "utf8")) as ProgramDefinition;
}

describe("kk-6day 시드 — 로드·검증", () => {
  it("스키마+시맨틱 검증 통과", () => {
    const raw = JSON.parse(readFileSync("programs/kk-6day.json", "utf8"));
    expect(validateProgramWithSchema(raw, schema)).toEqual([]);
  });

  it("1주 반복 · 5일 구성, 각 일자 3슬롯(T1/T2/accessory)", () => {
    const p = loadKk6day();
    expect(p.weeks).toHaveLength(1);
    expect(p.weeks[0]!.days).toHaveLength(5);
    for (const day of p.weeks[0]!.days) {
      expect(day.slots, day.name).toHaveLength(3);
    }
  });

  it("T1 규칙 배치 — pullup(doubleProgression)·legPress(repLadder)는 예외, 나머지 3개(ohp/tbarRow/bench)는 linearTopSet", () => {
    // 2026-07-22: 스쿼트→레그프레스 교체(축성부하 제거) — 레그프레스는 머신·TM 개념이 없어 다른
    // accessory와 동일한 repLadder(tracked) 방식으로 처방한다(programs/kk-6day.json d3-legpress).
    const p = loadKk6day();
    const t1Slots = p.weeks[0]!.days.flatMap((d) => d.slots).filter((s) => s.label === "T1");
    expect(t1Slots).toHaveLength(5);
    const pullup = t1Slots.find((s) => s.exerciseId === "pullup")!;
    expect(pullup.progressionRuleId).toBe("doubleProgression");
    const legPress = t1Slots.find((s) => s.exerciseId === "legPress")!;
    expect(legPress.progressionRuleId).toBe("repLadder");
    const linear = t1Slots.filter((s) => s.exerciseId !== "pullup" && s.exerciseId !== "legPress");
    expect(linear).toHaveLength(3);
    for (const s of linear) {
      expect(s.progressionRuleId, s.id).toBe("linearTopSet");
      expect(s.sets.filter((x) => x.amrapRole === "topSet"), s.id).toHaveLength(1);
    }
  });

  it("T2·accessory는 규칙 슬롯 전부 repLadder(tracked)", () => {
    const p = loadKk6day();
    const others = p.weeks[0]!.days.flatMap((d) => d.slots).filter((s) => s.label !== "T1" && s.progressionRuleId);
    expect(others.length).toBeGreaterThan(0);
    for (const s of others) {
      expect(s.progressionRuleId, s.id).toBe("repLadder");
      expect(s.sets.every((x) => x.load.kind === "tracked"), s.id).toBe(true);
    }
  });

  it("§3.3 불변식 — bench·lateralRaise 중복 등장에도 exerciseId당 규칙 슬롯 ≤1", () => {
    const p = loadKk6day();
    const slots = p.weeks[0]!.days.flatMap((d) => d.slots);

    const benchSlots = slots.filter((s) => s.exerciseId === "bench");
    expect(benchSlots).toHaveLength(2); // 화 T2 + 토 T1
    const benchRuled = benchSlots.filter((s) => s.progressionRuleId);
    expect(benchRuled.map((s) => s.id)).toEqual(["d5-bench"]);

    // UI14 item3 — 월↔화 악세사리 스왑: 레터럴레이즈는 이제 화(accessory, 규칙 있음) + 토(accessory, 규칙 없음).
    const lateralSlots = slots.filter((s) => s.exerciseId === "lateralRaise");
    expect(lateralSlots).toHaveLength(2); // 화 accessory + 토 accessory
    const lateralRuled = lateralSlots.filter((s) => s.progressionRuleId);
    expect(lateralRuled.map((s) => s.id)).toEqual(["d2-lateral"]);
  });

  it("데드리프트 부재 — 허리 부상 대응으로 프로그램에 exerciseId 'deadlift' 슬롯 없음", () => {
    const p = loadKk6day();
    const slots = p.weeks[0]!.days.flatMap((d) => d.slots);
    expect(slots.some((s) => s.exerciseId === "deadlift")).toBe(false);
  });

  // UI14 item1 — 워밍업 버그 fix: tracked 슬롯(CGBP, defaultLoad = bench 55%)도 pctOfTM 슬롯과
  // 동일하게 실제 참조 무게 기준 워밍업을 받아야 한다(이전엔 load.kind !== "pctOfTM"이면 무조건
  // []을 반환하는 버그로, bench TM 100 → CGBP 55kg인데도 워밍업이 전혀 없었다).
  it("토요일 CGBP(T2, tracked, defaultLoad ref bench pct 0.55) — 참조 무게 55kg 기준 워밍업 생성", () => {
    const p = loadKk6day();
    const TM2 = { bench: 100, ohp: 60, squat: 100 };
    const plan = buildWorkoutPlan(p, { cycleIndex: 0, week: 0, dayOrdinal: 5 }, TM2, {}, DEFAULT_PLATES)!;
    const cgbp = plan.slots.find((s) => s.slotId === "d5-cgbp")!;
    expect(cgbp.sets.every((s) => s.weight === 55)).toBe(true);
    expect(cgbp.needsInit).toBe(false);
    expect(cgbp.warmups.length).toBeGreaterThan(0);
    expect(cgbp.warmups.every((w) => w.weight !== null && w.weight < 55)).toBe(true);
  });
});

describe("kk-6day — T1 topSet 판정(linearTopSet)이 TM을 정확히 올림 (엔진×fold 접합)", () => {
  const p = loadKk6day();
  const programs = new Map([[programKey(p.id, p.version), p]]);
  const TM = { bench: 100, ohp: 60, squat: 100 };

  function at(day: number, hh: number, mm = 0): string {
    return `2026-07-${String(day).padStart(2, "0")}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`;
  }

  it("토요일 벤치 T1 탑세트 4렙(minReps 3 이상) → TM 100→102.5, 다음 플랜에 반영", () => {
    const pos = { cycleIndex: 0, week: 0, dayOrdinal: 5 };
    const plan = buildWorkoutPlan(p, pos, TM, {}, DEFAULT_PLATES)!;
    const benchT1 = plan.slots.find((s) => s.slotId === "d5-bench")!;
    const topSetIdx = benchT1.sets.findIndex((s) => s.amrapRole === "topSet");
    expect(topSetIdx).toBeGreaterThanOrEqual(0);

    const sets: SetRecord[] = benchT1.sets.map((s, i) => ({
      id: `sat-d5-bench-${i}`, sessionId: "sat", slotId: "d5-bench", exerciseId: "bench",
      targetWeight: s.weight, targetReps: s.reps, actualWeight: s.weight!,
      actualReps: i === topSetIdx ? 4 : s.reps, amrapRole: s.amrapRole,
      completedAt: at(5, 10, i), schemaVersion: 1,
    }));
    const decisions: DecisionEvent[] = [
      { id: "seed-bench", target: { kind: "tm", exerciseId: "bench" }, kind: "seed", value: 100, at: at(1, 8), schemaVersion: 1 },
    ];
    const sessions: SessionCompleted[] = [
      { id: "sc-sat", sessionId: "sat", at: at(5, 12), cyclePos: pos, status: "completed", programId: p.id, programVersion: p.version, schemaVersion: 1 },
    ];

    const st = foldState({ sets, corrections: [], decisions, sessions, programs });
    expect(st.tm["bench"]).toBe(102.5);
    expect(st.pendingProposals).toHaveLength(0);
  });
});
