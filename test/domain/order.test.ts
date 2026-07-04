import { describe, it, expect } from "vitest";
import { compareByAtId, sortByAtId } from "../../src/domain/order";

describe("전순서 (at, id)", () => {
  it("at 오름차순", () => {
    const a = { at: "2026-07-01T10:00:00Z", id: "b" };
    const b = { at: "2026-07-02T10:00:00Z", id: "a" };
    expect(compareByAtId(a, b)).toBeLessThan(0);
  });
  it("at 동률이면 id 오름차순", () => {
    const a = { at: "2026-07-01T10:00:00Z", id: "a2" };
    const b = { at: "2026-07-01T10:00:00Z", id: "a10" }; // 문자열 비교: "a10" < "a2"
    expect(compareByAtId(a, b)).toBeGreaterThan(0);
  });
  it("타임존 표기가 달라도 같은 순간이면 동률 → id로", () => {
    const a = { at: "2026-07-01T19:00:00+09:00", id: "x" };
    const b = { at: "2026-07-01T10:00:00Z", id: "y" };
    expect(compareByAtId(a, b)).toBeLessThan(0); // 같은 순간, "x" < "y"
  });
  it("sortByAtId는 원본을 바꾸지 않는다", () => {
    const items = [
      { at: "2026-07-02T00:00:00Z", id: "b" },
      { at: "2026-07-01T00:00:00Z", id: "a" },
    ];
    const sorted = sortByAtId(items);
    expect(sorted.map((i) => i.id)).toEqual(["a", "b"]);
    expect(items.map((i) => i.id)).toEqual(["b", "a"]);
  });
});
