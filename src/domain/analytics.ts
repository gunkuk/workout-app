import type { SetRecord, CorrectionRecord, SessionCompleted, ProgramDefinition, SlotSpec } from "./types.ts";
import { applyCorrections, sessionCyclePosOverride, type EffectiveSet } from "./corrections";
import { programKey, daySpecFor } from "./foldSupport";
import { exerciseInfo, type MuscleGroup } from "./exerciseLibrary";

/** 부위별 주간 통계 (스펙 §2-4) */
export type GroupStats = { validSets: number; tonnage: number; frequency: number };

/**
 * 주간 버킷 — (programId, cycleIndex, week) 키. programId가 키에 포함되므로 프로그램
 * 전환 후 새 인스턴스가 week0부터 재시작해도 이전 프로그램 버킷과 충돌하지 않는다
 * (스펙 §2-7 — UI가 firstAt 시간순으로 이어 보여줌).
 */
export type WeekBucket = {
  programId: string;
  cycleIndex: number;
  week: number;
  firstAt: string;
  groups: Partial<Record<MuscleGroup, GroupStats>>;
};

/**
 * 외부(크로스핏 등) 세션 — 프로그램 SetRecord가 없지만 빈도엔 반영해야 하는 세션.
 *
 * 계약 결정(Task 6 구현 확정): 플랜 원문 계약은 `{cyclePos, groups}`만 규정하고
 * programId를 명시하지 않았다. 그러나 WeekBucket 키는 (programId, cycleIndex, week)
 * 3요소이므로, programId 없이는 같은 주에 프로그램 전환이 있는 경우(Task6 테스트 ⑩)
 * 버킷을 유일하게 특정할 수 없다. 가장 단순하고 계약과 일관된 선택은 **호출자가 각
 * externalSessions 항목에 programId를 직접 명시**하는 것 — weeklyAnalysis에 "활성
 * 프로그램"이라는 새 개념을 도입하지 않는다. 매칭되는 버킷이 없으면(그 programId·주에
 * 실제 SetRecord가 하나도 없으면) 조용히 버려진다 — 외부 세션은 빈도만 가산하는 부가
 * 정보이지 버킷을 새로 만드는 근거가 아니다(스펙 "빈도만" 규정).
 */
export type ExternalSession = {
  cyclePos: { cycleIndex: number; week: number };
  groups: MuscleGroup[];
  programId: string;
};

export type WeeklyAnalysisInput = {
  sets: SetRecord[];
  corrections: CorrectionRecord[];
  sessions: SessionCompleted[];
  programs: Map<string, ProgramDefinition>;
  externalSessions?: ExternalSession[];
};

type Tier = "T1" | "T2" | "accessory";

/** 라벨이 정확히 T1|T2|accessory가 아닐 때의 구조적 fallback (스펙 §2-4) */
function structuralTier(slot: SlotSpec): Tier {
  if (slot.sets.some((s) => s.amrapRole !== undefined)) return "T1";
  if (slot.sets.some((s) => s.load.kind === "tracked")) return "accessory";
  return "T2";
}

function tierOf(slot: SlotSpec): Tier {
  if (slot.label === "T1" || slot.label === "T2" || slot.label === "accessory") return slot.label;
  return structuralTier(slot);
}

/** 티어 무관 공통 유효 규칙: rir ≤ 4 */
function isRirValid(s: EffectiveSet): boolean {
  return s.rir !== undefined && s.rir <= 4;
}

/**
 * 세션·슬롯 하나(completedAt 오름차순 정렬된 sets)의 유효 세트 플래그.
 * slotSpec 조회 실패(슬롯·프로그램 없음) → rir 규칙만 적용(스펙 §2-4).
 */
function computeValidFlags(sortedSets: EffectiveSet[], slotSpec: SlotSpec | undefined): boolean[] {
  if (!slotSpec) return sortedSets.map(isRirValid);

  const tier = tierOf(slotSpec);
  if (tier === "accessory") return sortedSets.map(() => true);

  if (tier === "T1") {
    return sortedSets.map((s, k) => {
      if (s.amrapRole !== undefined) return true;
      const specSet = slotSpec.sets[k];
      if (specSet && specSet.load.kind === "pctOfTM" && specSet.load.pct >= 0.9) return true;
      return isRirValid(s);
    });
  }

  // T2형: 후반 4세트(completedAt 순) + rir≤4
  const n = sortedSets.length;
  return sortedSets.map((s, i) => i >= n - 4 || isRirValid(s));
}

function sortByCompletedAt(sets: EffectiveSet[]): EffectiveSet[] {
  return [...sets].sort((a, b) => (a.completedAt < b.completedAt ? -1 : a.completedAt > b.completedAt ? 1 : 0));
}

type GroupAcc = { validSets: number; tonnage: number; sessionIds: Set<string>; external: number };

function bucketKeyOf(programId: string, cycleIndex: number, week: number): string {
  return `${programId}|c${cycleIndex}w${week}`;
}

/**
 * 주간 부위별 유효세트·톤수·빈도 (스펙 §2-4).
 * - 버킷팅: 세트 → sessionId로 SessionCompleted 조인 → (programId, cyclePos). 고아 세트
 *   (매칭 세션 없음) 제외. skipped 세션의 세트도 포함(규칙 발효만 completed 한정).
 * - warmup·revoked 세트는 처음부터 전체 제외.
 * - 티어 판별 → 유효 세트 → 톤수(전 워크 세트) → 부위 귀속(exerciseLibrary groups 전부)
 *   → 빈도(그룹별 distinct sessionId + externalSessions) 순.
 */
export function weeklyAnalysis(input: WeeklyAnalysisInput): WeekBucket[] {
  const effective = applyCorrections(input.sets, input.corrections).filter(
    (s) => !s.revoked && s.setType !== "warmup"
  );

  const sessionsBySessionId = new Map(input.sessions.map((s) => [s.sessionId, s]));

  // 세션·슬롯별로 그룹핑 (고아 세트는 여기서 제외 — 매칭 세션 없음)
  const bySlot = new Map<
    string,
    { session: SessionCompleted; slotId: string | undefined; sets: EffectiveSet[] }
  >();
  for (const s of effective) {
    const sc = sessionsBySessionId.get(s.sessionId);
    if (!sc) continue; // 고아 세트 — 제외
    const key = `${s.sessionId}::${s.slotId ?? ""}`;
    let g = bySlot.get(key);
    if (!g) {
      g = { session: sc, slotId: s.slotId, sets: [] };
      bySlot.set(key, g);
    }
    g.sets.push(s);
  }

  const buckets = new Map<string, WeekBucket>();
  const accByBucket = new Map<string, Map<MuscleGroup, GroupAcc>>();

  function acquireBucket(programId: string, cycleIndex: number, week: number, at: string): string {
    const key = bucketKeyOf(programId, cycleIndex, week);
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, { programId, cycleIndex, week, firstAt: at, groups: {} });
      accByBucket.set(key, new Map());
    } else if (Date.parse(at) < Date.parse(existing.firstAt)) {
      existing.firstAt = at;
    }
    return key;
  }

  function acc(bucketKey: string, group: MuscleGroup): GroupAcc {
    const m = accByBucket.get(bucketKey)!;
    let a = m.get(group);
    if (!a) {
      a = { validSets: 0, tonnage: 0, sessionIds: new Set(), external: 0 };
      m.set(group, a);
    }
    return a;
  }

  for (const { session: sc, slotId, sets } of bySlot.values()) {
    const pos = sessionCyclePosOverride(sc.id, input.corrections) ?? sc.cyclePos;
    const bucketKey = acquireBucket(sc.programId, pos.cycleIndex, pos.week, sc.at);

    const program = input.programs.get(programKey(sc.programId, sc.programVersion));
    const day = program ? daySpecFor(program, pos) : undefined;
    const slotSpec = day?.slots.find((sl) => sl.id === slotId);

    const sorted = sortByCompletedAt(sets);
    const validFlags = computeValidFlags(sorted, slotSpec);

    sorted.forEach((set, i) => {
      const groups = exerciseInfo(set.exerciseId)?.groups ?? [];
      for (const group of groups) {
        const a = acc(bucketKey, group);
        a.tonnage += set.actualWeight * set.actualReps;
        if (validFlags[i]) a.validSets += 1;
        a.sessionIds.add(set.sessionId);
      }
    });
  }

  for (const ext of input.externalSessions ?? []) {
    const key = bucketKeyOf(ext.programId, ext.cyclePos.cycleIndex, ext.cyclePos.week);
    if (!buckets.has(key)) continue; // 매칭 버킷 없으면 버림 — 외부 세션은 버킷 생성원이 아님
    for (const group of ext.groups) {
      acc(key, group).external += 1;
    }
  }

  for (const [key, bucket] of buckets) {
    const m = accByBucket.get(key)!;
    for (const [group, a] of m) {
      bucket.groups[group] = {
        validSets: a.validSets,
        tonnage: a.tonnage,
        frequency: a.sessionIds.size + a.external,
      };
    }
  }

  return [...buckets.values()];
}
