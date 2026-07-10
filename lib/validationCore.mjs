import Ajv from "ajv";
import addFormats from "ajv-formats";

/** 스키마 객체별 컴파일 캐시 — 동일 스키마 재검증 시 재컴파일 방지 */
const compiledCache = new WeakMap();

function compileSchema(schemaObject) {
  let compiled = compiledCache.get(schemaObject);
  if (!compiled) {
    const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
    addFormats(ajv);
    compiled = ajv.compile(schemaObject);
    compiledCache.set(schemaObject, compiled);
  }
  return compiled;
}

/** @returns {string[]} 에러 메시지 배열 (빈 배열 = 통과) */
function validateSchemaWith(compiled, program) {
  if (compiled(program)) return [];
  return (compiled.errors ?? []).map(
    (e) => `[스키마] ${e.instancePath || "(root)"} ${e.message}`,
  );
}

/** 스키마 객체를 파라미터로 받는 fs-free 스키마 전용 검증 (시맨틱 미포함) */
export function validateSchemaWithSchema(program, schemaObject) {
  return validateSchemaWith(compileSchema(schemaObject), program);
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

/**
 * 스키마 객체를 파라미터로 받는 fs-free 검증 진입점.
 * @returns {string[]} 에러 메시지 배열 (빈 배열 = 통과)
 */
export function validateProgramWithSchema(program, schemaObject) {
  const schemaErrors = validateSchemaWithSchema(program, schemaObject);
  if (schemaErrors.length) return schemaErrors;
  return validateSemantics(program);
}
