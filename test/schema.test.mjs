import { describe, it, expect } from "vitest";
import { validateSchema } from "../lib/validation.mjs";
import { minimalProgram } from "./fixtures.mjs";

describe("스키마 검증", () => {
  it("최소 유효 프로그램을 통과시킨다", () => {
    expect(validateSchema(minimalProgram())).toEqual([]);
  });
});
