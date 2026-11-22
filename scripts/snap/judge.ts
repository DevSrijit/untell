// The judging bench for the alignment model: capture films once, run the model on the stored frames, shoot the
// frames that hold findings, and score the model against a person's verdicts.
//
// Usage:
//   bun scripts/snap/judge.ts capture --films <module> [--only <id,id>] [--match <regex>] [--force]
//   bun scripts/snap/judge.ts issues  [--tag <name>] [--match <regex>] [--with-detector <regex>]
//   bun scripts/snap/judge.ts shots   [--tag <name>] [--match <regex>] [--all-levels]
//   bun scripts/snap/judge.ts score   [--tag <name>] [--labels <file>] [--json]
//
// capture  reads each film as the detector does: every 0.5 s and the last frame, each against the frame before (an
//          element counts when it did not move). It stores the raw capture (nodes and boxes, no pictures) gzipped in
//          out/snap/judge/caps/<film>.json.gz. It skips a film that is stored, unless --force.
// issues   runs the model (src/system/scene/align.ts) on every stored frame and merges one issue over time into one
//          row (its first and last time, its strongest record). Advice counts too. Writes out/snap/judge/issues-<tag>.json.
// shots    writes a PNG of each frame that holds a row at warning or error (all rows with --all-levels), for the
//          crop sheets (scripts/snap/judge_sheet.py).
// score    matches the rows to the verdicts in out/snap/survey/judged.json and prints the precision of each check and
//          each class, and the real misses the model no longer reports.
// The model is pure, so issues and score need no browser: tune the model, then run issues and score again.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { analyse, paintBox, type Issue } from "../../src/system/scene/align";
import { capture, closeBrowser, type Capture } from "./capture";
import { filmGuides, frameFromCapture, ignoresIn, sourcesOf } from "./frame";
import type { ResolvedGuides } from "../../src/system/scene/align";

const ROOT = resolve(import.meta.dir, "..", "..");
const DIR = join(ROOT, "out", "snap", "judge");
const CAPS = join(DIR, "caps"), SHOTS = join(DIR, "shots");
const args = process.argv.slice(2);
const cmd = args[0];
const opt = (k: string) => (args.indexOf(k) >= 0 ? args[args.indexOf(k) + 1] : undefined);
const flag = (k: string) => args.includes(k);
const tag = opt("--tag") ?? "current";
const match = opt("--match") ? new RegExp(opt("--match")!) : null;
mkdirSync(CAPS, { recursive: true });
mkdirSync(SHOTS, { recursive: true });

type Stored = Capture & { ignores: ReturnType<typeof ignoresIn>; pairs: [number, number][] };
const capPath = (id: string) => join(CAPS, `${id}.json.gz`);
export const readCap = (id: string): Stored => JSON.parse(new TextDecoder().decode(Bun.gunzipSync(readFileSync(capPath(id)))));
const storedIds = () => readdirSync(CAPS).filter((f) => f.endsWith(".json.gz")).map((f) => f.slice(0, -8)).filter((id) => !match || match.test(id)).sort();

/** The frames the detector reads: every 0.5 s from the first step, and the last frame; each with the frame before. */
export function restPairs(n: number, fps: number): [number, number][] {
  const step = Math.max(1, Math.round(fps / 2));
  const fs = [...new Set([...Array.from({ length: Math.ceil(n / step) }, (_, i) => i * step), n - 1])].filter((f) => f >= 1);
  return fs.map((f) => [f, f - 1]);
}

export type Row = Issue & {
  film: string; t0: number; t1: number; at: number; frame: number; frames: number;
  elBox: unknown; targetBox: unknown; kinds: string[]; width: number; height: number; system: string | null;
};

/** The model's issues for one stored capture, merged over time (as scripts/snap/detect_align.ts merges them). */
export function rowsOf(id: string, cap: Stored, guides: ResolvedGuides | null = null): Row[] {
  const by = new Map<string, Row>();
  for (const [f, p] of cap.pairs) {
    const fr = frameFromCapture(cap, f, p, cap.ignores, guides);
    if (fr.els.length < 2) continue;
    const a = analyse(fr);
    for (const i of a.issues) {
      if (i.via) continue;
      const key = `${i.kind}|${i.el}|${i.feature}|${i.target.el}|${i.target.feature}|${i.axis}`;
      const t = f / cap.fps;
      const el = (x: string) => fr.els.find((e) => e.id === x);
      const row: Row = { ...i, film: id, t0: t, t1: t, at: t, frame: f, frames: 1, elBox: el(i.el) ? paintBox(el(i.el)!) : null,
        targetBox: el(i.target.el) ? paintBox(el(i.target.el)!) : null, kinds: [el(i.el)?.kind ?? "guide", el(i.target.el)?.kind ?? "guide"],
        width: cap.width, height: cap.height, system: cap.system };
      const prev = by.get(key);
      if (!prev) { by.set(key, row); continue; }
      prev.t1 = t; prev.frames++;
      if (i.confidence > prev.confidence) by.set(key, { ...row, t0: prev.t0, frames: prev.frames });
    }
  }
  return [...by.values()].sort((a, b) => b.confidence - a.confidence || a.t0 - b.t0);
}

if (cmd === "capture") {
  const mod = resolve(opt("--films")!);
  const { FILMS } = await import(mod);
  const only = opt("--only")?.split(",");
  const ids = Object.keys(FILMS).filter((id) => (!only || only.includes(id)) && (!match || match.test(id)));
  let done = 0;
  for (const id of ids) {
    if (existsSync(capPath(id)) && !flag("--force")) continue;
    const e = FILMS[id];
    const pairs = restPairs(e.durationInFrames, e.fps);
    try {
      const cap = await capture(mod, id, pairs.flat());
      const stored: Stored = { ...cap, module: relative(ROOT, mod), ignores: ignoresIn(sourcesOf(mod, id)), pairs };
      writeFileSync(capPath(id), Bun.gzipSync(new TextEncoder().encode(JSON.stringify(stored))));
      done++;
      console.log(`${id}: ${pairs.length} frames`);
    } catch (err) { console.error(`${id}: ${(err as Error).message.split("\n")[0]}`); }
  }
  await closeBrowser();
  console.log(`captured ${done} film(s) to ${relative(ROOT, CAPS)}`);
}

if (cmd === "issues") {
  // --with-detector <regex>: the films whose detector pass is fresh (the detector ran on them in this round).
  const withDet = opt("--with-detector") ? new RegExp(opt("--with-detector")!) : null;
  const all: Row[] = [];
  for (const id of storedIds()) {
    const cap = readCap(id);
    const rows = rowsOf(id, cap, await filmGuides(join(ROOT, cap.module), id, cap));
    all.push(...rows);
    // --with-detector: add the rows that only the detector's pass reports (out/detector/<id>/align.json: elements
    // from the recording, every 0.5 s), so the judged set holds every finding a check prints.
    const dp = join(ROOT, "out", "detector", id, "align.json");
    if (withDet && withDet.test(id) && existsSync(dp)) {
      const have = new Set(rows.map((r) => `${r.kind}|${r.el}|${r.feature}|${r.target.el}|${r.target.feature}|${r.axis}`));
      for (const i of JSON.parse(readFileSync(dp, "utf8")).issues as (Row & { at: number })[]) {
        if (i.via || have.has(`${i.kind}|${i.el}|${i.feature}|${i.target.el}|${i.target.feature}|${i.axis}`)) continue;
        all.push({ ...i, film: id, frame: Math.round(i.at * cap.fps), width: cap.width, height: cap.height, system: cap.system, path: "detector" } as Row);
      }
    }
  }
  writeFileSync(join(DIR, `issues-${tag}.json`), JSON.stringify(all));
  const n = (l: string) => all.filter((r) => r.level === l && !r.ignored).length;
  console.log(`${storedIds().length} film(s): ${n("error")} error(s), ${n("warning")} warning(s), ${n("advice")} advice -> ${relative(ROOT, join(DIR, `issues-${tag}.json`))}`);
}

if (cmd === "shots") {
  const rows: Row[] = JSON.parse(readFileSync(join(DIR, `issues-${tag}.json`), "utf8"));
  const want = new Map<string, Set<number>>();
  for (const r of rows) {
    if (r.ignored || (!flag("--all-levels") && r.level === "advice") || (match && !match.test(r.film))) continue;
    if (!want.has(r.film)) want.set(r.film, new Set());
    want.get(r.film)!.add(r.frame);
  }
  for (const [id, fs] of want) {
    const need = [...fs].filter((f) => !existsSync(join(SHOTS, `${id}-${f}.png`)));
    if (!need.length) continue;
    const cap = readCap(id);
    try {
      await capture(resolve(ROOT, cap.module), id, need, { shots: Object.fromEntries(need.map((f) => [f, join(SHOTS, `${id}-${f}.png`)])) });
      console.log(`${id}: ${need.length} shot(s)`);
    } catch (err) { console.error(`${id}: ${(err as Error).message.split("\n")[0]}`); }
  }
  await closeBrowser();
}

if (cmd === "score") {
  const { score } = await import("./score");
  score(join(DIR, `issues-${tag}.json`), opt("--labels") ?? join(ROOT, "out", "snap", "survey", "judged.json"), flag("--json"));
}
