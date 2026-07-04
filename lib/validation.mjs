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
