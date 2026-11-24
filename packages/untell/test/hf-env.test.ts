// Privacy: every run of the HyperFrames CLI from untell turns off its usage reports. The test gives untell a stand-in
// CLI that writes the environment it was given to a file, and reads that file back.
import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { HF_ENV, hfEnv, runHyperframes, versionOf } from "../src/env";

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

/** A stand-in hyperframes program: it writes its environment as JSON to env.json in its folder. */
function standIn(): { bin: string; env: () => Record<string, string> } {
  const dir = mkdtempSync(join(tmpdir(), "untell-hf-env-"));
  dirs.push(dir);
  const bin = join(dir, "hyperframes");
  writeFileSync(bin, `#!/usr/bin/env node\nrequire("node:fs").writeFileSync(${JSON.stringify(join(dir, "env.json"))}, JSON.stringify(process.env));\nconsole.log("0.0.0");\n`);
  chmodSync(bin, 0o755);
  return { bin, env: () => JSON.parse(readFileSync(join(dir, "env.json"), "utf8")) as Record<string, string> };
}

describe("the HyperFrames CLI runs with its usage reports off", () => {
  test("runHyperframes sets both variables, also over an environment that sets them to 0 or leaves them out", () => {
    for (const given of [{ PATH: process.env.PATH ?? "", DO_NOT_TRACK: "0", HYPERFRAMES_NO_TELEMETRY: "0" }, { PATH: process.env.PATH ?? "" }, undefined]) {
      const s = standIn();
      const r = runHyperframes([s.bin], ["check", "--json"], { encoding: "utf8", ...(given ? { env: given } : {}) });
      expect(r.status).toBe(0);
      const e = s.env();
      expect([e.HYPERFRAMES_NO_TELEMETRY, e.DO_NOT_TRACK]).toEqual(["1", "1"]);
    }
  });
  test("the doctor's version probe of the CLI sets both variables", () => {
    const s = standIn();
    expect(versionOf(s.bin, "--version", hfEnv({ PATH: process.env.PATH ?? "" }))).toBe("0.0.0");
    expect([s.env().HYPERFRAMES_NO_TELEMETRY, s.env().DO_NOT_TRACK]).toEqual([HF_ENV.HYPERFRAMES_NO_TELEMETRY, HF_ENV.DO_NOT_TRACK]);
  });
  test("a real command (untell doctor) runs the project's CLI with both variables, from a parent that sets neither", () => {
    const s = standIn();
    const project = mkdtempSync(join(tmpdir(), "untell-hf-project-"));
    dirs.push(project);
    writeFileSync(join(project, "hyperframes.json"), "{}\n");
    const env: Record<string, string> = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", UNTELL_HYPERFRAMES: s.bin };
    const r = spawnSync(process.execPath, [join(import.meta.dir, "..", "src", "cli.ts"), "doctor", "--cwd", project], { encoding: "utf8", env, timeout: 120000 });
    expect(r.stdout).toContain("HyperFrames CLI");
    expect([s.env().HYPERFRAMES_NO_TELEMETRY, s.env().DO_NOT_TRACK]).toEqual(["1", "1"]);
  });
  test("the npm scripts that untell init writes run the CLI through untell hf, which sets both variables and passes the arguments", () => {
    const { newPackageJson } = require("../src/init") as typeof import("../src/init");
    const scripts = (newPackageJson(null, "hyperframes", "p") as { scripts: Record<string, string> }).scripts;
    expect([scripts.check, scripts.render, scripts.preview]).toEqual(["npx untell hf check", "npx untell hf render", "npx untell hf preview"]);
    expect((newPackageJson({ devDependencies: { untell: "0.1.0" } }, "hyperframes", "p") as { scripts: Record<string, string> }).scripts.check).toBe("untell hf check");
    const s = standIn();
    const project = mkdtempSync(join(tmpdir(), "untell-hf-script-"));
    dirs.push(project);
    const env: Record<string, string> = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", UNTELL_HYPERFRAMES: s.bin, DO_NOT_TRACK: "0" };
    const r = spawnSync(process.execPath, [join(import.meta.dir, "..", "src", "cli.ts"), "hf", "check", "--json"], { cwd: project, encoding: "utf8", env, timeout: 120000 });
    expect([r.status, r.stdout.trim()]).toEqual([0, "0.0.0"]);
    expect([s.env().HYPERFRAMES_NO_TELEMETRY, s.env().DO_NOT_TRACK]).toEqual(["1", "1"]);
  });
  test("no source file starts the HyperFrames CLI by any other way", () => {
    const src = join(import.meta.dir, "..", "src");
    const bad: string[] = [];
    for (const f of readdirSync(src).filter((f) => f.endsWith(".ts") && f !== "env.ts")) {
      const t = readFileSync(join(src, f), "utf8");
      // A spawn whose program is the HyperFrames command (hf.cmd, hf, or a bin found for it).
      for (const m of t.matchAll(/spawnSync\(\s*(hf\b[^,]*|cmd\[0\][^,]*hyperframes)/g)) bad.push(`${f}: ${m[0]}`);
      if (/versionOf\(bin\)/.test(t)) bad.push(`${f}: versionOf(bin) with no environment`);
    }
    expect(bad).toEqual([]);
  });
});
