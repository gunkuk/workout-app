#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { renderProgram } from "../lib/render.mjs";

const [file, ...rest] = process.argv.slice(2);
if (!file) {
  console.error("사용법: node tools/render.mjs <program.json> [--tm bench=105]... [--step 2.5]");
  process.exit(2);
}
const tms = {};
let step = 2.5;
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === "--tm") {
    const [k, v] = rest[++i].split("=");
    tms[k] = Number(v);
  } else if (rest[i] === "--step") {
    step = Number(rest[++i]);
  }
}
const program = JSON.parse(readFileSync(file, "utf8"));
console.log(renderProgram(program, tms, { step }));
