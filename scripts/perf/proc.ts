// Measures a command and every process under it: wall time, CPU seconds and peak memory.
//
// The meter reads the whole process table with `ps` every POLL_MS and keeps, for each process in the
// tree, the largest CPU time it saw. A process that exits keeps its last reading, so a short ffmpeg or a
// Chrome helper still counts (it can lose up to one poll of work). Peak memory is the largest sum of the
// resident sizes of the tree at one poll.
//
// Stage marks: the command can write lines of JSON {"stage", "t0", "t1"} (epoch ms) to the file in
// UNTELL_MARKS. The meter then gives each stage its wall time and the CPU seconds that the tree used
// inside the stage's window.
import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";

export const POLL_MS = 100;

/** A stage window. With `ms`, the stage is many short pieces inside a larger window (one per frame): its wall
 *  time is `ms` and its CPU cannot be told apart from the other pieces, so it has none. */
export type Mark = { stage: string; t0: number; t1: number; n?: number; ms?: number };
export type Sample = { t: number; cpu: number; rss: number };
export type Measure = {
  cmd: string; code: number | null; wall: number; cpu: number; peakMB: number;
  samples: Sample[]; marks: Mark[]; stdout: string; stderr: string; t0: number;
  /** CPU seconds by kind of process: bun, chrome (browser), chrome-gpu, chrome-renderer, chrome-other, ffmpeg, python, node, other. */
  byKind: Record<string, number>;
};

/** The kind of a process, from its command line. */
export function kindOf(cmd: string) {
  if (/ffmpeg|ffprobe/.test(cmd)) return "ffmpeg";
  if (/python/i.test(cmd)) return "python";
  if (/chrome|Chrome|chromium/.test(cmd)) {
    if (/--type=gpu-process/.test(cmd)) return "chrome-gpu";
    if (/--type=renderer/.test(cmd)) return "chrome-renderer";
    if (/--type=/.test(cmd)) return "chrome-other";
    return "chrome";
  }
  if (/(^|\/)bun( |$)/.test(cmd)) return "bun";
  if (/(^|\/)node( |$)/.test(cmd)) return "node";
  return "other";
}

/** "1:02.35" or "0:00.12" or "1:02:03.00" to seconds. */
function cpuSeconds(s: string) {
  const p = s.split(":").map(Number);
  return p.reduce((a, v) => a * 60 + v, 0);
}

/** One reading of the process table: pid -> [ppid, cpu s, rss kB, command]. */
function table(): Map<number, [number, number, number, string]> {
  const out = new Map<number, [number, number, number, string]>();
  let txt = "";
  try { txt = execFileSync("ps", ["-axww", "-o", "pid=,ppid=,time=,rss=,command="], { encoding: "utf8", maxBuffer: 1 << 26 }); } catch { return out; }
  for (const line of txt.split("\n")) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(\d+)\s+(.*)$/);
    if (!m) continue;
    out.set(Number(m[1]), [Number(m[2]), cpuSeconds(m[3]!), Number(m[4]), m[5]!]);
  }
  return out;
}

/** Runs `argv` and measures it. `env` adds to the current environment. */
export async function measure(argv: string[], opts: { cwd?: string; env?: Record<string, string>; marks?: string; quiet?: boolean } = {}): Promise<Measure> {
  if (opts.marks) rmSync(opts.marks, { force: true });
  const t0 = Date.now();
  const child = spawn(argv[0]!, argv.slice(1), { cwd: opts.cwd, env: { ...process.env, ...opts.env, ...(opts.marks ? { UNTELL_MARKS: opts.marks } : {}) }, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", (d) => { stdout += d; if (!opts.quiet) process.stderr.write(d); });
  child.stderr.on("data", (d) => { stderr += d; if (!opts.quiet) process.stderr.write(d); });
  const best = new Map<number, number>(); // pid -> largest CPU seconds seen
  const kinds = new Map<number, string>();
  const tree = new Set<number>([child.pid!]);
  const samples: Sample[] = [];
  let peak = 0;
  let done = false;
  const exited = new Promise<number | null>((r) => child.on("exit", (c) => { done = true; r(c); }));
  const poll = () => {
    const tab = table();
    // Grow the tree: any process whose parent is in it. A process that lost its parent (reparented to 1)
    // stays in the tree once seen.
    let grew = true;
    while (grew) {
      grew = false;
      for (const [pid, [ppid]] of tab) if (!tree.has(pid) && tree.has(ppid)) { tree.add(pid); grew = true; }
    }
    let rss = 0;
    for (const pid of tree) {
      const row = tab.get(pid);
      if (!row) continue;
      best.set(pid, Math.max(best.get(pid) ?? 0, row[1]));
      if (!kinds.has(pid)) kinds.set(pid, kindOf(row[3]));
      rss += row[2];
    }
    peak = Math.max(peak, rss);
    let cpu = 0;
    for (const v of best.values()) cpu += v;
    samples.push({ t: Date.now(), cpu, rss });
  };
  while (!done) {
    poll();
    await Promise.race([exited, new Promise((r) => setTimeout(r, POLL_MS))]);
  }
  const code = await exited;
  // The tree may still hold processes that outlive the command for a moment; take one more reading.
  poll();
  const wall = (Date.now() - t0) / 1000;
  const marks: Mark[] = opts.marks && existsSync(opts.marks)
    ? readFileSync(opts.marks, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  const byKind: Record<string, number> = {};
  for (const [pid, c] of best) byKind[kinds.get(pid) ?? "other"] = (byKind[kinds.get(pid) ?? "other"] ?? 0) + c;
  return { cmd: argv.join(" "), code, wall, cpu: samples.at(-1)?.cpu ?? 0, peakMB: peak / 1024, samples, marks, stdout, stderr, t0, byKind };
}

/** The CPU seconds the tree used between two times (epoch ms), from the samples. */
export function cpuBetween(samples: Sample[], a: number, b: number) {
  const at = (t: number) => {
    // Linear between the two samples that hold t.
    if (!samples.length) return 0;
    if (t <= samples[0]!.t) return samples[0]!.cpu;
    for (let i = 1; i < samples.length; i++) {
      const s0 = samples[i - 1]!, s1 = samples[i]!;
      if (t <= s1.t) return s0.cpu + ((s1.cpu - s0.cpu) * (t - s0.t)) / Math.max(1, s1.t - s0.t);
    }
    return samples.at(-1)!.cpu;
  };
  return Math.max(0, at(b) - at(a));
}

/** The peak memory of the tree between two times, MB. */
export function peakBetween(samples: Sample[], a: number, b: number) {
  let p = 0;
  for (const s of samples) if (s.t >= a - POLL_MS && s.t <= b + POLL_MS) p = Math.max(p, s.rss);
  return p / 1024;
}

/** Stage totals: marks with the same stage name add up. */
export function stages(m: Measure) {
  const out = new Map<string, { wall: number; cpu: number; peakMB: number; n: number }>();
  for (const k of m.marks) {
    const s = out.get(k.stage) ?? { wall: 0, cpu: 0, peakMB: 0, n: 0 };
    s.wall += (k.ms ?? k.t1 - k.t0) / 1000;
    s.cpu += k.ms !== undefined ? NaN : cpuBetween(m.samples, k.t0, k.t1);
    s.peakMB = Math.max(s.peakMB, peakBetween(m.samples, k.t0, k.t1));
    s.n += k.n ?? 1;
    out.set(k.stage, s);
  }
  return out;
}
