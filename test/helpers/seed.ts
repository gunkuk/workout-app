import { readFileSync } from "node:fs";
import { db } from "../../src/storage/db";
import { upsertProgramVersion, setInstanceState, appendDecision } from "../../src/storage/eventStore";
import type { ProgramDefinition, DecisionEvent } from "../../src/domain/types.ts";

/** nSuns 5일 시드 프로그램 로드 — 12개 .ts/.tsx 파일의 JSON.parse(readFileSync(...)) 중복 통합(Stage1-R T2). */
export function loadSeedProgram(): ProgramDefinition {
  return JSON.parse(readFileSync("programs/nsuns-5day.json", "utf8")) as ProgramDefinition;
}

/**
 * 온보딩 완료 상태 재현 — programVersions + library + instanceState(rolling) + TM 시드 결정 append.
 * addedAt·decisions·extra는 호출부(파일별 fixture)가 파라미터로 넘겨 각자의 값을 그대로 보존한다
 * (5개 파일 중복 통합 — Stage1-R T2).
 */
export async function seedOnboarded(
  program: ProgramDefinition,
  decisions: DecisionEvent[],
  addedAt: string,
  extra: DecisionEvent[] = [],
): Promise<void> {
  await upsertProgramVersion(program);
  await db.library.put({ programId: program.id, addedAt });
  await setInstanceState({
    programId: program.id,
    programVersion: program.version,
    mode: "rolling",
    anchor: {},
    schemaVersion: 1,
  });
  for (const d of [...decisions, ...extra]) await appendDecision(d);
}
