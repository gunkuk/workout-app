import { parseAndValidateProgram } from "./programImport";
import type { ProgramDefinition } from "../domain/types.ts";
// JSON import 방식: OnboardingScreen과 동일 패턴(`?raw` + JSON.parse) — resolveJsonModule 미설정.
import nsuns5dayRaw from "../../programs/nsuns-5day.json?raw";
import kk4dayRaw from "../../programs/kk-4day.json?raw";
import kk6dayRaw from "../../programs/kk-6day.json?raw";

export type BundledProgram = {
  name: string;
  id: string;
  version: number;
  load: () => ProgramDefinition;
};

/** 내장 프로그램 원본 JSON 텍스트 목록 — 새 번들 추가 시 이 배열에 한 줄만 추가하면 된다.
 *  (예: 팔로업에서 `import kk4dayRaw from "../../programs/kk-4day.json?raw";` 후 kk4dayRaw 추가) */
const BUNDLED_RAW: string[] = [nsuns5dayRaw, kk4dayRaw, kk6dayRaw];

/** 내장 프로그램 목록 — parseAndValidateProgram(스키마+시맨틱 검증, ProgramLibrary의 파일/URL 가져오기와
 *  동일 검증 경로)을 통과한 것만 노출한다. 검증 실패한 번들은 조용히 제외(다른 번들엔 영향 없음). */
export function listBundledPrograms(): BundledProgram[] {
  const result: BundledProgram[] = [];
  for (const raw of BUNDLED_RAW) {
    const parsed = parseAndValidateProgram(raw);
    if (!parsed.ok) continue;
    const program = parsed.program;
    result.push({
      name: program.name,
      id: program.id,
      version: program.version,
      load: () => program,
    });
  }
  return result;
}
