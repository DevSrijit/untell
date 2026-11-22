// The speed bench for untell's record, check and render paths.
//
// It runs a fixed set of films through one path and measures each run with scripts/perf/proc.ts: wall time,
// CPU seconds of the whole process tree (Chrome, ffmpeg and Python included), peak memory, and the time and
// CPU of each stage that the command marks. It runs each film alone, and then four copies of one film at
// the same time (--jobs 4), as when several agents share one machine.
//
// Usage:
//   bun scripts/perf/bench.ts record  --impl baseline|new [--set text,photo,...] [--jobs 1|4] [--label <name>] [-- <extra recorder flags>]
//   bun scripts/perf/bench.ts checks  [--set ...]            (each Python check, timed alone, on existing captures)
//   bun scripts/perf/bench.ts render  --engine remotion|hyperframes [--set ...] [--jobs 1|4] [--label <name>] [-- <extra flags>]
//   bun scripts/perf/bench.ts table   <label ...>            (print the saved results as Markdown)
// Results go to out/perf/results/<label>.json. Recordings go to out/perf/runs/<label>/<job>/, never to
// out/recordings, so a bench does not touch the recordings that other agents read.
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { measure, stages, type Measure } from "./proc";

const ROOT = resolve(import.meta.dir, "../..");
const RESULTS = join(ROOT, "out", "perf", "results");
const RUNS = join(ROOT, "out", "perf", "runs");

/** The bench set: a short text scene, a photo reel, a footage reel, a 3D model film and the 36 s hero. */
export const SET: Record<string, { module: string; id: string; hfScene?: string; hfSystem?: string; seconds: number }> = {
  text: { module: "src/films/blocks/primitives.tsx", id: "block-text-spec", hfScene: "examples/scenes/text.ts", hfSystem: "spec", seconds: 7 },
  photo: { module: "src/films/reels.tsx", id: "reel-pop", seconds: 14 },
  footage: { module: "src/films/reels.tsx", id: "reel-noir", seconds: 13 },
  model: { module: "src/films/models.tsx", id: "model-lantern-matte", seconds: 8 },
  hero: { module: "src/films/showpieces.tsx", id: "show-hero", seconds: 36 },
};

const args = process.argv.slice(2);
const dash = args.indexOf("--");
const extra = dash >= 0 ? args.slice(dash + 1) : [];
const own = dash >= 0 ? args.slice(0, dash) : args;
const opt = (k: string) => (own.indexOf(k) >= 0 ? own[own.indexOf(k) + 1] : undefined);
const mode = own[0];
const set = (opt("--set") ?? Object.keys(SET).join(",")).split(",");
const jobs = Number(opt("--jobs") ?? 1);

export type Run = { film: string; id: string; jobs: number; wall: number; cpu: number; peakMB: number; code: number | null;
  byKind: Record<string, number>; stages: Record<string, { wall: number; cpu: number; peakMB: number; n: number }>; frames?: number };
export type Result = { label: string; mode: string; impl?: string; engine?: string; when: string; load: string; runs: Run[] };

const loadNow = () => { try { return require("node:os").loadavg().map((v: number) => v.toFixed(1)).join(" "); } catch { return "?"; } };

function save(r: Result) {
  mkdirSync(RESULTS, { recursive: true });
  writeFileSync(join(RESULTS, `${r.label}.json`), JSON.stringify(r, null, 1));
  console.error(`saved out/perf/results/${r.label}.json`);
}

const toRun = (film: string, id: string, n: number, m: Measure): Run => ({
  film, id, jobs: n, wall: m.wall, cpu: m.cpu, peakMB: m.peakMB, code: m.code, byKind: m.byKind,
  stages: Object.fromEntries(stages(m)),
});

/** Runs `n` copies of a command at once and measures them as one: the wall time until the last ends, the CPU
 *  and the peak memory of all of them together. Each copy also keeps its own measure. */
/** --wait-load N: before each film, wait until the 1-minute load average is under N (both sides of a pair then
 *  start in the same machine state). */
async function settleLoad() {
  const limit = Number(opt("--wait-load"));
  if (!limit) return;
  const { loadavg } = await import("node:os");
  for (let told = false; loadavg()[0]! >= limit; told = true) {
    if (!told) console.error(`waiting for the load to fall under ${limit} (now ${loadavg()[0]!.toFixed(1)})`);
    await new Promise((r) => setTimeout(r, 5000));
  }
}

async function many(n: number, make: (job: number) => { argv: string[]; env?: Record<string, string>; marks?: string }) {
  await settleLoad();
  const all = await Promise.all(Array.from({ length: n }, (_, j) => { const c = make(j); return measure(c.argv, { cwd: ROOT, env: c.env, marks: c.marks, quiet: true }); }));
  return all;
}

async function benchRecord() {
  const impl = opt("--impl") ?? "new";
  const label = opt("--label") ?? `record-${impl}-j${jobs}`;
  const script = impl === "baseline" ? "scripts/perf/baseline/record.ts" : "scripts/record.ts";
  const res: Result = { label, mode: "record", impl, when: new Date().toISOString(), load: loadNow(), runs: [] };
  for (const film of set) {
    const f = SET[film]!;
    const outs = Array.from({ length: jobs }, (_, j) => join(RUNS, label, film, `j${j}`));
    for (const o of outs) { rmSync(o, { recursive: true, force: true }); mkdirSync(o, { recursive: true }); }
    await settleLoad();
    console.error(`${label}: ${film} (${f.id}) x${jobs}, load ${loadNow()}`);
    const ms = await many(jobs, (j) => ({
      argv: ["bun", script, "--force", ...extra, "--films", f.module, f.id],
      env: { UNTELL_REC_OUT: outs[j]! },
      marks: join(outs[j]!, "marks.jsonl"),
    }));
    for (const m of ms) if (m.code !== 0) console.error(`FAILED ${film}: ${m.stderr.slice(-1500)}`);
    // Four jobs: one row with the sums (CPU, memory) and the longest wall time.
    const runs = ms.map((m) => toRun(film, f.id, jobs, m));
    const row = runs[0]!;
    if (jobs > 1) {
      row.wall = Math.max(...runs.map((r) => r.wall));
      row.cpu = runs.reduce((a, r) => a + r.cpu, 0);
      row.peakMB = runs.reduce((a, r) => a + r.peakMB, 0); // an upper bound: the peaks may not meet
      row.byKind = {};
      for (const r of runs) for (const [k, v] of Object.entries(r.byKind)) row.byKind[k] = (row.byKind[k] ?? 0) + v;
    }
    row.frames = Math.round(f.seconds * 30);
    res.runs.push(row);
    console.error(`  wall ${row.wall.toFixed(1)} s  cpu ${row.cpu.toFixed(1)} s  peak ${row.peakMB.toFixed(0)} MB`);
  }
  save(res);
}

/** Each Python check, alone, on films that the detector has captured. Uses scripts/perf/checks_bench.py. */
async function benchChecks() {
  const label = opt("--label") ?? "checks";
  const res: Result = { label, mode: "checks", when: new Date().toISOString(), load: loadNow(), runs: [] };
  for (const film of set) {
    const f = SET[film]!;
    const m = await measure(["python3", join(ROOT, "scripts/perf/checks_bench.py"), f.id, ...extra], { cwd: ROOT, quiet: true });
    if (m.code !== 0) { console.error(`FAILED ${film}: ${m.stderr.slice(-1500)}`); continue; }
    const per = JSON.parse(m.stdout) as { load: { wall: number; cpu: number }; pixels: { wall: number; cpu: number }; checks: Record<string, { wall: number; cpu: number }> };
    const run = toRun(film, f.id, 1, m);
    run.stages = { load: { ...per.load, peakMB: 0, n: 1 }, "read frames": { ...per.pixels, peakMB: 0, n: 1 }, ...Object.fromEntries(Object.entries(per.checks).map(([k, v]) => [k, { ...v, peakMB: 0, n: 1 }])) };
    res.runs.push(run);
    console.error(`${film}: wall ${m.wall.toFixed(1)} s cpu ${m.cpu.toFixed(1)} s peak ${m.peakMB.toFixed(0)} MB`);
  }
  save(res);
}

async function benchRender() {
  const engine = opt("--engine") ?? "remotion";
  const label = opt("--label") ?? `render-${engine}-j${jobs}`;
  const res: Result = { label, mode: "render", engine, when: new Date().toISOString(), load: loadNow(), runs: [] };
  const impl = opt("--impl") ?? "framework";
  for (const film of set) {
    const f = SET[film]!;
    const outs = Array.from({ length: jobs }, (_, j) => join(RUNS, label, film, `j${j}`));
    for (const o of outs) { rmSync(o, { recursive: true, force: true }); mkdirSync(o, { recursive: true }); }
    await settleLoad();
    console.error(`${label}: ${film} x${jobs}, load ${loadNow()}`);
    const ms = await many(jobs, (j) => {
      if (impl === "untell" && engine === "hyperframes") {
        return { argv: ["bun", "scripts/render.ts", "--renderer", "hyperframes", "--scene", f.hfScene!, "--system", f.hfSystem!, "--seconds", String(f.seconds), "--out", join(outs[j]!, "out.mp4"), ...extra], marks: join(outs[j]!, "marks.jsonl") };
      }
      if (impl === "untell") {
        return { argv: ["bun", "scripts/render.ts", f.id, "--films", f.module, "--renderer", engine, "--out", join(outs[j]!, "out.mp4"), ...extra], marks: join(outs[j]!, "marks.jsonl") };
      }
      if (engine === "remotion") {
        const root = f.module.includes("showpieces") ? "src/showpieces-root.tsx" : "src/remotion-root.tsx";
        return { argv: ["npx", "remotion", "render", root, f.id, join(outs[j]!, "out.mp4"), "--public-dir", "assets", "--log", "error", ...extra] };
      }
      return { argv: ["bun", "scripts/perf/baseline/hf_render.ts", f.hfScene!, f.hfSystem!, String(f.seconds), join(outs[j]!, "project"), ...extra], marks: join(outs[j]!, "marks.jsonl") };
    });
    for (const m of ms) if (m.code !== 0) console.error(`FAILED ${film}: ${(m.stderr + m.stdout).slice(-1500)}`);
    const runs = ms.map((m) => toRun(film, f.id, jobs, m));
    const row = runs[0]!;
    if (jobs > 1) {
      row.wall = Math.max(...runs.map((r) => r.wall));
      row.cpu = runs.reduce((a, r) => a + r.cpu, 0);
      row.peakMB = runs.reduce((a, r) => a + r.peakMB, 0);
    }
    row.frames = Math.round(f.seconds * 30);
    res.runs.push(row);
    console.error(`  wall ${row.wall.toFixed(1)} s  cpu ${row.cpu.toFixed(1)} s  peak ${row.peakMB.toFixed(0)} MB`);
  }
  save(res);
}

function table(labels: string[]) {
  for (const label of labels) {
    const r: Result = JSON.parse(readFileSync(join(RESULTS, `${label}.json`), "utf8"));
    console.log(`\n### ${label} (${r.mode}${r.impl ? `, ${r.impl}` : ""}${r.engine ? `, ${r.engine}` : ""}; load at start ${r.load})\n`);
    console.log("| Film | Jobs | Wall s | CPU s | Peak MB | CPU by process |");
    console.log("| --- | --- | --- | --- | --- | --- |");
    for (const x of r.runs) {
      const kinds = Object.entries(x.byKind).filter(([, v]) => v >= 0.5).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(", ");
      console.log(`| ${x.film} (${x.id}) | ${x.jobs} | ${x.wall.toFixed(1)} | ${x.cpu.toFixed(1)} | ${x.peakMB.toFixed(0)} | ${kinds} |`);
    }
    const names = [...new Set(r.runs.flatMap((x) => Object.keys(x.stages)))];
    if (!names.length) continue;
    console.log(`\n| Stage | ${r.runs.map((x) => x.film).join(" | ")} |`);
    console.log(`| --- | ${r.runs.map(() => "---").join(" | ")} |`);
    for (const s of names) {
      console.log(`| ${s} | ${r.runs.map((x) => { const v = x.stages[s]; if (!v) return ""; return Number.isNaN(v.cpu) || v.cpu === null ? `${v.wall.toFixed(2)} s` : `${v.wall.toFixed(2)} s / ${v.cpu.toFixed(2)} cpu`; }).join(" | ")} |`);
    }
  }
}

/** The whole check path (record, capture, sound, every check) through a frozen copy of detect.ts:
 *  --impl baseline is detect.ts as it is; --impl new is the copy with the diff from RESULT.md (fast player,
 *  no seek for a frame that repeats) and the fast frame reader. Each job has its own folders. */
async function benchDetect() {
  const impl = opt("--impl") ?? "new";
  const label = opt("--label") ?? `detect-${impl}-j${jobs}`;
  // baseline: detect.ts as committed before the speed work (frozen copy, old recorder, old film.py); new: scripts/detect.ts.
  const script = impl === "baseline" ? "scripts/perf/baseline/detect_head.ts" : "scripts/detect.ts";
  const res: Result = { label, mode: "detect", impl, when: new Date().toISOString(), load: loadNow(), runs: [] };
  for (const film of set) {
    const f = SET[film]!;
    const outs = Array.from({ length: jobs }, (_, j) => join(RUNS, label, film, `j${j}`));
    for (const o of outs) { rmSync(o, { recursive: true, force: true }); mkdirSync(join(o, "rec"), { recursive: true }); mkdirSync(join(o, "det"), { recursive: true }); }
    await settleLoad();
    console.error(`${label}: ${film} (${f.id}) x${jobs}, load ${loadNow()}`);
    const ms = await many(jobs, (j) => ({
      argv: ["bun", script, f.id, "--films", f.module, "--json", "--force", ...extra],
      env: { UNTELL_REC_OUT: join(outs[j]!, "rec"), UNTELL_DET_OUT: join(outs[j]!, "det"), ...(impl === "baseline" ? {} : { UNTELL_NO_CACHE: process.env.UNTELL_NO_CACHE ?? "1" }) },
      marks: join(outs[j]!, "marks.jsonl"),
    }));
    for (const [j, m] of ms.entries()) { writeFileSync(join(outs[j]!, "findings.json"), m.stdout); if (m.code !== 0 && m.code !== 1) console.error(`FAILED ${film}: ${m.stderr.slice(-1500)}`); }
    const runs = ms.map((m) => toRun(film, f.id, jobs, m));
    const row = runs[0]!;
    if (jobs > 1) { row.wall = Math.max(...runs.map((r) => r.wall)); row.cpu = runs.reduce((a, r) => a + r.cpu, 0); row.peakMB = runs.reduce((a, r) => a + r.peakMB, 0); }
    row.frames = Math.round(f.seconds * 30);
    res.runs.push(row);
    console.error(`  wall ${row.wall.toFixed(1)} s  cpu ${row.cpu.toFixed(1)} s  peak ${row.peakMB.toFixed(0)} MB`);
  }
  save(res);
}

if (mode === "record") await benchRecord();
else if (mode === "detect") await benchDetect();
else if (mode === "checks") await benchChecks();
else if (mode === "render") await benchRender();
else if (mode === "table") table(own.slice(1));
else { console.error("usage: bun scripts/perf/bench.ts record|checks|render|table ..."); process.exit(2); }
if (existsSync(RUNS) && !own.includes("--keep") && mode !== "table" && mode !== "checks") {
  // Recordings are big (a 36 s film is about 300 MB). Keep only the last label's, for frame comparison.
}
