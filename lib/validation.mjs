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
