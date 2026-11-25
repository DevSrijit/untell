// The pack's anchors (marker first, then the fallback, else a clear stop) and what the pack writes.
// Run after the pack: bun packages/untell/scripts/pack.ts && bun test
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { blocksDocCut, extractDecl, importClosure, labCommandsIn, mapLabCommands, nativeRoot, pyImports, rootLine, setupHint, NEW_ROOT } from "../scripts/anchors";
import { registryDir } from "../src/kit";

const LAB = resolve(import.meta.dir, "../../..");
const PKG = resolve(import.meta.dir, "..");

describe("anchors: the marker first, then the fallback, else a stop that names the fix", () => {
  test("BLOCKS.md: the marker cuts before itself; the heading is a fallback with a note; neither stops", () => {
    const doc = "# Rules\nrule 1\n<!-- untell:pack end -->\n## What you deliver\nlab task\n";
    expect(blocksDocCut(doc, "B.md")).toEqual({ text: "# Rules\nrule 1\n", fallback: null });
    const old = blocksDocCut("# Rules\nrule 1\n## What you deliver\nlab task\n", "B.md");
    expect(old.text).toBe("# Rules\nrule 1\n");
    expect(old.fallback).toContain("untell:pack end");
    expect(() => blocksDocCut("# Rules\n", "B.md")).toThrow(/untell:pack end/);
  });
  test("ROOT: a native line is copied unchanged; an old line is set, with a note; an unknown line stops", () => {
    const native = 'import os\nROOT = Path(os.environ.get("UNTELL_ROOT") or Path(__file__).resolve().parents[2])\n';
    expect(rootLine(native, "a.py")).toEqual({ text: native, fallback: null });
    const old = rootLine("ROOT = Path(__file__).resolve().parents[2]\nx = 1\n", "a.py");
    expect(old.text).toBe(`${NEW_ROOT}\nx = 1\n`);
    expect(old.fallback).toContain("a.py");
    expect(rootLine("HERE = 1\nROOT = HERE.parents[1]\n", "l.py").fallback).not.toBeNull();
    expect(rootLine("x = 1\n", "n.py")).toEqual({ text: "x = 1\n", fallback: null });
    expect(() => rootLine("ROOT = somewhere_else()\n", "b.py")).toThrow(/UNTELL_ROOT/);
    expect(nativeRoot('ROOT = Path(os.environ.get("UNTELL_ROOT") or ".")')).toBe(true);
    expect(nativeRoot("ROOT = Path(__file__).resolve().parents[2]")).toBe(false);
  });
  test("the listen setup hint: native when the script reads UNTELL_LISTEN_SETUP, else each lab hint is set", () => {
    expect(setupHint('h = os.environ.get("UNTELL_LISTEN_SETUP")', "l.py").fallback).toBeNull();
    const r = setupHint('print("Add it: uv pip install --python .venv-audio/bin/python torch demucs")', "l.py");
    expect(r.text).toBe('print("Add it: untell listen setup --extras")');
    expect(r.fallback).toContain("1 setup hint");
    expect(setupHint("print(1)", "l.py")).toEqual({ text: "print(1)", fallback: null });
  });
  test("a sampler is a top-level const that ends with a line \"};\"; another shape stops the pack", () => {
    const src = "const a = 1;\nconst sample = () => {\n  return 2;\n};\nconst b = 3;\n";
    expect(extractDecl(src, "sample", "r.ts")).toBe("const sample = () => {\n  return 2;\n};");
    expect(() => extractDecl("function sample() {}\n", "sample", "r.ts")).toThrow(/top-level/);
  });
  test("Python imports and the helper closure of the detector", () => {
    expect(pyImports("import json\nfrom film import Skip\nimport a, b as c\n    from heat import x\n").sort()).toEqual(["a", "b", "film", "heat", "json"]);
    const d = mkdtempSync(join(tmpdir(), "untell-imp-"));
    mkdirSync(join(d, "checks"));
    writeFileSync(join(d, "detect.py"), "import cover\nfrom film import x\n");
    writeFileSync(join(d, "cover.py"), "import common\n");
    writeFileSync(join(d, "common.py"), "import json\n");
    writeFileSync(join(d, "heat.py"), "");
    writeFileSync(join(d, "unused.py"), "");
    writeFileSync(join(d, "checks", "film.py"), "import common\n");
    writeFileSync(join(d, "checks", "a.py"), "from heat import y\nimport film\n");
    expect(importClosure(join(d, "detect.py"), [join(d, "checks")], d, [join(d, "checks", "a.py"), join(d, "checks", "film.py")])).toEqual(["common.py", "heat.py"]);
  });
  test("repository commands in rule text map to untell commands; an unknown one is found", () => {
    const m = mapLabCommands("accept it: bun scripts/snap/cli.ts <film> --films <module> --apply <id>.");
    expect(m).toEqual({ text: "accept it: untell snap <film> --apply <id>.", count: 1 });
    expect(labCommandsIn(m.text)).toEqual([]);
    expect(labCommandsIn("run bun scripts/new_tool.ts now")).toEqual(["bun scripts/new_tool.ts"]);
  });
});

describe("what the pack writes", () => {
  const reg = registryDir();
  test("the tools that read the environment are the repository's files, byte for byte", () => {
    for (const [lab, rel] of [["scripts/review_sheet.py", "tools/review_sheet.py"], ["scripts/measure_video.py", "tools/measure_video.py"], ["scripts/listen/tempo.py", "tools/listen/tempo.py"],
      ["scripts/master.py", "tools/master.py"], ["scripts/media_treat.py", "tools/media_treat.py"],
      ["scripts/media_video.py", "tools/media_video.py"], ["scripts/media_cut.py", "tools/media_cut.py"], ["scripts/snap/preview.py", "tools/snap/preview.py"]] as const) {
      expect(readFileSync(join(reg, rel), "utf8")).toBe(readFileSync(join(LAB, lab), "utf8"));
    }
    expect(existsSync(join(reg, "tools", "cover.py"))).toBe(false);
  });
  test("the stamp lists the fallback anchors that remain", () => {
    const stamp = JSON.parse(readFileSync(join(reg, "stamp.json"), "utf8")) as { fallbacks: string[] };
    expect(Array.isArray(stamp.fallbacks)).toBe(true);
    for (const f of stamp.fallbacks) expect(f).toMatch(/^(src|scripts|systems)\//);
  });
  test("the samplers module is the repository's samplers and the repository's capture version", () => {
    const gen = readFileSync(join(PKG, "src/capture-samplers.gen.ts"), "utf8");
    const det = readFileSync(join(LAB, "scripts/detect.ts"), "utf8"), rec = readFileSync(join(LAB, "scripts/record.ts"), "utf8");
    expect(gen).toContain(`export const CAPTURE_VERSION = ${det.match(/captureVersion: (\d+)/)![1]};`);
    expect(gen).toContain(extractDecl(det, "inkSample", "d"));
    expect(gen).toContain(extractDecl(rec, "sampleElements", "r"));
    expect(gen).toContain("export const snapSample = ");
  });
  test("the rule catalog names no repository command; the align rules point to untell snap", () => {
    const rules = readFileSync(join(reg, "tools/inspect/rules.json"), "utf8");
    expect(labCommandsIn(rules)).toEqual([]);
    expect(rules).toContain("untell snap");
  });
  test("the CLI is Node-safe and holds no path of the machine that packed it", () => {
    const js = readFileSync(join(PKG, "dist/cli.js"), "utf8");
    expect(/import\.meta\.(dir|path)\b/.test(js)).toBe(false);
    expect(js.includes(LAB)).toBe(false);
  });
  test("the kit has the scene API index with withSnap and SnapRel", () => {
    const idx = readFileSync(join(reg, "kit/scene/index.ts"), "utf8");
    expect(idx).toContain("withSnap");
    expect(idx).toContain("SnapRel");
    expect(readFileSync(join(reg, "kit/music.gen.ts"), "utf8")).toContain("gridTrust");
  });
});
