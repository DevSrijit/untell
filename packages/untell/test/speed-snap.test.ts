// The recording cache (keys, hit and miss, status, clear), untell snap (the table round trip, the hunk ids it needs,
// the preview gate), the argument handling of the new commands, the review sheet's untimed findings, the music
// table's grid trust, and the clean first run as an end-to-end test.
// The end-to-end test records with Chrome: UNTELL_SKIP_E2E=1 skips it, and it skips itself when Chrome is missing.
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { cacheStatus, lookup, mediaStamp, prune, store } from "../src/cache";
import { recordingKey } from "../src/record";
import { hunk, noProposal, patterns, pick, readTable, withTable } from "../src/snap";
import { COMMAND_TABLE, COMMANDS, helpFor, HELP } from "../src/help";
import { withGridTrust } from "../src/media-store";
import { bundleError } from "../src/build";
import { registryDir } from "../src/kit";

const PKG = resolve(import.meta.dir, "..");
const LAB = resolve(PKG, "../..");
const CLI = join(PKG, "dist/cli.js");
const tmp = (p: string) => mkdtempSync(join(tmpdir(), `untell-${p}-`));
const node = (args: string[], cwd: string, env: Record<string, string> = {}) =>
  spawnSync("node", [CLI, ...args], { cwd, encoding: "utf8", env: { ...process.env, ...env }, timeout: 900000, maxBuffer: 1 << 28 });
/**
 * The JSON a command printed, or a failure that names why there is none: the child's error, its signal (a timeout
 * kills it), its status and the end of its stderr. Before, an empty stdout failed as "JSON Parse error: Unexpected
 * EOF" and hid the cause.
 */
const parsed = <T,>(r: ReturnType<typeof node>, what: string): T => {
  if (r.error || r.signal || !r.stdout?.trim())
    throw new Error(`${what} printed no JSON: status ${r.status}, signal ${r.signal ?? "none"}, error ${r.error?.message ?? "none"}\n${(r.stderr ?? "").slice(-2000)}`);
  return JSON.parse(r.stdout) as T;
};

describe("the recording cache", () => {
  const base = { page: "<html>", assets: "a", media: "m", runtime: "", chrome: "143", capture: true, reuse: true, samplers: "s", stamp: "1" };
  test("the key is stable, and every input changes it", () => {
    const k = recordingKey(base);
    expect(recordingKey({ ...base })).toBe(k);
    for (const [f, v] of Object.entries({ page: "<html>!", assets: "b", media: "n", runtime: "rt", chrome: "144", capture: false, reuse: false, samplers: "t", stamp: "2" })) {
      expect(recordingKey({ ...base, [f]: v } as typeof base)).not.toBe(k);
    }
  });
  test("a media file with a new time changes the stamp", () => {
    const d = tmp("media");
    writeFileSync(join(d, "a.mp3"), "x");
    const s1 = mediaStamp(d);
    utimesSync(join(d, "a.mp3"), new Date(2001, 1, 1), new Date(2001, 1, 1));
    expect(mediaStamp(d)).not.toBe(s1);
  });
  test("store then lookup is a hit; another key is a miss; status, prune and clear", () => {
    const project = tmp("cache");
    const work = join(project, "work");
    mkdirSync(join(work, "frames"), { recursive: true });
    writeFileSync(join(work, "frames", "f0000.jpg"), "jpg");
    writeFileSync(join(work, "tracks.json"), "{}");
    const cache = join(project, ".untell", "cache");
    expect(lookup(cache, "rec", "k1")).toBeNull();
    store(cache, "rec", "k1", work);
    const hit = lookup(cache, "rec", "k1")!;
    expect(readFileSync(join(hit, "frames", "f0000.jpg"), "utf8")).toBe("jpg");
    expect(lookup(cache, "rec", "k2")).toBeNull();
    expect(cacheStatus(project).entries).toBe(1);
    expect(prune(project, 0).removed).toBe(1);
    expect(cacheStatus(project).entries).toBe(0);
    store(cache, "rec", "k3", work);
    const r = node(["cache", "clear", "--json"], project);
    expect(r.status).toBe(0);
    expect(existsSync(cache)).toBe(false);
    const st = node(["cache", "status", "--json"], project);
    const j = JSON.parse(st.stdout) as { version: number; entries: number; slots: { count: number } };
    expect(j.version).toBe(1);
    expect(j.entries).toBe(0);
    expect(j.slots.count).toBeGreaterThan(0);
    expect(node(["cache", "slots"], project).status).toBe(2);
  });
  test("UNTELL_SLOTS sets the slot count that cache status reports", () => {
    const j = JSON.parse(node(["cache", "status", "--json"], tmp("slots"), { UNTELL_SLOTS: "3" }).stdout) as { slots: { count: number } };
    expect(j.slots.count).toBe(3);
  });
});

describe("untell snap", () => {
  const rel = { id: "c-2hite", move: ["row1-badge-text"], axis: "y" as const, of: "row1-badge-text", feature: "bandCy" as const, to: "row1-badge-pill.cy", kind: "centre" as const };
  const src = 'import type { Ctx, Node } from "../untell/scene/types";\n\nexport const system = "studio";\nexport const scene = (_c: Ctx): Node[] => [];\n';
  test("apply writes the table and the import; an empty table gives back the source", () => {
    const applied = withTable(src, [rel], "../untell/scene/align");
    expect(applied).toContain('import { withSnap, type SnapRel } from "../untell/scene/align";');
    expect(applied).toContain("const sceneBeforeSnap = ");
    expect(applied).toContain("export const scene = withSnap(sceneBeforeSnap, SNAPS);");
    expect(readTable(applied)).toEqual([rel]);
    expect(withTable(applied, [], "../untell/scene/align")).toBe(src);
    expect(readTable(src)).toBeNull();
    expect(() => withTable("export const system = 1;\n", [rel], "x")).toThrow(/export const scene/);
  });
  const p = (id: string, needs?: string[], delta = 4, feature = "bandCy") => ({ id, needs, delta, feature, axis: "y", kind: "centre", level: "error", confidence: 0.9, group: id, nodes: [id], el: id,
    from: 1, to: 1 + delta, joins: { el: "box", feature: "cy", on: [] }, why: "w", rel }) as never;
  test("pick adds the hunks a hunk needs, and an unknown id is wrong use", () => {
    const ps = [p("a"), p("b", ["a"]), p("c")];
    expect(pick(ps, "b").map((x: { id: string }) => x.id)).toEqual(["a", "b"]);
    expect(pick(ps, "all").length).toBe(3);
    expect(() => pick(ps, "zz")).toThrow(/no proposal zz/);
  });
  test("three hunks of one cause are named as one cause", () => {
    expect(patterns([p("a"), p("b"), p("c")])[0]).toMatch(/^3 hunks share one cause: text rides high/);
    expect(patterns([p("a"), p("b")])).toEqual([]);
    expect(hunk(p("a"))).toMatch(/^@@ a  centre  error 0\.90  move a y \+4 px @@/);
  });
  test("the CLI: wrong values are wrong use (exit 2) with the fix", () => {
    const d = tmp("snapargs");
    writeFileSync(join(d, "package.json"), JSON.stringify({ dependencies: { remotion: "4.0.0" } }));
    expect(node(["snap", "--at", "soon"], d).status).toBe(2);
    expect(node(["snap", "a.ts", "b.ts"], d).status).toBe(2);
    const r = node(["snap", "films/none.ts"], d);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("does not exist");
  });
});

test("the repository scripts get untell's setup hint and root from the environment", async () => {
  const { workEnv, LISTEN_SETUP } = await import("../src/worktree");
  const e = workEnv("/x");
  expect(e.UNTELL_LISTEN_SETUP).toBe(LISTEN_SETUP);
  expect(e.UNTELL_ROOT).toBe("/x");
  const { SETUP_UNTELL } = await import("../scripts/anchors");
  expect(LISTEN_SETUP).toBe(SETUP_UNTELL);
});

test("the page entry keys a frame from the nodes, half a frame to each side, and never near a scale change", async () => {
  const { pageEntry } = await import("../src/build");
  const e = pageEntry("/p/untell", "/p/untell/scene/hf-entry.ts", "/p/films/a.ts", true);
  expect(e).toContain("g.__untellFrameKey = ");
  expect(e).toContain("const at = [t - 0.5 / fps, t, t + 0.5 / fps];");
  expect(e).toContain("for (let k = f - 8; k <= f + 2; k++) if (rasterMoves(k)) return null;");
  expect(e).toContain("if (moves.length) nodes = applyMoves(nodes, moves);");
  expect(pageEntry("/p/untell", "/p/untell/scene/hf-entry.ts", "/p/films/a.ts", false)).not.toContain("applyMoves");
});

describe("the commands and their help", () => {
  test("every command's help shows one real example, and the main help names the first two steps", () => {
    for (const c of COMMANDS) expect(helpFor(c)!).toMatch(/Example/);
    expect(HELP).toContain("npx untell init");
    expect(HELP).toContain("npx untell check");
  });
  test("the command table has snap, cache and check --no-cache", () => {
    expect(COMMAND_TABLE.snap!.flags).toEqual(expect.arrayContaining(["--at", "--preview", "--apply", "--unapply", "--json"]));
    expect(Object.keys(COMMAND_TABLE.cache!.subs!)).toEqual(["status", "clear"]);
    expect(COMMAND_TABLE.check!.flags).toContain("--no-cache");
  });
  test("a missing package in a bundle names the install command", () => {
    const d = tmp("bundle");
    writeFileSync(join(d, "package-lock.json"), "{}");
    expect(bundleError(d, { errors: [{ text: 'Could not resolve "three/examples/jsm/loaders/GLTFLoader.js"' }, { text: 'Could not resolve "three"' }] }))
      .toContain("Run: npm install --save-exact three");
    expect(bundleError(d, { errors: [{ text: "Unexpected }", location: { file: join(d, "films/a.ts"), line: 3 } }] })).toContain("films/a.ts:3: Unexpected }");
  });
  test("a music map without grid trust gets the type's fields", () => {
    expect(JSON.parse(withGridTrust('{"bpm":120}'))).toEqual({ bpm: 120, gridTrust: "medium", gridIssues: [] });
    const full = '{"bpm":120,"gridTrust":"low","gridIssues":["half time"]}';
    expect(withGridTrust(full)).toBe(full);
  });
});

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("python3", ["-c", "import numpy, PIL"]).status === 0;
test.skipIf(!hasFfmpeg)("the review sheet lists untimed findings under its header, also from untell lint --json", () => {
  const d = tmp("sheet");
  const v = join(d, "v.mp4");
  expect(spawnSync("ffmpeg", ["-loglevel", "error", "-f", "lavfi", "-i", "color=c=gray:s=108x192:d=1:r=30", "-pix_fmt", "yuv420p", v]).status).toBe(0);
  const lint = { files: 1, errors: 1, warnings: 0, results: [{ file: "films/a.ts", findings: [{ rule: "tell/glow", severity: "error", line: 4, col: 1, text: "", message: "a glow", fix: "" }] }] };
  writeFileSync(join(d, "lint.json"), JSON.stringify(lint));
  writeFileSync(join(d, "det.json"), JSON.stringify({ findings: [{ check: "stall", severity: "warning", from: 0.2, to: 0.8, message: "m" }, { check: "hyperframes", severity: "error", message: "x" }] }));
  for (const [f, timeline, listed] of [["lint.json", 0, 1], ["det.json", 1, 1]] as const) {
    const r = spawnSync("python3", [join(registryDir(), "tools", "review_sheet.py"), v, "--out", join(d, `${f}.jpg`), "--findings", join(d, f)], { encoding: "utf8" });
    expect(r.status).toBe(0);
    const j = JSON.parse(readFileSync(join(d, `${f}.json`), "utf8")) as { findingsOnTimeline: number; findingsListed: number };
    expect([j.findingsOnTimeline, j.findingsListed]).toEqual([timeline, listed]);
  }
});

test.skipIf(!hasFfmpeg)("the review sheet shows the last frame when asked at its time, not an empty cell", () => {
  // Before: a frame asked at the last frame's time, written to 3 decimals (0.967 s for 0.9667 s), was past that frame's
  // start; ffmpeg gave no picture with a success status, and the cell stayed empty.
  const d = tmp("sheet-last");
  const v = join(d, "v.mp4");
  expect(spawnSync("ffmpeg", ["-loglevel", "error", "-f", "lavfi", "-i", "color=c=white:s=108x192:d=1:r=30", "-pix_fmt", "yuv420p", v]).status).toBe(0);
  const white = (step: string) => {
    const out = join(d, `s${step}.jpg`);
    expect(spawnSync("python3", [join(registryDir(), "tools", "review_sheet.py"), v, "--out", out, "--step", step], { encoding: "utf8" }).status).toBe(0);
    return Number(spawnSync("python3", ["-c", `from PIL import Image; import numpy as np; a = np.asarray(Image.open("${out}").convert("L")); print(int((a > 245).sum()))`], { encoding: "utf8" }).stdout.trim());
  };
  // Three frames each: at 0, 0.4 and 0.8 s; and at 0, 0.483 and 0.967 s (the last frame). The white area is the same.
  const inside = white("0.4"), last = white("0.48333");
  expect(last / inside).toBeGreaterThan(0.95);
});

// The clean first run: init, then check of untell's own example film, exits 0 with no error, no warning and no advice. A second
// check with no edit takes the recording from the cache, and its findings are the same as a check with --no-cache.
// Then untell render encodes the check's recording (a silent film with no footage) and untell check on the render
// passes too. The project's packages are the repository's (remotion, react, @remotion/player, three), linked in.
const chrome = process.env.UNTELL_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const e2e = process.env.UNTELL_SKIP_E2E !== "1" && existsSync(chrome) && existsSync(join(LAB, "node_modules", "three")) && existsSync(join(LAB, "node_modules", "@remotion", "player"));
test.skipIf(!e2e)("the clean first run (Remotion): init, check, a cache hit, the same findings with --no-cache, snap with 0 proposals, render, check on the render", () => {
  const d = tmp("e2e");
  const rv = (JSON.parse(readFileSync(join(LAB, "node_modules", "remotion", "package.json"), "utf8")) as { version: string }).version;
  writeFileSync(join(d, "package.json"), JSON.stringify({ name: "e2e", dependencies: { remotion: rv, "@remotion/player": rv } }));
  symlinkSync(join(LAB, "node_modules"), join(d, "node_modules"));
  expect(node(["init", "--no-install", "--agent", "codex"], d).status).toBe(0);
  const film = "src/films/untell-example.ts";
  const env = { UNTELL_CACHE: join(d, ".untell", "cache") };
  const first = node(["check", film, "--json"], d, env);
  const r1 = parsed<{ ok: boolean; errors: number; warnings: number; advice: number; findings: unknown[] }>(first, "untell check");
  // A clean pass: no error, no warning and no advice (the example's answer is as large as its title).
  expect([first.status, r1.ok, r1.errors, r1.warnings, r1.advice], first.stderr.slice(-2000)).toEqual([0, true, 0, 0, 0]);
  expect(first.stderr).not.toMatch(/page warning|page error|^warning:/m);
  const second = node(["check", film, "--json"], d, env);
  expect(second.stderr).toContain("record   from the cache");
  const third = node(["check", film, "--json", "--no-cache"], d, env);
  expect(third.stderr).toMatch(/record   \d+ frames/);
  expect(parsed<{ findings: unknown[] }>(second, "untell check (cache)").findings).toEqual(r1.findings);
  expect(parsed<{ findings: unknown[] }>(third, "untell check --no-cache").findings).toEqual(r1.findings);
  const s = node(["snap", film, "--json"], d);
  expect(s.status).toBe(0);
  expect(parsed<{ proposals: unknown[] }>(s, "untell snap").proposals).toEqual([]);
  const r = node(["render", film, "--json"], d, env);
  expect(r.status, r.stderr.slice(-2000)).toBe(0);
  const rep = parsed<{ route: string; final: string; bytes: number; mbitPerSecond: number }>(r, "untell render");
  expect(rep.route).toBe("recording");
  expect(rep.mbitPerSecond).toBeLessThanOrEqual(16);
  expect(existsSync(join(d, rep.final))).toBe(true);
  const onRender = node(["check", film, "--render", rep.final, "--json"], d, env);
  expect(onRender.status, onRender.stderr.slice(-2000)).toBe(0);
  rmSync(d, { recursive: true, force: true });
}, 900000);

// An agent's film: snap reported success for two hunks, and the next check found both issues again (one worse). After
// an apply, snap judges the changed scene with the same rule; a hunk whose issue is still there is not applied.
describe("snap --apply: the rule a hunk fixes, run again on the changed scene", () => {
  const { unresolved } = require("../src/snap") as typeof import("../src/snap");
  const issue = (off: number, fix?: string) => ({ kind: "rhythm", el: "orders-more2", feature: "top", axis: "y", v: 0, to: 0, target: { el: "x", feature: "gap" }, on: [], off, tol: 0.5, confidence: 1, level: "warning", why: "", cls: "", ...(fix ? { fix } : {}) });
  const hunk = { id: "g-1rwpk", kind: "rhythm", nodes: ["orders-more2"], group: "orders", axis: "y", el: "orders-more2", feature: "top", from: 1767, to: 1768.5, delta: 1.5, joins: { el: "x", feature: "gap", on: [] }, why: "", confidence: 1, level: "warning" };
  test("an issue that is gone after the move: applied", () => {
    expect(unresolved({ issues: [issue(-1.5, "g-1rwpk")], proposals: [] } as never, { issues: [], proposals: [] } as never, [hunk] as never)).toEqual([]);
  });
  test("an issue still there, or worse: not applied, and the result says by how much", () => {
    const left = unresolved({ issues: [issue(-1.5, "g-1rwpk")], proposals: [] } as never, { issues: [issue(0.5)], proposals: [] } as never, [hunk] as never);
    expect(left.map((x) => [x.id, x.issue.off, x.left?.off])).toEqual([["g-1rwpk", -1.5, 0.5]]);
  });
  test("fixed on the confirm frame but still there on another sampled frame (a camera tilt): not applied, with that frame", () => {
    // Before: the confirm read one frame and said the rule found nothing; the next check found the cause at other frames.
    const { unresolvedOn } = require("../src/snap") as typeof import("../src/snap");
    const A = { issues: [issue(-1.5, "g-1rwpk")], proposals: [] } as never;
    const at = (f: number) => (f === 90 ? { issues: [issue(0.8)], proposals: [] } : f === 15 ? null : { issues: [], proposals: [] }) as never;
    const left = unresolvedOn(A, [hunk] as never, [15, 30, 45, 60, 75, 90], at);
    expect(left.map((x) => [x.id, x.f])).toEqual([["g-1rwpk", 90]]);
    expect(unresolvedOn(A, [hunk] as never, [30, 45, 60], at)).toEqual([]);
  });
});

describe("a cache entry with a missing file", () => {
  test("an entry whose file is missing is a miss, and lookup drops it", () => {
    const cache = tmp("stale"), from = tmp("stale-from");
    try {
      writeFileSync(join(from, "out.mp4"), "video");
      const d = store(cache, "out", "k1", from);
      expect(lookup(cache, "out", "k1", ["out.mp4"])).toBe(d);
      // A stopped render leaves the entry without its file.
      rmSync(join(d, "out.mp4"));
      expect(lookup(cache, "out", "k1", ["out.mp4"])).toBeNull();
      expect(existsSync(d)).toBe(false);
    } finally { rmSync(cache, { recursive: true, force: true }); rmSync(from, { recursive: true, force: true }); }
  });
});

describe("untell snap with no proposal", () => {
  test("it gives the path of the full-size frame it read, and the file exists", () => {
    const project = tmp("snap-none");
    try {
      const file = join(project, ".untell", "snap", "film", "before.png");
      mkdirSync(join(project, ".untell", "snap", "film"), { recursive: true });
      writeFileSync(file, "png");
      const r = noProposal(project, file);
      expect(r.frame).not.toBeNull();
      expect(existsSync(join(project, r.frame!))).toBe(true);
      expect(r.text).toContain(r.frame!);
      expect(noProposal(project, join(project, "missing.png")).frame).toBeNull();
    } finally { rmSync(project, { recursive: true, force: true }); }
  });
});
