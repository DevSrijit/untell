// The kit compiles under the strict flags that Remotion's scaffolder writes into a new project's tsconfig
// (noUnusedLocals, noUnusedParameters): a project that copies src/system must build with no error from it.
import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");

test("src/system has no error under noUnusedLocals and noUnusedParameters", () => {
  const r = spawnSync(join(ROOT, "node_modules/.bin/tsc"), ["--noEmit", "-p", ".", "--noUnusedLocals", "--noUnusedParameters"], { cwd: ROOT, encoding: "utf8" });
  const ours = (r.stdout + r.stderr).split("\n").filter((l) => l.startsWith("src/system/"));
  expect(ours).toEqual([]);
}, 120_000);
