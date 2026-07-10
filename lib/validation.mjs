import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  validateSchemaWithSchema,
  validateSemantics,
  validateProgramWithSchema,
  RULES,
} from "./validationCore.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(
  readFileSync(join(here, "..", "schema", "program.schema.json"), "utf8"),
);

/** @returns {string[]} 에러 메시지 배열 (빈 배열 = 통과) */
export function validateSchema(program) {
  return validateSchemaWithSchema(program, schema);
}

export { validateSemantics, RULES };

export function validateProgram(program) {
  return validateProgramWithSchema(program, schema);
}
