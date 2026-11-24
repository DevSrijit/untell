#!/usr/bin/env bun
// Builds the pictures of the README and the npm page from real runs of untell's own commands, then writes README.md
// from README.template.md with every count read from `untell --version --json`.
//
// Usage: bun packages/untell/scripts/readme/build.ts [demo] [reels] [systems] [charts] [compose]
//        (no stage: all five, in this order; compose also writes the README and runs the guards)
//
// Stages:
//   demo     A new Remotion project with untell installed from a tarball. It runs what a user runs: init, check,
//            media add, listen, render, check --sheet, snap --preview, sheet and lint. It keeps each command's output
//            as text; every terminal picture is that text. The films it checks are in demo/films/:
//              drop-draft.ts  a short Kinetic film with real faults (an empty band, no accent): the check picture
//              drop.ts        the same film fixed, its cut on the drop of its track: the sound picture
//   demo/align/kettle-card.ts a product card on a named grid with two edges a few px off it: the snap picture
//              kiln-queue.ts  a UI frame whose text rides 4 to 6 px high in its boxes (for the guide pages)
//   reels    One frame from each of eight example reels (renders in out/render/reel-<id>.mastered.mp4).
//   systems  The defaults scene (examples/scenes/defaults.ts) in each of the 20 systems, one frame each (films.tsx).
//   charts   One bar chart in six systems, each in its own hand (src/films/blocks/hand.tsx), its last frame.
//   compose  Frames the outputs into docs/assets/*.png and *.gif (compose.ts), writes README.md and the npm page,
//            runs untell's copy rules on the pages, and runs the package's guards on the raw outputs.
//
// Settings (environment):
//   README_PACK      (demo, required) the untell tarball to install.
//   README_TEMPLATE  (demo, required) a Remotion project with git history: its first commit (the blank template)
//                    and a clone of its node_modules, so Remotion needs no download.
//   README_DEMO      the demo project folder (default out/readme/demo). The demo stage makes it again each time.
//
// Every picture is real output. compose.ts crops, orders and frames; it never draws a result. Changes to text are
// marked or stated: absolute paths show as "…/demo" or "~", and each run of terminal lines left out shows as "…".
// Heavy jobs (recordings, renders) run one at a time.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir, loadavg } from "node:os";
import { HANDS, REELS } from "./picks";

const HERE = import.meta.dir;
const ROOT = resolve(HERE, "../../../..");
const ASSETS = join(ROOT, "docs/assets");
const RAW = join(ROOT, "out/readme/raw"); // raw outputs: kept out of the published tree
const WORK = join(ROOT, "out/readme");
const DEMO = resolve(process.env.README_DEMO ?? join(WORK, "demo"));

const stages = process.argv.slice(2);
const want = (s: string) => stages.length === 0 || stages.includes(s);
const log = (m: string) => console.log(`[readme] ${m}`);
const mk = (p: string) => { mkdirSync(p, { recursive: true }); return p; };
const need = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`set ${k} (see the header of this script)`); return resolve(v); };
const copy = (from: string, to: string) => { mk(dirname(to)); cpSync(from, to, { recursive: true }); };

function run(cmd: string, cwd = ROOT, o: { ok?: (c: number) => boolean; quiet?: boolean } = {}) {
  const t0 = performance.now();
  const r = spawnSync("sh", ["-c", `${cmd} 2>&1`], { cwd, encoding: "utf8", maxBuffer: 64 << 20, env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" } });
  const seconds = (performance.now() - t0) / 1000, code = r.status ?? 1;
  if (!(o.ok ?? ((c) => c === 0))(code)) { console.error(r.stdout); throw new Error(`failed (${code}): ${cmd}`); }
  if (!o.quiet) log(`${cmd.slice(0, 110)}  (${seconds.toFixed(1)} s, exit ${code})`);
  return { out: r.stdout ?? "", code, seconds };
}

/** Absolute paths in text: the demo project, this repository and the home folder. */
function scrub(t: string): string {
  return t.split(DEMO).join("…/demo").split(ROOT + "/").join("").split(ROOT).join(".").split(homedir()).join("~");
}

/** Terminal text as a reader sees it: no escape codes, a redrawn line in its last state, no npm spinner frames. */
function clean(text: string): string {
  return scrub(text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").split("\n")
    .map((l) => l.split("\r").filter((s) => s.trim() !== "").pop() ?? "")
    .filter((l) => !/^\s*[\\|/-]\s*$/.test(l)).join("\n")).replace(/\n{3,}/g, "\n\n").trimEnd();
}

/** Runs a user command in the demo project and keeps its output for a terminal picture. */
function capture(name: string, cmd: string, o: { ok?: (c: number) => boolean } = {}) {
  const load = loadavg().map((x) => Math.round(x * 10) / 10);
  const r = run(cmd, DEMO, o);
  writeFileSync(join(mk(join(RAW, "demo/term")), `${name}.json`),
    JSON.stringify({ cmd: scrub(cmd), out: clean(r.out), code: r.code, seconds: Math.round(r.seconds * 10) / 10, load }, null, 1));
  return r;
}

// ---------------------------------------------------------------- demo
function demo() {
  const PACK = need("README_PACK"), TEMPLATE = need("README_TEMPLATE");
  if (!existsSync(join(TEMPLATE, ".git"))) throw new Error(`README_TEMPLATE has no git history: ${TEMPLATE}`);
  log(`demo project: ${DEMO}`);
  rmSync(DEMO, { recursive: true, force: true });
  rmSync(join(RAW, "demo"), { recursive: true, force: true });
  mk(dirname(DEMO));
  run(`git clone -q "${TEMPLATE}" "${DEMO}"`);
  run(`git checkout -q $(git rev-list --max-parents=0 HEAD)`, DEMO, { quiet: true });
  rmSync(join(DEMO, ".git"), { recursive: true, force: true });
  run(`cp -c -R "${join(TEMPLATE, "node_modules")}" "${join(DEMO, "node_modules")}"`);
  rmSync(join(DEMO, "node_modules/untell"), { recursive: true, force: true });

  // 1. Install, the counts, init, and the example film's check.
  run(`npm i -D "${PACK}" --prefer-offline --no-audit --no-fund`, DEMO);
  const version = run("npx untell --version --json", DEMO, { quiet: true }).out;
  writeFileSync(join(mk(join(RAW, "demo")), "version.json"), version.slice(version.indexOf("{")));
  capture("init", "npx untell init --agent claude");
  capture("check-example", "npx untell check");

  // 2. The films, a track and its analysis.
  for (const f of readdirSync(join(HERE, "demo/films"))) copy(join(HERE, "demo/films", f), join(DEMO, "src/films", f));
  for (const f of readdirSync(join(HERE, "demo/align"))) copy(join(HERE, "demo/align", f), join(DEMO, "src/align", f));
  copy(join(HERE, "demo/src/Root.tsx"), join(DEMO, "src/Root.tsx"));
  capture("listen-setup", "npx untell listen setup");
  copy(join(ROOT, "assets/media/show-music-1062/source.mp3"), join(DEMO, "pulse.mp3"));
  capture("media-add", "npx untell media add pulse.mp3 --as pulse");
  writeFileSync(join(DEMO, "drop-entry.ts"), `import { musicFrom } from "./src/untell/scene/blocks";\nconst from = musicFrom({ media: "pulse", peakAt: 3.7, until: 7.4 });\nconsole.log(JSON.stringify({ media: "pulse", peakAt: 3.7, from, drop: Math.round((from + 3.7) * 1000) / 1000 }));\n`);
  const entry = run("bun drop-entry.ts", DEMO, { quiet: true }).out.trim().split("\n").filter((l) => l.startsWith("{")).pop()!;
  writeFileSync(join(RAW, "demo/drop-entry.json"), entry + "\n");
  rmSync(join(DEMO, "drop-entry.ts"));

  // 3. The draft: its check (the check picture), its render, and the sheet with its faults (a top candidate).
  capture("check-draft", "npx untell check --film src/films/drop-draft.ts", { ok: (c) => c === 1 });
  copy(join(DEMO, ".untell/check/report.json"), join(RAW, "demo/check-report-draft.json"));
  capture("render-draft", "npx untell render src/films/drop-draft.ts", { ok: (c) => c === 0 || c === 1 });
  for (const theme of ["dark", "light"]) capture(`sheet-draft-${theme}`,
    `npx untell sheet out/drop-draft.mastered.mp4 --findings .untell/check/report.json --theme ${theme} --out out/drop-draft.${theme}.sheet.jpg`);

  // 4. The fixed film: its render and its sheet with the cut on the drop (the sound picture).
  capture("check-final", "npx untell check --film src/films/drop.ts --full");
  capture("render-final", "npx untell render src/films/drop.ts", { ok: (c) => c === 0 || c === 1 });
  capture("sheet-final", "npx untell check --film src/films/drop.ts --sheet out/drop.mastered.mp4", { ok: (c) => c === 0 || c === 1 });

  // 5. Alignment: snap on the product card (two edges off its named grid), the preview of all its hunks.
  capture("snap", "npx untell snap src/align/kettle-card.ts", { ok: (c) => c === 0 || c === 1 });
  capture("snap-preview", "npx untell snap src/align/kettle-card.ts --preview all", { ok: (c) => c === 0 || c === 1 });
  for (const f of readdirSync(join(DEMO, ".untell/snap/kettle-card")).filter((f) => /\.(png|json)$/.test(f)))
    copy(join(DEMO, ".untell/snap/kettle-card", f), join(RAW, "demo/snap", f));

  // 6. A whole reel in one image: untell sheet on the Kinetic example reel (a top candidate).
  copy(join(ROOT, "out/render/reel-kinetic.mastered.mp4"), join(DEMO, "out/one-day.mp4"));
  for (const theme of ["dark", "light"]) capture(`sheet-reel-${theme}`, `npx untell sheet out/one-day.mp4 --theme ${theme} --out out/one-day.${theme}.sheet.jpg`);

  // 7. The tells in code, for the guide.
  copy(join(ROOT, "examples/showpieces/tell.tsx"), join(DEMO, "src/draft/Launch.tsx"));
  capture("lint-tell", "npx untell lint src/draft/Launch.tsx", { ok: (c) => c === 1 });

  const o = join(RAW, "demo");
  for (const f of readdirSync(join(DEMO, "out")).filter((f) => /\.sheet\.(jpg|json)$/.test(f))) copy(join(DEMO, "out", f), join(o, "sheets", f));
  for (const f of ["listen.png", "listen.json", "music.json"]) copy(join(DEMO, "public/media/pulse", f), join(o, "listen", f));
  const frames = join(WORK, "frames/drop");
  rmSync(frames, { recursive: true, force: true });
  mk(frames);
  run(`ffmpeg -v error -y -i out/drop.mastered.mp4 -vf fps=12,scale=540:-2 "${frames}/f%04d.png"`, DEMO, { quiet: true });
  log("demo: done");
}

// ---------------------------------------------------------------- reels
function reels() {
  rmSync(join(RAW, "reels"), { recursive: true, force: true });
  mk(join(RAW, "reels"));
  for (const [id, t] of REELS)
    run(`ffmpeg -v error -y -ss ${t} -i "${join(ROOT, `out/render/reel-${id}.mastered.mp4`)}" -frames:v 1 -q:v 2 "${join(RAW, "reels", `${id}.jpg`)}"`, ROOT, { quiet: true });
  log("reels: done");
}

// ---------------------------------------------------------------- systems
function systems() {
  rmSync(join(RAW, "systems"), { recursive: true, force: true });
  mk(join(RAW, "systems"));
  const { SYSTEMS } = require(join(ROOT, "src/system/systems.ts")) as { SYSTEMS: { id: string; name: string; mode: string }[] };
  run(`bun scripts/record.ts --force --films packages/untell/scripts/readme/films.tsx --at 60 ${SYSTEMS.map((s) => `readme-defaults-${s.id}`).join(" ")}`);
  for (const s of SYSTEMS) run(`magick "${join(ROOT, "out/recordings", `readme-defaults-${s.id}`, "frames-png/f0060.png")}" -quality 90 "${join(RAW, "systems", `${s.id}.jpg`)}"`, ROOT, { quiet: true });
  writeFileSync(join(RAW, "systems/systems.json"), JSON.stringify(SYSTEMS.map((s) => ({ id: s.id, name: s.name, mode: s.mode })), null, 1));
  log("systems: done");
}

// ---------------------------------------------------------------- charts
function charts() {
  rmSync(join(RAW, "charts"), { recursive: true, force: true });
  mk(join(RAW, "charts"));
  const { HAND } = require(join(ROOT, "src/films/blocks/hand.tsx")) as { HAND: Record<string, { seconds: number }> };
  const last = Math.round(HAND.barChart!.seconds * 30) - 1;
  run(`bun scripts/record.ts --force --films src/films/blocks/hand.tsx --at ${last} ${HANDS.map((h) => `hand-barChart-${h}`).join(" ")}`);
  for (const h of HANDS) run(`magick "${join(ROOT, "out/recordings", `hand-barChart-${h}`, "frames-png", `f${String(last).padStart(4, "0")}.png`)}" -quality 90 "${join(RAW, "charts", `${h}.jpg`)}"`, ROOT, { quiet: true });
  log("charts: done");
}

// ---------------------------------------------------------------- compose, the README and the guards
async function compose() {
  const { composeAll } = await import("./compose");
  await composeAll({ root: ROOT, raw: RAW, out: ASSETS, work: WORK });
  const rows = readdirSync(ASSETS).filter((f) => /\.(png|gif|jpg)$/.test(f)).map((f) => [f, statSync(join(ASSETS, f)).size] as const);
  const total = rows.reduce((a, [, s]) => a + s, 0);
  writeFileSync(join(ASSETS, "SIZES.txt"), rows.map(([f, s]) => `${(s / 1024).toFixed(0).padStart(6)} KB  ${f}`).join("\n") + `\n${(total / 1048576).toFixed(2).padStart(6)} MB  total\n`);
  log(`compose: ${rows.length} pictures, ${(total / 1048576).toFixed(2)} MB`);
}

/** README.md from the template: {{key}} takes its value from `untell --version --json`; a missing key fails. */
function readme() {
  const v = JSON.parse(readFileSync(join(RAW, "demo/version.json"), "utf8")) as Record<string, unknown>;
  const t = readFileSync(join(HERE, "README.template.md"), "utf8").replace(/^<!--[\s\S]*?-->\n/, "");
  const md = t.replace(/\{\{(\w+)\}\}/g, (_m, k) => { if (v[k] === undefined) throw new Error(`README.template.md names {{${k}}}, which untell --version --json does not give`); return String(v[k]); });
  writeFileSync(join(ROOT, "README.md"), md);
  run("bun packages/untell/scripts/readme/npm-readme.ts");
  run("bun packages/untell/scripts/readme/prose-check.ts README.md packages/untell/README.md docs/guide/*.md");
}

async function guard() {
  const { scanTree, sourceHits, machineHits } = await import("../guards");
  const { walk } = await import("../../src/kit");
  for (const f of walk(RAW).filter((f) => /\.(json|md|txt)$/.test(f))) {
    const p = join(RAW, f), t = readFileSync(p, "utf8"), u = scrub(t);
    if (u !== t) writeFileSync(p, u);
  }
  const roots = [RAW, join(ROOT, "docs/guide"), HERE];
  const pages = ["README.md", "packages/untell/README.md"];
  const internal = new RegExp(["la" + "b", "pro" + "of", "build" + "er", "spr" + "int", "rou" + "nd"].map((w) => `\\b${w}\\b`).join("|"), "i"); // words for internal work, which no public page uses
  const words = pages.flatMap((f) => readFileSync(join(ROOT, f), "utf8").split("\n").flatMap((l, i) => (internal.test(l) ? [{ file: f, line: i + 1, text: l.trim().slice(0, 120) }] : [])));
  const hits = [...scanTree(roots, machineHits), ...scanTree(roots, sourceHits), ...words,
    ...pages.flatMap((f) => [...machineHits(readFileSync(join(ROOT, f), "utf8"), f), ...sourceHits(readFileSync(join(ROOT, f), "utf8"), f)])];
  if (hits.length) throw new Error(`a public file names this machine, a media source or an internal word:\n${hits.slice(0, 30).map((h) => `  ${h.file}:${h.line}: ${h.text}`).join("\n")}`);
  log("guards: no machine path, no media source, no internal word");
}

if (want("demo")) demo();
if (want("reels")) reels();
if (want("systems")) systems();
if (want("charts")) charts();
if (want("compose")) {
  await compose();
  readme();
  await guard();
}
