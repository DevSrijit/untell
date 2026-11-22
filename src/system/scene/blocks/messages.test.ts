// The blocks ship in the untell package. A message they throw or warn must be true in a user's project: when it
// names a repository command (bun scripts/...), it names the untell command on the same line too.
import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = import.meta.dir;
const files = [...readdirSync(DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).map((f) => join(DIR, f)), join(DIR, "../layout.ts"), join(DIR, "../../three/render.ts")];

test("no block message names only a repository command", () => {
  const bad: string[] = [];
  for (const f of files) readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    if (!/(Error\(|warn\()/.test(line)) return;
    if (/scripts\/[\w/-]+\.(ts|py)|python3 scripts/.test(line) && !/untell (media|check|listen|lint|record|build)\b|the untell lab/.test(line)) bad.push(`${f.split("/").slice(-2).join("/")}:${i + 1}`);
  });
  expect(bad).toEqual([]);
});
