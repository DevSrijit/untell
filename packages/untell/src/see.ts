// `untell see <video>`: give a model a video. A model cannot watch a film, so untell measures it (measures.ts) and
// writes what a model reads: see.json (one versioned document, sized for a context window), contact sheets in pages
// (8 to 12 frames each, about 1500 px on the long side, each frame with its time), and a short text on stdout.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { UsageError } from "./errors";
import { registryDir } from "./kit";
import { fitBudget, measureVideo, probeVideo, seeDocument, type SeeDoc, type VideoMeasures } from "./measures";

export const DEFAULT_BUDGET = 6000;

export type SeeOptions = { json?: boolean; out?: string; budget?: string; theme?: string; system?: string };

/** The folder of a file's output: .untell/see/<file name>/ in the project, unless --out names one. */
export function seeDir(cwd: string, file: string, out?: string): string {
  if (out) return resolve(cwd, out);
  const slug = basename(file).replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "film";
  return join(cwd, ".untell", "see", slug);
}

/** --budget: a whole number of tokens, 1000 or more. */
export function parseBudget(v: string | undefined): number {
  if (v === undefined) return DEFAULT_BUDGET;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1000) throw new UsageError(`--budget takes a whole number of tokens, 1000 or more, not "${v}".`, "see");
  return n;
}

const fmt = (v: number, n = 1) => v.toFixed(n);
const pct = (v: number) => `${Math.round(v * 100)} %`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** The text on stdout: what the file is, the timeline, then where the pictures and the JSON are. Pure. */
export function seeSummary(m: VideoMeasures, fit: { tokens: number; dropped: string[]; fits: boolean }, budget: number, json: string, cwd: string): string {
  const f = m.file, p = m.picture, s = m.sound;
  const show = (x: string) => { const r = relative(cwd, x); return !r || r.startsWith("..") ? x : r; };
  const L: string[] = [];
  const mbit = f.kbps ? `${fmt(f.kbps / 1000)} Mbit/s` : "bitrate unknown";
  L.push(`untell see  ${f.path}`);
  L.push(`file      ${fmt(f.seconds)} s · ${f.width} × ${f.height} (${f.aspect}) · ${+f.fps.toFixed(3)} fps · ${f.video.codec} · ${mbit}${f.rotation ? ` · turned ${f.rotation}°` : ""}`);
  if (s) {
    const tempo = s.tempo && Number.isFinite(s.tempo.bpm) ? `${Math.round(s.tempo.bpm)} BPM (${s.tempo.confidence} trust)` : "tempo not measured";
    const level = s.lufsIntegrated === null ? "no measured loudness (silent)" : `${s.lufsIntegrated} LUFS · true peak ${s.truePeakDb ?? "none"} dBTP · range ${s.loudnessRange ?? "?"} LU`;
    L.push(`sound     ${f.audio?.codec ?? "?"} · ${level} · ${plural(s.onsets.length, "onset")} · ${tempo}`
      + (s.silent.length ? ` · silent ${s.silent.map(([a, b]) => `${fmt(a)}-${fmt(b)}`).slice(0, 3).join(", ")}${s.silent.length > 3 ? " ..." : ""}` : ""));
  } else L.push(`sound     none: ${m.why.sound ?? "no audio stream"}`);
  const lens = p.shots.map((x) => x.to - x.from);
  const soft = p.shots.filter((x) => x.by !== "cut" && x.by !== "start").length;
  L.push(`pace      ${plural(p.shots.length, "shot")}${soft ? ` (${soft} after a soft change)` : ""} · mean ${fmt(lens.reduce((a, b) => a + b, 0) / Math.max(1, lens.length))} s · shortest ${fmt(Math.min(...lens), 2)} s · still ${pct(p.stillShare)} of the time (${plural(p.stalls.length, "stall")} over 1 s)`);
  const fs = p.firstSecond;
  L.push(`opens     ${fs.blankStart ? "on a blank frame" : `with ink on ${pct(fs.inkShare)} of the frame`} · first change at ${fs.firstChangeAt ?? "-"} s · ${fs.motion} motion in the first second${fs.textLike ? " · text-size detail" : ""}`);
  L.push(`colour    ${p.film.palette.slice(0, 4).map(([h, sh]) => `${h} ${pct(sh)}`).join(", ")} · brightness ${p.film.brightness} · ${p.film.polarity}`);
  L.push(`text      text-size detail ${pct(p.text.share)} of the time, in ${plural(p.text.shots, "shot")}${p.text.ocr ? ` · words read by ${p.text.ocr.tool}` : " · words not read (no OCR tool)"}`);
  L.push("");
  L.push("timeline");
  const MAX = 24;
  const words = (x: { text?: { words?: string | null } }) => (x.text?.words ? `  "${x.text.words.slice(0, 60)}${x.text.words.length > 60 ? "..." : ""}"` : "");
  for (const sh of p.shots.slice(0, MAX)) {
    const colour = sh.palette[0]?.[0] ?? sh.ground;
    L.push(`  ${fmt(sh.from).padStart(6)}-${fmt(sh.to).padEnd(6)} ${(sh.by === "cut" || sh.by === "start" ? "" : sh.by).padEnd(5)} ${sh.motion.level.padEnd(6)} ${sh.brightness < 0.35 ? "dark " : sh.brightness > 0.65 ? "light" : "mid  "} ${colour}${words(sh)}`);
  }
  if (p.shots.length > MAX) L.push(`  ... ${plural(p.shots.length - MAX, "more shot")} in see.json`);
  L.push("");
  const fi = m.findings;
  if (fi) {
    const head = fi.errors + fi.warnings + fi.advice ? `${plural(fi.errors, "error")}, ${plural(fi.warnings, "warning")}${fi.advice ? `, ${fi.advice} advice` : ""}` : "none";
    L.push(`findings  ${head} from ${fi.ran.length} rules that need only the file${fi.causes.length ? `: ${fi.causes.slice(0, 4).map((c) => `${c.check} ${fmt(c.from)}-${fmt(c.to)} s`).join("; ")}` : ""}`);
    if (fi.causes.length) L.push(`          untell check ${f.path} prints each fix`);
  } else L.push(`findings  not run: ${m.why.findings ?? "-"}`);
  L.push(`pictures  ${plural(m.pages.length, "page")}, each frame with its time; open them as images, in order:`);
  for (const pg of m.pages) L.push(`          ${show(pg.file)}  ${fmt(pg.from)}-${fmt(pg.to)} s, ${pg.frames} frames`);
  L.push(`json      ${show(json)}  about ${fit.tokens} tokens of ${budget} (${fit.fits ? "fits" : "over: the smallest form"})`);
  if (fit.dropped.length) L.push(`dropped   to fit: ${fit.dropped.join("; ")}`);
  return L.join("\n");
}

/** `untell see <video>`. Returns the exit code: 0 written, 2 wrong use or a missing tool. */
export async function see(cwdArg: string, videoArg: string | undefined, o: SeeOptions = {}): Promise<number> {
  const cwd = resolve(cwdArg);
  if (!videoArg) throw new UsageError("untell see needs a video file: untell see <video>", "see");
  const budget = parseBudget(o.budget);
  if (o.theme && !["dark", "light"].includes(o.theme)) throw new UsageError(`--theme is dark or light, not "${o.theme}".`, "see");
  const facts = probeVideo(resolve(cwd, videoArg));
  const outDir = seeDir(cwd, facts.path, o.out);
  mkdirSync(outDir, { recursive: true });
  const log = (s: string) => console.error(s);
  const m = await measureVideo(cwd, facts.path, { outDir, theme: o.theme ?? process.env.UNTELL_THEME, system: o.system, log });
  const pkg = JSON.parse(readFileSync(join(registryDir(), "..", "package.json"), "utf8")) as { version: string };
  const full: SeeDoc = seeDocument(m, pkg.version);
  const fit = fitBudget(full, budget);
  const json = join(outDir, "see.json");
  writeFileSync(json, fit.text);
  if (o.json) { process.stdout.write(fit.text); return 0; }
  console.log(seeSummary(m, fit, budget, json, cwd));
  const t = m.timings;
  console.error(`time      ${fmt(t.total ?? 0)} s: picture ${fmt(t.picture ?? 0)} s and rules ${fmt(t.findings ?? 0)} s side by side, sound ${fmt(t.sound ?? 0)} s, pages ${fmt(t.sheets ?? 0)} s${t.picture === 0 ? " (the measures and the findings of the last run of this file)" : ""}`);
  return existsSync(json) ? 0 : 1;
}
