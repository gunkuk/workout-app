# Stage 1-A: 프로그램 표준 양식 & 도구 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프로그램 정의의 기계 정본(JSON Schema) + 검증기·렌더러 CLI + 검증된 nSuns 5-day 시드 JSON을 만든다 — 앱·자연어 변환·친구 배포가 전부 이 위에 선다.

**Architecture:** 순수 Node ESM 라이브러리(`lib/`) + 얇은 CLI 래퍼(`tools/`). 검증 = ajv(스키마) + 순수 함수(시맨틱 불변식). 렌더러 = 프로그램 JSON+TM → 주차별 세트표 마크다운(자연어 변환 눈검수용). 스펙: `docs/superpowers/specs/2026-07-05-workout-pwa-design.md` §3.3·§3.7.

**Tech Stack:** Node ≥20, ESM, ajv@8 + ajv-formats, vitest.

## Global Constraints

- `package.json`에 `"type": "module"` — 전부 ESM, `.mjs`/`.js` import에 확장자 명시.
- 의존성은 정확히 3개: `ajv@^8`, `ajv-formats@^3` (dependencies), `vitest@^3` (devDependencies). 추가 금지.
- 무게 단위 kg. 반올림 = `Math.round(weight / step) * step` (step 기본 2.5).
- `schemaVersion`은 정수 `1` 고정 (스펙 §3.3 — 모든 영속 엔티티 공통).
- 도구의 출력·에러 메시지는 한국어.
- 증량 규칙 ID는 4개만: `nsunsTopSet` · `t2LastSet` · `doubleProgression` · `linear` (스펙 §3.7 카탈로그).
- 불변식(스펙 §2-3·§3.3): 각 사이클-주 내 exerciseId당 progressionRule 보유 슬롯 ≤ 1 / slotId 전역 유일 / 슬롯당 topSet 세트 ≤ 1.
- 모든 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` 트레일러.
- 작업 디렉터리: `C:\Users\rjs11\Desktop\workout-app` (git repo 존재, docs만 있음).

---

### Task 1: 프로젝트 스캐폴드 + JSON Schema + 로딩 스모크

**Files:**
- Create: `package.json`, `.gitignore`, `schema/program.schema.json`, `test/fixtures.mjs`, `test/schema.test.mjs`

**Interfaces:**
- Produces: `schema/program.schema.json` (draft-07) — 이후 모든 태스크가 참조. `test/fixtures.mjs`의 `minimalProgram(overrides)` — 모든 테스트의 기본 픽스처.

- [ ] **Step 1: package.json / .gitignore 작성**

`package.json`:
```json
{
  "name": "workout-app",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "vitest run",
    "validate": "node tools/validate.mjs",
    "render": "node tools/render.mjs"
  },
  "dependencies": { "ajv": "^8.17.1", "ajv-formats": "^3.0.1" },
  "devDependencies": { "vitest": "^3.0.0" }
}
```

`.gitignore`:
```
node_modules/
dist/
```

- [ ] **Step 2: 의존성 설치**

Run: `npm install`
Expected: `node_modules/` 생성, 에러 없음. (`npm ls ajv vitest`로 3개 패키지 확인)

- [ ] **Step 3: JSON Schema 작성**

`schema/program.schema.json` (스펙 §3.3 ProgramDefinition의 기계 정본):
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "workout-app/program.schema.json",
  "title": "ProgramDefinition",
  "type": "object",
  "required": ["id", "name", "version", "schemaVersion", "weeks"],
  "additionalProperties": false,
  "properties": {
    "id": { "type": "string", "minLength": 1 },
    "name": { "type": "string", "minLength": 1 },
    "description": { "type": "string" },
    "version": { "type": "integer", "minimum": 1 },
    "schemaVersion": { "const": 1 },
    "weeks": { "type": "array", "minItems": 1, "items": { "$ref": "#/$defs/week" } }
  },
  "$defs": {
    "week": {
      "type": "object",
      "required": ["days"],
      "additionalProperties": false,
      "properties": {
        "days": { "type": "array", "minItems": 1, "items": { "$ref": "#/$defs/day" } }
      }
    },
    "day": {
      "type": "object",
      "required": ["ordinal", "name", "slots"],
      "additionalProperties": false,
      "properties": {
        "ordinal": { "type": "integer", "minimum": 1 },
        "weekdayHint": { "type": "string" },
        "name": { "type": "string", "minLength": 1 },
        "slots": { "type": "array", "minItems": 1, "items": { "$ref": "#/$defs/slot" } }
      }
    },
    "slot": {
      "type": "object",
      "required": ["id", "exerciseId", "label", "sets"],
      "additionalProperties": false,
      "properties": {
        "id": { "type": "string", "minLength": 1 },
        "exerciseId": { "type": "string", "minLength": 1 },
        "label": { "type": "string", "minLength": 1 },
        "groupId": { "type": "string" },
        "warmupRuleId": { "type": "string" },
        "progressionRuleId": { "type": "string" },
        "progressionParams": { "type": "object" },
        "sets": { "type": "array", "minItems": 1, "items": { "$ref": "#/$defs/set" } }
      }
    },
    "set": {
      "type": "object",
      "required": ["load", "reps"],
      "additionalProperties": false,
      "properties": {
        "load": { "$ref": "#/$defs/load" },
        "reps": { "type": "integer", "minimum": 1 },
        "amrapRole": { "enum": ["topSet", "backoff"] }
      }
    },
    "load": {
      "oneOf": [
        {
          "type": "object",
          "required": ["kind", "pct"],
          "additionalProperties": false,
          "properties": {
            "kind": { "const": "pctOfTM" },
            "ref": { "type": "string", "minLength": 1 },
            "pct": { "type": "number", "exclusiveMinimum": 0, "maximum": 1.2 }
          }
        },
        {
          "type": "object",
          "required": ["kind"],
          "additionalProperties": false,
          "properties": { "kind": { "const": "tracked" } }
        }
      ]
    }
  }
}
```

- [ ] **Step 4: 픽스처 + 실패하는 스모크 테스트 작성**

`test/fixtures.mjs`:
```js
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
```

`test/schema.test.mjs`:
```js
import { describe, it, expect } from "vitest";
import { validateSchema } from "../lib/validation.mjs";
import { minimalProgram } from "./fixtures.mjs";

describe("스키마 검증", () => {
  it("최소 유효 프로그램을 통과시킨다", () => {
    expect(validateSchema(minimalProgram())).toEqual([]);
  });
});
```

- [ ] **Step 5: 실패 확인**

Run: `npx vitest run test/schema.test.mjs`
Expected: FAIL — `Cannot find module '../lib/validation.mjs'`

- [ ] **Step 6: validateSchema 최소 구현**

`lib/validation.mjs`:
```js
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const here = dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(
  readFileSync(join(here, "..", "schema", "program.schema.json"), "utf8"),
);

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
addFormats(ajv);
const compiled = ajv.compile(schema);

/** @returns {string[]} 에러 메시지 배열 (빈 배열 = 통과) */
export function validateSchema(program) {
  if (compiled(program)) return [];
  return (compiled.errors ?? []).map(
    (e) => `[스키마] ${e.instancePath || "(root)"} ${e.message}`,
  );
}
```

- [ ] **Step 7: 통과 확인**

Run: `npx vitest run test/schema.test.mjs`
Expected: PASS (1 passed)

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json .gitignore schema/ lib/ test/
git commit -m "feat: 프로그램 JSON Schema + validateSchema (Stage1-A T1)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 스키마 거부 케이스

**Files:**
- Modify: `test/schema.test.mjs`

**Interfaces:**
- Consumes: `validateSchema(program): string[]`, `minimalProgram(overrides)`

- [ ] **Step 1: 거부 케이스 테스트 추가**

`test/schema.test.mjs`의 describe 블록 안에 추가:
```js
  it("필수 필드 누락(weeks)을 거부한다", () => {
    const p = minimalProgram();
    delete p.weeks;
    const errors = validateSchema(p);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join("\n")).toContain("weeks");
  });

  it("잘못된 schemaVersion을 거부한다", () => {
    const errors = validateSchema(minimalProgram({ schemaVersion: 2 }));
    expect(errors.length).toBeGreaterThan(0);
  });

  it("pct 범위 밖(1.5) load를 거부한다", () => {
    const p = minimalProgram();
    p.weeks[0].days[0].slots[0].sets[0].load.pct = 1.5;
    expect(validateSchema(p).length).toBeGreaterThan(0);
  });

  it("알 수 없는 load kind를 거부한다", () => {
    const p = minimalProgram();
    p.weeks[0].days[0].slots[0].sets[0].load = { kind: "rpe", value: 8 };
    expect(validateSchema(p).length).toBeGreaterThan(0);
  });

  it("tracked load를 통과시킨다", () => {
    const p = minimalProgram();
    p.weeks[0].days[0].slots[0].sets[0].load = { kind: "tracked" };
    expect(validateSchema(p)).toEqual([]);
  });

  it("amrapRole 오타를 거부한다", () => {
    const p = minimalProgram();
    p.weeks[0].days[0].slots[0].sets[0].amrapRole = "topset";
    expect(validateSchema(p).length).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: 실행 — 전부 통과해야 정상** (스키마가 이미 제약을 갖고 있으므로)

Run: `npx vitest run test/schema.test.mjs`
Expected: PASS (7 passed). 실패하는 케이스가 있으면 **스키마 버그** — `schema/program.schema.json`의 해당 제약(oneOf·enum·maximum)을 수정해 통과시킨다.

- [ ] **Step 3: Commit**

```bash
git add test/schema.test.mjs schema/
git commit -m "test: 스키마 거부 케이스 6종 (Stage1-A T2)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 시맨틱 검증 — 불변식 3종

**Files:**
- Modify: `lib/validation.mjs`
- Create: `test/semantics.test.mjs`

**Interfaces:**
- Produces: `validateSemantics(program): string[]`, `validateProgram(program): string[]` (스키마 통과 시 시맨틱까지). Task 4의 `RULES`가 이 함수 안에서 호출됨.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/semantics.test.mjs`:
```js
import { describe, it, expect } from "vitest";
import { validateSemantics, validateProgram } from "../lib/validation.mjs";
import { minimalProgram } from "./fixtures.mjs";

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
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run test/semantics.test.mjs`
Expected: FAIL — `validateSemantics is not a function` (또는 export 없음)

- [ ] **Step 3: 구현** — `lib/validation.mjs`에 추가:

```js
/** 스키마 통과를 전제로 한 불변식 검사 */
export function validateSemantics(program) {
  const errors = [];
  const slotIds = new Set();

  program.weeks.forEach((week, wi) => {
    const ruledByExercise = new Map(); // exerciseId -> slotId (이 사이클-주)
    for (const day of week.days) {
      for (const slot of day.slots) {
        if (slotIds.has(slot.id)) errors.push(`[시맨틱] slotId 중복: ${slot.id}`);
        slotIds.add(slot.id);

        const topSets = slot.sets.filter((s) => s.amrapRole === "topSet");
        if (topSets.length > 1)
          errors.push(`[시맨틱] 슬롯 ${slot.id}: topSet 세트 ${topSets.length}개 (슬롯당 최대 1)`);

        if (slot.progressionRuleId) {
          errors.push(...checkRule(slot, wi, ruledByExercise));
        }
      }
    }
  });
  return errors;
}

/** Task 4에서 RULES 카탈로그로 확장 — 지금은 주당 1규칙 불변식 골격만 */
function checkRule(slot, weekIndex, ruledByExercise) {
  const errors = [];
  if (ruledByExercise.has(slot.exerciseId)) {
    errors.push(
      `[시맨틱] 주 ${weekIndex + 1}: ${slot.exerciseId}에 증량 규칙 슬롯 2개` +
        ` (${ruledByExercise.get(slot.exerciseId)}, ${slot.id}) — TM당 규칙은 사이클-주 1개`,
    );
  }
  ruledByExercise.set(slot.exerciseId, slot.id);
  return errors;
}

export function validateProgram(program) {
  const schemaErrors = validateSchema(program);
  if (schemaErrors.length) return schemaErrors;
  return validateSemantics(program);
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run`
Expected: PASS (schema 7 + semantics 4 = 11 passed)

- [ ] **Step 5: Commit**

```bash
git add lib/validation.mjs test/semantics.test.mjs
git commit -m "feat: 시맨틱 검증 — slotId 유일·topSet 상한·주당 1규칙 골격 (Stage1-A T3)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 증량 규칙 카탈로그(RULES) — ruleId·params 검증

**Files:**
- Modify: `lib/validation.mjs`, `test/semantics.test.mjs`

**Interfaces:**
- Produces: `RULES` — `{ [ruleId]: { checkParams(params, slot): string[] } }`. Plan B(도메인)가 같은 ruleId 문자열로 실행 로직을 구현한다. ruleId 4종: `nsunsTopSet`(params: `increment` kg>0, 슬롯에 topSet 세트 필수) / `t2LastSet`(`increment`>0) / `doubleProgression`(`repMin`<`repMax` 정수, `weightStep`>0) / `linear`(`increment`>0).

- [ ] **Step 1: 실패하는 테스트 추가** — `test/semantics.test.mjs`에:

```js
function ruledSlot(ruleId, params, sets) {
  const p = minimalProgram();
  p.weeks[0].days[0].slots[0].progressionRuleId = ruleId;
  p.weeks[0].days[0].slots[0].progressionParams = params;
  if (sets) p.weeks[0].days[0].slots[0].sets = sets;
  return p;
}

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
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run test/semantics.test.mjs`
Expected: FAIL — 새 5개 테스트가 "알 수 없는 규칙" 등 메시지 부재로 실패

- [ ] **Step 3: 구현** — `lib/validation.mjs`의 `checkRule`을 교체하고 `RULES` 추가:

```js
export const RULES = {
  nsunsTopSet: {
    checkParams(params, slot) {
      const errs = [];
      if (!slot.sets.some((s) => s.amrapRole === "topSet"))
        errs.push(`[시맨틱] 슬롯 ${slot.id}: nsunsTopSet 규칙인데 topSet 세트 없음`);
      if (!(typeof params.increment === "number" && params.increment > 0))
        errs.push(`[시맨틱] 슬롯 ${slot.id}: nsunsTopSet.increment(kg>0) 필요`);
      return errs;
    },
  },
  t2LastSet: {
    checkParams(params, slot) {
      if (!(typeof params.increment === "number" && params.increment > 0))
        return [`[시맨틱] 슬롯 ${slot.id}: t2LastSet.increment(kg>0) 필요`];
      return [];
    },
  },
  doubleProgression: {
    checkParams(params, slot) {
      const errs = [];
      const { repMin, repMax, weightStep } = params;
      if (!(Number.isInteger(repMin) && Number.isInteger(repMax) && repMin < repMax))
        errs.push(`[시맨틱] 슬롯 ${slot.id}: doubleProgression은 정수 repMin<repMax 필요`);
      if (!(typeof weightStep === "number" && weightStep > 0))
        errs.push(`[시맨틱] 슬롯 ${slot.id}: doubleProgression.weightStep(kg>0) 필요`);
      return errs;
    },
  },
  linear: {
    checkParams(params, slot) {
      if (!(typeof params.increment === "number" && params.increment > 0))
        return [`[시맨틱] 슬롯 ${slot.id}: linear.increment(kg>0) 필요`];
      return [];
    },
  },
};

function checkRule(slot, weekIndex, ruledByExercise) {
  const errors = [];
  const rule = RULES[slot.progressionRuleId];
  if (!rule) {
    errors.push(`[시맨틱] 슬롯 ${slot.id}: 알 수 없는 규칙 '${slot.progressionRuleId}'`);
    return errors;
  }
  if (ruledByExercise.has(slot.exerciseId)) {
    errors.push(
      `[시맨틱] 주 ${weekIndex + 1}: ${slot.exerciseId}에 증량 규칙 슬롯 2개` +
        ` (${ruledByExercise.get(slot.exerciseId)}, ${slot.id}) — TM당 규칙은 사이클-주 1개`,
    );
  }
  ruledByExercise.set(slot.exerciseId, slot.id);
  errors.push(...rule.checkParams(slot.progressionParams ?? {}, slot));
  return errors;
}
```

- [ ] **Step 4: 전체 통과 확인**

Run: `npx vitest run`
Expected: PASS (16 passed)

- [ ] **Step 5: Commit**

```bash
git add lib/validation.mjs test/semantics.test.mjs
git commit -m "feat: 증량 규칙 카탈로그 RULES 4종 + params 검증 (Stage1-A T4)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 카탈로그·변환 규약 문서

**Files:**
- Create: `schema/rules-catalog.md`, `docs/conversion-guide.md`

**Interfaces:**
- Produces: 자연어→JSON 변환을 수행할 미래 Claude 세션의 계약 문서. 코드 없음(문서 태스크) — 내용이 곧 산출물.

- [ ] **Step 1: rules-catalog.md 작성**

`schema/rules-catalog.md`:
```markdown
# 증량 규칙 카탈로그 (정본)

프로그램 JSON의 `progressionRuleId`는 아래 4개만 허용된다. 새 규칙 = 이 문서 + `lib/validation.mjs`의 `RULES` + (Plan B) 도메인 규칙 파일 1개 추가.

공통: 발효는 `SessionCompleted(status:"completed")` 시점, **TM당 사이클-주 발효 ≤1**(스펙 §2-3). 대체 세트(`substitutedFrom`)는 판정 입력에서 제외.

## nsunsTopSet — T1 메인리프트 (nSuns 원전)
- params: `{ "increment": number }` — 2~3렙 자동 증량폭 (kg). 벤치/OHP 2.5, 스쿼트/데드 5.
- 판정 입력: 이 슬롯의 `amrapRole:"topSet"` 세트의 실제 reps.
- 진리표: 0~1 → 제안(동결★/−5kg) · 2~3 → 자동 +increment · 4+ → 제안(+2×increment).
- 제약: 슬롯에 topSet 세트 1개 필수.

## t2LastSet — 독립 T2 리프트 (스모·프론트·인클라인·CGBP)
- params: `{ "increment": number }` — 인클라인/CGBP 2.5, 프론트 5, 스모 2.5(디스크).
- 판정: 슬롯 마지막 세트 목표 reps 완수 → 자동 +increment. 2사이클-주 연속 미완수 → 디로드 제안(−5% 또는 직전 TM).

## doubleProgression — 악세사리 (tracked load)
- params: `{ "repMin": int, "repMax": int, "weightStep": number, "sets": int }`
- 판정: 마지막 세트 actual reps ≥ repMax → 다음 세션 +weightStep, 목표 repMin으로 리셋. RIR 게이트 없음(2026-07-05 확정).
- 롤백: 증량 직후 1세션 유예 후, 2세션 연속 마지막 세트 < repMin → 이전 무게 제안.

## linear — 고정 주기 증량 (범용, 531류)
- params: `{ "increment": number }` — 사이클 완료 시 무조건 +increment 제안.
```

- [ ] **Step 2: conversion-guide.md 작성**

`docs/conversion-guide.md`:
```markdown
# 자연어 루틴 → 프로그램 JSON 변환 규약

**대상 독자: 이 변환을 수행할 (미래의) Claude Code 세션.** 사용자가 볼트
(`LLM-Wiki/4. KK/Weight Lifting/routines/*.md`)에 자연어로 쓴 루틴을
표준 양식 JSON으로 옮기는 절차다. 해석(자연어→구조)은 네가 하고,
정답 검증은 아래 도구가 한다 — 도구를 건너뛰고 "맞을 것"이라 단정하지 마라.

## 절차 (닫힌 루프)
1. 자연어 루틴 읽기. 모호하면 **추측 말고 사용자에게 질문** (요일 매핑,
   %인지 고정무게인지, AMRAP 여부, 증량 규칙).
2. `schema/program.schema.json` + `schema/rules-catalog.md` 참조해 JSON 작성.
   - slotId 컨벤션: `w{주}d{일}-{운동}-{역할}` 예: `w1d5-bench-t1`
   - 같은 운동이 한 주에 2번 나오면 **증량 규칙은 한 슬롯에만** (불변식).
3. `npm run validate -- <파일>` → 에러 0이 될 때까지 수정.
4. `npm run render -- <파일> --tm bench=105 --tm squat=85 ...` →
   출력된 세트표를 **원문과 나란히 놓고 세트 단위로 대조**. 무게·reps·AMRAP
   위치가 다르면 JSON 수정 후 3부터 반복.
5. 렌더 표를 사용자에게 보여주고 확인받은 뒤 `programs/`에 저장·커밋.
   (Stage 2 이후: GitHub push → 앱에서 URL 가져오기.)

## 함정 목록 (검증 루프에서 실제로 나온 것)
- 벤치처럼 주 2회 등장하는 리프트: volume day 슬롯엔 rule·topSet 금지.
- T1 리프트가 T2 슬롯로 재등장(화 OHP): rule 없이 볼륨 전용.
- 머신 악세사리 weightStep은 2.5가 아니라 실측(보통 5).
- topSet은 슬롯당 1개, `95%×1+`처럼 원문에 "+"가 붙은 최고중량 세트.
  마지막 백오프 AMRAP(`65%×5+`)은 `backoff`.
```

- [ ] **Step 3: Commit**

```bash
git add schema/rules-catalog.md docs/conversion-guide.md
git commit -m "docs: 증량 규칙 카탈로그 + 자연어 변환 규약 (Stage1-A T5)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 렌더러 라이브러리

**Files:**
- Create: `lib/render.mjs`, `test/render.test.mjs`

**Interfaces:**
- Produces: `roundToStep(weight, step): number` · `renderProgram(program, tms, {step=2.5}): string` (마크다운). `tms` = `{ [exerciseId]: number }`. Plan B·C가 `roundToStep`을 동일 규약으로 재사용.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/render.test.mjs`:
```js
import { describe, it, expect } from "vitest";
import { roundToStep, renderProgram } from "../lib/render.mjs";
import { minimalProgram } from "./fixtures.mjs";

describe("roundToStep", () => {
  it("2.5 단위 반올림 — 볼트 표 재현", () => {
    // TM 105 기준: 스펙 검증 라운드에서 확인된 볼트 표 값
    expect(roundToStep(105 * 0.75, 2.5)).toBe(80);   // 78.75 → 80
    expect(roundToStep(105 * 0.85, 2.5)).toBe(90);   // 89.25 → 90
    expect(roundToStep(105 * 0.95, 2.5)).toBe(100);  // 99.75 → 100
    expect(roundToStep(105 * 0.65, 2.5)).toBe(67.5); // 68.25 → 67.5
  });
  it("step 5 반올림", () => {
    expect(roundToStep(78.75, 5)).toBe(80);
    expect(roundToStep(72.4, 5)).toBe(70);
  });
});

describe("renderProgram", () => {
  it("pctOfTM 세트를 무게로 계산해 표로 출력", () => {
    const md = renderProgram(minimalProgram(), { bench: 105 });
    expect(md).toContain("| 1 | 80kg (75%) | 5 |");
  });
  it("TM 누락 시 물음표 표기(에러 아님)", () => {
    const md = renderProgram(minimalProgram(), {});
    expect(md).toContain("75% of bench (TM?)");
  });
  it("tracked load는 — 로 표기, topSet에 ★ 표기", () => {
    const p = minimalProgram();
    p.weeks[0].days[0].slots[0].sets = [
      { load: { kind: "tracked" }, reps: 8 },
      { load: { kind: "pctOfTM", pct: 0.95 }, reps: 1, amrapRole: "topSet" },
    ];
    const md = renderProgram(p, { bench: 105 });
    expect(md).toContain("| 1 | — | 8 |");
    expect(md).toContain("1+ ★topSet");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run test/render.test.mjs`
Expected: FAIL — `Cannot find module '../lib/render.mjs'`

- [ ] **Step 3: 구현**

`lib/render.mjs`:
```js
export function roundToStep(weight, step) {
  return Math.round(weight / step) * step;
}

export function renderProgram(program, tms, { step = 2.5 } = {}) {
  const lines = [`# ${program.name} (v${program.version})`];
  program.weeks.forEach((week, wi) => {
    lines.push("", `## Week ${wi + 1}`);
    for (const day of week.days) {
      const hint = day.weekdayHint ? ` (${day.weekdayHint})` : "";
      lines.push("", `### Day ${day.ordinal}${hint} — ${day.name}`);
      for (const slot of day.slots) {
        const rule = slot.progressionRuleId ? ` · rule: ${slot.progressionRuleId}` : "";
        lines.push("", `**[${slot.label}] ${slot.exerciseId}**${rule}`);
        lines.push("| # | 무게 | reps |", "|---|---|---|");
        slot.sets.forEach((set, si) => {
          let w = "—";
          if (set.load.kind === "pctOfTM") {
            const ref = set.load.ref ?? slot.exerciseId;
            const pctLabel = `${Math.round(set.load.pct * 100)}%`;
            w =
              tms[ref] == null
                ? `${pctLabel} of ${ref} (TM?)`
                : `${roundToStep(tms[ref] * set.load.pct, step)}kg (${pctLabel})`;
          }
          const reps = set.amrapRole
            ? `${set.reps}+${set.amrapRole === "topSet" ? " ★topSet" : ""}`
            : `${set.reps}`;
          lines.push(`| ${si + 1} | ${w} | ${reps} |`);
        });
      }
    }
  });
  return lines.join("\n");
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run`
Expected: PASS (21 passed)

- [ ] **Step 5: Commit**

```bash
git add lib/render.mjs test/render.test.mjs
git commit -m "feat: 렌더러 — roundToStep + 주차별 세트표 마크다운 (Stage1-A T6)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: CLI 래퍼 2종

**Files:**
- Create: `tools/validate.mjs`, `tools/render.mjs`

**Interfaces:**
- Consumes: `validateProgram`, `renderProgram`.
- Produces: `npm run validate -- <file>` (exit 0/1/2) · `npm run render -- <file> --tm k=v... [--step n]` (stdout 마크다운). conversion-guide.md가 이 인터페이스를 지시함.

- [ ] **Step 1: validate CLI 작성**

`tools/validate.mjs`:
```js
#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { validateProgram } from "../lib/validation.mjs";

const file = process.argv[2];
if (!file) {
  console.error("사용법: node tools/validate.mjs <program.json>");
  process.exit(2);
}
let program;
try {
  program = JSON.parse(readFileSync(file, "utf8"));
} catch (e) {
  console.error(`❌ 파일/JSON 읽기 실패: ${e.message}`);
  process.exit(2);
}
const errors = validateProgram(program);
if (errors.length) {
  console.error(`❌ 검증 실패 ${errors.length}건:`);
  for (const e of errors) console.error("  -", e);
  process.exit(1);
}
console.log(`✅ 유효한 프로그램: ${program.name} v${program.version}`);
```

- [ ] **Step 2: render CLI 작성**

`tools/render.mjs`:
```js
#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { renderProgram } from "../lib/render.mjs";

const [file, ...rest] = process.argv.slice(2);
if (!file) {
  console.error("사용법: node tools/render.mjs <program.json> [--tm bench=105]... [--step 2.5]");
  process.exit(2);
}
const tms = {};
let step = 2.5;
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === "--tm") {
    const [k, v] = rest[++i].split("=");
    tms[k] = Number(v);
  } else if (rest[i] === "--step") {
    step = Number(rest[++i]);
  }
}
const program = JSON.parse(readFileSync(file, "utf8"));
console.log(renderProgram(program, tms, { step }));
```

- [ ] **Step 3: 스모크 실행** (임시 파일로)

Run:
```bash
node --input-type=module -e "import { minimalProgram } from './test/fixtures.mjs'; import { writeFileSync } from 'node:fs'; writeFileSync('tmp-p.json', JSON.stringify(minimalProgram()));"
node tools/validate.mjs tmp-p.json
node tools/render.mjs tmp-p.json --tm bench=105
rm tmp-p.json
```
Expected: `✅ 유효한 프로그램: 테스트 프로그램 v1` + 마크다운 표에 `| 1 | 80kg (75%) | 5 |`.

- [ ] **Step 4: Commit**

```bash
git add tools/
git commit -m "feat: validate/render CLI 래퍼 (Stage1-A T7)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: nSuns 5-day 시드 프로그램 — 초안 → 공식 대조 → 오라클 테스트

**Files:**
- Create: `programs/nsuns-5day.json`, `test/seed.test.mjs`

**Interfaces:**
- Produces: 검증 통과한 시드 JSON — Plan B의 테스트 픽스처이자 앱의 기본 프로그램. exerciseId 정본: `bench, ohp, squat, deadlift, sumoDeadlift, frontSquat, inclineBench, cgbp, latPulldown, calfRaise, rearDeltFly, machineCurl, chestSupportedRow`.

- [ ] **Step 1: 시드 JSON 초안 작성** — 아래 초안은 통용 nSuns 5-day 기억 기반. **reps 수치는 Step 3에서 공식 시트와 대조해 확정한다** (%·구조는 검증 라운드에서 확인됨).

`programs/nsuns-5day.json`:
```json
{
  "id": "nsuns-5day",
  "name": "nSuns 5/3/1 5-day (화~토)",
  "description": "T1 9세트 + T2 8세트 + 악세사리 1개/일. 사용자 확정 2026-07-05: 데드 +5, RIR 게이트 없음.",
  "version": 1,
  "schemaVersion": 1,
  "weeks": [
    {
      "days": [
        {
          "ordinal": 1, "weekdayHint": "화", "name": "벤치 volume + OHP",
          "slots": [
            { "id": "w1d1-bench-t1", "exerciseId": "bench", "label": "T1",
              "sets": [
                { "load": { "kind": "pctOfTM", "pct": 0.65 }, "reps": 8 },
                { "load": { "kind": "pctOfTM", "pct": 0.75 }, "reps": 6 },
                { "load": { "kind": "pctOfTM", "pct": 0.85 }, "reps": 4 },
                { "load": { "kind": "pctOfTM", "pct": 0.85 }, "reps": 4 },
                { "load": { "kind": "pctOfTM", "pct": 0.85 }, "reps": 4 },
                { "load": { "kind": "pctOfTM", "pct": 0.80 }, "reps": 5 },
                { "load": { "kind": "pctOfTM", "pct": 0.75 }, "reps": 6 },
                { "load": { "kind": "pctOfTM", "pct": 0.70 }, "reps": 7 },
                { "load": { "kind": "pctOfTM", "pct": 0.65 }, "reps": 8, "amrapRole": "backoff" }
              ] },
            { "id": "w1d1-ohp-t2", "exerciseId": "ohp", "label": "T2",
              "sets": [
                { "load": { "kind": "pctOfTM", "pct": 0.50 }, "reps": 6 },
                { "load": { "kind": "pctOfTM", "pct": 0.60 }, "reps": 5 },
                { "load": { "kind": "pctOfTM", "pct": 0.70 }, "reps": 3 },
                { "load": { "kind": "pctOfTM", "pct": 0.70 }, "reps": 5 },
                { "load": { "kind": "pctOfTM", "pct": 0.70 }, "reps": 7 },
                { "load": { "kind": "pctOfTM", "pct": 0.70 }, "reps": 4 },
                { "load": { "kind": "pctOfTM", "pct": 0.70 }, "reps": 6 },
                { "load": { "kind": "pctOfTM", "pct": 0.70 }, "reps": 8 }
              ] },
            { "id": "w1d1-latpull-acc", "exerciseId": "latPulldown", "label": "accessory",
              "progressionRuleId": "doubleProgression",
              "progressionParams": { "repMin": 8, "repMax": 12, "weightStep": 5, "sets": 3 },
              "sets": [
                { "load": { "kind": "tracked" }, "reps": 8 },
                { "load": { "kind": "tracked" }, "reps": 8 },
                { "load": { "kind": "tracked" }, "reps": 8 }
              ] }
          ]
        },
        {
          "ordinal": 2, "weekdayHint": "수", "name": "스쿼트 + 스모데드",
          "slots": [
            { "id": "w1d2-squat-t1", "exerciseId": "squat", "label": "T1",
              "progressionRuleId": "nsunsTopSet", "progressionParams": { "increment": 5 },
              "sets": [
                { "load": { "kind": "pctOfTM", "pct": 0.75 }, "reps": 5 },
                { "load": { "kind": "pctOfTM", "pct": 0.85 }, "reps": 3 },
                { "load": { "kind": "pctOfTM", "pct": 0.95 }, "reps": 1, "amrapRole": "topSet" },
                { "load": { "kind": "pctOfTM", "pct": 0.90 }, "reps": 3 },
                { "load": { "kind": "pctOfTM", "pct": 0.85 }, "reps": 3 },
                { "load": { "kind": "pctOfTM", "pct": 0.80 }, "reps": 3 },
                { "load": { "kind": "pctOfTM", "pct": 0.75 }, "reps": 5 },
                { "load": { "kind": "pctOfTM", "pct": 0.70 }, "reps": 5 },
                { "load": { "kind": "pctOfTM", "pct": 0.65 }, "reps": 5, "amrapRole": "backoff" }
              ] },
            { "id": "w1d2-sumo-t2", "exerciseId": "sumoDeadlift", "label": "T2",
              "progressionRuleId": "t2LastSet", "progressionParams": { "increment": 2.5 },
              "sets": [
                { "load": { "kind": "pctOfTM", "pct": 0.50 }, "reps": 5 },
                { "load": { "kind": "pctOfTM", "pct": 0.60 }, "reps": 5 },
                { "load": { "kind": "pctOfTM", "pct": 0.70 }, "reps": 3 },
                { "load": { "kind": "pctOfTM", "pct": 0.70 }, "reps": 5 },
                { "load": { "kind": "pctOfTM", "pct": 0.70 }, "reps": 7 },
                { "load": { "kind": "pctOfTM", "pct": 0.70 }, "reps": 4 },
                { "load": { "kind": "pctOfTM", "pct": 0.70 }, "reps": 6 },
                { "load": { "kind": "pctOfTM", "pct": 0.70 }, "reps": 8 }
              ] },
            { "id": "w1d2-calf-acc", "exerciseId": "calfRaise", "label": "accessory",
              "progressionRuleId": "doubleProgression",
              "progressionParams": { "repMin": 12, "repMax": 20, "weightStep": 5, "sets": 3 },
              "sets": [
                { "load": { "kind": "tracked" }, "reps": 12 },
                { "load": { "kind": "tracked" }, "reps": 12 },
                { "load": { "kind": "tracked" }, "reps": 12 }
              ] }
          ]
        },
        {
          "ordinal": 3, "weekdayHint": "목", "name": "OHP + 인클라인",
          "slots": [
            { "id": "w1d3-ohp-t1", "exerciseId": "ohp", "label": "T1",
              "progressionRuleId": "nsunsTopSet", "progressionParams": { "increment": 2.5 },
              "sets": [
                { "load": { "kind": "pctOfTM", "pct": 0.75 }, "reps": 5 },
                { "load": { "kind": "pctOfTM", "pct": 0.85 }, "reps": 3 },
                { "load": { "kind": "pctOfTM", "pct": 0.95 }, "reps": 1, "amrapRole": "topSet" },
                { "load": { "kind": "pctOfTM", "pct": 0.90 }, "reps": 3 },
                { "load": { "kind": "pctOfTM", "pct": 0.85 }, "reps": 3 },
                { "load": { "kind": "pctOfTM", "pct": 0.80 }, "reps": 3 },
                { "load": { "kind": "pctOfTM", "pct": 0.75 }, "reps": 5 },
                { "load": { "kind": "pctOfTM", "pct": 0.70 }, "reps": 5 },
                { "load": { "kind": "pctOfTM", "pct": 0.65 }, "reps": 5, "amrapRole": "backoff" }
              ] },
            { "id": "w1d3-incline-t2", "exerciseId": "inclineBench", "label": "T2",
              "progressionRuleId": "t2LastSet", "progressionParams": { "increment": 2.5 },
              "sets": [
                { "load": { "kind": "pctOfTM", "pct": 0.40 }, "reps": 6 },
                { "load": { "kind": "pctOfTM", "pct": 0.50 }, "reps": 5 },
                { "load": { "kind": "pctOfTM", "pct": 0.60 }, "reps": 3 },
                { "load": { "kind": "pctOfTM", "pct": 0.60 }, "reps": 5 },
                { "load": { "kind": "pctOfTM", "pct": 0.60 }, "reps": 7 },
                { "load": { "kind": "pctOfTM", "pct": 0.60 }, "reps": 4 },
                { "load": { "kind": "pctOfTM", "pct": 0.60 }, "reps": 6 },
                { "load": { "kind": "pctOfTM", "pct": 0.60 }, "reps": 8 }
              ] },
            { "id": "w1d3-reardelt-acc", "exerciseId": "rearDeltFly", "label": "accessory",
              "progressionRuleId": "doubleProgression",
              "progressionParams": { "repMin": 12, "repMax": 20, "weightStep": 5, "sets": 3 },
              "sets": [
                { "load": { "kind": "tracked" }, "reps": 12 },
                { "load": { "kind": "tracked" }, "reps": 12 },
                { "load": { "kind": "tracked" }, "reps": 12 }
              ] }
          ]
        },
        {
          "ordinal": 4, "weekdayHint": "금", "name": "데드리프트 + 프론트스쿼트",
          "slots": [
            { "id": "w1d4-dead-t1", "exerciseId": "deadlift", "label": "T1",
              "progressionRuleId": "nsunsTopSet", "progressionParams": { "increment": 5 },
              "sets": [
                { "load": { "kind": "pctOfTM", "pct": 0.75 }, "reps": 5 },
                { "load": { "kind": "pctOfTM", "pct": 0.85 }, "reps": 3 },
                { "load": { "kind": "pctOfTM", "pct": 0.95 }, "reps": 1, "amrapRole": "topSet" },
                { "load": { "kind": "pctOfTM", "pct": 0.90 }, "reps": 3 },
                { "load": { "kind": "pctOfTM", "pct": 0.85 }, "reps": 3 },
                { "load": { "kind": "pctOfTM", "pct": 0.80 }, "reps": 3 },
                { "load": { "kind": "pctOfTM", "pct": 0.75 }, "reps": 3 },
                { "load": { "kind": "pctOfTM", "pct": 0.70 }, "reps": 3 },
                { "load": { "kind": "pctOfTM", "pct": 0.65 }, "reps": 3, "amrapRole": "backoff" }
              ] },
            { "id": "w1d4-front-t2", "exerciseId": "frontSquat", "label": "T2",
              "progressionRuleId": "t2LastSet", "progressionParams": { "increment": 5 },
              "sets": [
                { "load": { "kind": "pctOfTM", "pct": 0.35 }, "reps": 5 },
                { "load": { "kind": "pctOfTM", "pct": 0.45 }, "reps": 5 },
                { "load": { "kind": "pctOfTM", "pct": 0.55 }, "reps": 3 },
                { "load": { "kind": "pctOfTM", "pct": 0.55 }, "reps": 5 },
                { "load": { "kind": "pctOfTM", "pct": 0.55 }, "reps": 7 },
                { "load": { "kind": "pctOfTM", "pct": 0.55 }, "reps": 4 },
                { "load": { "kind": "pctOfTM", "pct": 0.55 }, "reps": 6 },
                { "load": { "kind": "pctOfTM", "pct": 0.55 }, "reps": 8 }
              ] },
            { "id": "w1d4-curl-acc", "exerciseId": "machineCurl", "label": "accessory",
              "progressionRuleId": "doubleProgression",
              "progressionParams": { "repMin": 8, "repMax": 12, "weightStep": 5, "sets": 3 },
              "sets": [
                { "load": { "kind": "tracked" }, "reps": 8 },
                { "load": { "kind": "tracked" }, "reps": 8 },
                { "load": { "kind": "tracked" }, "reps": 8 }
              ] }
          ]
        },
        {
          "ordinal": 5, "weekdayHint": "토", "name": "벤치 heavy + CGBP",
          "slots": [
            { "id": "w1d5-bench-t1", "exerciseId": "bench", "label": "T1",
              "progressionRuleId": "nsunsTopSet", "progressionParams": { "increment": 2.5 },
              "sets": [
                { "load": { "kind": "pctOfTM", "pct": 0.75 }, "reps": 5 },
                { "load": { "kind": "pctOfTM", "pct": 0.85 }, "reps": 3 },
                { "load": { "kind": "pctOfTM", "pct": 0.95 }, "reps": 1, "amrapRole": "topSet" },
                { "load": { "kind": "pctOfTM", "pct": 0.90 }, "reps": 3 },
                { "load": { "kind": "pctOfTM", "pct": 0.85 }, "reps": 5 },
                { "load": { "kind": "pctOfTM", "pct": 0.80 }, "reps": 3 },
                { "load": { "kind": "pctOfTM", "pct": 0.75 }, "reps": 5 },
                { "load": { "kind": "pctOfTM", "pct": 0.70 }, "reps": 3 },
                { "load": { "kind": "pctOfTM", "pct": 0.65 }, "reps": 5, "amrapRole": "backoff" }
              ] },
            { "id": "w1d5-cgbp-t2", "exerciseId": "cgbp", "label": "T2",
              "progressionRuleId": "t2LastSet", "progressionParams": { "increment": 2.5 },
              "sets": [
                { "load": { "kind": "pctOfTM", "pct": 0.40 }, "reps": 6 },
                { "load": { "kind": "pctOfTM", "pct": 0.50 }, "reps": 5 },
                { "load": { "kind": "pctOfTM", "pct": 0.60 }, "reps": 3 },
                { "load": { "kind": "pctOfTM", "pct": 0.60 }, "reps": 5 },
                { "load": { "kind": "pctOfTM", "pct": 0.60 }, "reps": 7 },
                { "load": { "kind": "pctOfTM", "pct": 0.60 }, "reps": 4 },
                { "load": { "kind": "pctOfTM", "pct": 0.60 }, "reps": 6 },
                { "load": { "kind": "pctOfTM", "pct": 0.60 }, "reps": 8 }
              ] },
            { "id": "w1d5-csr-acc", "exerciseId": "chestSupportedRow", "label": "accessory",
              "progressionRuleId": "doubleProgression",
              "progressionParams": { "repMin": 8, "repMax": 12, "weightStep": 5, "sets": 3 },
              "sets": [
                { "load": { "kind": "tracked" }, "reps": 8 },
                { "load": { "kind": "tracked" }, "reps": 8 },
                { "load": { "kind": "tracked" }, "reps": 8 }
              ] }
          ]
        }
      ]
    }
  ]
}
```

- [ ] **Step 2: 검증 통과 확인**

Run: `npm run validate -- programs/nsuns-5day.json`
Expected: `✅ 유효한 프로그램: nSuns 5/3/1 5-day (화~토) v1`
(실패 시 에러 메시지의 슬롯 id를 보고 JSON 수정 — 불변식 위반이면 이 계획 §Global Constraints 참조.)

- [ ] **Step 3: 공식 시트 대조 (스펙 §2-1 정본 확정 — 필수, 건너뛰기 금지)**

WebFetch: `https://liftvault.com/programs/powerlifting/n-suns-lifting-spreadsheets/` (5-day 시트의 T1/T2 세트·%·reps 표 추출). 대조 항목:
1. 각 요일 T1 9세트의 %와 reps (특히 화요일 벤치 volume 스킴 — topSet 없음이 맞는지)
2. 각 T2 8세트의 %와 reps (리프트별로 다름)
3. 차이 발견 시 `programs/nsuns-5day.json` 수정 → Step 2 재실행.
4. 대조 결과를 커밋 메시지에 1줄 기록 (예: "공식 대조: T2 인클라인 % 수정 3건").

- [ ] **Step 4: 오라클 테스트 작성** — `test/seed.test.mjs`:

```js
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { validateProgram } from "../lib/validation.mjs";
import { renderProgram, roundToStep } from "../lib/render.mjs";

const seed = JSON.parse(readFileSync("programs/nsuns-5day.json", "utf8"));

describe("nSuns 5-day 시드", () => {
  it("검증 전체 통과", () => {
    expect(validateProgram(seed)).toEqual([]);
  });

  it("토요일 벤치 heavy T1 무게 오라클 (TM 105 = 볼트 검증표)", () => {
    const day5 = seed.weeks[0].days[4];
    const benchT1 = day5.slots.find((s) => s.id === "w1d5-bench-t1");
    const weights = benchT1.sets.map((s) => roundToStep(105 * s.load.pct, 2.5));
    expect(weights).toEqual([80, 90, 100, 95, 90, 85, 80, 72.5, 67.5]);
  });

  it("구조 불변식: 벤치 rule은 heavy day에만, 화 OHP T2는 rule 없음", () => {
    const slots = seed.weeks[0].days.flatMap((d) => d.slots);
    const benchRuled = slots.filter((s) => s.exerciseId === "bench" && s.progressionRuleId);
    expect(benchRuled.map((s) => s.id)).toEqual(["w1d5-bench-t1"]);
    const ohpT2 = slots.find((s) => s.id === "w1d1-ohp-t2");
    expect(ohpT2.progressionRuleId).toBeUndefined();
  });

  it("topSet은 heavy T1 4곳뿐, volume day엔 없음", () => {
    const topSetSlots = seed.weeks[0].days.flatMap((d) =>
      d.slots.filter((s) => s.sets.some((x) => x.amrapRole === "topSet")).map((s) => s.id),
    );
    expect(topSetSlots.sort()).toEqual(
      ["w1d2-squat-t1", "w1d3-ohp-t1", "w1d4-dead-t1", "w1d5-bench-t1"].sort(),
    );
  });

  it("렌더 스모크: 전 TM 제공 시 TM? 표기 없음", () => {
    const md = renderProgram(seed, {
      bench: 105, ohp: 67.5, squat: 85, deadlift: 120,
      sumoDeadlift: 100, frontSquat: 60, inclineBench: 70, cgbp: 80,
    });
    expect(md).not.toContain("(TM?)");
    expect(md).toContain("★topSet");
  });
});
```

- [ ] **Step 5: 전체 테스트 통과 확인**

Run: `npx vitest run`
Expected: PASS (26 passed)

- [ ] **Step 6: 렌더 눈검수 산출** (conversion-guide 루프의 첫 실전 적용)

Run: `npm run render -- programs/nsuns-5day.json --tm bench=105 --tm ohp=67.5 --tm squat=85 --tm deadlift=120 --tm sumoDeadlift=100 --tm frontSquat=60 --tm inclineBench=70 --tm cgbp=80 > docs/nsuns-5day-rendered.md`
Expected: `docs/nsuns-5day-rendered.md` 생성 — 사용자가 훑어볼 최종 눈검수 산출물.

- [ ] **Step 7: Commit**

```bash
git add programs/ test/seed.test.mjs docs/nsuns-5day-rendered.md
git commit -m "feat: nSuns 5-day 시드 (공식 대조 완료) + 오라클 테스트 (Stage1-A T8)

공식 대조: <Step 3 결과 1줄 기록>

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## 완료 기준 (Plan A)
1. `npx vitest run` 전체 통과 (26+).
2. `npm run validate -- programs/nsuns-5day.json` → ✅.
3. `docs/nsuns-5day-rendered.md`가 존재하고 사용자 눈검수 대기.
4. 후속: Plan B(도메인 코어 — fold·증량 실행 로직·분석)가 이 시드를 픽스처로 사용.
