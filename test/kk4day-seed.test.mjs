import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { validateProgram } from "../lib/validation.mjs";

// KK 4-day (2026-07-11, 과학 패널 검증 반영) — 번들 프로그램 구조 박제.
const p = JSON.parse(readFileSync("programs/kk-4day.json", "utf8"));

describe("kk-4day 시드", () => {
  it("스키마+시맨틱 검증 통과", () => {
    expect(validateProgram(p)).toEqual([]);
  });

  it("7주 메조사이클 — 누적 6주(볼륨/헤비 교차) + 디로드 1주", () => {
    expect(p.weeks).toHaveLength(7);
    // 디로드 주(W7): progression 규칙·AMRAP 전무, 전 슬롯 3세트 이하 (Bell 2025 오프로드)
    const deload = p.weeks[6];
    for (const day of deload.days) {
      for (const s of day.slots) {
        expect(s.progressionRuleId, s.id).toBeUndefined();
        expect(s.sets.some((x) => x.amrapRole), s.id).toBe(false);
        expect(s.sets.length, s.id).toBeLessThanOrEqual(3);
      }
    }
  });

  it("누적 주 — 데드만 주별 상이(볼륨 주 규칙없음 / 헤비 주 nsunsTopSet)", () => {
    const dead1 = p.weeks[0].days.find((d) => d.ordinal === 2).slots.find((s) => s.exerciseId === "deadlift");
    const dead2 = p.weeks[1].days.find((d) => d.ordinal === 2).slots.find((s) => s.exerciseId === "deadlift");
    expect(dead1.progressionRuleId).toBeUndefined();
    expect(dead1.sets.some((s) => s.amrapRole)).toBe(false);
    expect(dead2.progressionRuleId).toBe("nsunsTopSet");
    expect(dead2.sets.filter((s) => s.amrapRole === "topSet")).toHaveLength(1);
  });

  it("tracked(DP) 슬롯은 두 주에서 같은 slotId 재사용 — 진행 상태 연속", () => {
    for (const id of ["d1-tbar", "d1-pullup", "d2-hip", "d5-curl"]) {
      const w1 = p.weeks[0].days.flatMap((d) => d.slots).find((s) => s.id === id);
      const w2 = p.weeks[1].days.flatMap((d) => d.slots).find((s) => s.id === id);
      expect(w1, id).toBeDefined();
      expect(w2, id).toBeDefined();
      expect(w1.exerciseId).toBe(w2.exerciseId);
    }
  });

  it("불변식 — 벤치 T2(수)는 규칙 없음(벤치 TM은 토 topSet만), T-bar는 DP 6~9", () => {
    const benchT2 = p.weeks[0].days.find((d) => d.ordinal === 3).slots.find((s) => s.id === "d3-bench-t2");
    expect(benchT2.progressionRuleId).toBeUndefined();
    const tbar = p.weeks[0].days[0].slots.find((s) => s.id === "d1-tbar");
    expect(tbar.progressionRuleId).toBe("doubleProgression");
    expect(tbar.progressionParams).toMatchObject({ repMin: 6, repMax: 9, weightStep: 5 });
  });

  it("과학 패널 필수수정 반영 — 스모 4세트·힙쓰러스트 2세트·후면어깨 3세트 존재", () => {
    const sumo = p.weeks[0].days.find((d) => d.ordinal === 4).slots.find((s) => s.exerciseId === "sumoDeadlift");
    expect(sumo.sets).toHaveLength(4);
    const hip = p.weeks[0].days.find((d) => d.ordinal === 2).slots.find((s) => s.exerciseId === "hipThrust");
    expect(hip.sets).toHaveLength(2);
    const rd = p.weeks[0].days[0].slots.find((s) => s.exerciseId === "rearDeltFly");
    expect(rd.sets).toHaveLength(3);
  });
});
