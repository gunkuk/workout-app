/**
 * lib/validationCore.mjs 의 TS 타입 선언 — fs-free 순수 코어.
 * src/ 쪽에서 이 모듈을 typed하게 import하기 위함(브라우저 번들 대상).
 */

/** 증량 규칙 카탈로그 항목 */
export type ValidationRule = {
  checkParams(params: Record<string, unknown>, slot: unknown): string[];
};

export const RULES: Record<string, ValidationRule>;

/** 스키마 객체를 파라미터로 받는 fs-free 스키마 전용 검증 (시맨틱 미포함) */
export function validateSchemaWithSchema(program: unknown, schemaObject: object): string[];

/** 스키마 통과를 전제로 한 불변식 검사 */
export function validateSemantics(program: unknown): string[];

/**
 * 스키마 객체를 파라미터로 받는 fs-free 검증 진입점.
 * @returns 에러 메시지 배열 (빈 배열 = 통과)
 */
export function validateProgramWithSchema(program: unknown, schemaObject: object): string[];
