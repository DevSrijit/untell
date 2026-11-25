// The measures of any video file: what a model needs to know of a film that it cannot watch, as typed data.
// `untell see` is a thin command over this module. Each function takes a file path and returns data; none prints.
//
//   probeVideo        the file: length, frame size and aspect (after rotation), frame rate, codecs, bitrate, sound
//   measurePicture    one decode of the frames (tools/measure_video.py): cuts, soft changes, shots, motion, colour,
//                     ink, text detail
//   measureSound      the sound (tools/measure_video.py and ffmpeg's EBU R128 meter), the tempo with untell listen's
//                     rhythm when its tools are set up (tools/listen/tempo.py)
//   fileFindings      the rules that need only the file, as untell check <video> runs them (eyes.ts)
//   contactSheets     the review sheet as pages of 8 to 12 frames, about 1500 px on the long side (tools/review_sheet.py)
//   measureVideo      all of the above, side by side where they can run at once, with the time of each part
//   seeDocument       the measures as one versioned document; fitBudget makes it fit a number of tokens
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { loudnessOf } from "./detector";
import { ensureDetectorPython, ffmpegFix, LISTEN_MODULES, listenPython, pyHas, runs } from "./env";
import { MissingToolError, UsageError } from "./errors";
import { eyesRun, readFps, VIDEO_EXT } from "./eyes";
import { registryDir } from "./kit";

/** Why a measure is null: the key of the measure, and the reason in words. */
export type Why = Record<string, string>;

export type FileFacts = {
  path: string; name: string; bytes: number; container: string | null;
  seconds: number; width: number; height: number; aspect: string; rotation: number;
  fps: number; frames: number | null;
  video: { codec: string; profile: string | null; pixFmt: string | null; kbps: number | null };
  audio: { codec: string; channels: number | null; sampleRate: number | null; kbps: number | null } | null;
  kbps: number | null; sound: boolean;
};

/** A cut: its time and its strength (the share of the frame that changes at the cut, 0 to 1). */
export type Cut = { t: number; frame: number; strength: number };
export type MotionLevel = "still" | "low" | "medium" | "high";
/** Four rows of four zones, top row first. Ink: a digit for each zone (see INK_KEY). Text: "#" or ".". */
export type Grid = string[];
/** How a shot starts: the file's start, a hard cut, or a soft change (a fade, a wipe, a move that replaces the picture). */
export type ShotStart = "start" | "cut" | "fade" | "wipe" | "move";
/** A large change of the picture with no hard cut. `shot`: it replaces the picture, so a new shot starts there. */
export type SoftChange = { t: number; frame: number; kind: "fade" | "wipe" | "move"; strength: number; span: number; shot: boolean };
export type Shot = {
  from: number; to: number; by: ShotStart; motion: { level: MotionLevel; mean: number }; brightness: number;
  palette: [string, number][]; ground: string; ink: Grid; inkShare: number;
  /** words: the words tesseract read, or null with the reason in why (only when tesseract ran). */
  text?: { zones: Grid; share: number; words?: string | null; why?: string };
};
export type PictureMeasures = {
  fps: number; frames: number; seconds: number; samples: number; elapsed: number;
  cuts: Cut[]; changes: SoftChange[]; shots: Shot[]; stalls: [number, number][]; stillShare: number;
  firstSecond: { brightness: number; inkShare: number; ink: Grid; blankStart: boolean; firstChangeAt: number | null; motion: MotionLevel; cuts: number; inkAt1s: number; textLike: boolean };
  film: { palette: [string, number][]; brightness: number; contrast: number; polarity: string; lightInkShare: number | null; ink: Grid; inkShare: number };
  text: { share: number; zones: Grid; shots: number; ocr: { tool: string; shots: number; of: number } | null };
  /** For the review sheet: the motion of every frame and the cuts as frames, at `fps`. */
  sheet: { fps: number; motion: number[]; cuts: number[]; stalls: [number, number][] };
};
export type Tempo = { bpm: number; confidence: "high" | "medium" | "low"; pulseClarity: number; grid: string; meter: number; beats: number[]; downbeats: number[]; method: string };
export type SoundMeasures = {
  lufsIntegrated: number | null; truePeakDb: number | null; loudnessRange: number | null;
  /** The level (dB, RMS) in steps of `step` seconds. */
  energy: { step: number; db: number[] };
  silent: [number, number][]; digitalSilence: [number, number][];
  onsets: number[]; tempo: Tempo | null;
  /** How the cuts sit against the onsets (and the beats when the tempo has medium or high trust). */
  cutsOnSound: { cuts: number; onOnset: number; onBeat: number | null; within: number } | null;
  why: Why; elapsed: number;
  /** For the review sheet: the level every 10 ms. */
  env: number[];
};
export type FindingsMeasures = {
  ok: boolean; errors: number; warnings: number; advice: number;
  findings: { check: string; severity: string; from: number | null; to: number | null; measured: unknown; limit: unknown }[];
  causes: { check: string; severity: string; from: number; to: number; count: number; fix: string }[];
  ran: string[]; notRun: Record<string, number>; report: string; system: string | null; elapsed: number;
  /** The limits the rules used: the system's, or the defaults of the checks with no system. */
  limits: { stall: number | null; lufs: number | null; lufsRange: number | null };
};
export type SheetPage = { file: string; from: number; to: number; frames: number };
export type Timings = Record<string, number>;
export type VideoMeasures = {
  file: FileFacts; picture: PictureMeasures; sound: SoundMeasures | null; findings: FindingsMeasures | null;
  pages: SheetPage[]; why: Why; timings: Timings; outDir: string;
};

const tool = (...p: string[]) => join(registryDir(), "tools", ...p);
const round = (v: number, n = 2) => Math.round(v * 10 ** n) / 10 ** n;

/** The aspect of a frame as a ratio of small whole numbers when one is close (16:9, 9:16, 1:1, 4:5), else w:h to 2 places. */
export function aspectOf(w: number, h: number): string {
  const known: [number, number][] = [[16, 9], [9, 16], [1, 1], [4, 5], [5, 4], [4, 3], [3, 4], [21, 9], [2, 1], [1, 2], [3, 2], [2, 3], [9, 8]];
  const r = w / h;
  const k = known.find(([a, b]) => Math.abs(r - a / b) / (a / b) < 0.012);
  return k ? `${k[0]}:${k[1]}` : r >= 1 ? `${round(r)}:1` : `1:${round(1 / r)}`;
}

/** The file's facts from ffprobe. The frame size is the size it shows at: a rotated phone clip turns. */
export function probeVideo(fileArg: string): FileFacts {
  const file = resolve(fileArg);
  if (!existsSync(file)) throw new UsageError(`${fileArg} does not exist. Give the path of a video file (${VIDEO_EXT.join(", ")}).`, "see");
  if (!VIDEO_EXT.includes(extname(file).toLowerCase())) throw new UsageError(`${fileArg} is not a video file. untell see reads ${VIDEO_EXT.join(", ")}.`, "see");
  if (!runs("ffprobe")) throw new MissingToolError(`untell see needs ffprobe and ffmpeg to read a video. Install them: ${ffmpegFix()}`);
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries",
    "stream=index,codec_type,codec_name,profile,pix_fmt,width,height,avg_frame_rate,r_frame_rate,nb_frames,bit_rate,channels,sample_rate:stream_side_data=rotation:format=duration,bit_rate,format_name,size",
    "-of", "json", file], { encoding: "utf8" });
  if (r.status !== 0) throw new UsageError(`ffprobe cannot read ${basename(file)}: ${(r.stderr ?? "").trim().split("\n").pop()}. Give a video file (${VIDEO_EXT.join(", ")}).`, "see");
  type Stream = { codec_type: string; codec_name?: string; profile?: string; pix_fmt?: string; width?: number; height?: number; avg_frame_rate?: string; r_frame_rate?: string;
    nb_frames?: string; bit_rate?: string; channels?: number; sample_rate?: string; side_data_list?: { rotation?: number }[] };
  const j = JSON.parse(r.stdout) as { streams: Stream[]; format: { duration?: string; bit_rate?: string; format_name?: string; size?: string } };
  // The first video stream that is a picture (a cover image is a video stream with one frame and no rate).
  const v = j.streams.find((s) => s.codec_type === "video" && s.width && s.height && s.codec_name !== "mjpeg" && s.codec_name !== "png") ?? j.streams.find((s) => s.codec_type === "video" && s.width);
  if (!v?.width || !v.height) throw new UsageError(`${basename(file)} has no video stream. untell see reads a film; for a sound file, run untell listen analyse <file>.`, "see");
  const a = j.streams.find((s) => s.codec_type === "audio");
  const rate = (s?: string) => { const [x, y] = (s ?? "0/1").split("/").map(Number); return y ? x! / y : 0; };
  const fps = rate(v.avg_frame_rate) || rate(v.r_frame_rate) || 30;
  const rotation = Math.round(Number((v.side_data_list ?? []).find((s) => s.rotation !== undefined)?.rotation ?? 0));
  const turned = Math.abs(rotation) % 180 === 90;
  const width = turned ? v.height : v.width, height = turned ? v.width : v.height;
  const kb = (s?: string) => (s && Number(s) > 0 ? Math.round(Number(s) / 1000) : null);
  const seconds = Number(j.format.duration ?? 0);
  return {
    path: file, name: basename(file), bytes: Number(j.format.size ?? statSync(file).size), container: j.format.format_name ?? null,
    seconds: round(seconds, 3), width, height, aspect: aspectOf(width, height), rotation,
    fps: round(fps, 3), frames: v.nb_frames ? Number(v.nb_frames) : null,
    video: { codec: v.codec_name ?? "unknown", profile: v.profile ?? null, pixFmt: v.pix_fmt ?? null, kbps: kb(v.bit_rate) },
    audio: a ? { codec: a.codec_name ?? "unknown", channels: a.channels ?? null, sampleRate: a.sample_rate ? Number(a.sample_rate) : null, kbps: kb(a.bit_rate) } : null,
    kbps: kb(j.format.bit_rate) ?? (seconds > 0 ? Math.round((statSync(file).size * 8) / seconds / 1000) : null), sound: !!a,
  };
}

/** Runs a Python tool as a child process, so several run at once. Resolves with its stdout; rejects with its error. */
function runTool(py: string, args: string[], env: NodeJS.ProcessEnv = process.env, cwd?: string): Promise<string> {
  return new Promise((done, fail) => {
    const c = spawn(py, args, { env, cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    c.stdout.on("data", (d) => { out += d; });
    c.stderr.on("data", (d) => { err += d; });
    c.on("error", (e) => fail(e));
    c.on("close", (code, signal) => (code === 0 ? done(out)
      : fail(new Error(`${basename(args[0]!)} failed: ${(err || out).trim().split("\n").slice(-3).join(" ") || (signal ? `it was ended by ${signal}` : `exit code ${code}`)}`))));
  });
}

/** The samples a second for the text detail: 4 for a short film, fewer for a long one (about 300 samples), at least 1. */
export const samplesFor = (seconds: number) => Math.max(1, Math.min(4, Math.round((300 / Math.max(1, seconds)) * 4) / 4));

/** The tesseract program when it runs, else null. untell ships no OCR; a model gets the words only when it is there. */
export const ocrTool = (): string | null => (process.env.UNTELL_NO_OCR === "1" ? null : runs("tesseract", "--version") ? "tesseract" : null);

export type PictureOptions = { py: string; work: string; ocr?: string | null; plan?: SheetPlan | null };

/** The picture of a file: one decode of its frames (tools/measure_video.py picture). */
export async function measurePicture(file: string, facts: FileFacts, o: PictureOptions): Promise<PictureMeasures> {
  mkdirSync(o.work, { recursive: true });
  const out = join(o.work, "picture.json");
  const args = [tool("measure_video.py"), "picture", file, "--out", out, "--width", String(facts.width), "--height", String(facts.height),
    "--fps", String(readFps(facts.fps)), "--samples", String(samplesFor(facts.seconds)), ...(o.ocr ? ["--ocr", o.ocr] : []),
    // The contact sheet's frames, at its frame size, from the same decode (the review sheet then decodes nothing).
    ...(o.plan ? ["--thumbs", join(o.work, "thumbs"), "--thumb-rate", `1000/${Math.round(o.plan.step * 1000)}`, "--thumb-size", `${2 * o.plan.tw}x${2 * o.plan.th}`] : [])];
  await runTool(o.py, args);
  return JSON.parse(readFileSync(out, "utf8")) as PictureMeasures;
}

type SoundRaw = { seconds: number; silent: [number, number][]; digitalSilence: [number, number][]; onsets: number[]; env: number[]; elapsed: number };

/** A step for the level curve: at most about 60 points, at least 0.5 s. */
export function energyStep(seconds: number): number {
  return [0.5, 1, 2, 5, 10, 15, 30, 60, 120].find((s) => seconds / s <= 60) ?? 300;
}

/** The level curve: the RMS level of each step (dB, whole numbers) from the 10 ms levels. */
export function energyCurve(env: number[], step: number): number[] {
  const per = Math.max(1, Math.round(step * 100));
  const out: number[] = [];
  for (let i = 0; i < env.length; i += per) {
    const part = env.slice(i, i + per);
    const p = part.reduce((s, v) => s + v * v, 0) / Math.max(1, part.length);
    out.push(Math.max(-90, Math.round(10 * Math.log10(p + 1e-12))));
  }
  return out;
}

/** How the cuts sit on the sound: a cut within `within` seconds of an onset (or a beat) is on it. */
export function cutsOnSound(cuts: number[], onsets: number[], beats: number[] | null, within: number) {
  if (!cuts.length) return null;
  const near = (t: number, xs: number[]) => xs.some((x) => Math.abs(x - t) <= within);
  return { cuts: cuts.length, onOnset: cuts.filter((t) => near(t, onsets)).length, onBeat: beats ? cuts.filter((t) => near(t, beats)).length : null, within: round(within, 3) };
}

export type SoundOptions = { py: string; work: string; listenPy?: string | null; cuts?: number[]; fps?: number };

/** The listen Python when it has its core modules (untell listen setup), else null. untell see does not install it. */
export function listenReady(project: string): string | null {
  const py = listenPython(project);
  return existsSync(py) && pyHas(py, LISTEN_MODULES) ? py : null;
}

/** The sound of a file, or null with the reason when it has none. The tempo runs only when the listen tools are set up. */
export async function measureSound(file: string, facts: FileFacts, o: SoundOptions): Promise<{ sound: SoundMeasures | null; why: string | null }> {
  if (!facts.sound) return { sound: null, why: "the file has no audio stream" };
  mkdirSync(o.work, { recursive: true });
  const t0 = Date.now();
  const rawOut = join(o.work, "sound.json"), tempoOut = join(o.work, "tempo.json");
  const tempo = o.listenPy
    ? runTool(o.listenPy, [tool("listen", "tempo.py"), file, "--out", tempoOut], process.env).then(() => JSON.parse(readFileSync(tempoOut, "utf8")) as Tempo, (e: Error) => e)
    : Promise.resolve(null);
  const raw = runTool(o.py, [tool("measure_video.py"), "sound", file, "--out", rawOut]).then(() => JSON.parse(readFileSync(rawOut, "utf8")) as SoundRaw);
  const loud = loudnessOf(file, true);
  const [r, t] = await Promise.all([raw, tempo]);
  const why: Why = {};
  let tp: Tempo | null = null;
  if (t instanceof Error) why.tempo = `untell listen's rhythm failed: ${t.message}`;
  else if (!t) why.tempo = "the listen tools are not set up here, so no beat tracker ran. Run untell listen setup, then untell see again";
  else if (typeof t.bpm !== "number" || !Number.isFinite(t.bpm) || !t.beats?.length) why.tempo = "untell listen's rhythm found no beat grid in this sound";
  else tp = t;
  // ffmpeg's meter gives -70 LUFS (its gate) for silence: that is no loudness, so it is null, with the reason.
  if (loud.lufsIntegrated !== null && loud.lufsIntegrated <= -70) { loud.lufsIntegrated = null; loud.loudnessRange = null; }
  if (loud.lufsIntegrated === null) why.lufsIntegrated = "no part of the sound passes the -70 LUFS gate of EBU R128: it is silent, or too short";
  if (loud.truePeakDb === null) why.truePeakDb = "the sound has no peak: every sample is zero";
  const step = energyStep(r.seconds);
  const trusted = tp && tp.confidence !== "low" ? tp.beats : null;
  const fps = o.fps ?? 30;
  return {
    sound: {
      lufsIntegrated: loud.lufsIntegrated, truePeakDb: loud.truePeakDb, loudnessRange: loud.loudnessRange ?? null,
      energy: { step, db: energyCurve(r.env, step) }, silent: r.silent, digitalSilence: r.digitalSilence, onsets: r.onsets,
      tempo: tp, cutsOnSound: cutsOnSound(o.cuts ?? [], r.onsets, trusted, 2 / fps), why, elapsed: (Date.now() - t0) / 1000, env: r.env,
    },
    why: null,
  };
}

/** The findings of the rules that need only the file, as untell check <video> gives them (the same ids and report). */
export async function fileFindings(cwd: string, file: string, o: { system?: string; log?: (s: string) => void } = {}): Promise<FindingsMeasures | null> {
  const t0 = Date.now();
  const r = await eyesRun(cwd, file, { system: o.system }, o.log ?? (() => {}));
  if (!r) return null;
  const lim = (r.res as { limits?: { stall?: number; lufs?: number; lufsRange?: number } }).limits ?? {};
  const notRun: Record<string, number> = {};
  for (const why of Object.values(r.report.skipped ?? {})) notRun[why] = (notRun[why] ?? 0) + 1;
  return {
    ok: r.report.ok, errors: r.report.errors, warnings: r.report.warnings, advice: r.report.advice,
    findings: r.report.findings.map((f) => ({ check: f.check, severity: f.severity, from: f.from ?? null, to: f.to ?? null, measured: f.measured ?? null, limit: f.limit ?? null })),
    causes: (r.report.groups ?? []).map((g) => ({ check: g.check, severity: g.severity, from: g.from, to: g.to, count: g.count, fix: g.fix })),
    ran: r.ran, notRun, report: r.reportPath, system: o.system ?? null, elapsed: (Date.now() - t0) / 1000,
    limits: { stall: lim.stall ?? null, lufs: lim.lufs ?? null, lufsRange: lim.lufsRange ?? null },
  };
}

/** The frames of the contact sheet: a step from a short list, so that the pages hold at most MAX_FRAMES frames. */
export const MAX_FRAMES = 72;
export function sheetStep(seconds: number): number {
  return [0.25, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 15, 20, 30, 60, 120].find((s) => s >= (seconds < 3 ? 0.25 : 0.5) && Math.ceil(seconds / s) <= MAX_FRAMES) ?? 300;
}

/** Frames on a page: 8 to 12 (fewer only on a film with fewer frames, or on the last page). */
export function perPage(frames: number): number {
  if (frames <= 12) return Math.max(1, frames);
  const pages = Math.ceil(frames / 12);
  return Math.max(8, Math.ceil(frames / pages));
}

/** The page layout: the columns and the frame width that keep the page's long side near `side` px. Pure. */
export function pageLayout(width: number, height: number, frames: number, side = 1500, findings = false): { cols: number; tw: number } {
  const gut = 72, pad = 16, head = 90, lanes = 72 + 16 + (findings ? 48 : 0), gap = 24;
  let best = { cols: 1, tw: 120, area: 0 };
  for (let cols = 2; cols <= 6; cols++) {
    const rows = Math.ceil(frames / cols);
    const byW = (side - gut - 2 * pad) / cols;
    const byH = ((side - 2 * pad - head) / rows - lanes - gap) * (width / height);
    const tw = Math.floor(Math.min(byW, byH));
    if (tw < 120) continue;
    const area = tw * tw * (height / width) * Math.min(cols * rows, frames);
    if (area > best.area) best = { cols, tw, area };
  }
  return { cols: best.cols, tw: best.tw };
}

/** The plan of the contact sheets: the step between frames, frames on a page, columns, and the frame size (px). */
export type SheetPlan = { step: number; frames: number; per: number; cols: number; tw: number; th: number };
export function sheetPlan(facts: Pick<FileFacts, "seconds" | "width" | "height">, findings: boolean): SheetPlan {
  const step = sheetStep(facts.seconds);
  const frames = Math.max(1, Math.ceil(facts.seconds / step - 1e-6));
  const per = perPage(frames);
  const { cols, tw } = pageLayout(facts.width, facts.height, per, 1500, findings);
  return { step, frames, per, cols, tw, th: Math.round((tw * facts.height) / facts.width) };
}

export type SheetOptions = { py: string; work: string; outDir: string; findings?: string | null; theme?: string; plan?: SheetPlan };

/** The contact sheets: tools/review_sheet.py as pages, from the measures and the frames of the one decode. */
export async function contactSheets(file: string, facts: FileFacts, pic: PictureMeasures, sound: SoundMeasures | null, o: SheetOptions): Promise<SheetPage[]> {
  const { step, per, cols, tw } = o.plan ?? sheetPlan({ ...facts, seconds: pic.seconds }, !!o.findings);
  const thumbs = join(o.work, "thumbs");
  const input = join(o.work, "sheet-input.json");
  writeFileSync(input, JSON.stringify({ ...pic.sheet, env: sound?.env ?? null, onsets: sound?.onsets ?? [] }));
  const out = join(o.outDir, "sheet.jpg");
  for (const f of ["sheet.json", ...Array.from({ length: 40 }, (_, k) => `sheet-${k + 1}.jpg`), "sheet.jpg"]) rmSync(join(o.outDir, f), { force: true });
  const args = [tool("review_sheet.py"), file, "--out", out, "--step", String(step), "--cols", String(cols), "--tw", String(tw),
    "--per-page", String(per), "--no-phone", "--measures", input, ...(existsSync(thumbs) ? ["--thumbs", thumbs] : []),
    ...(o.findings ? ["--findings", o.findings] : []), ...(o.theme ? ["--theme", o.theme] : [])];
  await runTool(o.py, args, { ...process.env, UNTELL_FONTS: process.env.UNTELL_FONTS ?? join(registryDir(), "fonts") });
  const j = JSON.parse(readFileSync(join(o.outDir, "sheet.json"), "utf8")) as { pages: { sheet: string; from: number; to: number; frames: number }[] };
  rmSync(join(o.outDir, "sheet.json"), { force: true });
  return j.pages.map((p) => ({ file: p.sheet, from: round(p.from, 2), to: round(p.to, 2), frames: p.frames }));
}

export type MeasureOptions = { outDir: string; system?: string; theme?: string; log?: (s: string) => void; findings?: boolean; sheets?: boolean; ocr?: boolean };

/** The shape of the kept measures (picture.json, sound-measures.json): a new shape measures the file again. */
export const MEASURES_SHAPE = 3;

/** The code that makes the measures and the pack that holds the rules: a change to either measures the file again. */
function codeStamp(): string {
  const h = createHash("sha256");
  for (const f of ["measure_video.py", "inspect/checks/cuts.py", "inspect/common.py", "listen/tempo.py", "listen/analysis.py"]) {
    const p = tool(...f.split("/"));
    if (existsSync(p)) h.update(readFileSync(p));
  }
  // The pack's stamp: a new pack (new rules, a new detector) runs the rules and the measures again.
  const packed = join(registryDir(), "stamp.json");
  if (existsSync(packed)) h.update(readFileSync(packed));
  return h.digest("hex").slice(0, 16);
}

/**
 * Every measure of a file. The picture, the sound and the tempo run as child processes while the rules run, so the
 * time is about the longest of them, not their sum. The picture and the sound are kept for the same file and the
 * same code (a stamp in <outDir>/measures), so a second run reads them. Returns the time of each part, in seconds.
 */
export async function measureVideo(cwd: string, fileArg: string, o: MeasureOptions): Promise<VideoMeasures> {
  const log = o.log ?? (() => {});
  const timings: Timings = {};
  const t0 = Date.now();
  const facts = probeVideo(resolve(cwd, fileArg));
  const file = facts.path;
  if (!runs("ffmpeg")) throw new MissingToolError(`untell see needs ffmpeg to read a video. Install it: ${ffmpegFix()}`);
  const py = ensureDetectorPython(cwd, log);
  if (!py) throw new MissingToolError("untell see needs Python 3.10 or later with numpy, Pillow and scipy (the line above says why it is missing and the fix).");
  const work = join(o.outDir, "measures");
  mkdirSync(work, { recursive: true });
  const ocr = o.ocr === false ? null : ocrTool();
  const listenPy = listenReady(cwd);
  const plan = o.sheets === false ? null : sheetPlan(facts, o.findings !== false);
  const stamp = JSON.stringify({ file, bytes: statSync(file).size, mtime: statSync(file).mtimeMs, code: codeStamp(), shape: MEASURES_SHAPE, ocr: !!ocr, listen: !!listenPy, plan, system: o.system ?? null });
  const stampFile = join(work, "stamp.json");
  const kept = existsSync(stampFile) && readFileSync(stampFile, "utf8") === stamp && existsSync(join(work, "picture.json")) && (!facts.sound || existsSync(join(work, "sound.json")));
  if (!kept) rmSync(stampFile, { force: true });
  timings.probe = (Date.now() - t0) / 1000;

  // 1. The picture: a child process. 2. The rules: the detector (it blocks this process, the child goes on).
  const t1 = Date.now();
  const picture: Promise<PictureMeasures> = kept ? Promise.resolve(JSON.parse(readFileSync(join(work, "picture.json"), "utf8")) as PictureMeasures)
    : measurePicture(file, facts, { py: py.py, work, ocr, plan });
  picture.catch(() => {}); // awaited below; a failure must not end the process while the rules run
  let findings: FindingsMeasures | null = null;
  const why: Why = {};
  const keptFindings = join(work, "findings.json");
  if (o.findings !== false && kept && existsSync(keptFindings)) {
    findings = JSON.parse(readFileSync(keptFindings, "utf8")) as FindingsMeasures;
    findings.elapsed = 0;
  } else if (o.findings !== false) {
    const rulesLog = (s: string) => log(s.startsWith("untell check") ? "  rules    the rules that need only the file (untell check <video>)" : s);
    try { findings = await fileFindings(cwd, file, { system: o.system, log: rulesLog }); }
    catch (e) { why.findings = `the rules could not run: ${(e as Error).message.split("\n")[0]}`; }
    if (!findings && !why.findings) why.findings = "the rules could not run (the line above says why)";
    if (findings) writeFileSync(keptFindings, JSON.stringify(findings));
  } else why.findings = "not asked for";
  timings.findings = findings?.elapsed ?? 0;
  const pic = await picture;
  timings.picture = kept ? 0 : pic.elapsed;

  // 3. The sound (it needs the cuts for "cuts on onsets"): the sound tool and the tempo run side by side.
  const t2 = Date.now();
  let sound: SoundMeasures | null = null;
  const cutTimes = pic.cuts.map((c) => c.t);
  if (kept && facts.sound) {
    const s = JSON.parse(readFileSync(join(work, "sound-measures.json"), "utf8")) as SoundMeasures;
    sound = { ...s, cutsOnSound: cutsOnSound(cutTimes, s.onsets, s.tempo && s.tempo.confidence !== "low" ? s.tempo.beats : null, 2 / pic.fps) };
  } else {
    const r = await measureSound(file, facts, { py: py.py, work, listenPy, cuts: cutTimes, fps: pic.fps });
    sound = r.sound;
    if (r.why) why.sound = r.why;
    if (sound) writeFileSync(join(work, "sound-measures.json"), JSON.stringify(sound));
  }
  if (!facts.sound) why.sound = "the file has no audio stream";
  timings.sound = kept ? 0 : (Date.now() - t2) / 1000;
  writeFileSync(stampFile, stamp);
  timings.measures = (Date.now() - t1) / 1000;

  // 4. The pictures: the review sheet as pages, from the measures, with the findings on the lanes.
  const t3 = Date.now();
  let pages: SheetPage[] = [];
  if (plan) pages = await contactSheets(file, facts, pic, sound, { py: py.py, work, outDir: o.outDir, findings: findings ? keptFindings : null, theme: o.theme, plan });
  timings.sheets = (Date.now() - t3) / 1000;
  timings.total = (Date.now() - t0) / 1000;
  return { file: facts, picture: pic, sound, findings, pages, why, timings, outDir: o.outDir };
}

// ---------------------------------------------------------------- the document

/** How untell see estimates tokens: the characters of see.json divided by 3, rounded up. It is an estimate: a
 *  tokenizer counts hex colours and digit grids its own way, so a real count can differ either way. */
export const TOKEN_RULE = "the characters of see.json divided by 3, rounded up";
export const estimateTokens = (text: string) => Math.ceil(text.length / 3);

export const INK_KEY = "4 rows of 4 zones, top row first. Each digit says how much of the zone differs from the ground colour (the most common colour of the shot) by more than 28 levels on a channel: 0 under 0.5 %, 1 from 0.5 %, 2 from 2 %, 3 from 5 %, 4 from 10 %, 5 from 20 %, 6 from 35 %, 7 from 50 %, 8 from 70 %, 9 from 90 %";
export const KEY = {
  times: "seconds from the start of the file",
  cut: "[time, strength]: strength is the share of the frame that changes at the cut (0 to 1)",
  motion: "the mean change of grey level (0 to 255) from one frame to the next, on a copy 96 px wide: still under 0.15, low under 1, medium under 4, high from 4",
  stalls: "spans over 1 s where under 0.15 % of the frame changes from the frame 0.2 s before (the measure of the stall rule); a span that reaches the end counts. rule says what the stall rule makes of it: fault (it reports it), under the limit, end hold (the closing hold, which the ending rule judges), or not judged (the rules did not run)",
  shots: "a shot ends at a hard cut or at a soft change that replaces the picture. by: how it starts (start, cut, fade, wipe, move)",
  changes: "[time, kind, strength]: a large change of the picture with no hard cut. kind: fade (the frames mix), wipe (part old, part new), move (the content moves). strength: the share of the frame that differs from 0.25 s before to 0.25 s after",
  words: "read by OCR (tesseract) on one frame of the shot, with a confidence of 70 or more: noisy. A halftone, grain or a picture can read as letters, and large or stylised type can read wrong or not at all. null: nothing read, and why says why",
  brightness: "the mean luma, 0 black to 1 white",
  palette: "[colour, share of the pixels]: k-means in OKLab",
  ink: INK_KEY,
  zones: "4 rows of 4 zones as for ink: # where detail of text size shows, . where none",
};

/** The version of see.json. 2: a shot also ends at a soft change (timeline.shots, pace.shots and the shot lengths),
 *  each stall is an object with the stall rule's verdict (pace.stalls), and the onset times are spread evenly over the
 *  whole film when they are too many (sound.onsets.times). */
export const SEE_VERSION = 2;
export type SeeDoc = Record<string, unknown> & { version: number };

export type StallRow = { from: number; to: number; seconds: number; rule: "fault" | "under the limit" | "end hold" | "not judged"; why: string };

/** What the stall rule makes of each still span: the findings of the rules when they ran, else "not judged". Pure. */
export function judgeStalls(stalls: [number, number][], seconds: number, fps: number, fi: FindingsMeasures | null): StallRow[] {
  const lim = fi?.limits.stall ?? null;
  const limWords = lim === null ? "" : `the limit of ${lim} s (${fi?.system ? `the system ${fi.system}` : "the default with no system; --system <id> takes a system's limit"})`;
  return stalls.map(([from, to]) => {
    const row = { from, to, seconds: round(to - from) };
    if (to >= seconds - 1.5 / fps) return { ...row, rule: "end hold" as const, why: `the closing hold: the stall rule does not count a still span that reaches the last frame; the ending rule judges it${fi?.system ? "" : ", and it needs a system (--system <id>)"}` };
    if (!fi) return { ...row, rule: "not judged" as const, why: "the rules did not run" };
    const hit = fi.findings.find((f) => f.check === "stall" && (f.from ?? 0) < to && (f.to ?? 0) > from);
    if (hit) return { ...row, rule: "fault" as const, why: `the stall rule reports it (${hit.severity}): over ${limWords}` };
    return { ...row, rule: "under the limit" as const, why: row.seconds > (lim ?? Infinity) ? `the stall rule counts this span under ${limWords} (it counts from 0.2 s after the last change)` : `${row.seconds} s is under ${limWords}` };
  });
}

/** At most `max` items, spread evenly over the list: each n-th item from the first. Pure. */
export function thinEvenly<T>(xs: T[], max: number): { kept: T[]; every: number } {
  const every = Math.max(1, Math.ceil(xs.length / max));
  return { kept: xs.filter((_, i) => i % every === 0), every };
}

const pick = <T extends object>(o: T, keys: (keyof T)[]) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

/** The measures as one versioned document: the full form, before any budget. Pure. */
export function seeDocument(m: VideoMeasures, version: string): SeeDoc {
  const f = m.file, p = m.picture;
  const lens = p.shots.map((s) => s.to - s.from);
  const why: Why = { ...m.why };
  const doc: SeeDoc = {
    version: SEE_VERSION,
    made: `untell see ${version}`,
    about: "Measures of one video file for a model that cannot watch it. Each value is measured, not judged. A null has its reason under why. The pictures are contact sheets of the file: open them in order.",
    key: KEY,
    file: {
      name: f.name, path: f.path, seconds: f.seconds, width: f.width, height: f.height, aspect: f.aspect, ...(f.rotation ? { rotation: f.rotation } : {}),
      fps: f.fps, frames: f.frames ?? p.frames, video: f.video.codec + (f.video.profile ? ` (${f.video.profile})` : ""), pixFmt: f.video.pixFmt,
      kbps: f.kbps, videoKbps: f.video.kbps, audio: f.audio ? `${f.audio.codec}, ${f.audio.channels ?? "?"} ch, ${f.audio.sampleRate ? f.audio.sampleRate / 1000 : "?"} kHz` : null,
      sound: f.sound, bytes: f.bytes,
    },
    timeline: {
      cuts: p.cuts.map((c) => [c.t, c.strength]),
      changes: (p.changes ?? []).map((c) => [c.t, c.kind, c.strength]),
      shots: p.shots.map((s) => ({
        from: s.from, to: s.to, by: s.by, motion: s.motion.level, brightness: s.brightness, palette: s.palette, ink: s.ink,
        ...(s.text ? { text: { zones: s.text.zones, ...(s.text.words !== undefined ? { words: s.text.words } : {}), ...(s.text.why ? { why: s.text.why } : {}) } } : {}),
      })),
    },
    pace: {
      shots: p.shots.length, meanShot: round(lens.reduce((a, b) => a + b, 0) / Math.max(1, lens.length)), shortestShot: round(Math.min(...lens)), longestShot: round(Math.max(...lens)),
      cutsPerMinute: round(p.cuts.length / Math.max(1e-9, p.seconds / 60), 1),
      stalls: judgeStalls(p.stalls, p.seconds, p.fps, m.findings), stillShare: p.stillShare,
      firstSecond: pick(p.firstSecond, ["blankStart", "firstChangeAt", "motion", "cuts", "brightness", "inkShare", "inkAt1s", "ink", "textLike"]),
    },
    colour: { palette: p.film.palette, brightness: p.film.brightness, contrast: p.film.contrast, polarity: p.film.polarity, ink: p.film.ink, inkShare: p.film.inkShare },
    text: {
      measured: p.text.ocr
        ? `where detail of text size shows (edges in rows of 8 px cells on frames 640 px on the long side), and the words that ${p.text.ocr.tool} reads with a confidence of 70 or more on one frame of each shot with that detail (${p.text.ocr.shots} of ${p.text.ocr.of} shots)`
        : "where detail of text size shows: edges in rows of 8 px cells on frames 640 px on the long side",
      notMeasured: p.text.ocr
        ? "the size, font and colour of the type; words that change inside a shot; grain, leaves and fine patterns can show as text detail"
        : "the words (no OCR tool here: with tesseract on PATH, untell see reads them); the size, font and colour of the type; grain, leaves and fine patterns can show as text detail",
      shareOfTime: p.text.share, zones: p.text.zones, shotsWithText: p.text.shots,
    },
    sound: null,
    findings: null,
    pictures: { folder: m.outDir, pages: m.pages.map((pg) => ({ file: relative(m.outDir, pg.file) || pg.file, from: pg.from, to: pg.to, frames: pg.frames })) },
    notes: { dropped: [] as string[], notMeasured: [] as string[] },
    why,
  };
  if (m.sound) {
    const s = m.sound;
    doc.sound = {
      lufsIntegrated: s.lufsIntegrated, truePeakDb: s.truePeakDb, loudnessRange: s.loudnessRange,
      energy: { from: 0, unit: "dBFS: the RMS level of the sound mixed to mono, one value for each step of `step` seconds from 0 s", ...s.energy },
      silent: s.silent, ...(s.digitalSilence.length ? { digitalSilence: s.digitalSilence } : {}),
      onsets: (() => {
        const t = thinEvenly(s.onsets, 64);
        return { count: s.onsets.length, times: t.kept, ...(t.every > 1 ? { every: t.every, thinned: `one onset in ${t.every}, spread over the whole film` } : {}), method: "a rise of the 10 ms level over its mean plus 2.5 deviations, at least 120 ms apart" };
      })(),
      tempo: s.tempo ? { bpm: s.tempo.bpm, trust: s.tempo.confidence, pulseClarity: s.tempo.pulseClarity, grid: s.tempo.grid, meter: s.tempo.meter, beats: s.tempo.beats.length, firstBeat: s.tempo.beats[0] ?? null } : null,
      cutsOnSound: s.cutsOnSound,
      ...(Object.keys(s.why).length ? { why: s.why } : {}),
    };
  }
  if (m.findings) {
    const fi = m.findings;
    doc.findings = {
      ok: fi.ok, errors: fi.errors, warnings: fi.warnings, advice: fi.advice, system: fi.system,
      limits: fi.limits,
      ...(fi.system ? {} : { limitsFrom: "the defaults of the checks: no system was given (--system <id> takes a system's limits). Without a system, a rule cannot know the design: an empty frame or a long hold can be on purpose" }),
      causes: fi.causes.map((c) => ({ check: c.check, severity: c.severity, from: c.from, to: c.to, count: c.count, fix: c.fix })),
      findings: fi.findings, ran: fi.ran, notRun: fi.notRun,
      more: `untell check ${f.path} lists every rule that did not run, and untell check --explain <id> says what a rule measures`,
    };
  }
  const nm = doc.notes as { notMeasured: string[] };
  nm.notMeasured.push("what the film means, says or shows as objects: these are measures of pixels and sound");
  if (!m.sound) nm.notMeasured.push(`sound: ${m.why.sound ?? "none"}`);
  else if (m.sound.why.tempo) nm.notMeasured.push(`tempo: ${m.sound.why.tempo}`);
  if (!p.text.ocr) nm.notMeasured.push("the words on screen: no OCR tool (tesseract) on PATH");
  if (!m.findings) nm.notMeasured.push(`findings: ${m.why.findings ?? "the rules did not run"}`);
  if (!Object.keys(why).length) delete doc.why;
  return doc;
}

/** The document as written: the top-level keys and each shot on a line of their own, the rest compact. */
export function formatDoc(doc: SeeDoc): string {
  const lines = Object.entries(doc).map(([k, v]) => {
    if (k === "timeline" && v && typeof v === "object" && Array.isArray((v as { shots?: unknown }).shots)) {
      const t = v as Record<string, unknown> & { shots: unknown[] };
      const rest = Object.entries(t).filter(([kk]) => kk !== "shots").map(([kk, vv]) => `${JSON.stringify(kk)}:${JSON.stringify(vv)}`);
      return `${JSON.stringify(k)}:{${rest.join(",")}${rest.length ? "," : ""}"shots":[\n${t.shots.map((s) => JSON.stringify(s)).join(",\n")}\n]}`;
    }
    return `${JSON.stringify(k)}:${JSON.stringify(v)}`;
  });
  return `{\n${lines.join(",\n")}\n}\n`;
}

type Shotish = Record<string, unknown> & { from: number; to: number };

/**
 * The steps that make the document smaller, in the order untell see takes them. Each changes the document and
 * returns the words for notes.dropped, or null when it had nothing to drop. The order keeps the timeline (the cuts
 * and the shots) and the findings longest: detail goes first, then the form of each shot.
 */
export const DROP_STEPS: { name: string; run: (d: SeeDoc) => string | null }[] = [
  { name: "onset times", run: (d) => { const o = (d.sound as { onsets?: { times?: number[] } } | null)?.onsets as Record<string, unknown> | undefined; if (!(o?.times as number[] | undefined)?.length) return null; delete o!.times; delete o!.every; delete o!.thinned; return "the onset times (the count stays)"; } },
  { name: "text zones of each shot", run: (d) => eachShot(d, (s) => { const t = s.text as Record<string, unknown> | undefined; if (!t?.zones) return false; delete t.zones; return true; }, "the text zones of each shot (the film's zones stay)") },
  { name: "palettes of each shot to one colour", run: (d) => eachShot(d, (s) => { const p = s.palette as unknown[] | undefined; if (!p || p.length <= 1) return false; s.palette = p.slice(0, 1); return true; }, "the palette of each shot after its first colour") },
  { name: "ink grids of each shot", run: (d) => eachShot(d, (s) => { if (!s.ink) return false; delete s.ink; return true; }, "the ink grid of each shot (the film's grid and the first second's stay)") },
  { name: "coarser level curve", run: (d) => coarser(d) },
  { name: "coarser level curve again", run: (d) => coarser(d) },
  { name: "measured values of each finding", run: (d) => { const f = d.findings as { findings?: Record<string, unknown>[] } | null; if (!f?.findings?.some((x) => "measured" in x)) return null; for (const x of f.findings) { delete x.measured; delete x.limit; } return "the measured values and limits of each finding (the causes keep their fix)"; } },
  { name: "palettes of each shot", run: (d) => eachShot(d, (s) => { if (!s.palette) return false; delete s.palette; return true; }, "the palette of each shot (the film's palette stays)") },
  { name: "words of each shot to 60 characters", run: (d) => eachShot(d, (s) => { const t = s.text as { words?: string } | undefined; if (!t?.words || t.words.length <= 60) return false; t.words = `${t.words.slice(0, 57)}...`; return true; }, "the words of each shot after 60 characters") },
  { name: "shots as rows", run: (d) => {
    const tl = d.timeline as { shots: unknown[]; shotRow?: string };
    if (!tl.shots.length || Array.isArray(tl.shots[0])) return null;
    tl.shots = (tl.shots as Shotish[]).map((s) => { const w = (s.text as { words?: string } | undefined)?.words; return [s.from, s.to, s.motion, s.brightness, ...(w ? [w] : [])]; });
    tl.shotRow = "[from, to, motion, brightness, words on screen when read]";
    return "the shots as objects: each shot is a row [from, to, motion, brightness, words]";
  } },
  { name: "cut strengths", run: (d) => { const tl = d.timeline as { cuts: unknown[] }; if (!tl.cuts.length || !Array.isArray(tl.cuts[0])) return null; tl.cuts = (tl.cuts as number[][]).map((c) => c[0]!); return "the strength of each cut (the times stay)"; } },
  { name: "words of each shot", run: (d) => { const tl = d.timeline as { shots: unknown[][]; shotRow?: string }; if (!tl.shots.some((s) => Array.isArray(s) && s.length > 4)) return null; tl.shots = tl.shots.map((s) => s.slice(0, 4)); tl.shotRow = "[from, to, motion, brightness]"; return "the words of each shot"; } },
  { name: "shots into windows", run: (d) => windows(d, 40) },
  { name: "cut times", run: (d) => { const tl = d.timeline as { cuts: unknown }; if (!Array.isArray(tl.cuts) || !tl.cuts.length) return null; const n = tl.cuts.length; tl.cuts = { count: n }; return "the time of each cut (the count stays; the windows count the cuts in them)"; } },
  { name: "findings to causes", run: (d) => { const f = d.findings as { findings?: unknown[]; ran?: unknown } | null; if (!f?.findings) return null; delete f.findings; delete f.ran; return "each finding (the causes stay, one fix each)"; } },
  { name: "rules not run", run: (d) => { const f = d.findings as { notRun?: unknown; more?: unknown } | null; if (!f?.notRun) return null; delete f.notRun; delete f.more; return "the count of the rules that did not run"; } },
  { name: "fix of each cause", run: (d) => { const f = d.findings as { causes?: Record<string, unknown>[] } | null; if (!f?.causes?.some((c) => "fix" in c)) return null; for (const c of f.causes) delete c.fix; return "the fix of each cause (untell check <video> prints it)"; } },
  { name: "stall spans", run: (d) => { const p = d.pace as { stalls?: unknown } | undefined; if (!p || !Array.isArray(p.stalls) || !p.stalls.length) return null; p.stalls = p.stalls.length; return "the time of each stall (the count stays)"; } },
  { name: "text method", run: (d) => { const x = d.text as Record<string, unknown> | undefined; if (!x?.notMeasured) return null; delete x.notMeasured; x.measured = "detail of text size (untell see --help says how)"; return "the words on how the text is measured"; } },
  { name: "shots into 12 windows", run: (d) => windows(d, 12) },
  { name: "notes in short", run: (d) => { const n = d.notes as { dropped: string[]; notMeasured?: string[] } | undefined; if (!n?.notMeasured) return null; delete n.notMeasured; return "the notes on what is not measured"; } },
];

function eachShot(d: SeeDoc, fn: (s: Record<string, unknown>) => boolean, words: string): string | null {
  const shots = (d.timeline as { shots: unknown[] }).shots;
  let any = false;
  for (const s of shots) if (s && typeof s === "object" && !Array.isArray(s) && fn(s as Record<string, unknown>)) any = true;
  return any ? words : null;
}

function coarser(d: SeeDoc): string | null {
  const e = (d.sound as { energy?: { step: number; db: number[] } } | null)?.energy;
  if (!e || e.db.length <= 12) return null;
  const db: number[] = [];
  for (let i = 0; i < e.db.length; i += 2) db.push(e.db[i + 1] === undefined ? e.db[i]! : Math.round(10 * Math.log10((10 ** (e.db[i]! / 10) + 10 ** (e.db[i + 1]! / 10)) / 2)));
  e.db = db;
  e.step *= 2;
  return `the level curve at a coarser step (${e.step} s)`;
}

/** The shots (or wider windows) merged into `n` windows of equal time: [from, to, shots, the highest motion]. */
function windows(d: SeeDoc, n: number): string | null {
  const tl = d.timeline as { shots?: unknown[][]; shotRow?: string; windows?: unknown[][] };
  const file = d.file as { seconds: number };
  if (tl.windows && tl.windows.length > n) {
    // Wider windows from the windows: their shots added (a shot across a border counts in both), the highest motion.
    const w = file.seconds / n, order: MotionLevel[] = ["still", "low", "medium", "high"];
    tl.windows = Array.from({ length: n }, (_, k) => {
      const inside = tl.windows!.filter((x) => (x[0] as number) < (k + 1) * w - 1e-9 && (x[1] as number) > k * w + 1e-9);
      return [round(k * w, 1), round((k + 1) * w, 1), inside.reduce((s, x) => s + (x[2] as number), 0), order[inside.reduce((m, x) => Math.max(m, order.indexOf(x[3] as MotionLevel)), 0)]];
    });
    return `the windows, merged into ${n}`;
  }
  if (!tl.shots?.length || tl.shots.length <= n || !Array.isArray(tl.shots[0])) return null;
  const w = file.seconds / n;
  const order: MotionLevel[] = ["still", "low", "medium", "high"];
  const out: unknown[] = [];
  for (let k = 0; k < n; k++) {
    const a = k * w, b = (k + 1) * w;
    const inside = tl.shots!.filter((s) => (s[0] as number) < b && (s[1] as number) > a);
    const top = inside.reduce((m, s) => Math.max(m, order.indexOf(s[2] as MotionLevel)), 0);
    out.push([round(a, 1), round(b, 1), inside.length, order[top]]);
  }
  delete (tl as Record<string, unknown>).shots;
  tl.windows = out as unknown[][];
  tl.shotRow = "windows: [from, to, shots in it, the highest motion]";
  return `the shots, merged into ${n} windows of equal time`;
}

/**
 * Makes the document fit `budget` tokens: it takes the steps of DROP_STEPS in order until the estimate fits, and
 * records each step in notes.dropped. When no step is left and it still does not fit, `fits` is false and a note says
 * the smallest size. Pure: it returns a new document.
 */
export function fitBudget(full: SeeDoc, budget: number): { doc: SeeDoc; text: string; tokens: number; dropped: string[]; fits: boolean } {
  const doc = JSON.parse(JSON.stringify(full)) as SeeDoc;
  const notes = doc.notes as { dropped: string[]; budget?: string };
  const measure = () => {
    doc.budget = { tokens: budget, estimate: TOKEN_RULE, used: 0 };
    let text = formatDoc(doc);
    // The count is part of the text: set it, then once more with its own digits in it.
    for (let i = 0; i < 3; i++) { (doc.budget as { used: number }).used = estimateTokens(text); text = formatDoc(doc); }
    return { text, tokens: estimateTokens(text) };
  };
  let m = measure();
  const names: string[] = [];
  for (const step of DROP_STEPS) {
    if (m.tokens <= budget) break;
    const words = step.run(doc);
    if (words) { notes.dropped.push(words); names.push(step.name); m = measure(); }
  }
  // Last: the list of what was dropped in its short form (the names of the steps).
  const said = [...notes.dropped];
  if (m.tokens > budget && names.length) { notes.dropped = names; m = measure(); }
  const fits = m.tokens <= budget;
  if (!fits) { notes.budget = `the budget of ${budget} tokens is too small: this is the smallest form, about ${m.tokens} tokens`; m = measure(); }
  return { doc, text: m.text, tokens: m.tokens, dropped: said, fits };
}
