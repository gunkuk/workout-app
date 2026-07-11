import { describe, it, expect } from "vitest";
import { validateSemantics, validateProgram } from "../lib/validation.mjs";
import { minimalProgram } from "./fixtures.mjs";

function ruledSlot(ruleId, params, sets) {
  const p = minimalProgram();
  p.weeks[0].days[0].slots[0].progressionRuleId = ruleId;
  p.weeks[0].days[0].slots[0].progressionParams = params;
  if (sets) p.weeks[0].days[0].slots[0].sets = sets;
  return p;
}

function twoSlotProgram() {
  const p = minimalProgram();
  p.weeks[0].days[0].slots.push({
    id: "s2",
    exerciseId: "ohp",
    label: "T2",
    sets: [{ load: { kind: "pctOfTM", pct: 0.5 }, reps: 6 }],
  });
  return p;
}

describe("시맨틱 검증", () => {
  it("유효 프로그램은 빈 배열", () => {
    expect(validateSemantics(twoSlotProgram())).toEqual([]);
  });

  it("slotId 중복을 잡는다", () => {
    const p = twoSlotProgram();
    p.weeks[0].days[0].slots[1].id = "s1";
    expect(validateSemantics(p).join("\n")).toContain("slotId 중복");
  });

  // 2026-07-11 완화(KK 4-day 멀티위크): slotId 유일성은 주 내에서만 — 주 간 같은 id 재사용은
  // "같은 슬롯의 재등장"(doubleProgression 상태 연속에 필요)으로 허용하되 exerciseId가 같아야 한다.
  it("주 간 같은 slotId 재사용(동일 exerciseId)은 허용", () => {
    const p = twoSlotProgram();
    p.weeks.push(JSON.parse(JSON.stringify(p.weeks[0])));
    expect(validateSemantics(p)).toEqual([]);
  });

  it("주 간 slotId 재사용인데 exerciseId가 다르면 에러", () => {
    const p = twoSlotProgram();
    p.weeks.push(JSON.parse(JSON.stringify(p.weeks[0])));
    p.weeks[1].days[0].slots[0].exerciseId = "otherLift";
    expect(validateSemantics(p).join("\n")).toContain("exerciseId 불일치");
  });

  it("슬롯당 topSet 2개를 잡는다", () => {
    const p = minimalProgram();
    p.weeks[0].days[0].slots[0].sets = [
      { load: { kind: "pctOfTM", pct: 0.95 }, reps: 1, amrapRole: "topSet" },
      { load: { kind: "pctOfTM", pct: 0.9 }, reps: 1, amrapRole: "topSet" },
    ];
    expect(validateSemantics(p).join("\n")).toContain("topSet");
  });

  it("validateProgram = 스키마 실패 시 시맨틱 생략", () => {
    const p = minimalProgram({ schemaVersion: 99 });
    const errors = validateProgram(p);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every((e) => e.startsWith("[스키마]"))).toBe(true);
  });
});

describe("증량 규칙 카탈로그", () => {
  it("알 수 없는 ruleId를 잡는다", () => {
    const errors = validateSemantics(ruledSlot("magicRule", {}));
    expect(errors.join("\n")).toContain("알 수 없는 규칙");
  });

  it("nsunsTopSet: topSet 세트 없으면 에러", () => {
    const errors = validateSemantics(ruledSlot("nsunsTopSet", { increment: 2.5 }));
    expect(errors.join("\n")).toContain("topSet 세트 없음");
  });

  it("nsunsTopSet: topSet 있고 increment 유효하면 통과", () => {
    const errors = validateSemantics(
      ruledSlot("nsunsTopSet", { increment: 2.5 }, [
        { load: { kind: "pctOfTM", pct: 0.95 }, reps: 1, amrapRole: "topSet" },
      ]),
    );
    expect(errors).toEqual([]);
  });

  it("doubleProgression: repMin>=repMax를 잡는다", () => {
    const errors = validateSemantics(
      ruledSlot("doubleProgression", { repMin: 12, repMax: 8, weightStep: 5 }),
    );
    expect(errors.join("\n")).toContain("repMin<repMax");
  });

  it("t2LastSet: increment 누락을 잡는다", () => {
    const errors = validateSemantics(ruledSlot("t2LastSet", {}));
    expect(errors.join("\n")).toContain("increment");
  });
});
