#!/usr/bin/env bun
// Runs untell's own copy rules on Markdown: tell/cliche-copy (stock marketing phrases), tell/placeholder and
// tell/emoji, from scripts/lint/rules.ts. The rules read quoted strings in code, so each Markdown line is passed as
// one string. Exit 1 when any rule fires.
//
// Usage: bun packages/untell/scripts/readme/prose-check.ts <file.md> ...
import { readFileSync } from "node:fs";
import { RULES } from "../../../../scripts/lint/rules";

const IDS = ["tell/cliche-copy", "tell/placeholder", "tell/emoji"];
const rules = RULES.filter((r) => IDS.includes(r.id));
if (rules.length !== IDS.length) throw new Error(`missing rules: ${IDS.filter((id) => !rules.some((r) => r.id === id)).join(", ")}`);

let found = 0;
for (const file of process.argv.slice(2)) {
  const lines = readFileSync(file, "utf8").split("\n").map((l) => `"${l.replace(/"/g, "'")}"`);
  const src = lines.join("\n");
  for (const r of rules) {
    const hits = r.file ? r.file(src, lines) : [];
    for (const h of hits) { found++; console.log(`${file}:${h.line}  ${r.id}  ${h.message}`); }
  }
}
console.log(found ? `${found} finding(s)` : `no findings (${IDS.join(", ")})`);
process.exit(found ? 1 : 0);
