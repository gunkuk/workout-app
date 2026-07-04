#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { validateProgram } from "../lib/validation.mjs";

const file = process.argv[2];
if (!file) {
  console.error("사용법: node tools/validate.mjs <program.json>");
  process.exit(2);
}
let program;
try {
  program = JSON.parse(readFileSync(file, "utf8"));
} catch (e) {
  console.error(`❌ 파일/JSON 읽기 실패: ${e.message}`);
  process.exit(2);
}
const errors = validateProgram(program);
if (errors.length) {
  console.error(`❌ 검증 실패 ${errors.length}건:`);
  for (const e of errors) console.error("  -", e);
  process.exit(1);
}
console.log(`✅ 유효한 프로그램: ${program.name} v${program.version}`);
