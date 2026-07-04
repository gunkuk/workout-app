export function minimalProgram(overrides = {}) {
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
