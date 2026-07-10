import { validateProgramWithSchema } from "../../lib/validationCore.mjs";
import type { ProgramDefinition } from "../domain/types.ts";
// JSON import 방식: OnboardingScreen과 동일 패턴(`?raw` + JSON.parse) — resolveJsonModule 미설정.
import schemaRaw from "../../schema/program.schema.json?raw";

const schema = JSON.parse(schemaRaw) as object;

export type ParseAndValidateResult =
  | { ok: true; program: ProgramDefinition }
  | { ok: false; errors: string[] };

/** JSON 텍스트를 파싱 후 스키마+시맨틱 검증 — validationCore의 string[](빈 배열=통과) 결과를 {ok,errors}로 래핑 */
export function parseAndValidateProgram(jsonText: string): ParseAndValidateResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    return { ok: false, errors: [`JSON 파싱 실패: ${e instanceof Error ? e.message : String(e)}`] };
  }

  const errors = validateProgramWithSchema(parsed, schema);
  if (errors.length) return { ok: false, errors };
  return { ok: true, program: parsed as ProgramDefinition };
}

/** raw URL에서 프로그램 JSON 텍스트를 가져온다 (예: GitHub raw) */
export async function fetchProgramFromUrl(url: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (e) {
    throw new Error(
      `URL 가져오기 실패: ${e instanceof Error ? e.message : String(e)} — raw URL이 CORS를 허용해야 합니다(GitHub raw 등).`,
    );
  }
  if (!response.ok) {
    throw new Error(
      `URL 가져오기 실패: HTTP ${response.status} — raw URL이 CORS를 허용해야 합니다(GitHub raw 등).`,
    );
  }
  return response.text();
}
