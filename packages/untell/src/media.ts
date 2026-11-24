// `untell media`: the tools for media that the user or an agent brings. untell does not find media and does
// not say where to find it. It takes a file or a URL, keeps it in the project, prepares it for a design
// system and lists it in the media table that the photo, music and hit blocks read.
//
//   untell media setup                      Python (.venv-media), rembg and the cut-out model
//   untell media formats                    the formats and sizes untell takes (docs/MEDIA.md is the full spec)
//   untell media add <file|URL> --as <name> [--kind photo|video|music|sfx] [--source <text>] [--licence <text>]
//   untell media prepare <name> --system <id> [--as-is] [--no-cutout] [--keep-holes] [--height <px>]
//   untell media beats <name>               tempo, beat times, energy bar by bar, entry points
//   untell media measure <name>             a sound's length and peak
//   untell media remove <name> | list | table
//
// Every command writes into the project (paths in media-paths.ts), never into the package. The Python
// scripts ship in the package (registry/tools) and run with the project's .venv-media.
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import type { Framework } from "./detect";
import { readTokens, systemsDir } from "./build";
import { registryDir } from "./kit";
import { checkName, extOfUrl, kindOfExt, mediaPaths, MUSIC_MIN_SECONDS, storedExt, type MediaKind, type MediaPaths } from "./media-paths";
import { readManifest, readMetas, updateManifest, writeMusicTable, writeTable, type ManifestEntry, type Meta } from "./media-store";
import { listenState } from "./listen";
import { ensureDetectorPython, listenPython, MODEL, modelPath, runHyperframes } from "./env";
import { gltfBounds, gltfJson, packGlb } from "../../../src/system/three/model";
import { artBounds, parseMarkSvg } from "../../../src/system/scene/markArt";
import { silhouetteOfGlb } from "../../../src/system/three/silhouette";

export type MediaArgs = { positional: string[]; opt: (name: string) => string | undefined; flag: (name: string) => boolean };

const log = (s: string) => console.log(s);
const tool = (name: string) => join(registryDir(), "tools", name);
const venvPython = (project: string) => join(project, ".venv-media", "bin", "python");

export function mediaSetup(projectArg: string): number {
  const project = resolve(projectArg);
  const run = (cmd: string, args: string[]) => spawnSync(cmd, args, { cwd: project, stdio: "inherit" }).status === 0;
  if (spawnSync("uv", ["--version"], { encoding: "utf8" }).status !== 0) {
    log("untell media setup needs uv: https://docs.astral.sh/uv/getting-started/installation/");
    return 1;
  }
  const py = venvPython(project);
  if (!existsSync(py) && !run("uv", ["venv", "-q", ".venv-media", "--python", "3.12"])) return 1;
  // scipy: the cut-out cleanup (media_cut.py) and the detector's checks use it.
  if (!run("uv", ["pip", "install", "-q", "--python", py, "rembg[cpu]", "pillow", "numpy", "scipy"])) return 1;
  // Download the model now, so the first cut-out does not stall on it.
  if (!run(py, ["-c", "from rembg import new_session; new_session('birefnet-general-lite'); print('media tools ready: rembg + BiRefNet')"])) return 1;
  const missing = ["ffmpeg", "ffprobe"].filter((t) => !has(t));
  if (missing.length) log(`Also install ${missing.join(" and ")} (https://ffmpeg.org): footage, beats and sound measuring need them.`);
  return 0;
}

/**
 * The Python tools that a photo needs, set up once when they are missing: the grade needs numpy and Pillow; the
 * cut-out also needs rembg and its model. It says what it fetches and its size first.
 */
function ensurePhotoTools(project: string, cutout: boolean) {
  const py = venvPython(project);
  if (!cutout) {
    if (!(existsSync(py) && pyFinds(py, ["numpy", "PIL"])) && !ensureDetectorPython(project, log, { venv: true })?.venv) throw new Error("the grade needs a .venv-media with numpy and Pillow, and untell could not make one. Install uv (https://docs.astral.sh/uv/) or Python 3.10 or later, then run: untell media setup");
    return;
  }
  // Installed means found, not imported: importing rembg loads onnxruntime and can take longer than the check's
  // timeout, which said "installs them now" on every run (an agent's case).
  if (existsSync(py) && pyFinds(py, ["rembg", "scipy"]) && existsSync(modelPath())) return;
  log(`untell media prepare: the cut-out needs rembg and the ${MODEL} model (about 300 MB to download, once). untell installs them into .venv-media now...`);
  if (mediaSetup(project) !== 0) throw new Error("the cut-out tools are not set up. Install uv (https://docs.astral.sh/uv/), then run: untell media setup. Or prepare the photo without a cut-out: --no-cutout");
}

/** True when the Python finds each module (installed), without importing it. */
function pyFinds(py: string, modules: string[]): boolean {
  const r = spawnSync(py, ["-c", `import importlib.util, sys; sys.exit(0 if all(importlib.util.find_spec(m) for m in ${JSON.stringify(modules)}) else 1)`], { encoding: "utf8", timeout: 30000 });
  return !r.error && r.status === 0;
}

const has = (cmd: string) => spawnSync(cmd, ["-version"], { encoding: "utf8" }).status === 0;
function need(cmd: string, what: string) {
  if (!has(cmd)) throw new Error(`${what} needs ${cmd}, and it is not on PATH. Install ffmpeg (https://ffmpeg.org), which includes ffprobe.`);
}
function needPython(project: string): string {
  const py = venvPython(project);
  if (!existsSync(py)) throw new Error("the media tools are not set up in this project (no .venv-media). Run: untell media setup");
  return py;
}

/** A local HyperFrames CLI: --hyperframes, UNTELL_HYPERFRAMES, then the project's node_modules. Never a download. */
export function localHyperframes(project: string, flag?: string): string | null {
  const bin = flag ?? process.env.UNTELL_HYPERFRAMES ?? join(project, "node_modules/.bin/hyperframes");
  return existsSync(bin) ? bin : null;
}

function py(project: string, args: string[], env: Record<string, string> = {}, capture = false, python?: string) {
  const r = spawnSync(python ?? needPython(project), args, { cwd: project, encoding: "utf8", maxBuffer: 256 << 20, stdio: capture ? "pipe" : "inherit",
    env: { ...process.env, UNTELL_SYSTEMS: systemsDir(project), ...env } });
  if (r.status !== 0) throw new Error(`${basename(args[0]!)} failed${capture ? `: ${(r.stderr ?? "").trim().split("\n").slice(-3).join(" ")}` : ""}`);
  return r.stdout ?? "";
}

type Probe = { width?: number; height?: number; fps?: number; duration?: number; codec?: string; alpha?: boolean; sampleRate?: number; channels?: number };
/** What ffprobe says about a file, or null without ffprobe. */
export function probe(file: string): Probe | null {
  if (!has("ffprobe")) return null;
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate,pix_fmt,sample_rate,channels:format=duration", "-of", "json", file], { encoding: "utf8" });
  if (r.status !== 0) return null;
  const j = JSON.parse(r.stdout) as { streams?: Record<string, string | number>[]; format?: { duration?: string } };
  const v = j.streams?.find((s) => s.codec_type === "video"), a = j.streams?.find((s) => s.codec_type === "audio");
  const [n, d] = String(v?.r_frame_rate ?? "0/1").split("/").map(Number);
  return {
    ...(v ? { width: Number(v.width), height: Number(v.height), codec: String(v.codec_name), fps: d ? n! / d : undefined, alpha: /^(rgba|bgra|argb|abgr|ya|yuva|pal8)/.test(String(v.pix_fmt ?? "")) } : {}),
    ...(a ? { sampleRate: Number(a.sample_rate), channels: Number(a.channels), ...(v ? {} : { codec: String(a.codec_name) }) } : {}),
    ...(j.format?.duration ? { duration: Number(j.format.duration) } : {}),
  };
}

/** Copies a file, or downloads a URL, into `dir` as source.<ext>. Returns the stored file name. */
async function bring(src: string, dir: string): Promise<{ file: string; ext: string }> {
  if (/^https?:\/\//i.test(src)) {
    const r = await fetch(src, { redirect: "follow", headers: { "User-Agent": "untell-media" } });
    if (!r.ok) throw new Error(`download failed: HTTP ${r.status}`);
    const ext = extOfUrl(src, r.headers.get("content-type"));
    if (!ext) throw new Error(`the URL gives no file type untell takes (content type ${r.headers.get("content-type") ?? "none"}). Run untell media formats.`);
    mkdirSync(dir, { recursive: true });
    const file = `source${storedExt(ext)}`;
    writeFileSync(join(dir, file), Buffer.from(await r.arrayBuffer()));
    return { file, ext };
  }
  const path = resolve(src);
  if (!existsSync(path)) throw new Error(`no file ${src}`);
  const ext = extname(path);
  if (!kindOfExt(ext)) throw new Error(`untell does not take ${ext || "files without an extension"}. Run untell media formats.`);
  mkdirSync(dir, { recursive: true });
  const file = `source${storedExt(ext)}`;
  copyFileSync(path, join(dir, file));
  return { file, ext };
}

/**
 * Measures a sound with ffmpeg alone (no Python, no HyperFrames): its length, the time of its loudest 10 ms, its
 * integrated loudness (LUFS) and its peak (dBFS: the true peak over its louder channel). The same numbers as
 * kit-extra/media_sound.py measure: mono at 22050 Hz for the RMS of each 10 ms, the ebur128 meter for the loudness and
 * the true peak. Pure apart from ffmpeg, for the tests.
 */
/**
 * The attacks of a sound, seconds into it: peaks of its 10 ms level within 6 dB of its loudest, each 40 ms or more from
 * the one before and with a dip of 6 dB between them (the detector's measure, sound_checks.transients). An effect with
 * two or more reads as two hits; `hit` plays the first by default.
 */
export function attacksOf(x: Float32Array, rate: number): number[] {
  const hop = Math.round(rate * 0.01), d: number[] = [];
  for (let i = 0; i + hop < x.length; i += hop) { let e = 0; for (let k = i; k < i + hop; k++) e += x[k]! * x[k]!; d.push(20 * Math.log10(Math.sqrt(e / hop) + 1e-9)); }
  const top = Math.max(...d), out: number[] = [];
  for (let i = 1; i < d.length - 1; i++) {
    if (!(d[i]! >= d[i - 1]! && d[i]! >= d[i + 1]! && d[i]! > top - 6)) continue;
    const prev = out[out.length - 1];
    if (prev !== undefined && ((i - prev) * 0.01 < 0.04 || Math.min(...d.slice(prev, i + 1)) > Math.min(d[prev]!, d[i]!) - 6)) { if (d[i]! > d[prev]!) out[out.length - 1] = i; continue; }
    out.push(i);
  }
  return out.map((i) => Math.round(i) / 100);
}

/** The octave bands of the masking measure (sound_checks.NAMED_BANDS), Hz. */
const BANDS: [number, number][] = [[60, 120], [120, 250], [250, 500], [500, 1000], [1000, 2000], [2000, 4000], [4000, 8000], [8000, 16000]];
/**
 * The energy in each octave band (dB) of the 0.1 s at time t, at 44.1 kHz: the detector's measure (sound_checks.bands_of
 * and fx_bands, a Hann window and the power of each bin), so `hit` sets its duck by the band where the bed covers it.
 */
export function bandsAt(x: Float32Array, rate: number, t: number): number[] {
  const w = Math.round(0.1 * rate), p = Math.floor(t * rate);
  const seg = x.subarray(Math.max(0, p - (w >> 1)), Math.max(0, p + (w >> 1)));
  const n = seg.length;
  if (n < 64) return BANDS.map(() => -120);
  const win = new Float64Array(n);
  for (let i = 0; i < n; i++) win[i] = seg[i]! * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  const sums = BANDS.map(() => 0);
  const top = Math.min(Math.floor(n / 2), Math.ceil((16000 * n) / rate));
  for (let k = 0; k <= top; k++) {
    const f = (k * rate) / n, b = BANDS.findIndex(([lo, hi]) => f >= lo && f < hi);
    if (b < 0) continue;
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) { const a = (2 * Math.PI * k * i) / n; re += win[i]! * Math.cos(a); im -= win[i]! * Math.sin(a); }
    sums[b]! += re * re + im * im;
  }
  return sums.map((e) => Math.round(10 * Math.log10(e + 1e-12) * 10) / 10);
}

/**
 * An effect's rise: seconds from the first 10 ms within 10 dB of its loudest 10 ms to that loudest 10 ms (the
 * detector's measure, sound_checks.fx_rise). A click rises in a few ms; a swell or a riser in a quarter second or more.
 */
export function riseOf(x: Float32Array, rate: number): number {
  const hop = Math.round(rate * 0.01), d: number[] = [];
  for (let i = 0; i + hop < x.length; i += hop) { let e = 0; for (let k = i; k < i + hop; k++) e += x[k]! * x[k]!; d.push(20 * Math.log10(Math.sqrt(e / hop) + 1e-9)); }
  if (!d.length) return 0;
  const pk = d.indexOf(Math.max(...d));
  return Math.round((pk - d.findIndex((v) => v >= d[pk]! - 10)) * 10) / 1000;
}

export function measureFile(file: string): { duration: number; peak: number; lufs: number | null; peakDb: number; level?: "integrated" | "momentary"; attacks?: number[]; bands?: number[]; rise?: number; lead?: number } {
  const RATE = 22050, hop = RATE / 100 | 0;
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-ac", "1", "-ar", String(RATE), "-f", "f32le", "-"], { maxBuffer: 1 << 30 });
  if (r.error) throw new Error("measuring a sound needs ffmpeg, and it is not on PATH. Install ffmpeg (https://ffmpeg.org).");
  if (r.status !== 0) throw new Error(`ffmpeg cannot read ${basename(file)}: ${String(r.stderr ?? "").trim().split("\n")[0]}`);
  // A decode error is a damaged file, though ffmpeg exits 0 and the header still gives a length: a truncated FLAC
  // was added with the duration its header claimed. The add fails, with ffmpeg's own line.
  const bad = String(r.stderr ?? "").split("\n").find((l) => /decod\w* (error|failed)|invalid data|invalid residual|truncat|corrupt|error while decoding/i.test(l));
  if (bad) throw new Error(`${basename(file)} does not decode cleanly, so it is damaged or cut short (ffmpeg: ${bad.replace(/^\[[^\]]*\]\s*/g, "").replace(/^\[[^\]]*\]\s*/g, "").trim()}). Download it again, or convert it from its original.`);
  const buf = r.stdout as Buffer;
  const x = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
  let best = -1, at = 0, top = 0;
  for (let k = 0; (k + 1) * hop <= x.length; k++) {
    let e = 0;
    for (let i = k * hop; i < (k + 1) * hop; i++) e += x[i]! * x[i]!;
    if (e > best) { best = e; at = k; }
  }
  for (let i = 0; i < x.length; i++) top = Math.max(top, Math.abs(x[i]!));
  // A short sound gets 0.5 s of silence after it, so the meter fills its 400 ms window over the sound's own end.
  const short = x.length / RATE < SHORT_SOUND;
  const l = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", short ? "apad=pad_dur=0.5,ebur128=peak=true" : "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 64 << 20 });
  const m = [...(l.stderr ?? "").matchAll(/I:\s+(-?\d+(?:\.\d+)?) LUFS/g)];
  const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
  // The peak is the file's true peak over its louder channel (ebur128's summary): a mono fold at a low rate read a
  // stereo click 2.5 dB under the peak that the mix plays, and hit's level then passed the music's peak.
  const tp = (l.stderr ?? "").match(/True peak:\s*\n\s*Peak:\s*(-?\d+(?:\.\d+)?) dBFS/);
  // The mono fold above adds the two channels of a stereo file, so its sample peak is not the file's: a track whose
  // true peak is -0.84 dBTP read +2.0 dBFS there. The true peak alone is the number (the fold's peak only when the
  // meter gives none).
  const duration = round(x.length / RATE, 3), peakDb = round(tp ? Number(tp[1]) : 20 * Math.log10(Math.max(top, 1e-9)), 1);
  // A short effect: the integrated loudness is gated over 3 s and reads about -70 LUFS for a click. Its level is its
  // loudest 400 ms (the momentary loudness), the level that hit and typing set against the bed.
  if (short) {
    const mom = [...(l.stderr ?? "").matchAll(/ M:\s*(-?\d+(?:\.\d+)?)/g)].map((v) => Number(v[1])).filter((v) => v > -70);
    const peak = round(((at + 0.5) * hop) / RATE, 3);
    // The bands at the peak, at the detector's rate.
    const hi = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-ac", "1", "-ar", "44100", "-f", "f32le", "-"], { maxBuffer: 1 << 30 });
    const hb = hi.status === 0 ? (hi.stdout as Buffer) : null;
    const bands = hb ? bandsAt(new Float32Array(hb.buffer, hb.byteOffset, Math.floor(hb.byteLength / 4)), 44100, peak) : undefined;
    return { duration, peak, lufs: mom.length ? round(Math.max(...mom), 1) : round(peakDb - 14, 1), peakDb, level: "momentary", attacks: attacksOf(x, RATE), rise: riseOf(x, RATE), ...(bands ? { bands } : {}) };
  }
  // Digital silence at the start (every sample under -72 dBFS, as the render's digital-silence rule reads it): music()
  // enters after it.
  let first = 0;
  while (first < x.length && Math.abs(x[first]!) < 8 / 32768) first++;
  return { duration, peak: round(((at + 0.5) * hop) / RATE, 3), lufs: m.length ? Number(m.at(-1)![1]) : null, peakDb, level: "integrated", lead: round(first / RATE, 3) };
}

/** Under this length a sound is an effect: its level is its loudest 400 ms, not a whole-file loudness. */
export const SHORT_SOUND = 3;

/** Measures a sound into its meta.json (see measureFile). */
function measureSound(project: string, p: MediaPaths, name: string, entry: ManifestEntry, _hfFlag?: string) {
  const file = join(p.media, name, entry.file);
  const m = measureFile(file);
  writeFileSync(join(p.media, name, "meta.json"), JSON.stringify({ kind: entry.kind, file: entry.file, ...m, ...(entry.role ? { role: entry.role } : {}) }, null, 1) + "\n");
  log(m.level === "momentary"
    ? `${name}: an effect of ${m.duration.toFixed(2)} s, peak at ${m.peak.toFixed(3)} s, true peak ${m.peakDb} dBTP; its loudest 400 ms at ${m.lufs} LUFS (measured with ffmpeg; a whole-file loudness needs ${SHORT_SOUND} s or more)`
    : `${name}: ${m.duration.toFixed(2)} s, loudest at ${m.peak.toFixed(3)} s${m.lufs !== null ? `, ${m.lufs} LUFS` : ""}, true peak ${m.peakDb} dBTP (measured with ffmpeg)`);
  if (entry.kind === "music" && (m.lead ?? 0) >= 0.05)
    log(`  note: ${name} opens with ${m.lead!.toFixed(2)} s of digital silence. music() enters where the sound starts (skipSilence: false keeps an entry inside it); a drop placed so the bed enters inside it leaves the film silent there, and the build says so.`);
  if (m.attacks && m.attacks.length > 1)
    log(`${name}: it has ${m.attacks.length} attacks (at ${m.attacks.map((a) => a.toFixed(2)).join(", ")} s), so it reads as more than one hit. hit plays the first by default (part [0, ${(m.attacks[1]! - 0.02).toFixed(2)}]); to play another, give hit part: [from, until] in seconds into the file.`);
}

function entryOf(p: MediaPaths, name: string): ManifestEntry {
  const e = readManifest(p)[checkName(name)];
  if (!e) throw new Error(`no asset "${name}" in untell-media.json. Run untell media list.`);
  return e;
}

async function add(project: string, p: MediaPaths, a: MediaArgs) {
  const src = a.positional[0];
  if (!src) throw new Error("usage: untell media add <file or URL> --as <name> [--kind photo|video|music|sfx] [--source <text>] [--licence <text>]");
  const name = checkName(a.opt("--as"));
  const given = a.opt("--kind");
  if (given && !["photo", "video", "music", "sfx", "model", "mark"].includes(given)) throw new Error(`--kind is photo, video, music, sfx, model or mark, not ${given}`);
  const dir = join(p.media, name);
  if (readManifest(p)[name] && !a.flag("--force")) throw new Error(`"${name}" is already here. Give --force to replace it, or choose another name.`);
  // Bring the file into a new folder first: a failed copy or download leaves the old asset as it was.
  const incoming = join(p.media, `.incoming-${name}-${process.pid}`);
  rmSync(incoming, { recursive: true, force: true });
  let file: string, ext: string;
  try { ({ file, ext } = await bring(src, incoming)); } catch (e) { rmSync(incoming, { recursive: true, force: true }); throw e; }
  const found = kindOfExt(ext);
  if (found === "model") {
    if (given && given !== "model") { rmSync(incoming, { recursive: true, force: true }); throw new Error(`${ext} is a 3D model, not ${given}`); }
    try { prepareModel(join(incoming, file), /^https?:/i.test(src) ? null : dirname(resolve(src)), name); } catch (e) { rmSync(incoming, { recursive: true, force: true }); throw e; }
    if (file.endsWith(".glb")) rmSync(join(incoming, file), { force: true }); // model.glb is the same file
    rmSync(dir, { recursive: true, force: true });
    renameSync(incoming, dir);
    const entry: ManifestEntry = { kind: "model", file: file.endsWith(".glb") ? "model.glb" : file, original: /^https?:/i.test(src) ? src : basename(src), added: new Date().toISOString(),
      ...(a.opt("--source") ? { source: a.opt("--source")! } : {}), ...(a.opt("--licence") ? { licence: a.opt("--licence")! } : {}) };
    updateManifest(p, (m) => { m[name] = entry; });
    writeTable(p);
    log(`added ${name} (model): ${p.mediaRel}/${name}/model.glb. A 3D scene can use it now: model("${name}", { height: <units> }) from ${p.kit}/three/models.ts (bounds in ${p.kit}/media.gen.ts, MODELS)`);
    return;
  }
  if (found === "mark") {
    // A mark: the SVG is parsed once here (scene/markArt.ts states the format), and its paths go into the marks table.
    if (given && given !== "mark") { rmSync(incoming, { recursive: true, force: true }); throw new Error(`${ext} is a mark (SVG), not ${given}`); }
    let art;
    try { art = parseMarkSvg(readFileSync(join(incoming, file), "utf8")); } catch (e) { rmSync(incoming, { recursive: true, force: true }); throw new Error(`${basename(src)}: ${(e as Error).message}`); }
    if (file !== "mark.svg") renameSync(join(incoming, file), join(incoming, "mark.svg"));
    writeFileSync(join(incoming, "meta.json"), JSON.stringify({ kind: "mark", file: "mark.svg", art }, null, 1) + "\n");
    rmSync(dir, { recursive: true, force: true });
    renameSync(incoming, dir);
    const entry: ManifestEntry = { kind: "mark", file: "mark.svg", original: /^https?:/i.test(src) ? src : basename(src), added: new Date().toISOString(),
      ...(a.opt("--source") ? { source: a.opt("--source")! } : {}), ...(a.opt("--licence") ? { licence: a.opt("--licence")! } : {}) };
    updateManifest(p, (m) => { m[name] = entry; });
    writeTable(p);
    const b = artBounds(art);
    log(`added ${name} (mark): ${art.paths.length} path(s), drawn box ${b.w.toFixed(1)} x ${b.h.toFixed(1)} (file units). The drawnMark block can use it now: mark: "${name}" (paths in ${p.kit}/marks.gen.ts)`);
    return;
  }
  const info = probe(join(incoming, file));
  // Every refusal comes before the asset moves in, and a failure after it puts the folder and the manifest back as
  // they were: a failed add never leaves an entry (an agent once removed a damaged entry by hand).
  const refuse = (m: string): never => { rmSync(incoming, { recursive: true, force: true }); throw new Error(m); };
  let kind: MediaKind;
  if (found === "audio") {
    if (given && given !== "music" && given !== "sfx") refuse(`${ext} is a sound: --kind music or sfx`);
    kind = (given as MediaKind | undefined) ?? (info?.duration !== undefined && info.duration >= MUSIC_MIN_SECONDS ? "music" : "sfx");
    if (!given) log(`  ${name} is ${info?.duration?.toFixed(1) ?? "?"} s long, so untell takes it as ${kind}. Give --kind to choose.`);
  } else {
    if (given && given !== found) refuse(`${ext} is a ${found}, not ${given}`);
    kind = found!;
  }
  const role = a.opt("--role");
  if (role !== undefined && (role !== "lead-in" || kind !== "sfx")) refuse(`--role takes "lead-in", for an effect (--kind sfx) that leads into its change (a whoosh on a motion), not ${role}`);
  for (const w of warnings(kind, info)) log(`  note: ${w}`);
  const before = readManifest(p)[name];
  const old = existsSync(dir) ? `${dir}.old-${process.pid}` : null;
  if (old) renameSync(dir, old);
  renameSync(incoming, dir);
  const entry: ManifestEntry = { kind, file, original: /^https?:/i.test(src) ? src : basename(src), added: new Date().toISOString(),
    ...(a.opt("--source") ? { source: a.opt("--source")! } : {}), ...(a.opt("--licence") ? { licence: a.opt("--licence")! } : {}), ...(role ? { role: "lead-in" as const } : {}) };
  try {
    updateManifest(p, (m) => { m[name] = entry; });
    if (kind === "music" || kind === "sfx") measureSound(project, p, name, entry, a.opt("--hyperframes"));
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    if (old) renameSync(old, dir);
    updateManifest(p, (m) => { if (before) m[name] = before; else delete m[name]; });
    writeTable(p);
    throw new Error(`media add ${name}: ${e instanceof Error ? e.message : String(e)}. Nothing was added: the media folder and the manifest are as they were.`);
  }
  if (old) rmSync(old, { recursive: true, force: true });
  writeTable(p);
  log(`added ${name} (${kind}): ${p.mediaRel}/${name}/${file}`);
  if (kind === "music" || kind === "sfx") {
    log(`  the ${kind === "music" ? "music" : "hit"} block can use it now: media: "${name}"`);
    if (kind === "music") musicMap(project, name);
  } else {
    log(`  next: untell media prepare ${name} --system <id>`);
  }
}

/** Notes on a file that is outside the spec (docs/MEDIA.md). They warn; they never refuse. */
export function warnings(kind: MediaKind, i: Probe | null): string[] {
  if (!i) return [];
  const w: string[] = [];
  const short = Math.min(i.width ?? Infinity, i.height ?? Infinity);
  if (kind === "photo" && short < 772) w.push(`the photo is ${i.width}x${i.height}. Below 772 px on the short side it is sharp only in a window or a small box.`);
  else if (kind === "photo" && short < 1188) w.push(`the photo is ${i.width}x${i.height}. Full-bleed and framed-low are sharpest from 1188 px on the short side; this one is a little soft there.`);
  if (kind === "video") {
    if ((i.height ?? 0) < 1080 && (i.width ?? 0) < 1080) w.push(`the footage is ${i.width}x${i.height}. Below 1080 px on both sides it looks soft at full-bleed.`);
    if (i.fps && i.fps < 23.9) w.push(`the footage is ${i.fps.toFixed(2)} fps. Films render at 30 fps: below 24 fps the motion stutters.`);
  }
  if ((kind === "music" || kind === "sfx") && i.sampleRate && i.sampleRate < 44100) w.push(`the sound is ${i.sampleRate} Hz. Use 44.1 or 48 kHz.`);
  if (kind === "sfx" && i.duration && i.duration > 8) w.push(`the effect is ${i.duration.toFixed(1)} s long. An effect is short (under about 6 s), with one clear peak.`);
  return w;
}

/**
 * The music map of a new track: untell listen analyse (the core analysis only, so add stays quick), then
 * music.json and the kit's music table. Without the listen tools, one line says how to add them.
 */
function musicMap(project: string, name: string) {
  const st = listenState(project);
  if (!st.core) {
    log(`  music({ peakAt }) and beats() need the music map of ${name}. Add the listen tools once: untell listen setup, then: untell listen analyse ${name}`);
    return;
  }
  log(`  untell listen analyse ${name} (the core analysis; untell listen analyse ${name} --force adds the stems and tags when they are set up):`);
  const r = spawnSync(process.execPath, [process.argv[1]!, "listen", "analyse", name, "--no-stems", "--no-clap", "--force", "--cwd", project], { stdio: "inherit" });
  if (r.status !== 0) log(`  the music map failed. Run it again: untell listen analyse ${name}`);
}

/**
 * model.glb.js: the model's bytes in a script. A page opened from a file (file:) may not fetch a file beside it, but it
 * may load a script; the kit's model loader (three/render.ts) reads the bytes from it there. Keyed by its own src.
 */
export function modelScript(glb: Uint8Array): string {
  return `(globalThis.__vsModelBytes = globalThis.__vsModelBytes || {})[document.currentScript.getAttribute("src").replace(/\\.js$/, "")] = "${Buffer.from(glb).toString("base64")}";\n`;
}

/** A 3D model: packs it into one model.glb (textures inside) and writes its bounds into meta.json. From the repository's prepare-model. */
export function prepareModel(file: string, srcDir: string | null, name: string) {
  const bytes = new Uint8Array(readFileSync(file));
  const json = gltfJson(bytes);
  const isGlb = bytes.byteLength >= 4 && new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true) === 0x46546c67;
  const glb = isGlb ? bytes : packGlb(json, (uri) => {
    if (!srcDir) throw new Error("a .gltf from a URL names files beside it that untell cannot fetch. Give a .glb file, or download the .gltf with its files and give the local path.");
    const f = join(srcDir, decodeURIComponent(uri));
    if (!existsSync(f)) throw new Error(`the .gltf names ${uri}, and it is not beside it (${f}). Keep the .gltf with its files, or give a .glb.`);
    return new Uint8Array(readFileSync(f));
  });
  // Every file the model names must be inside it: a texture left outside loads at render time and fails there (404).
  const outside = [...((json as { buffers?: { uri?: string }[] }).buffers ?? []), ...((json as { images?: { uri?: string }[] }).images ?? [])]
    .map((x) => x.uri).filter((u): u is string => !!u && !u.startsWith("data:"));
  if (isGlb && outside.length) throw new Error(`${name}: the .glb names files outside it (${outside.slice(0, 3).join(", ")}${outside.length > 3 ? ", ..." : ""}). untell keeps a model as one file. Export it with its textures embedded, or give the .gltf with its files beside it.`);
  const dir = dirname(file);
  writeFileSync(join(dir, "model.glb"), glb);
  writeFileSync(join(dir, "model.glb.js"), modelScript(glb));
  const b = gltfBounds(json);
  if (![...b.min, ...b.max].every(Number.isFinite)) throw new Error(`${name}: the model has no mesh with bounds, so untell cannot frame it.`);
  const used = (json as { extensionsUsed?: string[] }).extensionsUsed ?? [];
  const needs = used.filter((x) => x === "KHR_draco_mesh_compression" || x === "KHR_texture_basisu" || x === "EXT_meshopt_compression");
  if (needs.length) log(`  note: ${name} uses ${needs.join(", ")}. The renderer has no decoder for it: export the model again without compression.`);
  // The silhouette: what the model covers from 24 yaws and 7 pitches, so product frames it by its drawn shape and not by
  // its box (a thin model framed by its box comes out small). untell writes it into the kit's silhouettes table.
  let silhouette: unknown = null;
  try { silhouette = silhouetteOfGlb(glb, { min: b.min as [number, number, number], max: b.max as [number, number, number] }); }
  catch (e) { log(`  note: ${name}: no silhouette (${(e as Error).message}); product frames it by its box.`); }
  writeFileSync(join(dir, "meta.json"), JSON.stringify({ kind: "model", file: "model.glb", min: b.min, max: b.max, extensions: used, ...(silhouette ? { silhouette } : {}) }, null, 1) + "\n");
  const size = b.max.map((v, i) => v - b.min[i]!);
  log(`  ${name}: model.glb ${(glb.byteLength / 1e6).toFixed(1)} MB, size ${size.map((v) => v.toFixed(3)).join(" x ")} (file units), y is up${silhouette ? "; silhouette measured, so product frames it by its shape" : ""}`);
}

function prepare(project: string, p: MediaPaths, a: MediaArgs) {
  const name = checkName(a.positional[0]);
  const entry = entryOf(p, name);
  const asIs = a.flag("--as-is");
  const system = asIs ? "none" : a.opt("--system");
  if (!system) throw new Error(`usage: untell media prepare ${name} --system <id> (or --as-is for a screenshot or screen recording)`);
  if (system !== "none") readTokens(project, system);
  const dir = join(p.media, name);
  if (entry.kind === "photo") {
    const mode = a.flag("--no-cutout") ? "nocut" : "cut";
    // A PNG or WebP with its own transparency is its own cut-out: no model runs, so untell installs none. The grade's
    // tools (numpy, Pillow) read the alpha first; the model is set up only for a photo that needs it.
    ensurePhotoTools(project, false);
    const own = mode === "cut" && /\.(png|webp)$/i.test(entry.file) && py(project, [tool("media_photo.py"), dir, system, "alpha", entry.file], {}, true).trim() === "alpha";
    if (mode === "cut" && !own) ensurePhotoTools(project, true);
    if (own) log("  the photo has its own transparency: it is the cut-out, and no model runs.");
    py(project, [tool("media_photo.py"), dir, system, mode, entry.file, ...(a.flag("--keep-holes") ? ["--keep-holes"] : [])]);
  } else if (entry.kind === "video") {
    need("ffmpeg", "preparing footage");
    need("ffprobe", "preparing footage");
    const h = a.opt("--height");
    if (h && !/^\d{3,4}$/.test(h)) throw new Error("--height is a whole number of pixels, such as 1920");
    if (!a.flag("--no-cutout")) log("  footage gets no cut-out in this version: the photo block cannot draw `over` with a clip. Grading only.");
    py(project, [tool("media_video.py"), dir, system, ...(h ? [h] : [])]);
  } else {
    throw new Error(`${name} is ${entry.kind}: sounds need no prepare (untell media measure ${name} measures one again).`);
  }
  updateManifest(p, (m) => { if (m[name]) m[name]!.treatment = system; });
  writeTable(p);
  log(`  the photo block can use it now: media: "${name}" (table: ${p.kit}/media.gen.ts)`);
}

function beats(project: string, p: MediaPaths, a: MediaArgs) {
  const name = checkName(a.positional[0]);
  const entry = entryOf(p, name);
  if (entry.kind !== "music" && entry.kind !== "sfx") throw new Error(`${name} is ${entry.kind}, not a sound`);
  need("ffmpeg", "untell media beats");
  const file = join(p.media, name, entry.file);
  const hf = localHyperframes(project, a.opt("--hyperframes"));
  const args = [tool("media_sound.py"), "beats", file];
  mkdirSync(p.work, { recursive: true });
  const tmp = join(p.work, `beats-${process.pid}.json`);
  if (hf) {
    const r = runHyperframes([hf], ["beats", file, "--json"], { cwd: project, encoding: "utf8", maxBuffer: 64 << 20 });
    try {
      const j = JSON.parse(r.stdout) as { bpm?: number; beatTimes?: number[] };
      if (j.bpm && j.beatTimes?.length) { writeFileSync(tmp, JSON.stringify({ bpm: j.bpm, beatTimes: j.beatTimes })); args.push(tmp); }
    } catch {}
  }
  let out: string;
  try { out = py(project, args, {}, true); } finally { rmSync(tmp, { force: true }); }
  const d = JSON.parse(out) as { bpm: number; beatsBy: string; beats: number[]; bars: { bar: number; at: number; energy: number }[]; entries: { at: number; bar: number; why: string }[]; duration: number };
  writeFileSync(join(p.media, name, "beats.json"), JSON.stringify(d, null, 1) + "\n");
  log(`${name}: ${d.bpm} BPM (beats from ${d.beatsBy}), ${d.beats.length} beats, ${d.bars.length} bars of 4 beats, ${d.duration.toFixed(1)} s`);
  log(`first beats (s): ${d.beats.slice(0, 8).join(", ")}`);
  log("energy by bar (bar, start s, energy 0 to 1):");
  for (const b of d.bars) log(`  ${String(b.bar).padStart(3)}  ${b.at.toFixed(3).padStart(8)}  ${"#".repeat(Math.round(b.energy * 30)).padEnd(30)} ${b.energy.toFixed(2)}`);
  log("entry points (use as the music block's `from`, or place a cut on them):");
  for (const e of d.entries) log(`  ${e.at.toFixed(3)} s  bar ${e.bar}: ${e.why}`);
  log(`all beat times: ${p.mediaRel}/${name}/beats.json`);
}

/** One asset's state for `untell media list`: a sound's length and peak, a model's size and its file, a picture's grade and size. */
export function mediaState(kind: string, meta: Meta | undefined): string {
  if (kind === "music" || kind === "sfx") return meta ? `${meta.duration} s, peak ${meta.peak} s${typeof meta.lufs === "number" ? `, ${meta.lufs} LUFS` : ""}` : "not measured";
  if (kind === "mark") {
    const art = (meta as { art?: { paths: unknown[] } } | undefined)?.art;
    return art ? `mark.svg, ${art.paths.length} path(s)` : "not parsed";
  }
  if (kind === "model") {
    if (!meta?.min || !meta.max) return "not measured";
    const size = meta.max.map((v, i) => (v - meta.min![i]!).toFixed(3)).join(" x ");
    return `model.glb, size ${size} (file units)`;
  }
  return meta ? `prepared (${meta.grade}), ${meta.width}x${meta.height}${meta.duration ? `, ${meta.duration.toFixed(2)} s` : ""}${meta.mask ? ", cut-out" : ""}` : "not prepared";
}

function list(p: MediaPaths) {
  const m = readManifest(p), metas = readMetas(p);
  const names = Object.keys(m).sort();
  if (!names.length) { log(`no media yet. Add a file: untell media add <file or URL> --as <name>`); return; }
  for (const n of names) {
    const e = m[n]!, meta = metas[n];
    const state = mediaState(e.kind, meta);
    log(`${n.padEnd(24)} ${e.kind.padEnd(6)} ${state}${e.source ? `\n${" ".repeat(32)}source: ${e.source}` : ""}${e.licence ? `\n${" ".repeat(32)}licence: ${e.licence}` : ""}`);
  }
  log(`\n${names.length} asset(s) in ${p.mediaRel}/, listed in untell-media.json and ${p.kit}/media.gen.ts`);
}

function remove(p: MediaPaths, a: MediaArgs) {
  const name = checkName(a.positional[0]);
  entryOf(p, name);
  updateManifest(p, (m) => { delete m[name]; });
  rmSync(join(p.media, name), { recursive: true, force: true });
  writeTable(p);
  writeMusicTable(p);
  log(`removed ${name}: its folder, its manifest entry and its row in the media table`);
}

export const FORMATS = `What untell media takes (the full spec, with sizes for each placement: docs/MEDIA.md in the untell package)

photo    JPEG, PNG or WebP. sRGB. Best: the crop that fills the box is 1.1 x the box in px (a push of 8 %).
         Full-bleed 9:16 needs a crop of 1188 x 2112; 16:9, 2112 x 1188; 1:1, 1188 x 1188.
         prepare: plate.jpg (graded), plate-top.jpg (top eased into the ground), plate-dim.jpg (behind type),
         subject.png (the cut-out, graded), and a subject box, centre and coarse mask in the media table.
cut-out  PNG or WebP with alpha. untell keeps its alpha as the cut-out and runs no model.
footage  MP4 (H.264) is best; MOV, WebM and M4V also work (ffmpeg reads them). 24 to 60 fps, 30 or 60 best.
         1080 px or more on the short side. Its sound is dropped. prepare: plate.mp4 (graded, 1440 px tall by
         default, --height to change), plate-top.mp4, plate-dim.mp4; a keyframe every 0.5 s.
music    MP3 (192 kbps or more), WAV, M4A/AAC, OGG or FLAC. 44.1 or 48 kHz, stereo. At least the film's length
         plus the entry point. The whole mix aims at the system's mix target (the Mix line in the Direction
         section of its SYSTEM.md); the music block sets the bed's level for it, and untell master finishes it.
effect   The same formats. Short (under about 6 s), one clear peak, little silence before it.
         add measures its length and peak, so the hit block puts the peak on the first frame that shows its picture.
mark     SVG with a viewBox (or a width and a height in px), and path, rect, circle, ellipse, polygon, polyline or
         line elements, each in one flat paint (fill, or fill="none" with a stroke). No transform, use, text, image,
         gradient, pattern, clip-path or mask: apply them in the editor first. At most 64 shapes. The colours in the
         file are not used: the film paints the mark in the system's roles (ink, and one path in the accent).
         add parses it into the marks table, so the drawnMark block draws it by its strokes, then fills it.
3D model glTF binary (.glb), or a .gltf with its files beside it. y is up (glTF's own axis). add packs it into
         model.glb and writes its bounds in its own units, so a 3D block can size and frame it. No Draco, KTX2 or
         meshopt compression: the renderer has no decoder for them.

Use files that the brief's owner may use. When the brief gives none, find them yourself, and give each file's
source and licence when you add it: untell media add <file> --as <name> --source <text> --licence <text>.
untell records that text in untell-media.json and does not check it: the licence is yours to read.`;

export const MEDIA_HELP = `untell media: tools for media you bring (photos, footage, music, effects)

  untell media setup                     Python (.venv-media), rembg and the cut-out model (init runs it)
  untell media formats                   the formats and sizes untell takes
  untell media add <file|URL> --as <name> [--kind photo|video|music|sfx|model|mark] [--source <text>] [--licence <text>] [--role lead-in] [--force]
                                         copy or download a file into the project; sounds are measured at once,
                                         a track gets its music map (with untell listen setup), a .glb its bounds.
                                         An effect that rises slowly to its peak (a swell) is a lead-in by its
                                         measure; --role lead-in names a short whoosh that carries a motion, so the
                                         beat rule follows the motion, not a beat
                                         Example: untell media add ~/Music/bed.mp3 --as bed
  untell media prepare <name> --system <id> [--as-is] [--no-cutout] [--keep-holes] [--height <px>]
                                         cut out the subject (photos) and grade for the system (photos and footage).
                                         The cut-out cleanup opens backdrop gaps that the subject encloses and
                                         removes the backdrop rim; --keep-holes keeps every gap filled (use it when
                                         it opens a gap that is part of the subject). Example: untell media prepare
                                         runner --system riso
  untell media beats <name>              tempo, beat times, energy bar by bar and entry points of a track
  untell media measure <name>            a sound's length and peak, again
  untell media remove <name>             delete an asset, its manifest entry and its table row
  untell media list                      every asset, its kind and state
  untell media table                     write the media table again from the prepared files`;

export async function media(projectArg: string, sub: string | undefined, a: MediaArgs): Promise<number> {
  const project = resolve(projectArg);
  if (sub === "setup") return mediaSetup(project);
  if (sub === "formats") { log(FORMATS); return 0; }
  if (!sub || sub === "help") { log(MEDIA_HELP); return sub ? 0 : 1; }
  const p = mediaPaths(project);
  switch (sub) {
    case "add": await add(project, p, a); return 0;
    case "prepare": prepare(project, p, a); return 0;
    case "beats": beats(project, p, a); return 0;
    case "measure": {
      const name = checkName(a.positional[0]);
      const e = entryOf(p, name);
      if (e.kind !== "music" && e.kind !== "sfx") throw new Error(`${name} is ${e.kind}, not a sound`);
      measureSound(project, p, name, e, a.opt("--hyperframes"));
      writeTable(p);
      return 0;
    }
    case "remove": remove(p, a); return 0;
    case "list": list(p); return 0;
    case "table": writeTable(p); log(`wrote ${p.kit}/media.gen.ts`); return 0;
    default: log(MEDIA_HELP); return 1;
  }
}

/** For init --force: the kit's empty table replaced a filled one, so write it again from the manifest. */
export function restoreTable(project: string, fw?: Framework): boolean {
  const p = mediaPaths(project, fw);
  if (!existsSync(p.manifest)) return false;
  writeTable(p);
  writeMusicTable(p);
  return true;
}

