import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { parseAndValidateProgram, fetchProgramFromUrl } from "../../src/lib/programImport";

const seedJsonText = readFileSync("programs/nsuns-5day.json", "utf8");

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 검증 fixture(고의 스키마 위반 조작용, any 허용)
function minimalProgramObj(overrides: Record<string, unknown> = {}): any {
  return {
    id: "test-prog",
    name: "테스트 프로그램",
    version: 1,
    schemaVersion: 1,
    weeks: [
      {
        days: [
          {
            ordinal: 1,
            name: "day1",
            slots: [
              {
                id: "s1",
                exerciseId: "bench",
                label: "T1",
                sets: [{ load: { kind: "pctOfTM", pct: 0.75 }, reps: 5 }],
              },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseAndValidateProgram", () => {
  it("① 정상 시드 JSON을 통과시킨다", () => {
    const result = parseAndValidateProgram(seedJsonText);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.program.id).toBeTruthy();
    }
  });

  it("② 스키마 위반(slots 누락)을 잡는다", () => {
    const p = minimalProgramObj();
    delete p.weeks[0].days[0].slots;
    const result = parseAndValidateProgram(JSON.stringify(p));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.join("\n")).toContain("[스키마]");
    }
  });

  it("③ 의미 위반(사이클-주 TM 규칙 2개)을 잡는다 — RULES 발화 확인", () => {
    const p = minimalProgramObj();
    p.weeks[0].days[0].slots.push({
      id: "s2",
      exerciseId: "bench",
      label: "T2",
      progressionRuleId: "linear",
      progressionParams: { increment: 2.5 },
      sets: [{ load: { kind: "pctOfTM", pct: 0.5 }, reps: 8 }],
    });
    p.weeks[0].days[0].slots[0].progressionRuleId = "linear";
    p.weeks[0].days[0].slots[0].progressionParams = { increment: 2.5 };
    const result = parseAndValidateProgram(JSON.stringify(p));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join("\n")).toContain("증량 규칙 슬롯 2개");
    }
  });

  it("④ JSON 파싱 실패 시 ok:false", () => {
    const result = parseAndValidateProgram("{ not valid json");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("JSON 파싱 실패");
    }
  });
});

describe("fetchProgramFromUrl", () => {
  it("⑤ fetch 실패 시 CORS 안내를 포함한 명시 에러를 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    await expect(fetchProgramFromUrl("https://example.com/program.json")).rejects.toThrow(
      /CORS/,
    );
  });

  it("응답이 ok가 아니면 명시 에러를 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => "" }),
    );
    await expect(fetchProgramFromUrl("https://example.com/program.json")).rejects.toThrow(
      /CORS/,
    );
  });

  it("성공 시 응답 텍스트를 반환한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => seedJsonText }),
    );
    await expect(fetchProgramFromUrl("https://example.com/program.json")).resolves.toBe(
      seedJsonText,
    );
  });
});
