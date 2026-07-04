# Stage 1-B1: 도메인 코어 — 이벤트·정정·fold·증량 규칙 (TypeScript)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스펙 §3.3 fold 계약의 완전한 구현 — 이벤트 4종 타입, 정정 적용, (at,id) 전순서, 증량 규칙 3종의 판정 함수, 그리고 이 모두를 접는 `foldState`. 순수 함수만 (브라우저/IO 없음). Plan C의 UI가 이 위에 선다.

**Architecture:** `src/domain/` 순수 TypeScript. 이벤트는 태그 없는 4개 타입(FoldInput으로 분리 전달). 자동 증량은 이벤트가 아니라 fold가 도출(스펙 §3.1 원칙 2). 판정 규칙은 순수 judge 함수로 분리해 fold가 조립. 스펙: `docs/superpowers/specs/2026-07-05-workout-pwa-design.md` §2-2·§2-3·§3.3.

**Tech Stack:** TypeScript 5 (strict, vitest가 esbuild로 직접 실행 — 빌드 불필요), vitest.

## Global Constraints

- 신규 devDependency는 `typescript@^5`와 `@types/node@^22` 둘만. dependencies 추가 금지.
- `src/domain/`은 순수 TS: `node:*`·브라우저 API import 금지. 결정론적 함수만.
- **전순서 계약**: 이벤트 정렬 = `Date.parse(at)` 오름차순, 동률이면 `id` 문자열 오름차순.
- **cyclePos 규약**: `week`는 `program.weeks` 배열의 0-based 인덱스, `dayOrdinal`은 day의 `ordinal` 값(1-based), `cycleIndex`는 0-based 사이클 반복 번호.
- **발효 상한**: TM/악세사리 무게에 규칙이 쓰는 발효는 `(target, cycleIndex, week)`당 ≤1 — 같은 키의 후속 판정은 no-op (첫 판정 승, left-fold).
- 규칙 발효는 `SessionCompleted.status === "completed"`에서만. `setType==="warmup"`·`substitutedFrom` 있는 세트·revoked 세트는 판정 입력에서 제외.
- DecisionEvent는 재검토 플래그와 무관하게 **항상 절대값 적용**.
- 진리표(스펙 §2-3): 탑세트 0~1 → 제안(동결/−5) · 2~3 → 자동 +increment · 4+ → 제안(2×increment). T2: 마지막 세트 완수 → +increment, 2연속 미완수 → 디로드 제안. 악세사리: 마지막 세트 ≥repMax → +weightStep·rep 리셋·유예 1세션, 유예 아닌 2연속 마지막 세트 <repMin → 롤백 제안.
- 한국어 식별자 금지(코드), 제안 `label`은 한국어.
- 모든 커밋 메시지 끝: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- 작업 디렉터리: `C:\Users\rjs11\Desktop\workout-app` (branch stage1). 기존 26 테스트는 계속 통과해야 함.

---

### Task 1: TypeScript 셋업 + 도메인 타입

**Files:**
- Create: `tsconfig.json`, `src/domain/types.ts`, `test/domain/types.test.ts`
- Modify: `package.json` (devDependency + typecheck 스크립트)

**Interfaces:**
- Produces: 이후 모든 태스크가 import하는 타입들 — `CyclePos`, `SetRecord`, `CorrectionRecord`, `DecisionEvent`, `SessionCompleted`, `Proposal`, `AccessoryState`, `FoldInput`, `FoldState`. `npm run typecheck` = `tsc --noEmit`.

- [ ] **Step 1: typescript 설치 + 스크립트**

Run: `npm install -D typescript@^5 @types/node@^22`
`package.json`의 scripts에 추가: `"typecheck": "tsc --noEmit"`

- [ ] **Step 2: tsconfig.json 작성**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 3: src/domain/types.ts 작성**

```typescript
/** 사이클 위치 — week는 program.weeks의 0-based 인덱스, dayOrdinal은 1-based, cycleIndex는 0-based 반복 번호 */
export type CyclePos = { cycleIndex: number; week: number; dayOrdinal: number };

export type SetRecord = {
  id: string;
  sessionId: string;
  slotId?: string;
  exerciseId: string;
  setType?: "work" | "warmup";
  targetWeight: number | null;
  targetReps: number;
  actualWeight: number;
  actualReps: number;
  rir?: number;
  amrapRole?: "topSet" | "backoff";
  substitutedFrom?: string;
  completedAt: string; // ISO 8601
  schemaVersion: 1;
};

export type CorrectionPatch = {
  actualWeight?: number;
  actualReps?: number;
  rir?: number;
  cyclePos?: CyclePos;
};

export type CorrectionRecord = {
  id: string;
  /** 대상: SetRecord.id | SessionCompleted.id | 선행 CorrectionRecord.id */
  supersedes: string;
  patch?: CorrectionPatch;
  revoked?: true;
  at: string;
  schemaVersion: 1;
};

export type DecisionTarget =
  | { kind: "tm"; exerciseId: string }
  | { kind: "accessory"; slotId: string };

export type DecisionEvent = {
  id: string;
  target: DecisionTarget;
  kind: "seed" | "manual" | "deloadAccepted" | "bonusAccepted" | "rollbackAccepted" | "t2DeloadAccepted";
  /** 절대값 스냅샷 (델타 아님) */
  value: number;
  targetReps?: number;
  at: string;
  /** seed·manual 외에는 필수 */
  sourceSetRecordId?: string;
  schemaVersion: 1;
};

export type SessionCompleted = {
  id: string;
  sessionId: string;
  at: string;
  cyclePos: CyclePos;
  status: "completed" | "skipped";
  programId: string;
  programVersion: number;
  schemaVersion: 1;
};

/** 프로그램 정의 (Plan A 스키마와 동일 구조의 TS 타입) */
export type LoadSpec =
  | { kind: "pctOfTM"; ref?: string; pct: number }
  | { kind: "tracked" };

export type SetSpec = { load: LoadSpec; reps: number; amrapRole?: "topSet" | "backoff" };

export type SlotSpec = {
  id: string;
  exerciseId: string;
  label: string;
  groupId?: string;
  warmupRuleId?: string;
  progressionRuleId?: string;
  progressionParams?: Record<string, unknown>;
  sets: SetSpec[];
};

export type DaySpec = { ordinal: number; weekdayHint?: string; name: string; slots: SlotSpec[] };

export type ProgramDefinition = {
  id: string;
  name: string;
  description?: string;
  version: number;
  schemaVersion: 1;
  weeks: { days: DaySpec[] }[];
};

/** fold가 표면화하는, 사용자 결정 대기 제안 */
export type Proposal = {
  type: "tmDeload" | "tmBonus" | "t2Deload" | "accessoryRollback";
  target: DecisionTarget;
  label: string; // 한국어 설명
  sourceSetRecordId: string;
  /** 제안 옵션 (절대값 후보들) */
  options: number[];
};

export type AccessoryState = {
  weight: number;
  targetReps: number;
  missStreak: number;
  /** 증량 직후 1세션 유예 (스펙 §2-2 롤백 카운트 제외) */
  grace: boolean;
};

export type FoldInput = {
  sets: SetRecord[];
  corrections: CorrectionRecord[];
  decisions: DecisionEvent[];
  sessions: SessionCompleted[];
  /** key = `${programId}@${programVersion}` */
  programs: Map<string, ProgramDefinition>;
};

export type FoldState = {
  /** exerciseId -> 현재 TM (T1·T2 공통) */
  tm: Record<string, number>;
  /** slotId -> 악세사리 상태 */
  accessories: Record<string, AccessoryState>;
  /** 미결 제안 (같은 target의 새 판정이 옛 제안을 대체, 결정이 소비) */
  pendingProposals: Proposal[];
  /** 재검토 필요 플래그가 붙은 DecisionEvent id들 (UI 전용 — fold 값엔 영향 없음) */
  reviewFlags: string[];
};
```

- [ ] **Step 4: 타입 스모크 테스트 작성** — `test/domain/types.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type { SetRecord, FoldState } from "../../src/domain/types.ts";

describe("도메인 타입", () => {
  it("SetRecord 리터럴이 타입을 만족한다", () => {
    const s: SetRecord = {
      id: "s1", sessionId: "ss1", exerciseId: "bench",
      targetWeight: 80, targetReps: 5, actualWeight: 80, actualReps: 5,
      completedAt: "2026-07-05T10:00:00Z", schemaVersion: 1,
    };
    expect(s.exerciseId).toBe("bench");
  });
  it("FoldState 초기형", () => {
    const f: FoldState = { tm: {}, accessories: {}, pendingProposals: [], reviewFlags: [] };
    expect(f.pendingProposals).toEqual([]);
  });
});
```

- [ ] **Step 5: 실행 확인**

Run: `npx vitest run test/domain/types.test.ts` → PASS (2)
Run: `npm run typecheck` → 에러 0, exit 0
Run: `npx vitest run` → 28 passed (기존 26 + 2)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json src/ test/domain/
git commit -m "feat: TS 셋업 + 도메인 이벤트·상태 타입 (Stage1-B1 T1)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 전순서 (order.ts)

**Files:**
- Create: `src/domain/order.ts`, `test/domain/order.test.ts`

**Interfaces:**
- Produces: `compareByAtId(a: {at: string; id: string}, b): number` · `sortByAtId<T extends {at: string; id: string}>(items: T[]): T[]` (원본 불변, 새 배열). fold(T6·T7)가 사용.

- [ ] **Step 1: 실패하는 테스트** — `test/domain/order.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { compareByAtId, sortByAtId } from "../../src/domain/order.ts";

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
```

- [ ] **Step 2: 실패 확인** — `npx vitest run test/domain/order.test.ts` → FAIL (module not found)

- [ ] **Step 3: 구현** — `src/domain/order.ts`:

```typescript
export function compareByAtId(a: { at: string; id: string }, b: { at: string; id: string }): number {
  const ta = Date.parse(a.at);
  const tb = Date.parse(b.at);
  if (ta !== tb) return ta - tb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortByAtId<T extends { at: string; id: string }>(items: T[]): T[] {
  return [...items].sort(compareByAtId);
}
```

- [ ] **Step 4: 통과 확인** — `npx vitest run` → 32 passed / `npm run typecheck` → 0 에러

- [ ] **Step 5: Commit**

```bash
git add src/domain/order.ts test/domain/order.test.ts
git commit -m "feat: (at,id) 전순서 비교·정렬 (Stage1-B1 T2)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 정정 적용 (corrections.ts)

**Files:**
- Create: `src/domain/corrections.ts`, `test/domain/corrections.test.ts`

**Interfaces:**
- Produces: `EffectiveSet = SetRecord & { corrected: boolean; revoked: boolean }` · `applyCorrections(sets: SetRecord[], corrections: CorrectionRecord[]): EffectiveSet[]` · `sessionCyclePosOverride(sessionCompletedId: string, corrections: CorrectionRecord[]): CyclePos | undefined`. 승자 규칙: 같은 루트 대상의 복수 정정 = (at,id) 최신 승. 체인(정정의 정정)은 루트 SetRecord로 해소.

- [ ] **Step 1: 실패하는 테스트** — `test/domain/corrections.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { applyCorrections, sessionCyclePosOverride } from "../../src/domain/corrections.ts";
import type { SetRecord, CorrectionRecord } from "../../src/domain/types.ts";

function set(id: string, over: Partial<SetRecord> = {}): SetRecord {
  return {
    id, sessionId: "ss1", exerciseId: "bench",
    targetWeight: 100, targetReps: 1, actualWeight: 100, actualReps: 3,
    completedAt: "2026-07-05T10:00:00Z", schemaVersion: 1, ...over,
  };
}
function corr(id: string, supersedes: string, over: Partial<CorrectionRecord> = {}): CorrectionRecord {
  return { id, supersedes, at: "2026-07-06T10:00:00Z", schemaVersion: 1, ...over };
}

describe("applyCorrections", () => {
  it("정정 없으면 원본 그대로 (corrected=false)", () => {
    const out = applyCorrections([set("s1")], []);
    expect(out[0]!.actualReps).toBe(3);
    expect(out[0]!.corrected).toBe(false);
  });
  it("patch가 필드를 덮는다", () => {
    const out = applyCorrections([set("s1")], [corr("c1", "s1", { patch: { actualReps: 1 } })]);
    expect(out[0]!.actualReps).toBe(1);
    expect(out[0]!.corrected).toBe(true);
  });
  it("revoked 세트는 revoked=true", () => {
    const out = applyCorrections([set("s1")], [corr("c1", "s1", { revoked: true })]);
    expect(out[0]!.revoked).toBe(true);
  });
  it("같은 대상 복수 정정 = at 최신 승", () => {
    const out = applyCorrections([set("s1")], [
      corr("c1", "s1", { patch: { actualReps: 1 }, at: "2026-07-06T10:00:00Z" }),
      corr("c2", "s1", { patch: { actualReps: 5 }, at: "2026-07-07T10:00:00Z" }),
    ]);
    expect(out[0]!.actualReps).toBe(5);
  });
  it("at 동률이면 id 큰 쪽 승", () => {
    const out = applyCorrections([set("s1")], [
      corr("c1", "s1", { patch: { actualReps: 1 } }),
      corr("c2", "s1", { patch: { actualReps: 4 } }),
    ]);
    expect(out[0]!.actualReps).toBe(4);
  });
  it("정정의 정정은 루트 세트로 해소된다", () => {
    const out = applyCorrections([set("s1")], [
      corr("c1", "s1", { patch: { actualReps: 1 }, at: "2026-07-06T10:00:00Z" }),
      corr("c2", "c1", { patch: { actualReps: 2 }, at: "2026-07-07T10:00:00Z" }),
    ]);
    expect(out[0]!.actualReps).toBe(2);
  });
});

describe("sessionCyclePosOverride", () => {
  it("SessionCompleted 대상 cyclePos 정정의 최신 승자를 반환", () => {
    const cs: CorrectionRecord[] = [
      corr("c1", "sc1", { patch: { cyclePos: { cycleIndex: 0, week: 0, dayOrdinal: 1 } }, at: "2026-07-06T10:00:00Z" }),
      corr("c2", "sc1", { patch: { cyclePos: { cycleIndex: 1, week: 0, dayOrdinal: 1 } }, at: "2026-07-07T10:00:00Z" }),
    ];
    expect(sessionCyclePosOverride("sc1", cs)).toEqual({ cycleIndex: 1, week: 0, dayOrdinal: 1 });
  });
  it("정정 없으면 undefined", () => {
    expect(sessionCyclePosOverride("sc1", [])).toBeUndefined();
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run test/domain/corrections.test.ts` → FAIL

- [ ] **Step 3: 구현** — `src/domain/corrections.ts`:

```typescript
import type { SetRecord, CorrectionRecord, CyclePos } from "./types.ts";
import { compareByAtId } from "./order.ts";

export type EffectiveSet = SetRecord & { corrected: boolean; revoked: boolean };

/** 정정 체인을 따라 루트 대상 id를 찾는다 (순환 방지) */
function rootTargetOf(c: CorrectionRecord, byId: Map<string, CorrectionRecord>): string {
  let cur = c;
  const seen = new Set<string>([c.id]);
  while (byId.has(cur.supersedes)) {
    const next = byId.get(cur.supersedes)!;
    if (seen.has(next.id)) break;
    seen.add(next.id);
    cur = next;
  }
  return cur.supersedes;
}

/** 대상 id별 승자 정정 (at 최신 승, 동률 id 큰 쪽) */
function winnersByRoot(corrections: CorrectionRecord[]): Map<string, CorrectionRecord> {
  const byId = new Map(corrections.map((c) => [c.id, c]));
  const winners = new Map<string, CorrectionRecord>();
  for (const c of corrections) {
    const root = rootTargetOf(c, byId);
    const w = winners.get(root);
    if (!w || compareByAtId(c, w) > 0) winners.set(root, c);
  }
  return winners;
}

export function applyCorrections(sets: SetRecord[], corrections: CorrectionRecord[]): EffectiveSet[] {
  const winners = winnersByRoot(corrections);
  return sets.map((s) => {
    const w = winners.get(s.id);
    if (!w) return { ...s, corrected: false, revoked: false };
    if (w.revoked) return { ...s, corrected: true, revoked: true };
    const { cyclePos: _ignored, ...patch } = w.patch ?? {};
    return { ...s, ...patch, corrected: true, revoked: false };
  });
}

/** SessionCompleted.cyclePos 정정의 승자 (없으면 undefined) */
export function sessionCyclePosOverride(
  sessionCompletedId: string,
  corrections: CorrectionRecord[],
): CyclePos | undefined {
  const winners = winnersByRoot(corrections);
  return winners.get(sessionCompletedId)?.patch?.cyclePos;
}
```

- [ ] **Step 4: 통과 확인** — `npx vitest run` → 40 passed / `npm run typecheck` → 0

- [ ] **Step 5: Commit**

```bash
git add src/domain/corrections.ts test/domain/corrections.test.ts
git commit -m "feat: 정정 적용 — 체인 해소·최신 승·cyclePos 오버라이드 (Stage1-B1 T3)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 판정 함수 3종 (rules/)

**Files:**
- Create: `src/domain/rules/nsunsTopSet.ts`, `src/domain/rules/t2LastSet.ts`, `src/domain/rules/doubleProgression.ts`, `test/domain/rules.test.ts`

**Interfaces:**
- Produces (fold T6·T7이 소비):
  - `judgeTopSet(actualReps, params: {increment: number}): TopSetOutcome` — `{kind:"holdOrDeload"} | {kind:"auto", delta} | {kind:"bonusProposal", suggested}`
  - `judgeT2(lastSet: {actualReps, targetReps} | undefined, prevFailStreak: number, params: {increment: number}): T2Outcome` — `{kind:"auto", delta, failStreak: 0} | {kind:"none", failStreak} | {kind:"deloadProposal", failStreak}`
  - `applyAccessorySession(state: AccessoryState, lastSet: {actualWeight, actualReps} | undefined, params: {repMin, repMax, weightStep}): {state: AccessoryState; rollback: boolean}`

- [ ] **Step 1: 실패하는 테스트** — `test/domain/rules.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { judgeTopSet } from "../../src/domain/rules/nsunsTopSet.ts";
import { judgeT2 } from "../../src/domain/rules/t2LastSet.ts";
import { applyAccessorySession } from "../../src/domain/rules/doubleProgression.ts";
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
```

- [ ] **Step 2: 실패 확인** — `npx vitest run test/domain/rules.test.ts` → FAIL

- [ ] **Step 3: 구현 3파일**

`src/domain/rules/nsunsTopSet.ts`:
```typescript
export type TopSetOutcome =
  | { kind: "holdOrDeload" }
  | { kind: "auto"; delta: number }
  | { kind: "bonusProposal"; suggested: number };

/** 스펙 §2-3 T1 진리표. 판정 입력 = 탑세트 실제 reps. */
export function judgeTopSet(actualReps: number, params: { increment: number }): TopSetOutcome {
  if (actualReps <= 1) return { kind: "holdOrDeload" };
  if (actualReps <= 3) return { kind: "auto", delta: params.increment };
  return { kind: "bonusProposal", suggested: params.increment * 2 };
}
```

`src/domain/rules/t2LastSet.ts`:
```typescript
export type T2Outcome =
  | { kind: "auto"; delta: number; failStreak: 0 }
  | { kind: "none"; failStreak: number }
  | { kind: "deloadProposal"; failStreak: number };

/** 스펙 §2-3(b). 완수 = actualReps >= targetReps. 2연속 미완수 → 디로드 제안. */
export function judgeT2(
  lastSet: { actualReps: number; targetReps: number } | undefined,
  prevFailStreak: number,
  params: { increment: number },
): T2Outcome {
  if (!lastSet) return { kind: "none", failStreak: prevFailStreak };
  if (lastSet.actualReps >= lastSet.targetReps) return { kind: "auto", delta: params.increment, failStreak: 0 };
  const failStreak = prevFailStreak + 1;
  if (failStreak >= 2) return { kind: "deloadProposal", failStreak };
  return { kind: "none", failStreak };
}
```

`src/domain/rules/doubleProgression.ts`:
```typescript
import type { AccessoryState } from "../types.ts";

export type DoubleProgressionParams = { repMin: number; repMax: number; weightStep: number };

/**
 * 스펙 §2-2: 마지막 세트 ≥repMax → +스텝·하한 리셋·유예 1세션.
 * 유예 아닌 세션에서 마지막 세트 <repMin 2연속 → rollback 신호 (상태는 불변, 수락 시 DecisionEvent).
 */
export function applyAccessorySession(
  state: AccessoryState,
  lastSet: { actualWeight: number; actualReps: number } | undefined,
  params: DoubleProgressionParams,
): { state: AccessoryState; rollback: boolean } {
  if (!lastSet) return { state, rollback: false };

  if (lastSet.actualReps >= params.repMax) {
    return {
      state: { weight: state.weight + params.weightStep, targetReps: params.repMin, missStreak: 0, grace: true },
      rollback: false,
    };
  }

  if (lastSet.actualReps < params.repMin) {
    if (state.grace) return { state: { ...state, grace: false, missStreak: 0 }, rollback: false };
    const missStreak = state.missStreak + 1;
    return { state: { ...state, missStreak, grace: false }, rollback: missStreak >= 2 };
  }

  const targetReps = Math.min(Math.max(lastSet.actualReps + 1, params.repMin), params.repMax);
  return { state: { ...state, targetReps, missStreak: 0, grace: false }, rollback: false };
}
```

- [ ] **Step 4: 통과 확인** — `npx vitest run` → 52 passed / `npm run typecheck` → 0

- [ ] **Step 5: Commit**

```bash
git add src/domain/rules/ test/domain/rules.test.ts
git commit -m "feat: 판정 함수 3종 — 진리표·T2·더블프로그레션 (Stage1-B1 T4)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: fold 준비 — 세션·슬롯 인덱싱 유틸

**Files:**
- Create: `src/domain/foldSupport.ts`, `test/domain/foldSupport.test.ts`

**Interfaces:**
- Produces (fold T6이 소비):
  - `programKey(programId: string, version: number): string` — `` `${programId}@${version}` ``
  - `capKey(targetKey: string, pos: CyclePos): string` — `` `${targetKey}|c${pos.cycleIndex}w${pos.week}` ``
  - `daySpecFor(program: ProgramDefinition, pos: CyclePos): DaySpec | undefined` — weeks[pos.week]에서 ordinal 일치 day
  - `judgingSetsForSlot(sets: EffectiveSet[], sessionId: string, slotId: string): EffectiveSet[]` — 해당 세션·슬롯의 판정 대상 세트(작업 세트만: revoked·warmup·substituted 제외), completedAt 오름차순
  - `lastSetOf(sets: EffectiveSet[]): EffectiveSet | undefined`

- [ ] **Step 1: 실패하는 테스트** — `test/domain/foldSupport.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { programKey, capKey, daySpecFor, judgingSetsForSlot, lastSetOf } from "../../src/domain/foldSupport.ts";
import { applyCorrections } from "../../src/domain/corrections.ts";
import type { ProgramDefinition, SetRecord } from "../../src/domain/types.ts";

const prog: ProgramDefinition = {
  id: "p", name: "P", version: 1, schemaVersion: 1,
  weeks: [
    { days: [{ ordinal: 1, name: "d1", slots: [] }, { ordinal: 2, name: "d2", slots: [] }] },
    { days: [{ ordinal: 1, name: "w2d1", slots: [] }] },
  ],
};

function set(id: string, over: Partial<SetRecord> = {}): SetRecord {
  return {
    id, sessionId: "ss1", slotId: "sl1", exerciseId: "bench",
    targetWeight: 100, targetReps: 5, actualWeight: 100, actualReps: 5,
    completedAt: "2026-07-05T10:00:00Z", schemaVersion: 1, ...over,
  };
}

describe("foldSupport", () => {
  it("programKey·capKey 포맷", () => {
    expect(programKey("nsuns", 3)).toBe("nsuns@3");
    expect(capKey("tm:bench", { cycleIndex: 2, week: 0, dayOrdinal: 5 })).toBe("tm:bench|c2w0");
  });
  it("daySpecFor: week 인덱스 + ordinal 매칭", () => {
    expect(daySpecFor(prog, { cycleIndex: 0, week: 1, dayOrdinal: 1 })?.name).toBe("w2d1");
    expect(daySpecFor(prog, { cycleIndex: 0, week: 0, dayOrdinal: 2 })?.name).toBe("d2");
    expect(daySpecFor(prog, { cycleIndex: 0, week: 5, dayOrdinal: 1 })).toBeUndefined();
  });
  it("judgingSetsForSlot: warmup·substituted·revoked·다른 슬롯 제외, 시간순", () => {
    const sets = applyCorrections(
      [
        set("s1", { completedAt: "2026-07-05T10:02:00Z" }),
        set("s2", { completedAt: "2026-07-05T10:01:00Z" }),
        set("s3", { setType: "warmup" }),
        set("s4", { substitutedFrom: "deadlift" }),
        set("s5", { slotId: "other" }),
        set("s6", {}),
      ],
      [{ id: "c1", supersedes: "s6", revoked: true, at: "2026-07-06T00:00:00Z", schemaVersion: 1 }],
    );
    const out = judgingSetsForSlot(sets, "ss1", "sl1");
    expect(out.map((s) => s.id)).toEqual(["s2", "s1"]);
    expect(lastSetOf(out)?.id).toBe("s1");
  });
});
```

- [ ] **Step 2: 실패 확인** — FAIL (module not found)

- [ ] **Step 3: 구현** — `src/domain/foldSupport.ts`:

```typescript
import type { ProgramDefinition, DaySpec, CyclePos } from "./types.ts";
import type { EffectiveSet } from "./corrections.ts";

export function programKey(programId: string, version: number): string {
  return `${programId}@${version}`;
}

/** 발효 상한 키 — target당 사이클-주 1회 (스펙 §2-3) */
export function capKey(targetKey: string, pos: CyclePos): string {
  return `${targetKey}|c${pos.cycleIndex}w${pos.week}`;
}

export function daySpecFor(program: ProgramDefinition, pos: CyclePos): DaySpec | undefined {
  const week = program.weeks[pos.week];
  if (!week) return undefined;
  return week.days.find((d) => d.ordinal === pos.dayOrdinal);
}

/** 판정 대상 세트: 해당 세션·슬롯의 작업 세트만 (revoked·warmup·대체 제외), completedAt 오름차순 */
export function judgingSetsForSlot(sets: EffectiveSet[], sessionId: string, slotId: string): EffectiveSet[] {
  return sets
    .filter(
      (s) =>
        s.sessionId === sessionId &&
        s.slotId === slotId &&
        !s.revoked &&
        s.setType !== "warmup" &&
        s.substitutedFrom === undefined,
    )
    .sort((a, b) => (a.completedAt < b.completedAt ? -1 : a.completedAt > b.completedAt ? 1 : 0));
}

export function lastSetOf(sets: EffectiveSet[]): EffectiveSet | undefined {
  return sets.length ? sets[sets.length - 1] : undefined;
}
```

- [ ] **Step 4: 통과 확인** — `npx vitest run` → 55 passed / typecheck 0

- [ ] **Step 5: Commit**

```bash
git add src/domain/foldSupport.ts test/domain/foldSupport.test.ts
git commit -m "feat: fold 지원 유틸 — 키·day 매칭·판정세트 필터 (Stage1-B1 T5)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: foldState — TM 경로 (결정 + 자동 증량 + 상한 + 제안)

**Files:**
- Create: `src/domain/fold.ts`, `test/domain/fold-tm.test.ts`

**Interfaces:**
- Produces: `foldState(input: FoldInput): FoldState`. 이 태스크에서 TM 경로(nsunsTopSet·t2LastSet·DecisionEvent·발효 상한·제안·플래그)를 완성한다. 악세사리 경로는 T7이 같은 함수에 추가.
- 내부 계약: 타임라인 = decisions + (status=completed인) sessions를 (at,id) 정렬해 좌fold. 파생 증량은 그 SessionCompleted 처리 시점에 즉시 적용. 제안은 target별 최신 판정만 유지, 이후 DecisionEvent(sourceSetRecordId 일치 또는 동일 target의 seed/manual)가 소비. 플래그: sourceSetRecordId를 가진 결정 중, 그 세트에 (결정보다 늦은 at의) actualReps/revoked 정정 승자가 있는 것.

- [ ] **Step 1: 실패하는 테스트** — `test/domain/fold-tm.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { foldState } from "../../src/domain/fold.ts";
import { programKey } from "../../src/domain/foldSupport.ts";
import type {
  ProgramDefinition, SetRecord, DecisionEvent, SessionCompleted, CorrectionRecord, FoldInput,
} from "../../src/domain/types.ts";

/** 테스트 프로그램: 1주 사이클, day1 벤치 T1(rule, topSet), day2 인클라인 T2(rule) */
const prog: ProgramDefinition = {
  id: "p", name: "P", version: 1, schemaVersion: 1,
  weeks: [{
    days: [
      {
        ordinal: 1, name: "bench heavy",
        slots: [{
          id: "sl-bench", exerciseId: "bench", label: "T1",
          progressionRuleId: "nsunsTopSet", progressionParams: { increment: 2.5 },
          sets: [{ load: { kind: "pctOfTM", pct: 0.95 }, reps: 1, amrapRole: "topSet" }],
        }],
      },
      {
        ordinal: 2, name: "incline",
        slots: [{
          id: "sl-inc", exerciseId: "inclineBench", label: "T2",
          progressionRuleId: "t2LastSet", progressionParams: { increment: 2.5 },
          sets: [{ load: { kind: "pctOfTM", pct: 0.6 }, reps: 8 }],
        }],
      },
    ],
  }],
};
const programs = new Map([[programKey("p", 1), prog]]);

let n = 0;
function at(day: number, hh = 10): string {
  return `2026-07-${String(day).padStart(2, "0")}T${String(hh).padStart(2, "0")}:00:00Z`;
}
function seed(exerciseId: string, value: number, day: number): DecisionEvent {
  return { id: `d${++n}`, target: { kind: "tm", exerciseId }, kind: "seed", value, at: at(day), schemaVersion: 1 };
}
function session(id: string, day: number, cycleIndex: number, dayOrdinal: number, status: "completed" | "skipped" = "completed"): SessionCompleted {
  return { id: `sc-${id}`, sessionId: id, at: at(day, 12), cyclePos: { cycleIndex, week: 0, dayOrdinal }, status, programId: "p", programVersion: 1, schemaVersion: 1 };
}
function topSet(id: string, sessionId: string, reps: number, day: number): SetRecord {
  return {
    id, sessionId, slotId: "sl-bench", exerciseId: "bench",
    targetWeight: 100, targetReps: 1, actualWeight: 100, actualReps: reps, amrapRole: "topSet",
    completedAt: at(day, 11), schemaVersion: 1,
  };
}
function t2Set(id: string, sessionId: string, reps: number, day: number): SetRecord {
  return {
    id, sessionId, slotId: "sl-inc", exerciseId: "inclineBench",
    targetWeight: 60, targetReps: 8, actualWeight: 60, actualReps: reps,
    completedAt: at(day, 11), schemaVersion: 1,
  };
}
function input(over: Partial<FoldInput>): FoldInput {
  return { sets: [], corrections: [], decisions: [], sessions: [], programs, ...over };
}

describe("foldState — TM 경로", () => {
  it("seed 결정이 TM을 만든다", () => {
    const st = foldState(input({ decisions: [seed("bench", 100, 1)] }));
    expect(st.tm["bench"]).toBe(100);
  });

  it("탑세트 2~3렙 자동 증량 (세션 완료 시점)", () => {
    const st = foldState(input({
      decisions: [seed("bench", 100, 1)],
      sessions: [session("w1", 2, 0, 1)],
      sets: [topSet("s1", "w1", 3, 2)],
    }));
    expect(st.tm["bench"]).toBe(102.5);
  });

  it("같은 사이클-주 두 번째 판정은 no-op (첫 판정 승)", () => {
    const st = foldState(input({
      decisions: [seed("bench", 100, 1)],
      sessions: [session("w1a", 2, 0, 1), session("w1b", 4, 0, 1)],
      sets: [topSet("s1", "w1a", 3, 2), topSet("s2", "w1b", 3, 4)],
    }));
    expect(st.tm["bench"]).toBe(102.5); // 한 번만
  });

  it("cycleIndex가 다르면 각각 발효", () => {
    const st = foldState(input({
      decisions: [seed("bench", 100, 1)],
      sessions: [session("c0", 2, 0, 1), session("c1", 9, 1, 1)],
      sets: [topSet("s1", "c0", 3, 2), topSet("s2", "c1", 2, 9)],
    }));
    expect(st.tm["bench"]).toBe(105);
  });

  it("skipped 세션은 발효 없음", () => {
    const st = foldState(input({
      decisions: [seed("bench", 100, 1)],
      sessions: [session("w1", 2, 0, 1, "skipped")],
      sets: [topSet("s1", "w1", 3, 2)],
    }));
    expect(st.tm["bench"]).toBe(100);
  });

  it("manual 결정은 절대값으로 덮고, 이후 자동 증량은 그 위에", () => {
    const manual: DecisionEvent = { id: "dm", target: { kind: "tm", exerciseId: "bench" }, kind: "manual", value: 90, at: at(3), schemaVersion: 1 };
    const st = foldState(input({
      decisions: [seed("bench", 100, 1), manual],
      sessions: [session("c1", 9, 1, 1)],
      sets: [topSet("s2", "c1", 3, 9)],
    }));
    expect(st.tm["bench"]).toBe(92.5); // 90 + 2.5
  });

  it("0~1렙 → 증량 없음 + tmDeload 제안 (cap은 소진)", () => {
    const st = foldState(input({
      decisions: [seed("bench", 100, 1)],
      sessions: [session("w1", 2, 0, 1)],
      sets: [topSet("s1", "w1", 1, 2)],
    }));
    expect(st.tm["bench"]).toBe(100);
    expect(st.pendingProposals).toHaveLength(1);
    expect(st.pendingProposals[0]).toMatchObject({ type: "tmDeload", sourceSetRecordId: "s1", options: [100, 95] });
  });

  it("4+렙 → tmBonus 제안, 이후 bonusAccepted 결정이 소비", () => {
    const st1 = foldState(input({
      decisions: [seed("bench", 100, 1)],
      sessions: [session("w1", 2, 0, 1)],
      sets: [topSet("s1", "w1", 5, 2)],
    }));
    expect(st1.tm["bench"]).toBe(100);
    expect(st1.pendingProposals[0]).toMatchObject({ type: "tmBonus", options: [105] });

    const accept: DecisionEvent = {
      id: "da", target: { kind: "tm", exerciseId: "bench" }, kind: "bonusAccepted",
      value: 105, at: at(3), sourceSetRecordId: "s1", schemaVersion: 1,
    };
    const st2 = foldState(input({
      decisions: [seed("bench", 100, 1), accept],
      sessions: [session("w1", 2, 0, 1)],
      sets: [topSet("s1", "w1", 5, 2)],
    }));
    expect(st2.tm["bench"]).toBe(105);
    expect(st2.pendingProposals).toHaveLength(0);
  });

  it("T2: 마지막 세트 완수 → +2.5 / 2연속 미완수 → t2Deload 제안", () => {
    const ok = foldState(input({
      decisions: [seed("inclineBench", 60, 1)],
      sessions: [session("t1", 2, 0, 2)],
      sets: [t2Set("s1", "t1", 8, 2)],
    }));
    expect(ok.tm["inclineBench"]).toBe(62.5);

    const fail2 = foldState(input({
      decisions: [seed("inclineBench", 60, 1)],
      sessions: [session("t1", 2, 0, 2), session("t2", 9, 1, 2)],
      sets: [t2Set("s1", "t1", 6, 2), t2Set("s2", "t2", 6, 9)],
    }));
    expect(fail2.tm["inclineBench"]).toBe(60);
    expect(fail2.pendingProposals.some((p) => p.type === "t2Deload")).toBe(true);
  });

  it("정정 재fold: 탑세트 3→1 정정 시 자동 증량이 사라지고, 그 세트 기반 결정엔 플래그", () => {
    const correction: CorrectionRecord = { id: "c1", supersedes: "s1", patch: { actualReps: 1 }, at: at(5), schemaVersion: 1 };
    const accept: DecisionEvent = {
      id: "da", target: { kind: "tm", exerciseId: "bench" }, kind: "bonusAccepted",
      value: 105, at: at(3), sourceSetRecordId: "s1", schemaVersion: 1,
    };
    const st = foldState(input({
      decisions: [seed("bench", 100, 1), accept],
      sessions: [session("w1", 2, 0, 1)],
      sets: [topSet("s1", "w1", 3, 2)],
      corrections: [correction],
    }));
    // 자동 +2.5는 사라짐(1렙), 결정 105는 절대값이라 그대로 적용, 단 플래그
    expect(st.tm["bench"]).toBe(105);
    expect(st.reviewFlags).toContain("da");
  });

  it("대체 세트(substitutedFrom)는 판정 제외", () => {
    const sub: SetRecord = { ...topSet("s1", "w1", 3, 2), substitutedFrom: "deadlift" };
    const st = foldState(input({
      decisions: [seed("bench", 100, 1)],
      sessions: [session("w1", 2, 0, 1)],
      sets: [sub],
    }));
    expect(st.tm["bench"]).toBe(100);
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run test/domain/fold-tm.test.ts` → FAIL

- [ ] **Step 3: 구현** — `src/domain/fold.ts`:

```typescript
import type {
  FoldInput, FoldState, Proposal, DecisionEvent, SessionCompleted, AccessoryState,
} from "./types.ts";
import { sortByAtId, compareByAtId } from "./order.ts";
import { applyCorrections, sessionCyclePosOverride, type EffectiveSet } from "./corrections.ts";
import { programKey, capKey, daySpecFor, judgingSetsForSlot, lastSetOf } from "./foldSupport.ts";
import { judgeTopSet } from "./rules/nsunsTopSet.ts";
import { judgeT2 } from "./rules/t2LastSet.ts";
import { applyAccessorySession, type DoubleProgressionParams } from "./rules/doubleProgression.ts";

type TimelineItem =
  | { type: "decision"; at: string; id: string; ev: DecisionEvent }
  | { type: "session"; at: string; id: string; ev: SessionCompleted };

function targetKeyOf(t: DecisionEvent["target"]): string {
  return t.kind === "tm" ? `tm:${t.exerciseId}` : `acc:${t.slotId}`;
}

export function foldState(input: FoldInput): FoldState {
  const effectiveSets: EffectiveSet[] = applyCorrections(input.sets, input.corrections);

  const timeline: TimelineItem[] = sortByAtId([
    ...input.decisions.map((ev) => ({ type: "decision" as const, at: ev.at, id: ev.id, ev })),
    ...input.sessions
      .filter((s) => s.status === "completed")
      .map((ev) => ({ type: "session" as const, at: ev.at, id: ev.id, ev })),
  ]);

  const tm: Record<string, number> = {};
  const accessories: Record<string, AccessoryState> = {};
  const caps = new Set<string>();
  const t2FailStreak: Record<string, number> = {};
  /** targetKey -> 최신 미결 제안 */
  const proposals = new Map<string, Proposal>();

  for (const item of timeline) {
    if (item.type === "decision") {
      const d = item.ev;
      const key = targetKeyOf(d.target);
      if (d.target.kind === "tm") {
        tm[d.target.exerciseId] = d.value;
      } else {
        const prev = accessories[d.target.slotId];
        accessories[d.target.slotId] = {
          weight: d.value,
          targetReps: d.targetReps ?? prev?.targetReps ?? 0,
          missStreak: 0,
          grace: false,
        };
      }
      // 결정은 해당 target의 미결 제안을 소비
      proposals.delete(key);
      continue;
    }

    // SessionCompleted (completed만 타임라인에 있음)
    const sc = item.ev;
    const pos = sessionCyclePosOverride(sc.id, input.corrections) ?? sc.cyclePos;
    const program = input.programs.get(programKey(sc.programId, sc.programVersion));
    if (!program) continue;
    const day = daySpecFor(program, pos);
    if (!day) continue;

    for (const slot of day.slots) {
      if (!slot.progressionRuleId) continue;
      const slotSets = judgingSetsForSlot(effectiveSets, sc.sessionId, slot.id);
      const params = slot.progressionParams ?? {};

      if (slot.progressionRuleId === "nsunsTopSet") {
        const ts = slotSets.find((s) => s.amrapRole === "topSet");
        if (!ts) continue;
        const key = `tm:${slot.exerciseId}`;
        const ck = capKey(key, pos);
        if (caps.has(ck)) continue;
        caps.add(ck);
        const current = tm[slot.exerciseId];
        if (current === undefined) continue;
        const outcome = judgeTopSet(ts.actualReps, { increment: Number(params["increment"]) });
        if (outcome.kind === "auto") {
          tm[slot.exerciseId] = current + outcome.delta;
        } else if (outcome.kind === "holdOrDeload") {
          proposals.set(key, {
            type: "tmDeload",
            target: { kind: "tm", exerciseId: slot.exerciseId },
            label: `탑세트 ${ts.actualReps}렙 — 동결(기본) 또는 −5kg`,
            sourceSetRecordId: ts.id,
            options: [current, current - 5],
          });
        } else {
          proposals.set(key, {
            type: "tmBonus",
            target: { kind: "tm", exerciseId: slot.exerciseId },
            label: `탑세트 ${ts.actualReps}렙 — 추가 증량 제안`,
            sourceSetRecordId: ts.id,
            options: [current + outcome.suggested],
          });
        }
      } else if (slot.progressionRuleId === "t2LastSet") {
        const last = lastSetOf(slotSets);
        const key = `tm:${slot.exerciseId}`;
        const ck = capKey(key, pos);
        if (caps.has(ck)) continue;
        if (!last) continue;
        caps.add(ck);
        const current = tm[slot.exerciseId];
        if (current === undefined) continue;
        const outcome = judgeT2(
          { actualReps: last.actualReps, targetReps: last.targetReps },
          t2FailStreak[slot.exerciseId] ?? 0,
          { increment: Number(params["increment"]) },
        );
        t2FailStreak[slot.exerciseId] = outcome.failStreak;
        if (outcome.kind === "auto") {
          tm[slot.exerciseId] = current + outcome.delta;
        } else if (outcome.kind === "deloadProposal") {
          proposals.set(key, {
            type: "t2Deload",
            target: { kind: "tm", exerciseId: slot.exerciseId },
            label: `T2 마지막 세트 ${outcome.failStreak}연속 미완수 — 디로드 제안`,
            sourceSetRecordId: last.id,
            options: [Math.round((current * 0.95) / 2.5) * 2.5, current],
          });
        }
      } else if (slot.progressionRuleId === "doubleProgression") {
        const key = `acc:${slot.id}`;
        const ck = capKey(key, pos);
        if (caps.has(ck)) continue;
        const last = lastSetOf(slotSets);
        if (!last) continue;
        caps.add(ck);
        const p = params as unknown as DoubleProgressionParams;
        const prev: AccessoryState =
          accessories[slot.id] ?? { weight: last.actualWeight, targetReps: p.repMin, missStreak: 0, grace: false };
        const { state, rollback } = applyAccessorySession(
          prev,
          { actualWeight: last.actualWeight, actualReps: last.actualReps },
          p,
        );
        accessories[slot.id] = state;
        if (rollback) {
          proposals.set(key, {
            type: "accessoryRollback",
            target: { kind: "accessory", slotId: slot.id },
            label: `2세션 연속 하한 미달 — 이전 무게 롤백 제안`,
            sourceSetRecordId: last.id,
            options: [state.weight - p.weightStep],
          });
        }
      }
    }
  }

  // 재검토 플래그: sourceSetRecordId 결정 중, 그 세트에 결정보다 늦은 판정필드 정정이 있는 것
  const reviewFlags: string[] = [];
  for (const d of input.decisions) {
    if (!d.sourceSetRecordId) continue;
    const hasLaterJudgingCorrection = input.corrections.some(
      (c) =>
        c.supersedes === d.sourceSetRecordId &&
        compareByAtId(c, d) > 0 &&
        (c.revoked === true || c.patch?.actualReps !== undefined),
    );
    if (hasLaterJudgingCorrection) reviewFlags.push(d.id);
  }

  return {
    tm,
    accessories,
    pendingProposals: [...proposals.values()],
    reviewFlags,
  };
}
```

- [ ] **Step 4: 통과 확인** — `npx vitest run` → 66 passed / `npm run typecheck` → 0

- [ ] **Step 5: Commit**

```bash
git add src/domain/fold.ts test/domain/fold-tm.test.ts
git commit -m "feat: foldState — TM 경로 (결정·자동증량·발효상한·제안·플래그) (Stage1-B1 T6)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: foldState — 악세사리 경로 통합 테스트 + nSuns 시드 연동 검증

**Files:**
- Create: `test/domain/fold-accessory.test.ts`, `test/domain/fold-seed-integration.test.ts`

**Interfaces:**
- Consumes: T6의 foldState 전체 (악세사리 분기는 T6 구현에 이미 포함 — 이 태스크는 그 경로의 행동 검증 + 실제 nSuns 시드 JSON과의 통합 검증).
- ⚠️ 테스트가 실패하면 fold.ts를 수정한다 (이 태스크에서 fold.ts 수정 허용).

- [ ] **Step 1: 악세사리 fold 테스트** — `test/domain/fold-accessory.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { foldState } from "../../src/domain/fold.ts";
import { programKey } from "../../src/domain/foldSupport.ts";
import type { ProgramDefinition, SetRecord, SessionCompleted, FoldInput, DecisionEvent } from "../../src/domain/types.ts";

const prog: ProgramDefinition = {
  id: "p", name: "P", version: 1, schemaVersion: 1,
  weeks: [{
    days: [{
      ordinal: 1, name: "acc day",
      slots: [{
        id: "sl-lat", exerciseId: "latPulldown", label: "accessory",
        progressionRuleId: "doubleProgression",
        progressionParams: { repMin: 8, repMax: 12, weightStep: 5, sets: 3 },
        sets: [
          { load: { kind: "tracked" }, reps: 8 },
          { load: { kind: "tracked" }, reps: 8 },
          { load: { kind: "tracked" }, reps: 8 },
        ],
      }],
    }],
  }],
};
const programs = new Map([[programKey("p", 1), prog]]);

function at(day: number, hh = 10): string {
  return `2026-07-${String(day).padStart(2, "0")}T${String(hh).padStart(2, "0")}:00:00Z`;
}
function session(id: string, day: number, cycleIndex: number): SessionCompleted {
  return { id: `sc-${id}`, sessionId: id, at: at(day, 12), cyclePos: { cycleIndex, week: 0, dayOrdinal: 1 }, status: "completed", programId: "p", programVersion: 1, schemaVersion: 1 };
}
function accSet(id: string, sessionId: string, weight: number, reps: number, day: number, minute: number): SetRecord {
  return {
    id, sessionId, slotId: "sl-lat", exerciseId: "latPulldown",
    targetWeight: weight, targetReps: 8, actualWeight: weight, actualReps: reps,
    completedAt: `2026-07-${String(day).padStart(2, "0")}T11:${String(minute).padStart(2, "0")}:00Z`, schemaVersion: 1,
  };
}
function input(over: Partial<FoldInput>): FoldInput {
  return { sets: [], corrections: [], decisions: [], sessions: [], programs, ...over };
}

describe("foldState — 악세사리 경로", () => {
  it("첫 세션: 상태가 마지막 세트 무게로 부트스트랩", () => {
    const st = foldState(input({
      sessions: [session("a1", 2, 0)],
      sets: [accSet("s1", "a1", 40, 9, 2, 1), accSet("s2", "a1", 40, 9, 2, 5)],
    }));
    expect(st.accessories["sl-lat"]).toMatchObject({ weight: 40, targetReps: 10 });
  });

  it("마지막 세트 12렙 → +5·rep 리셋·유예", () => {
    const st = foldState(input({
      sessions: [session("a1", 2, 0)],
      sets: [accSet("s1", "a1", 40, 12, 2, 1)],
    }));
    expect(st.accessories["sl-lat"]).toEqual({ weight: 45, targetReps: 8, missStreak: 0, grace: true });
  });

  it("증량 직후 유예 → 다음 세션 미달은 카운트 제외, 그 다음 2연속 미달에 롤백 제안", () => {
    const st = foldState(input({
      sessions: [session("a1", 2, 0), session("a2", 9, 1), session("a3", 16, 2), session("a4", 23, 3)],
      sets: [
        accSet("s1", "a1", 40, 12, 2, 1),  // → 45, grace
        accSet("s2", "a2", 45, 6, 9, 1),   // grace 소진, 카운트 X
        accSet("s3", "a3", 45, 6, 16, 1),  // miss 1
        accSet("s4", "a4", 45, 7, 23, 1),  // miss 2 → rollback 제안
      ],
    }));
    expect(st.accessories["sl-lat"]!.missStreak).toBe(2);
    const rb = st.pendingProposals.find((p) => p.type === "accessoryRollback");
    expect(rb).toBeDefined();
    expect(rb!.options).toEqual([40]);
  });

  it("rollbackAccepted 결정이 무게를 덮고 제안을 소비", () => {
    const accept: DecisionEvent = {
      id: "dr", target: { kind: "accessory", slotId: "sl-lat" }, kind: "rollbackAccepted",
      value: 40, targetReps: 8, at: at(24), sourceSetRecordId: "s4", schemaVersion: 1,
    };
    const st = foldState(input({
      decisions: [accept],
      sessions: [session("a1", 2, 0), session("a2", 9, 1), session("a3", 16, 2), session("a4", 23, 3)],
      sets: [
        accSet("s1", "a1", 40, 12, 2, 1),
        accSet("s2", "a2", 45, 6, 9, 1),
        accSet("s3", "a3", 45, 6, 16, 1),
        accSet("s4", "a4", 45, 7, 23, 1),
      ],
    }));
    expect(st.accessories["sl-lat"]).toMatchObject({ weight: 40, targetReps: 8, missStreak: 0 });
    expect(st.pendingProposals).toHaveLength(0);
  });
});
```

- [ ] **Step 2: nSuns 시드 통합 테스트** — `test/domain/fold-seed-integration.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { foldState } from "../../src/domain/fold.ts";
import { programKey } from "../../src/domain/foldSupport.ts";
import type { ProgramDefinition, SetRecord, DecisionEvent, SessionCompleted, FoldInput } from "../../src/domain/types.ts";

const seed = JSON.parse(readFileSync("programs/nsuns-5day.json", "utf8")) as ProgramDefinition;
const programs = new Map([[programKey(seed.id, seed.version), seed]]);

function at(day: number, hh = 10): string {
  return `2026-07-${String(day).padStart(2, "0")}T${String(hh).padStart(2, "0")}:00:00Z`;
}
const seeds: DecisionEvent[] = [
  { id: "d1", target: { kind: "tm", exerciseId: "bench" }, kind: "seed", value: 105, at: at(1), schemaVersion: 1 },
  { id: "d2", target: { kind: "tm", exerciseId: "ohp" }, kind: "seed", value: 67.5, at: at(1), schemaVersion: 1 },
];
function session(id: string, day: number, dayOrdinal: number): SessionCompleted {
  return { id: `sc-${id}`, sessionId: id, at: at(day, 14), cyclePos: { cycleIndex: 0, week: 0, dayOrdinal }, status: "completed", programId: seed.id, programVersion: seed.version, schemaVersion: 1 };
}

describe("nSuns 시드 × fold 통합", () => {
  it("화요일 벤치 volume(topSet 없음·rule 없음) + OHP T2(rule 없음) → 아무 TM도 안 움직임", () => {
    // 화요일 세션: 벤치 volume 마지막 backoff AMRAP 12렙 + OHP T2 마지막 세트 완수
    const sets: SetRecord[] = [
      { id: "s1", sessionId: "tue", slotId: "w1d1-bench-t1", exerciseId: "bench", targetWeight: 68, targetReps: 8, actualWeight: 68, actualReps: 12, amrapRole: "backoff", completedAt: at(2, 11), schemaVersion: 1 },
      { id: "s2", sessionId: "tue", slotId: "w1d1-ohp-t2", exerciseId: "ohp", targetWeight: 47.5, targetReps: 8, actualWeight: 47.5, actualReps: 8, completedAt: at(2, 12), schemaVersion: 1 },
    ];
    const st = foldState({ sets, corrections: [], decisions: seeds, sessions: [session("tue", 2, 1)], programs });
    expect(st.tm["bench"]).toBe(105);
    expect(st.tm["ohp"]).toBe(67.5);
    expect(st.pendingProposals).toHaveLength(0);
  });

  it("토요일 벤치 heavy 탑세트 3렙 → 벤치 +2.5 정확히 1회 (스펙 §3.6 오라클)", () => {
    const sets: SetRecord[] = [
      { id: "s1", sessionId: "sat", slotId: "w1d5-bench-t1", exerciseId: "bench", targetWeight: 100, targetReps: 1, actualWeight: 100, actualReps: 3, amrapRole: "topSet", completedAt: at(6, 11), schemaVersion: 1 },
    ];
    const st = foldState({ sets, corrections: [], decisions: seeds, sessions: [session("sat", 6, 5)], programs });
    expect(st.tm["bench"]).toBe(107.5);
  });

  it("화 OHP T2 완수 + 목 OHP 탑세트 3렙이 한 주에 있어도 OHP는 +2.5 정확히 1회", () => {
    const sets: SetRecord[] = [
      { id: "s1", sessionId: "tue", slotId: "w1d1-ohp-t2", exerciseId: "ohp", targetWeight: 47.5, targetReps: 8, actualWeight: 47.5, actualReps: 10, completedAt: at(2, 12), schemaVersion: 1 },
      { id: "s2", sessionId: "thu", slotId: "w1d3-ohp-t1", exerciseId: "ohp", targetWeight: 64, targetReps: 1, actualWeight: 64, actualReps: 3, amrapRole: "topSet", completedAt: at(4, 11), schemaVersion: 1 },
    ];
    const st = foldState({
      sets, corrections: [], decisions: seeds,
      sessions: [session("tue", 2, 1), session("thu", 4, 3)],
      programs,
    });
    expect(st.tm["ohp"]).toBe(70); // 67.5 + 2.5 (T1만) — 화요일 T2 슬롯엔 rule이 없으므로
  });
});
```

- [ ] **Step 3: 실행** — `npx vitest run` → 73 passed 기대. 실패 시 fold.ts의 해당 분기를 수정하고 재실행 (수정 내용은 리포트에 기록).

- [ ] **Step 4: typecheck** — `npm run typecheck` → 0

- [ ] **Step 5: Commit**

```bash
git add test/domain/fold-accessory.test.ts test/domain/fold-seed-integration.test.ts src/domain/
git commit -m "test: fold 악세사리 경로 + nSuns 시드 통합 검증 (Stage1-B1 T7)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## 완료 기준 (Plan B1)
1. `npx vitest run` 전체 통과 (73+), `npm run typecheck` 0 에러.
2. 스펙 §3.6 오라클 중 fold 관련 항목 전부 테스트로 존재: 벤치 주2회 1회 증량 · OHP T2+T1 1회 증량 · cycleIndex 구분 · 정정 재fold(자동 교정+플래그) · skipped 무발효 · 대체 제외 · 악세사리 유예·롤백.
3. 후속: Plan B2(엔진·워밍업·분석·e1RM — WorkoutPlan 생성), Plan C(앱 셸·UI·PWA).
