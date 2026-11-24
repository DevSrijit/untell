// Unit tests for the repository tools in the package: the pack guards (media sources, essentia, the commands that a
// playbook names), the argument handling of untell listen, untell master and the detector in untell check,
// the music table, the work tree and the 3D model step of untell media add.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { HAS_SOURCE_NAMES, essentiaHits, namedCommands, scanTree, sourceHits, unknownCommands } from "../scripts/guards";
import { COMMAND_TABLE, helpFor } from "../src/help";
import { registryDir } from "../src/kit";
import { UsageError } from "../src/errors";
import { analyse, compare, listen, listenPackages, mix, parseExtras, resolveItem } from "../src/listen";
import { master, masterArgs } from "../src/master";
import { builtScene, filmToCheck, isSceneModule } from "../src/check";
import { explainDetectorRule, formatDetectorRules, detectorRules, messageOf } from "../src/detector";
import { musicTableSource, writeMusicTable, updateManifest } from "../src/media-store";
import { mediaPaths } from "../src/media-paths";
import { workTree } from "../src/worktree";
import { prepareModel } from "../src/media";
import { agentsSection, skill } from "../src/templates";

const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "untell-tools-")); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const quiet = <T>(fn: () => T): T => { const l = console.log, e = console.error; console.log = () => {}; console.error = () => {}; try { return fn(); } finally { console.log = l; console.error = e; } };
const args = (positional: string[], opts: Record<string, string> = {}, flags: string[] = []) =>
  ({ positional, opt: (n: string) => opts[n], flag: (n: string) => flags.includes(n) });
/** A HyperFrames project with a kit folder and its system docs. */
function hfProject() {
  const d = tmp();
  writeFileSync(join(d, "hyperframes.json"), "{}");
  mkdirSync(join(d, "untell", "docs"), { recursive: true });
  const sys = join(registryDir(), "docs", "systems");
  spawnSync("cp", ["-R", sys, join(d, "untell", "docs", "systems")]);
  writeFileSync(join(d, "untell", "music.gen.ts"), readFileSync(join(registryDir(), "kit", "music.gen.ts"), "utf8"));
  return d;
}
const cli = (cwd: string, ...a: string[]) => spawnSync("bun", [join(import.meta.dir, "..", "src", "cli.ts"), ...a, "--cwd", cwd], { encoding: "utf8" });

describe("the media source guard", () => {
  const name = ["pix", "abay"].join("");
  test.skipIf(!HAS_SOURCE_NAMES)("finds a source name in any case, with its line", () => {
    const hits = sourceHits(`line one\nfrom ${name.toUpperCase()} we took it\n`, "x.md");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.line).toBe(2);
    expect(sourceHits(`a ${["poly", " haven"].join("")} model`)).toHaveLength(1);
  });
  test("passes text that names formats and parameters only", () => {
    expect(sourceHits("MP3, 44.1 kHz, -16 LUFS. untell never checks where a file comes from.")).toEqual([]);
  });
  test("nothing the package ships names a source", () => {
    expect(scanTree([registryDir(), join(import.meta.dir, "..", "docs")], sourceHits)).toEqual([]);
    expect(sourceHits(readFileSync(join(import.meta.dir, "..", "dist", "cli.js"), "utf8"))).toEqual([]);
    expect(sourceHits(readFileSync(join(import.meta.dir, "..", "README.md"), "utf8"))).toEqual([]);
  });
});

describe("the essentia guard", () => {
  test("finds a Python or a JavaScript import of essentia", () => {
    expect(essentiaHits("import essentia.standard as es")).toHaveLength(1);
    expect(essentiaHits("    from essentia import Pool")).toHaveLength(1);
    expect(essentiaHits('const e = require("essentia.js");')).toHaveLength(1);
    expect(essentiaHits('import { Essentia } from "essentia.js";')).toHaveLength(1);
    expect(essentiaHits('m = __import__("essentia")')).toHaveLength(1);
  });
  test("passes prose that only names it", () => {
    expect(essentiaHits("# untell uses no essentia: it is AGPL.\nimport numpy as np")).toEqual([]);
  });
  test("no shipped file imports essentia", () => {
    expect(scanTree([registryDir()], essentiaHits)).toEqual([]);
  });
});

describe("the commands that a document names", () => {
  test("reads code spans, fences and Mermaid nodes, not prose", () => {
    const md = "untell does not find media.\nRun `untell listen analyse <name>` first.\n```bash\nnpx untell master out/a.mp4 --system riso\n```\n```mermaid\n  N --> C{untell check}\n```\n";
    const n = namedCommands(md);
    expect(n.map((x) => x.words.join(" "))).toEqual(["listen analyse", "master", "check"]);
    expect(n[1]!.flags).toEqual(["--system"]);
  });
  test("an unknown command, subcommand or flag is reported", () => {
    const bad = unknownCommands(namedCommands("`untell rendr`\n`untell listen hum`\n`untell check --fast`\n`untell master x.mp4 --system riso`"), COMMAND_TABLE);
    expect(bad.map((b) => b.why)).toEqual(['no command "rendr"', 'no subcommand "listen hum"', 'no flag --fast for "check"']);
  });
  test("every command that a shipped playbook names exists", () => {
    const dir = join(registryDir(), "docs", "playbooks");
    const files = readdirSync(dir);
    expect(files.length).toBeGreaterThanOrEqual(5);
    const named = files.flatMap((f) => namedCommands(readFileSync(join(dir, f), "utf8"), f));
    expect(named.length).toBeGreaterThan(5);
    expect(unknownCommands(named, COMMAND_TABLE)).toEqual([]);
  });
  test("every command that the skill and AGENTS.md name exists", () => {
    for (const fw of ["remotion", "hyperframes"] as const) {
      const named = [...namedCommands(skill(fw)), ...namedCommands(agentsSection(fw))];
      expect(named.some((n) => n.words[0] === "master")).toBe(true);
      expect(named.some((n) => n.words.join(" ") === "listen analyse")).toBe(true);
      expect(unknownCommands(named, COMMAND_TABLE)).toEqual([]);
    }
  });
  test("the skill names the playbooks in their order", () => {
    const s = skill("hyperframes");
    const at = ["shape.md", "craft.md", "critique.md", "polish.md"].map((f) => s.indexOf(`\`${f}\``));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(s).toContain("craft-floor.md");
  });
});

describe("the command table", () => {
  test("each command in the table has a help text, and the CLI knows it", () => {
    for (const cmd of Object.keys(COMMAND_TABLE)) {
      expect(helpFor(cmd)).not.toBeNull();
      const r = spawnSync("bun", [join(import.meta.dir, "..", "src", "cli.ts"), cmd, "--help"], { encoding: "utf8" });
      expect(r.status).toBe(0);
      expect(r.stderr).not.toContain("there is no command");
    }
  });
});

describe("untell listen: arguments", () => {
  test("--extras: none, all, a list, and a bad name", () => {
    expect(parseExtras(undefined)).toEqual([]);
    expect(parseExtras(true)).toEqual(["stems", "tags"]);
    expect(parseExtras("all")).toEqual(["stems", "tags"]);
    expect(parseExtras("tags")).toEqual(["tags"]);
    expect(() => parseExtras("stems,drums")).toThrow(UsageError);
  });
  test("the packages: the core, and the extras with their pins, without repeats", () => {
    const core = listenPackages([]);
    for (const m of ["numpy", "scipy", "librosa", "soundfile", "pyloudnorm"]) expect(core).toContain(m);
    expect(core.some((p) => p.startsWith("torch"))).toBe(false);
    const all = listenPackages(["stems", "tags"]);
    expect(all).toContain("transformers==4.46.3");
    expect(all.filter((p) => p === "torch")).toHaveLength(1);
    expect(all.some((p) => /essentia/.test(p))).toBe(false);
  });
  test("an item: not a file and not an asset, or not a sound", () => {
    const d = tmp();
    expect(() => resolveItem(d, null, "nothing-here")).toThrow(UsageError);
    writeFileSync(join(d, "notes.txt"), "x");
    expect(() => resolveItem(d, null, "notes.txt")).toThrow(UsageError);
  });
  test("a file gets its own folder in .untell/listen, as a copy", () => {
    const d = tmp();
    writeFileSync(join(d, "Night Run.mp3"), "not really audio");
    const r = resolveItem(d, null, "Night Run.mp3");
    expect(r.name).toBe("night-run");
    expect(r.asset).toBe(false);
    expect(r.dir).toBe(join(d, ".untell", "listen", "night-run"));
    expect(lstatSync(r.arg).isSymbolicLink()).toBe(false);
  });
  test("each subcommand without its argument is wrong use", async () => {
    const d = hfProject();
    expect(() => analyse(d, [], args([]))).toThrow(UsageError);
    expect(() => mix(d, args([]))).toThrow(UsageError);
    expect(() => mix(d, args(["missing.mp4"]))).toThrow(UsageError);
    expect(() => compare(d, args([]))).toThrow(UsageError);
    await expect(listen(d, "hum", args([]))).rejects.toThrow(UsageError);
  });
  test("the CLI: wrong use exits with 2 and names the help", () => {
    const d = hfProject();
    const r = cli(d, "listen", "setup", "--extras", "drums");
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("--extras takes stems, tags or all");
    expect(cli(d, "listen", "hum").status).toBe(2);
    expect(cli(d, "listen", "--help").stdout).toContain("untell listen compare");
  });
});

describe("untell master: arguments", () => {
  test("--lufs and --peak take numbers in range", () => {
    expect(masterArgs({})).toEqual([]);
    expect(masterArgs({ lufs: "-14", peak: "-1.5" })).toEqual(["--lufs", "-14", "--peak", "-1.5"]);
    expect(() => masterArgs({ lufs: "loud" })).toThrow(UsageError);
    expect(() => masterArgs({ lufs: "3" })).toThrow(UsageError);
    expect(() => masterArgs({ peak: "-20" })).toThrow(UsageError);
  });
  test("no render or a missing render is wrong use; no system takes the default target", () => {
    const d = hfProject();
    expect(() => master(d, undefined, {})).toThrow(UsageError);
    expect(() => master(d, "out/none.mp4", { system: "riso" })).toThrow(UsageError);
    writeFileSync(join(d, "film.mp4"), "x");
    // No system and no --lufs: the default target of the checks (-16 LUFS). The file is not a video, so ffmpeg fails.
    expect(() => quiet(() => master(d, "film.mp4", {}))).not.toThrow(UsageError);
    expect(() => master(d, "film.mp4", { system: "no-such-system" })).toThrow(/Unknown system/);
  });
  test("the CLI: a negative --lufs is a value, not a file; two files are wrong use", () => {
    const d = hfProject();
    const r = cli(d, "master", "gone.mp4", "--lufs", "-14");
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("gone.mp4 does not exist");
    expect(cli(d, "master", "a.mp4", "b.mp4").status).toBe(2);
  });
});

describe("untell check: the detector's catalog and the film", () => {
  test("--rules lists every rule, --explain gives one in full", () => {
    const rules = detectorRules();
    expect(rules.length).toBeGreaterThan(20);
    expect(formatDetectorRules()).toContain(`${rules.length} rules`);
    const x = explainDetectorRule("stall");
    expect(x).toContain("Measures:");
    expect(x).toContain("Fix:");
    expect(() => explainDetectorRule("no-such-check")).toThrow(UsageError);
  });
  test("the CLI: --explain of an unknown id exits 2; of a lint rule goes to the lint catalog", () => {
    const d = hfProject();
    expect(cli(d, "check", "--explain", "nope").status).toBe(2);
    expect(cli(d, "check", "--explain", "stall").stdout).toContain("stall");
    expect(cli(d, "check", "--rules").stdout).toContain("a11y/flash");
    expect(cli(d, "check", "extra-word").status).toBe(2);
  });
  test("a finding's message carries the rule line, what it measured and the limit", () => {
    const m = messageOf({ check: "stall", severity: "error", from: 1, to: 3, measured: { still: 2 }, limit: { max: 1.5 }, fix: "x" }, detectorRules());
    expect(m).toContain('measured {"still":2}');
    expect(m).toContain('limit {"max":1.5}');
  });
  test("a scene module, the built scene and --film", () => {
    expect(isSceneModule('export const system = "riso";\nexport const scene = () => [];')).toBe(true);
    expect(isSceneModule("export const scene = () => [];")).toBe(false);
    const d = hfProject();
    mkdirSync(join(d, "films"));
    writeFileSync(join(d, "films", "kite-drift.ts"), 'export const system = "riso";\nexport const seconds = 4;\nexport const scene = () => [];\n');
    writeFileSync(join(d, "index.html"), "<!-- Generated by untell build from films/kite-drift.ts. untell build rewrites this file -->");
    expect(builtScene(d)).toBe(join(d, "films", "kite-drift.ts"));
    expect(filmToCheck(d, "hyperframes", undefined, () => {}).id).toBe("kite-drift");
    expect(() => filmToCheck(d, "hyperframes", "films/none.ts", () => {})).toThrow(UsageError);
    writeFileSync(join(d, "films", "notes.ts"), "export const x = 1;\n");
    expect(() => filmToCheck(d, "hyperframes", "films/notes.ts", () => {})).toThrow(/not a scene module/);
  });
});

describe("the music table", () => {
  test("keeps the kit's types and writes one row a track", () => {
    const src = musicTableSource("export type MusicMap = { bpm: number };\n", { "b-bed": '{"bpm":120}\n', "a-bed": '{"bpm":90}' });
    expect(src).toContain("export type MusicMap");
    expect(src.indexOf('"a-bed"')).toBeLessThan(src.indexOf('"b-bed"'));
    expect(musicTableSource("", {})).toContain("export const MUSIC: Record<string, MusicMap> = {\n};");
  });
  test("writeMusicTable reads music.json of each asset in the manifest", () => {
    const d = hfProject();
    const p = mediaPaths(d);
    mkdirSync(join(p.media, "tide"), { recursive: true });
    writeFileSync(join(p.media, "tide", "music.json"), '{"bpm":100}');
    mkdirSync(join(p.media, "stray"), { recursive: true });
    writeFileSync(join(p.media, "stray", "music.json"), '{"bpm":1}');
    updateManifest(p, (m) => { m.tide = { kind: "music", file: "source.mp3" }; });
    expect(writeMusicTable(p)).toBe(1);
    const t = readFileSync(join(d, "untell", "music.gen.ts"), "utf8");
    expect(t).toContain('"tide": {"bpm":100,"gridTrust":"medium","gridIssues":[]}');
    expect(t).not.toContain("stray");
    expect(t).toContain("export type MusicMap");
  });
});

describe("the work tree", () => {
  test("links the project's files into the repository's layout", () => {
    const d = hfProject();
    const p = mediaPaths(d);
    writeFileSync(join(d, "untell", "media.gen.ts"), "export const SOUNDS = {};\n");
    mkdirSync(join(d, "rec"), { recursive: true });
    const root = workTree(d, p, { id: "kite-drift", recording: join(d, "rec"), render: null });
    expect(lstatSync(join(root, "assets", "media")).isSymbolicLink()).toBe(true);
    expect(existsSync(join(root, "systems", "riso", "tokens.json"))).toBe(true);
    expect(existsSync(join(root, "src", "system", "media.gen.ts"))).toBe(true);
    expect(existsSync(join(root, "scripts", "media_cut.py"))).toBe(true);
    expect(lstatSync(join(root, "out", "recordings", "kite-drift")).isSymbolicLink()).toBe(true);
    expect(JSON.parse(readFileSync(join(root, "assets", "media.json"), "utf8"))).toEqual({});
  });
  test("every shipped repository script finds its root from UNTELL_ROOT", () => {
    const tools = join(registryDir(), "tools");
    for (const f of ["inspect/common.py", "inspect/sound_checks.py", "listen/listen.py", "listen/mix.py", "music_map.py", "master.py"]) {
      const text = readFileSync(join(tools, f), "utf8");
      expect(text).toContain('environ.get("UNTELL_ROOT")');
      expect(text).not.toMatch(/^ROOT = Path\(__file__\)/m);
    }
  });
});

describe("untell media add: a 3D model", () => {
  test("a .gltf gets its bounds and one model.glb", () => {
    const d = tmp();
    const gltf = {
      asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0, translation: [0, 1, 0] }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      accessors: [{ min: [-1, -2, -0.5], max: [1, 2, 0.5] }],
    };
    writeFileSync(join(d, "source.gltf"), JSON.stringify(gltf));
    quiet(() => prepareModel(join(d, "source.gltf"), d, "kettle"));
    const meta = JSON.parse(readFileSync(join(d, "meta.json"), "utf8"));
    expect(meta.kind).toBe("model");
    expect(meta.file).toBe("model.glb");
    expect(meta.min).toEqual([-1, -1, -0.5]);
    expect(meta.max).toEqual([1, 3, 0.5]);
    expect(readFileSync(join(d, "model.glb")).readUInt32LE(0)).toBe(0x46546c67);
  });
  test("a model with no bounds is refused", () => {
    const d = tmp();
    writeFileSync(join(d, "source.gltf"), JSON.stringify({ asset: { version: "2.0" }, scenes: [{ nodes: [] }] }));
    expect(() => quiet(() => prepareModel(join(d, "source.gltf"), d, "empty"))).toThrow(/no mesh/);
  });
});

// A first-use test: a scene that calls beats() at the top of its module printed beats()' low-trust warning three
// times in one check, once for each import of the module. One file state is imported once in a command.
describe("sceneExports: one import per file state", () => {
  test("a warning at the top of a scene module prints once over three reads, and again after the file changes", async () => {
    const { loadSceneMeta, sceneExports } = await import("../src/build");
    const dir = mkdtempSync(join(tmpdir(), "untell-once-"));
    const file = join(dir, "film.ts");
    const src = (n: number) => `console.warn("top-level warning ${n}");\nexport const system = "riso";\nexport const seconds = 4;\nexport const scene = () => [];\n`;
    writeFileSync(file, src(1));
    const said: string[] = [];
    const warn = console.warn;
    console.warn = (...m: unknown[]) => { said.push(m.map(String).join(" ")); };
    try {
      await loadSceneMeta(dir, file);
      await loadSceneMeta(dir, file);
      await sceneExports(dir, file);
      expect(said.filter((m) => m.includes("top-level warning")).length).toBe(1);
      writeFileSync(file, src(22)); // another size: another file state
      await loadSceneMeta(dir, file);
      expect(said.filter((m) => m.includes("top-level warning")).length).toBe(2);
    } finally {
      console.warn = warn;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
