// The release round: block warnings as findings, sound measured with ffmpeg alone, init --new, the render entry, snap's
// frame from the check, the shipped-file guards, the kit's pack stamp, and the CLI's arguments.
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { blockFindings } from "../src/detector";
import { measureFile } from "../src/media";
import { NEW_VERSIONS, newPackageJson, newProjectFiles } from "../src/init";
import { DELIVERY_ARGS, DELIVERY_MBIT, remotionEntry } from "../src/render";
import { checkFrame } from "../src/snap";
import { KIT_STAMP, kitMismatch, packStamp } from "../src/kit";
import { machineHits } from "../scripts/guards";
import { ownerName } from "../scripts/anchors";

const PKG = resolve(import.meta.dir, "..");
const CLI = join(PKG, "dist/cli.js");
const tmp = (p: string) => mkdtempSync(join(tmpdir(), `untell-${p}-`));
const node = (args: string[], cwd: string) => spawnSync("node", [CLI, ...args], { cwd, encoding: "utf8", timeout: 120000 });
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

describe("block warnings", () => {
  test("a block's warning is a finding on its node; other page messages are not", () => {
    const f = blockFindings([
      'page warning: title claim: "The rule of 72." does not fit in the display role, so it is set in headline.',
      "page warning: placeBehind: no layout keeps every letter under 22 % hidden",
      "page error: TypeError: x is undefined",
      "page warning: Warning: React does not recognize a prop",
      'page warning: title claim: "The rule of 72." does not fit in the display role, so it is set in headline.',
    ]);
    expect(f.map((x) => [x.check, x.node ?? null])).toEqual([["block/title", "claim"], ["block/placeBehind", null]]);
    expect(f.every((x) => x.severity === "warning" && x.fix.length > 20)).toBe(true);
  });
});

describe("sound measured with ffmpeg alone", () => {
  test.skipIf(!hasFfmpeg)("the loudest 10 ms, the length, the level and the sample peak of a file", () => {
    const d = tmp("tone");
    const f = join(d, "hit.wav");
    // 1 s of quiet tone, then 0.2 s loud, then 0.8 s quiet: the loudest moment is at about 1.1 s.
    spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=f=440:d=2", "-af", "volume='if(between(t,1,1.2),1,0.05)':eval=frame", f]);
    const m = measureFile(f);
    expect(m.duration).toBeCloseTo(2, 1);
    expect(m.peak).toBeGreaterThan(1.0);
    expect(m.peak).toBeLessThan(1.2);
    expect(m.lufs).not.toBeNull();
    expect(m.peakDb).toBeLessThan(0.1);
  });
  test.skipIf(!hasFfmpeg)("a truncated file fails: a decode error is not a duration", () => {
    // Before: media add accepted a truncated FLAC and reported the length its header claimed.
    const d = tmp("cut-short");
    const f = join(d, "track.flac"), cut = join(d, "cut.flac");
    spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=f=440:d=4", f]);
    writeFileSync(cut, readFileSync(f).subarray(0, 30000));
    expect(() => measureFile(cut)).toThrow(/does not decode cleanly/);
    expect(measureFile(f).duration).toBeCloseTo(4, 1);
  });
  test.skipIf(!hasFfmpeg)("a stereo file's peak is its true peak, not the sum of its channels", () => {
    // Before: the mono fold added the channels, and a track with a true peak of -0.84 dBTP printed +2 dBFS.
    const d = tmp("stereo");
    const f = join(d, "track.wav");
    spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=f=220:d=2", "-af", "volume=0.9,pan=stereo|c0=c0|c1=c0", f]);
    const m = measureFile(f);
    const tp = Number(/True peak:\s*\n\s*Peak:\s*(-?\d+(?:\.\d+)?) dBFS/.exec(spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", f, "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8" }).stderr)![1]);
    expect(m.peakDb).toBeCloseTo(tp, 1);
    expect(m.peakDb).toBeLessThan(0);
  });
});

describe("init --new", () => {
  test("Remotion: an entry, a Root, a strict tsconfig with the DOM types, the Player at the Remotion version", () => {
    const files = newProjectFiles("remotion", "film");
    expect(Object.keys(files).sort()).toEqual(["remotion.config.ts", "src/Root.tsx", "src/index.ts", "tsconfig.json"]);
    expect(JSON.parse(files["tsconfig.json"]!).compilerOptions.strict).toBe(true);
    const pkg = newPackageJson({ dependencies: { untell: "file:untell-0.1.0.tgz" } }, "remotion", "film") as Record<string, Record<string, string>>;
    expect(pkg.dependencies!.untell).toBe("file:untell-0.1.0.tgz");
    expect(pkg.dependencies!["@remotion/player"]).toBe(NEW_VERSIONS.remotion);
    expect(pkg.dependencies!.remotion).toBe(NEW_VERSIONS.remotion);
    expect(pkg.devDependencies!["@types/web"]).toBe(NEW_VERSIONS.typesWeb);
  });
  test("HyperFrames: hyperframes.json and the CLI in node_modules, with its scripts", () => {
    expect(Object.keys(newProjectFiles("hyperframes", "film")).sort()).toEqual(["hyperframes.json", "meta.json"]);
    const pkg = newPackageJson(null, "hyperframes", "film") as Record<string, Record<string, string>>;
    expect(pkg.devDependencies!.hyperframes).toBe(NEW_VERSIONS.hyperframes);
    // Through untell hf, so the CLI runs with its usage reports off (env.ts); npx when untell is not a dependency yet.
    expect(pkg.scripts!.render).toBe("npx untell hf render");
  });
  test("an empty folder under a parent with a package.json: init --new writes package.json here, never in the parent", async () => {
    // Before: npm install in a folder with no package.json installed into the first parent that had one (the home folder).
    const { scaffold, ownPackageJson } = require("../src/init") as typeof import("../src/init");
    const parent = tmp("parent");
    writeFileSync(join(parent, "package.json"), '{"name":"parent"}\n');
    for (const fw of ["remotion", "hyperframes"] as const) {
      const d = join(parent, `empty-${fw}`);
      await scaffold(d, fw, { install: false, log: () => {} });
      const pkg = JSON.parse(readFileSync(join(d, "package.json"), "utf8")) as { name: string };
      expect(pkg.name).toBe(`empty-${fw}`);
    }
    expect(readFileSync(join(parent, "package.json"), "utf8")).toBe('{"name":"parent"}\n');
    // init on a HyperFrames project with only hyperframes.json: a package.json here before any install.
    const hf = join(parent, "hf-only");
    mkdirSync(hf);
    writeFileSync(join(hf, "hyperframes.json"), "{}\n");
    expect(ownPackageJson(hf)).toBe(true);
    expect(ownPackageJson(hf)).toBe(false);
    expect(JSON.parse(readFileSync(join(hf, "package.json"), "utf8")).name).toBe("hf-only");
  });
  test("a folder with project files is refused with the fix (notes may be there); a project is refused too", () => {
    const d = tmp("new");
    writeFileSync(join(d, "notes.md"), "x");
    mkdirSync(join(d, "src"));
    const r = node(["init", "--new", "hyperframes", "--no-install"], d);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/holds no project yet, and this folder has src/);
    const e = tmp("new2");
    writeFileSync(join(e, "hyperframes.json"), "{}");
    expect(node(["init", "--new", "hyperframes"], e).stderr).toMatch(/already a HyperFrames project/);
    expect(node(["init", "--new", "vue"], e).stderr).toMatch(/--new takes remotion or hyperframes/);
  });
  test("init in a folder that is no project names --new", () => {
    const r = node(["init"], tmp("none"));
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/npx untell init --new hyperframes \(or --new remotion\)/);
  });
});

describe("untell render", () => {
  test("the Remotion entry registers the scene as the composition film", () => {
    const e = remotionEntry("../../src/untell/film", "../../src/films/heron");
    expect(e).toContain('import { sceneComposition } from "../../src/untell/film";');
    expect(e).toContain('import * as film from "../../src/films/heron";');
    expect(e).toContain('sceneComposition("film", film)');
    expect(e).toContain("registerRoot(");
  });
  test("the delivery encode caps the peak rate and copies nothing it should not", () => {
    expect(DELIVERY_ARGS).toContain(`${DELIVERY_MBIT}M`);
    expect(DELIVERY_ARGS.join(" ")).toMatch(/-c:v libx264 .*-pix_fmt yuv420p/);
  });
});

describe("snap reads the check's frame only when it is current", () => {
  test("no check yet: snap's own capture, with the reason", () => {
    const d = tmp("snapchk");
    const scene = join(d, "a.ts");
    writeFileSync(scene, "export const scene = () => []; export const system = \"spec\";");
    const own = { width: 1080, height: 1920, safe: null, els: [], others: [], ghosts: [] } as never;
    const r = checkFrame(d, "a", scene, 10, own, [], null);
    expect(r.fr).toBeNull();
    expect(r.why).toBe("no check of this film yet");
  });
});

describe("guards on shipped files", () => {
  test("a path of this machine or a repository name is found; the repository URL is not", () => {
    const home = ["/Us", "ers/someone/x"].join("");
    expect(machineHits(`a\n${home}\nb`).map((h) => h.line)).toEqual([2]);
    expect(machineHits("https://github.com/devsrijit/untell")).toHaveLength(0);
  });
});

describe("the kit's pack", () => {
  test("a kit from another pack, or with no stamp, gets one line with the fix; this pack's kit gets none", () => {
    const d = tmp("stamp");
    mkdirSync(join(d, "untell"), { recursive: true });
    expect(kitMismatch(d, "hyperframes")).toMatch(/an older untell.*untell init --force/);
    writeFileSync(join(d, "untell", KIT_STAMP), JSON.stringify({ packedAt: "2020-01-01T00:00:00.000Z" }));
    expect(kitMismatch(d, "hyperframes")).toMatch(/packed 2020-01-01/);
    writeFileSync(join(d, "untell", KIT_STAMP), JSON.stringify({ packedAt: packStamp()!.packedAt }));
    expect(kitMismatch(d, "hyperframes")).toBeNull();
  });
  test("untell --version --json gives the counts from the pack", () => {
    const j = JSON.parse(node(["--version", "--json"], PKG).stdout) as Record<string, number | string>;
    expect(j.version).toBe(1);
    for (const k of ["systems", "blocks", "lintRules", "detectorRules", "kitFiles"]) expect(typeof j[k]).toBe("number");
    expect(j.systems).toBe(20);
  });
});

describe("the CLI's arguments", () => {
  test("snap ids go with commas or spaces and are never the film", () => {
    const d = tmp("ids");
    for (const a of [["--preview", "c-1,h-2"], ["--preview", "c-1", "h-2"], ["--apply", "c-1", "h-2"]]) {
      const r = node(["snap", "films/a.ts", ...a], d);
      expect(r.stderr).not.toMatch(/takes one film/);
      expect(r.stderr).toMatch(/no Remotion or HyperFrames project/);
    }
  });
  test("check takes the film as a word, and at most one film and one render", () => {
    const d = tmp("chk");
    expect(node(["check", "a.ts", "b.ts"], d).stderr).toMatch(/takes one scene module and at most one render/);
    expect(node(["check", "a.ts", "notes.txt"], d).stderr).toMatch(/takes one scene module/);
    expect(node(["check", "a.ts", "out/a.mp4", "--render", "out/b.mp4"], d).stderr).toMatch(/give the render once/);
  });
});

describe("the check screen", () => {
  const { printScreen, screenStyle } = require("../src/check") as typeof import("../src/check");
  const base = { version: 1 as const, project: "/p", framework: "remotion", steps: [], sheet: null };
  const run = (report: Record<string, unknown>, tty: boolean) => {
    const out: string[] = [];
    printScreen({ ...base, ...report } as never, (report.res ?? null) as never, { log: (s) => out.push(s), S: screenStyle(tty), sceneRel: "src/films/a.ts", renderArg: null, sheet: null, reportPath: ".untell/check/report.json" });
    return out.join("\n");
  };
  test("errors: the verdict first, numbered causes, every finding, the next command; plain text without a terminal", () => {
    const f = { check: "dead-space", severity: "error", message: "m", fix: "Fill it.", from: 0, to: 4.67, measured: { band: "upper third" }, limit: { max: 1.5 } };
    const s = run({ ok: false, errors: 1, warnings: 0, advice: 0, findings: [f], res: { groups: [{ check: "dead-space", severity: "error", cause: "an empty part of the frame (0.00-4.67 s)", count: 1, likelyGoneAfterFix: 1, from: 0, to: 4.67, nodes: [], fix: "Fill it." }] } }, false);
    const lines = s.split("\n").filter(Boolean);
    expect(lines[0]).toBe("x failed: 1 error · 1 cause, one fix each");
    expect(s).toContain("   1  x an empty part of the frame");
    expect(s).toContain("x dead-space             0.00–4.67 s");
    expect(s).toContain("next    fix cause 1, then run: untell check src/films/a.ts");
    expect(s).not.toMatch(/\x1b\[/);
    expect(s).not.toMatch(/✓/);
  });
  test("a clean film: passed, the render command, colour only on a terminal", () => {
    const s = run({ ok: true, errors: 0, warnings: 0, advice: 0, findings: [] }, false);
    expect(s.split("\n").filter(Boolean)[0]).toBe("passed");
    expect(s).toContain("next    untell render src/films/a.ts");
    expect(run({ ok: true, errors: 0, warnings: 0, advice: 0, findings: [] }, true)).toMatch(/\x1b\[32mpassed/);
  });
  test("the detector's verdict line: passed with warnings, and a demo runs frame rules only", () => {
    const w = { check: "stall", severity: "warning", message: "m", fix: "Move it.", from: 1, to: 3 };
    const v = { state: "warnings", errors: 0, warnings: 1, advice: 0, renderStale: false, line: "passed with 1 warning: fix or declare each before delivery (a demo: frame rules only)" };
    expect(run({ ok: true, errors: 0, warnings: 1, advice: 0, findings: [w], verdict: v }, false).split("\n").filter(Boolean)[0]).toBe("! passed with 1 warning: fix or declare each before delivery (a demo: frame rules only)");
    // A lint error that the detector did not see: the same three states over every finding, with the demo note kept.
    const lint = { check: "lint/tell/random", severity: "error", message: "m", fix: "Seed it.", file: "a.ts", line: 3 };
    expect(run({ ok: false, errors: 1, warnings: 1, advice: 0, findings: [lint, w], verdict: v }, false).split("\n").filter(Boolean)[0]).toBe("x failed: 1 error, 1 warning (a demo: frame rules only) · 1 cause, one fix each");
  });
  test("each declaration and its effect: matched, matched nothing, or a lint rule's", () => {
    const declarations = [
      { rule: "stall", nodes: ["title"], reason: "a held beat", where: "a.ts:4", scope: "named nodes", matched: 2 },
      { rule: "dead-space", nodes: [], reason: "x", where: "a.ts:9", scope: "the whole film", matched: 0, why: "no finding of this rule: remove it" },
      { rule: "tell/random", nodes: [], reason: "a seed", where: "a.ts:12", scope: "the whole film", matched: 0, lint: true },
    ];
    const s = run({ ok: true, errors: 0, warnings: 0, advice: 0, findings: [], declarations, notes: [{ check: "untell-ignore", unused: "a.ts:9: dead-space", why: "no finding of this rule: remove it" }] }, false);
    expect(s).toContain("= stall title");
    expect(s).toContain("matched 2 findings  a.ts:4");
    expect(s).toContain("- dead-space");
    expect(s).toContain("matched nothing: no finding of this rule: remove it  a.ts:9");
    expect(s).toContain("a lint rule: untell lint applies it to its own line or the next");
    expect(s.match(/a\.ts:9/g)!.length).toBe(1);
  });
});

describe("a film that warns while it loads", () => {
  const { printScreen, screenStyle, warningCovered } = require("../src/check") as typeof import("../src/check");
  const LOW = "beats track: the beat grid is low trust (the cross-check counts 140 BPM against 93 BPM: 2:3). Cut on `cuts`.";
  test("a block's warning with no time: the cause names the block, and its text prints one time", () => {
    const f = { check: "block-warning", severity: "advice", message: LOW, fix: "Read the block's warning: give the block the box, the words or the prop it names." };
    const out: string[] = [];
    printScreen({ version: 1, project: "/p", framework: "hyperframes", steps: [], sheet: null, ok: true, errors: 0, warnings: 0, advice: 1, findings: [f] } as never, null,
      { log: (x) => out.push(x), S: screenStyle(false), sceneRel: "films/a.ts", renderArg: null, sheet: null, reportPath: "r.json" });
    const s = out.join("\n");
    expect(s.split("\n").filter(Boolean)[0]).toBe("passed (1 advice) · 1 cause, one fix each");
    expect(s).toContain("i what a block said while it built");
    expect(s).toContain("       beats track");
    expect(s.split("the beat grid is low trust").length - 1).toBe(1);
  });
  test("a warning that a finding carries is covered; another is not", () => {
    expect(warningCovered(LOW, [{ message: LOW }])).toBe(true);
    expect(warningCovered(LOW, [{ message: "title claim: it does not fit" }])).toBe(false);
    expect(warningCovered(LOW, [{ message: "fix it", measured: { block: "beats", message: LOW.slice(12) } }])).toBe(true);
  });
  // The scene warns when its module loads, as beats() does for a low-trust grid. untell check imports the module
  // before the screen. Before, the warning printed on stderr above the verdict.
  test("untell check: the verdict is the first line of stdout, and the warning prints one time, under it", () => {
    const d = tmp("warns");
    writeFileSync(join(d, "package.json"), JSON.stringify({ name: "warns", dependencies: { remotion: "4.0.0" } }));
    expect(node(["init", "--no-install", "--agent", "codex"], d).status).toBe(0);
    const film = join(d, "src", "films", "untell-example.ts");
    writeFileSync(film, `console.warn(${JSON.stringify(LOW)});\n` + readFileSync(film, "utf8"));
    const r = node(["check", "src/films/untell-example.ts", "--no-record"], d);
    const lines = r.stdout.split("\n").filter((l) => l.trim());
    expect(lines[0], r.stdout + r.stderr).toMatch(/^passed/);
    expect(r.stderr).not.toContain("low trust");
    expect(r.stdout.split("the beat grid is low trust").length - 1).toBe(1);
    expect(r.stdout).toContain(`  film     ${LOW}`);
  });
});

describe("the plates table", () => {
  const { platesOf, platesSource } = require("../src/media-store") as typeof import("../src/media-store");
  test("each prepared asset with a plate, its plate files only; the source compiles to the same table", async () => {
    const d = tmp("plates");
    for (const [n, files] of [["boat", ["meta.json", "source.jpg", "plate.jpg", "plate-dim.jpg", "subject.png"]], ["bed", ["meta.json", "source.mp3"]], ["raw", ["source.jpg"]]] as const) {
      mkdirSync(join(d, n), { recursive: true });
      for (const f of files) writeFileSync(join(d, n, f), "x");
    }
    const t = platesOf(d, { boat: {}, bed: {}, raw: {} });
    expect(t).toEqual({ boat: ["plate-dim.jpg", "plate.jpg", "subject.png"] });
    const file = join(d, "t.ts");
    writeFileSync(file, platesSource(t));
    expect((await import(file)).PLATES).toEqual(t);
  });
});

describe("a short effect's level", () => {
  test.skipIf(!hasFfmpeg)("a click reads its loudest 400 ms, not a gated -70 LUFS, and says it is an effect", () => {
    const d = tmp("click");
    const f = join(d, "click.wav");
    spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=f=2000:d=0.15", "-af", "volume=0.5", f]);
    const m = measureFile(f);
    expect(m.level).toBe("momentary");
    expect(m.lufs).toBeGreaterThan(-40);
    expect(m.lufs).toBeLessThan(0);
  });
});

describe("cases from agents' films", () => {
  const { tsconfigAdvice, KIT_TSCONFIG } = require("../src/init") as typeof import("../src/init");
  const { hyperframesFindings, hfIgnores, renderStale } = require("../src/check") as typeof import("../src/check");
  const { findHyperframes } = require("../src/worktree") as typeof import("../src/worktree");
  const { analysedTracks } = require("../src/listen") as typeof import("../src/listen");
  const { slotWait } = require("../src/record") as typeof import("../src/record");
  test("init in a Remotion project with no tsconfig writes one the kit compiles under, and adds the type packages", () => {
    const d = tmp("plainrem");
    writeFileSync(join(d, "package.json"), JSON.stringify({ name: "x", dependencies: { remotion: "4.0.545" } }));
    const r = node(["init", "--no-install", "--agent", "codex"], d);
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(require("node:fs").readFileSync(join(d, "tsconfig.json"), "utf8")).compilerOptions.lib).toContain("DOM");
    expect(r.stdout).toMatch(/@types\/three@0\.182\.0/);
    expect(r.stdout).toMatch(/typescript@5\.9\.3/);
    expect(require("node:fs").existsSync(join(d, ".untell", "media-src"))).toBe(true);
    expect(JSON.parse(KIT_TSCONFIG).compilerOptions.strict).toBe(true);
  });
  test("a tsconfig without the DOM types or JSX gets one line each that says what to change", () => {
    expect(tsconfigAdvice(JSON.stringify({ compilerOptions: { lib: ["es2015"] } }), {})).toEqual([
      'compilerOptions.lib is ["es2015"]: add "DOM" and "DOM.Iterable" (the kit draws in a page), or add the @types/web package.',
      'set compilerOptions.jsx to "react-jsx" (the kit\'s Remotion renderer is React).']);
    expect(tsconfigAdvice(JSON.stringify({ compilerOptions: { lib: ["es2015"], jsx: "react-jsx" } }), { devDependencies: { "@types/web": "0.0.166" } })).toEqual([]);
  });
  test("the HyperFrames CLI is found in the project, then on PATH", () => {
    const d = tmp("hfbin");
    mkdirSync(join(d, "node_modules", ".bin"), { recursive: true });
    writeFileSync(join(d, "node_modules", ".bin", "hyperframes"), "#!/bin/sh\n");
    const was = process.env.UNTELL_HYPERFRAMES; delete process.env.UNTELL_HYPERFRAMES;
    expect(findHyperframes(d)).toBe(join(d, "node_modules", ".bin", "hyperframes"));
    const e = tmp("hfpath"), bin = tmp("bin");
    writeFileSync(join(bin, "hyperframes"), "#!/bin/sh\n");
    const path = process.env.PATH; process.env.PATH = `${bin}:${path}`;
    expect(findHyperframes(e)).toBe(join(bin, "hyperframes"));
    process.env.PATH = path; if (was) process.env.UNTELL_HYPERFRAMES = was;
  });
  test("listen compare reads the tracks analysed by file path as well as the assets", () => {
    const d = tmp("tracks");
    mkdirSync(join(d, ".untell", "listen", "cand-a"), { recursive: true });
    writeFileSync(join(d, ".untell", "listen", "cand-a", "listen.json"), "{}");
    mkdirSync(join(d, "public", "media", "bed"), { recursive: true });
    writeFileSync(join(d, "public", "media", "bed", "listen.json"), "{}");
    writeFileSync(join(d, "untell-media.json"), JSON.stringify({ bed: { kind: "music", file: "source.mp3" } }));
    const t = analysedTracks(d, { media: join(d, "public", "media"), manifest: join(d, "untell-media.json") } as never);
    expect(Object.keys(t).sort()).toEqual(["bed", "cand-a"]);
  });
  test("HyperFrames' findings: every error and warning, block warnings folded, declarable, a system's override", () => {
    const j = { layout: { findings: [{ code: "text_occluded", severity: "error", message: "Text is hidden", time: 0.5, dataAttributes: { "data-el": "line-0" } }, { code: "text_box_overflow", severity: "info" }] },
      craft: { findings: [{ code: "line_unread", severity: "warning", message: "The last line is on screen 1.0 s" }, { code: "dead_stretch", severity: "warning", message: "still" }] },
      runtime: { findings: [{ code: "console_warning", severity: "warning", message: "title tag: does not fit" }] } };
    const ignores = hfIgnores("a\n// untell-ignore hyperframes/dead_stretch: the hold is the system's\n// untell-ignore hyperframes/nope: typo\n", "film.ts");
    const r = hyperframesFindings(j, { system: "kinetic", overrides: { kinetic: { line_unread: { severity: "off", why: "Kinetic ends on a hard cut" } } }, ignores });
    expect(r.findings.map((f) => [f.check, f.severity, f.node ?? null])).toEqual([["hyperframes/text_occluded", "error", "line-0"]]);
    expect(r.declared.map((f) => [f.check, f.declared.where])).toEqual([["hyperframes/dead_stretch", "film.ts:2"]]);
    expect(r.unused.map((u) => u.unused)).toEqual(["film.ts:3: hyperframes/nope"]);
    expect(r.folded).toBe(1);
    expect(r.system[0]).toMatch(/line_unread: not a fault in kinetic/);
  });
  test("a render is stale when the hash of the nodes it drew differs from the scene's; current when equal", () => {
    const d = tmp("stale");
    const cap = join(d, "capture.json"), out = join(d, "out.mp4");
    writeFileSync(cap, JSON.stringify({ nodes: [{ id: "a" }] }));
    writeFileSync(out, "");
    expect(renderStale(out, cap)).toBeNull();
    const { sha } = require("../src/cache") as typeof import("../src/cache");
    writeFileSync(`${out}.untell.json`, JSON.stringify({ nodes: sha(JSON.stringify([{ id: "a" }])) }));
    expect(renderStale(out, cap)).toBe(false);
    writeFileSync(cap, JSON.stringify({ nodes: [{ id: "b" }] }));
    expect(renderStale(out, cap)).toBe(true);
  });
  test("the waiting line says how many slots are busy, that it is normal, and the setting", () => {
    const s = slotWait("waiting for a machine slot (5 in use): pid 1: record a; pid 2: render b");
    expect(s).toMatch(/all 5 in use/);
    expect(s).toMatch(/This is normal when several agents work at once/);
    expect(s).toMatch(/UNTELL_SLOTS/);
  });
});

describe("no terminal: the full result and the exit code", () => {
  // macOS pipes are asynchronous: an exit before the queue drained cut `untell check | cat` at 64 KB, verdict and all.
  test("a slow pipe reader gets every line and the last line is the summary; the exit code is kept", () => {
    const d = tmp("pipe");
    writeFileSync(join(d, "big.ts"), Array.from({ length: 3000 }, (_, i) => `const v${i} = Math.random();`).join("\n"));
    const r = spawnSync("bash", ["-c", `node ${JSON.stringify(CLI)} lint big.ts | (sleep 1; cat); echo "exit=\${PIPESTATUS[0]}"`], { cwd: d, encoding: "utf8", timeout: 120000, maxBuffer: 64 << 20 });
    const lines = r.stdout.trim().split("\n");
    expect(lines.at(-1)).toBe("exit=1");
    expect(lines.at(-2)).toMatch(/^3000 error\(s\), 0 warning\(s\) in 1 of 1 file\(s\)/);
    expect(r.stdout.length).toBeGreaterThan(200000);
  });
});

describe("a kept listen result with no cross-check", () => {
  // A track analysed with no HyperFrames CLI is analysed again once one is found, also through UNTELL_HYPERFRAMES only.
  test("is not reused when UNTELL_HYPERFRAMES names a CLI; a cross-checked one is", () => {
    const { lacksCrossCheck } = require("../src/listen") as typeof import("../src/listen");
    const d = tmp("listen-kept");
    const cli = join(d, "hf"); writeFileSync(cli, "#!/bin/sh\n"); 
    const old = process.env.UNTELL_HYPERFRAMES;
    process.env.UNTELL_HYPERFRAMES = cli;
    try {
      writeFileSync(join(d, "a.json"), JSON.stringify({ validation: { hyperframes: "not available" } }));
      writeFileSync(join(d, "b.json"), JSON.stringify({ validation: { hyperframesBpm: 120, bpm: 120 } }));
      expect(lacksCrossCheck(join(d, "a.json"), d)).toBe(true);
      expect(lacksCrossCheck(join(d, "b.json"), d)).toBe(false);
    } finally { if (old === undefined) delete process.env.UNTELL_HYPERFRAMES; else process.env.UNTELL_HYPERFRAMES = old; }
  });
});

describe("a declaration across the picture check and the render check", () => {
  const { passEffects } = require("../src/check") as typeof import("../src/check");
  const decl = () => [{ rule: "hook", nodes: [], reason: "r", where: "a.ts:3", scope: "the whole film", matched: 0, why: "no finding of this rule: remove it" }];
  test("matched in the picture pass: the render pass says keep it; matched in neither: remove it", () => {
    const d1 = decl(); d1[0]!.matched = 2;
    const rec = passEffects(d1, {}, "picture");
    const d2 = decl();
    passEffects(d2, rec, "render");
    expect(d2[0]!.why).toBe("matched nothing in this pass; it matched 2 in the picture check, so keep it");
    const d3 = decl();
    passEffects(d3, { picture: { "a.ts:3 hook": 0 } }, "render");
    expect(d3[0]!.why).toBe("no finding of this rule: remove it");
    const d4 = decl();
    passEffects(d4, {}, "render");
    expect(d4[0]!.why).toBe("no finding of this rule: remove it if the picture check does not match it either");
  });
});

describe("media prepare with no cut-out", () => {
  // Before: Riso's photo needs its ink separations, and --no-cutout wrote none. Inks read the whole photo.
  const hasPy = spawnSync("python3", ["-c", "import numpy, PIL"]).status === 0;
  test.skipIf(!hasPy)("riso: the plates and the ink separations, no subject; cutout: the plates and a note for paper", () => {
    for (const [sys, inks] of [["riso", true], ["cutout", false]] as const) {
      const d = tmp(`nocut-${sys}`);
      spawnSync("python3", ["-c", `from PIL import Image; import numpy as np; Image.fromarray((np.indices((120, 160)).sum(0) % 255).astype("uint8")).convert("RGB").save("${join(d, "source.jpg")}")`]);
      const r = spawnSync("python3", [join(PKG, "registry/tools/media_photo.py"), d, sys, "nocut", "source.jpg"], { encoding: "utf8", env: { ...process.env, UNTELL_SYSTEMS: join(PKG, "registry/docs/systems") } });
      expect(r.status).toBe(0);
      const files = readdirSync(d);
      expect(files).toContain("plate.jpg");
      expect(files).not.toContain("subject.png");
      expect(files.some((f) => /^ink-\w+\.png$/.test(f))).toBe(inks);
      if (!inks) expect(r.stdout).toMatch(/paper\.png\): that needs a cut-out/);
    }
  });
});

describe("media prepare on a picture with its own transparency", () => {
  // Before: prepare set up the cut-out model for a PNG that had alpha, and --no-cutout put its transparent pixels on a
  // black plate (the colour stored under them), against Raw's ground.
  const hasPy = spawnSync("python3", ["-c", "import numpy, PIL"]).status === 0;
  test.skipIf(!hasPy)("it is its own cut-out (no model), and every plate takes the system's ground, never black", () => {
    const tool = join(PKG, "registry/tools/media_photo.py"), env = { ...process.env, UNTELL_SYSTEMS: join(PKG, "registry/docs/systems") };
    const corner = (f: string) => Number(spawnSync("python3", ["-c", `from PIL import Image; print(min(Image.open("${f}").convert("RGB").getpixel((1, 1))))`], { encoding: "utf8" }).stdout.trim());
    for (const mode of ["cut", "nocut"] as const) {
      const d = tmp(`alpha-${mode}`);
      // A grey disc on transparent black (LA, as a line drawing saves): the corner is transparent.
      spawnSync("python3", ["-c", `from PIL import Image, ImageDraw; im = Image.new("LA", (160, 200), (0, 0)); ImageDraw.Draw(im).ellipse((30, 40, 130, 160), fill=(90, 255)); im.save("${join(d, "source.png")}")`]);
      expect(spawnSync("python3", [tool, d, "raw", "alpha", "source.png"], { encoding: "utf8", env }).stdout.trim()).toBe("alpha");
      const r = spawnSync("python3", [tool, d, "raw", mode, "source.png"], { encoding: "utf8", env });
      expect(r.status).toBe(0);
      if (mode === "cut") expect(r.stdout).toMatch(/kept the photo's own transparency/);
      // Raw's ground is a light paper: the transparent corner shows it on every plate.
      for (const f of ["plate.jpg", "plate-dim.jpg", "plate-top.jpg"]) if (readdirSync(d).includes(f)) expect(corner(join(d, f))).toBeGreaterThan(200);
    }
  });
});

describe("the cut-out model's place", () => {
  // Before: rembg writes <home>/models/<model>/<model>.onnx, and untell looked for <home>/<model>.onnx.
  test("the folder layout rembg writes, then the old flat one; U2NET_HOME wins, else REMBG_HOME, else ~/.rembg", () => {
    const { modelPath, modelPaths, MODEL } = require("../src/env") as typeof import("../src/env");
    const d = tmp("u2net");
    expect(modelPaths({ U2NET_HOME: d })).toEqual([join(d, "models", MODEL, `${MODEL}.onnx`), join(d, `${MODEL}.onnx`)]);
    expect(modelPaths({ REMBG_HOME: d })[0]).toBe(join(d, "models", MODEL, `${MODEL}.onnx`));
    expect(modelPaths({})[0]).toBe(join(require("node:os").homedir(), ".rembg", "models", MODEL, `${MODEL}.onnx`));
    writeFileSync(join(d, `${MODEL}.onnx`), "x");
    expect(modelPath({ U2NET_HOME: d })).toBe(join(d, `${MODEL}.onnx`));
    mkdirSync(join(d, "models", MODEL), { recursive: true });
    writeFileSync(join(d, "models", MODEL, `${MODEL}.onnx`), "x");
    expect(modelPath({ U2NET_HOME: d })).toBe(join(d, "models", MODEL, `${MODEL}.onnx`));
  });
});

describe("HyperFrames findings keep their element", () => {
  const { hyperframesFindings, hfIgnores, nodeOfSelector } = require("../src/check") as typeof import("../src/check");
  test("the selector stays; a declaration that names the node matches it; the effect line has one count", () => {
    expect(nodeOfSelector('[data-el="cap-0"] > span')).toBe("cap-0");
    expect(nodeOfSelector("#claim")).toBe("claim");
    const j = { layout: { findings: [
      { code: "text_box_overflow", severity: "warning", message: "text overflows", selector: '[data-el="cap-0"]' },
      { code: "text_box_overflow", severity: "warning", message: "text overflows", selector: "#note" },
      { code: "text_box_overflow", severity: "warning", message: "text overflows", selector: "#other" },
    ] } };
    const ig = hfIgnores("// untell-ignore hyperframes/text_box_overflow cap note: wide on purpose\n", "a.ts");
    const r = hyperframesFindings(j as never, { system: null, overrides: {}, ignores: ig });
    expect(r.declared.map((d) => d.node)).toEqual(["cap-0", "note"]);
    expect(r.findings.map((f) => [f.node, f.selector])).toEqual([["other", "#other"]]);
    expect(ig[0]!.matched).toBe(2);
  });
});

test("a declaration's effect line and its count agree", () => {
  const { oneCount } = require("../src/check") as typeof import("../src/check");
  expect(oneCount({ matched: 2, effect: "declared hyperframes/x on cap (a.ts:3, named nodes): r: suppresses 0 findings" }).effect).toBe("declared hyperframes/x on cap (a.ts:3, named nodes): r: suppresses 2 findings");
});

test("untell check --explain answers for a HyperFrames rule that untell passes through", () => {
  const { explainDetectorRule } = require("../src/detector") as typeof import("../src/detector");
  const t = explainDetectorRule("hyperframes/line_unread");
  expect(t).toMatch(/^hyperframes\/line_unread  \(HyperFrames' own check/);
  expect(t).toMatch(/kinetic: not reported \(Kinetic ends on a cut with no hold/);
  expect(t).toMatch(/untell-ignore hyperframes\/line_unread <node>/);
  // Bleed text carries HyperFrames' own opt-outs, so no system softens the overflow rules for all its elements.
  expect(explainDetectorRule("hyperframes/outside_safe_zone")).not.toMatch(/kinetic: advice/);
  expect(explainDetectorRule("hyperframes/some_new_rule")).toMatch(/A rule of HyperFrames' own check/);
});

describe("an effect's peak is the peak the mix plays", () => {
  // Before: a stereo click measured on a mono fold read 2.5 dB under its louder channel, so hit's level put every
  // click 0.2 dB over the music's peak.
  test.skipIf(!hasFfmpeg)("a click louder on one channel: its peak is that channel's", () => {
    const d = tmp("stereo-click");
    const f = join(d, "click.wav");
    spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=f=3000:d=0.12", "-filter_complex", "[0]asplit[a][b];[a]volume=0.1[l];[b]volume=0.5[r];[l][r]join=inputs=2:channel_layout=stereo", f]);
    const m = measureFile(f);
    // lavfi's sine is at 1/8: the louder channel peaks at 20 log10(0.125 x 0.5) = -24.1 dBFS; a mono fold reads -28.5.
    expect(m.peakDb).toBeGreaterThan(-24.5);
  });
});


test("media add measures an effect's attacks: two hits 0.3 s apart are two attacks; one hit is one", () => {
  const { attacksOf } = require("../src/media") as typeof import("../src/media");
  const rate = 22050, x = new Float32Array(rate);
  const burst = (at: number) => { for (let i = 0; i < rate * 0.03; i++) x[Math.round(at * rate) + i] = Math.sin(i * 0.3) * Math.exp(-i / (rate * 0.01)); };
  burst(0.1);
  expect(attacksOf(x, rate).length).toBe(1);
  burst(0.4);
  expect(attacksOf(x, rate).map((a) => Math.round(a * 10) / 10)).toEqual([0.1, 0.4]);
});

describe("untell listen before untell listen setup", () => {
  // Before: untell listen mix failed until the agent ran untell listen setup. Now the first use sets up the core.
  const { needListen } = require("../src/listen") as typeof import("../src/listen");
  const { listenPython } = require("../src/env") as typeof import("../src/env");
  const quiet = <T,>(f: () => T): T => { const l = console.log, e = console.error; console.log = console.error = () => {}; try { return f(); } finally { console.log = l; console.error = e; } };
  test("the first use runs the setup once; a setup that cannot run names the one command", () => {
    const d = tmp("listen-first");
    let calls = 0;
    // A stand-in setup: a .venv-listen whose Python finds every module.
    const py = quiet(() => needListen(d, true, () => { calls++; const p = listenPython(d); mkdirSync(require("node:path").dirname(p), { recursive: true }); writeFileSync(p, "#!/bin/sh\nexit 0\n", { mode: 0o755 }); return { py: p, pkgs: [], state: { core: true, extras: [], missingExtras: [] } }; }));
    expect(py).toBe(listenPython(d));
    expect(calls).toBe(1);
    quiet(() => needListen(d, true, () => { calls++; throw new Error("x"); }));
    expect(calls).toBe(1); // set up: no second setup
    const e = tmp("listen-none");
    expect(() => quiet(() => needListen(e, true, () => { throw new Error("uv could not install the core."); }))).toThrow(/untell listen setup/);
  });
});
