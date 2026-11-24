// Unit tests for untell lint in the package: the files it reads, the films folder, the hook input of both
// harnesses, the catalog and the sheet's path rules. The rules themselves are tested in the repository (scripts/lint).
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { filmsFolders, hookPaths, hookTargets, lintable, lintCommand, lintFiles, lintHook, lintPaths, patchFiles, RULES, tellsDoc } from "../src/lint";
import { sheetPathFor } from "../src/sheet";
import { newestRender } from "../src/check";
import { HELP, helpFor } from "../src/help";

const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "untell-lint-")); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

const BAD = `export const system = "riso";\nexport const seconds = 6;\nexport const scene = (ctx, B) => [{ fill: "#ff0000", y: Math.random() }];\n`;
const remotion = () => {
  const d = tmp();
  writeFileSync(join(d, "package.json"), JSON.stringify({ dependencies: { remotion: "4.0.0" } }));
  mkdirSync(join(d, "src/films"), { recursive: true });
  return d;
};

describe("the files lint reads", () => {
  test("source files, not tests, types or generated tables", () => {
    expect(["a.ts", "a.tsx", "a.html", "a.css", "a.js"].every(lintable)).toBe(true);
    expect(["a.test.ts", "a.d.ts", "media.gen.ts", "a.md", "a.json"].some(lintable)).toBe(false);
  });
  test("a folder walk skips node_modules and the kit folder", () => {
    const d = tmp();
    for (const f of ["films/a.ts", "node_modules/x/b.ts", "untell/c.ts", "films/d.md"]) { mkdirSync(join(d, f, ".."), { recursive: true }); writeFileSync(join(d, f), ""); }
    expect(lintFiles([d]).map((f) => f.slice(d.length + 1))).toEqual(["films/a.ts"]);
  });
  test("a missing path is a usage error that says what to give", () => expect(() => lintFiles(["/no/such/file.ts"])).toThrow(/does not exist/));
});

describe("lintCommand", () => {
  test("with no path it lints the films folder", () => {
    const d = remotion();
    writeFileSync(join(d, "src/films/bad.ts"), BAD);
    expect(filmsFolders(d)).toEqual(["src/films"]);
    const r = lintPaths(lintFiles([join(d, "src/films")]), d);
    expect(r.results[0]!.file).toBe("src/films/bad.ts");
    expect(r.results[0]!.findings.map((f) => f.rule)).toEqual(expect.arrayContaining(["scene/raw-colour", "tell/random"]));
  });
  test("with no path and no films folder, the error says to give a path", () => {
    expect(() => lintCommand(tmp(), { paths: [] })).toThrow(/no films folder.*untell lint <path>/);
  });
  test("bad flag values are usage errors", () => {
    const d = remotion();
    expect(() => lintCommand(d, { paths: [], scope: "all" })).toThrow(/--scope/);
    expect(() => lintCommand(d, { paths: [], maxWarnings: "x" })).toThrow(/--max-warnings/);
  });
});

describe("the hook", () => {
  test("patchFiles reads Codex's apply_patch paths", () => {
    const patch = "*** Begin Patch\n*** Update File: src/films/a.ts\n@@\n-x\n+y\n*** Add File: films/b.ts\n+z\n*** Delete File: old.ts\n*** End Patch";
    expect(patchFiles(patch)).toEqual(["src/films/a.ts", "films/b.ts"]);
    expect(hookPaths({ tool_name: "apply_patch", tool_input: { command: patch } })).toEqual(["src/films/a.ts", "films/b.ts"]);
  });
  test("Claude Code's Edit and Write give file_path", () => {
    expect(hookPaths({ tool_name: "Edit", tool_input: { file_path: "/p/src/films/a.ts" } })).toEqual(["/p/src/films/a.ts"]);
  });
  test("lints a film file and exits 2 with the findings on stderr", () => {
    const d = remotion();
    writeFileSync(join(d, "src/films/bad.ts"), BAD);
    const r = lintHook(JSON.stringify({ cwd: d, tool_name: "Write", tool_input: { file_path: join(d, "src/films/bad.ts") } }), "/");
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/untell lint: \d+ error\(s\)/);
    expect(r.stderr).toContain("src/films/bad.ts:3");
  });
  test("is silent for a clean film, a file that is not a film, bad JSON and a file outside the project", () => {
    const d = remotion();
    writeFileSync(join(d, "src/films/ok.ts"), "export const a = 1;\n");
    writeFileSync(join(d, "README.ts"), "const x = Math.random();\n");
    const run = (file: string) => lintHook(JSON.stringify({ cwd: d, tool_input: { file_path: file } }), d);
    expect(run(join(d, "src/films/ok.ts"))).toEqual({ code: 0, stderr: "" });
    expect(run(join(d, "README.ts"))).toEqual({ code: 0, stderr: "" });
    expect(run("/etc/hosts")).toEqual({ code: 0, stderr: "" });
    expect(lintHook("not json", d)).toEqual({ code: 0, stderr: "" });
  });
  test("a scene module outside the films folder counts as a film", () => {
    const d = remotion();
    mkdirSync(join(d, "src/other"));
    writeFileSync(join(d, "src/other/s.ts"), BAD);
    expect(hookTargets({ cwd: d, tool_input: { file_path: "src/other/s.ts" } }, d).files).toHaveLength(1);
  });
});

describe("docs and help", () => {
  test("TELLS.md lists every rule", () => {
    const doc = tellsDoc();
    for (const r of RULES) expect(doc).toContain(`\`${r.id}\``);
    expect(doc).toContain(`${RULES.length} rules`);
  });
  test("every command in the help has its own help", () => {
    for (const c of ["init", "lint", "build", "check", "sheet", "media", "systems", "doctor", "hooks"]) {
      expect(HELP).toContain(`  ${c} `);
      expect(helpFor(c)).toContain(`untell ${c}`);
    }
    expect(HELP).toContain("Exit codes");
  });
});

describe("the sheet's paths", () => {
  test("the sheet goes beside the video", () => {
    expect(sheetPathFor("/a/out/film.mp4")).toBe("/a/out/film.sheet.jpg");
    expect(sheetPathFor("/a/out/film.mp4", "/b/s.jpg")).toBe("/b/s.jpg");
  });
  test("newestRender skips sheets and finds the newest video", () => {
    const d = tmp();
    mkdirSync(join(d, "out"));
    expect(newestRender(d)).toBe(null);
    writeFileSync(join(d, "out/a.mp4"), "");
    expect(newestRender(d)).toBe(join(d, "out/a.mp4"));
  });
});

describe("scene/case-collision in a folder", () => {
  test("a scene and a composition whose names differ only by case are an error", () => {
    const { mkdtempSync, writeFileSync } = require("node:fs");
    const { join } = require("node:path");
    const { tmpdir } = require("node:os");
    const { lintPaths } = require("../src/lint");
    const d = mkdtempSync(join(tmpdir(), "untell-case-"));
    writeFileSync(join(d, "halving.ts"), "export const seconds = 1;\n");
    writeFileSync(join(d, "Halving.tsx"), "export const x = 1;\n");
    const r = lintPaths([join(d, "halving.ts")], d);
    expect(r.errors).toBe(1);
    expect(JSON.stringify(r.results)).toContain("scene/case-collision");
  });
});
