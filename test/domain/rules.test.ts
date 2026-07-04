import { describe, it, expect } from "vitest";
import { judgeTopSet } from "../../src/domain/rules/nsunsTopSet";
import { judgeT2 } from "../../src/domain/rules/t2LastSet";
import { applyAccessorySession } from "../../src/domain/rules/doubleProgression";
import type { AccessoryState } from "../../src/domain/types.ts";

describe("judgeTopSet (진리표)", () => {
  it("0~1렙 → holdOrDeload 제안", () => {
    expect(judgeTopSet(0, { increment: 2.5 }).kind).toBe("holdOrDeload");
    expect(judgeTopSet(1, { increment: 2.5 }).kind).toBe("holdOrDeload");
  });
  it("2~3렙 → 자동 +increment", () => {
    expect(judgeTopSet(2, { increment: 2.5 })).toEqual({ kind: "auto", delta: 2.5 });
    expect(judgeTopSet(3, { increment: 5 })).toEqual({ kind: "auto", delta: 5 });
  });
  it("4렙 이상 → 2×increment 보너스 제안", () => {
    expect(judgeTopSet(4, { increment: 2.5 })).toEqual({ kind: "bonusProposal", suggested: 5 });
    expect(judgeTopSet(7, { increment: 5 })).toEqual({ kind: "bonusProposal", suggested: 10 });
  });
});

describe("judgeT2", () => {
  it("마지막 세트 완수 → 자동 +increment, streak 리셋", () => {
    expect(judgeT2({ actualReps: 8, targetReps: 8 }, 1, { increment: 2.5 }))
      .toEqual({ kind: "auto", delta: 2.5, failStreak: 0 });
  });
  it("미완수 1회 → none, streak 1", () => {
    expect(judgeT2({ actualReps: 6, targetReps: 8 }, 0, { increment: 2.5 }))
      .toEqual({ kind: "none", failStreak: 1 });
  });
  it("2연속 미완수 → 디로드 제안", () => {
    expect(judgeT2({ actualReps: 6, targetReps: 8 }, 1, { increment: 2.5 }))
      .toEqual({ kind: "deloadProposal", failStreak: 2 });
  });
  it("마지막 세트 기록 없음 → none, streak 유지", () => {
    expect(judgeT2(undefined, 1, { increment: 2.5 })).toEqual({ kind: "none", failStreak: 1 });
  });
});

describe("applyAccessorySession (더블 프로그레션)", () => {
  const params = { repMin: 8, repMax: 12, weightStep: 5 };
  const base: AccessoryState = { weight: 40, targetReps: 8, missStreak: 0, grace: false };

  it("마지막 세트 상한 도달 → +스텝·rep 리셋·유예", () => {
    const { state, rollback } = applyAccessorySession(base, { actualWeight: 40, actualReps: 12 }, params);
    expect(state).toEqual({ weight: 45, targetReps: 8, missStreak: 0, grace: true });
    expect(rollback).toBe(false);
  });
  it("범위 내 수행 → 목표 = actual+1 (상한 캡), 유예 해제", () => {
    const { state } = applyAccessorySession({ ...base, grace: true }, { actualWeight: 40, actualReps: 9 }, params);
    expect(state.targetReps).toBe(10);
    expect(state.grace).toBe(false);
    expect(state.missStreak).toBe(0);
  });
  it("유예 세션의 하한 미달은 카운트 제외", () => {
    const { state, rollback } = applyAccessorySession({ ...base, grace: true }, { actualWeight: 45, actualReps: 6 }, params);
    expect(state.missStreak).toBe(0);
    expect(state.grace).toBe(false);
    expect(rollback).toBe(false);
  });
  it("유예 아닌 하한 미달 2연속 → rollback 신호", () => {
    const r1 = applyAccessorySession(base, { actualWeight: 45, actualReps: 6 }, params);
    expect(r1.state.missStreak).toBe(1);
    expect(r1.rollback).toBe(false);
    const r2 = applyAccessorySession(r1.state, { actualWeight: 45, actualReps: 7 }, params);
    expect(r2.state.missStreak).toBe(2);
    expect(r2.rollback).toBe(true);
  });
  it("세트 기록 없음 → 상태 불변", () => {
    const { state, rollback } = applyAccessorySession(base, undefined, params);
    expect(state).toEqual(base);
    expect(rollback).toBe(false);
  });
});
