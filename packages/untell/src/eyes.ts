// `untell check <video>` with no scene: the eyes for any film. It reads a video file that untell did not make (or one
// whose scene is not here), and runs every check that needs only the file: the frame rules that read pixels and the
// sound rules that read the file's own audio. It lists each rule that it did not run and why (it needs the scene's
// nodes and the ink of each text, the scene's sound clips, or a system). With --system <id>, the limits come from that
// system (the stall limit, the loudness target, the end); without it, from the defaults of the checks.
//
// The detector reads a recording and a capture from one root (detect.py, film.py). This module makes that root in
// .untell/eyes/<file>/: the frames of the file (ffmpeg), an elements list and a capture with no nodes and no ink, the
// file's sound, and a link to the file as the render. So the checks run unchanged.
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { readTokens, systemsDir } from "./build";
import { detectFramework } from "./detect";
import { detectorRules, loudnessOf, messageOf, runDetect, type DetectorResult, type DetectorRule } from "./detector";
import { ensureDetectorPython, ffmpegFix, runs } from "./env";
import { MissingToolError, UsageError } from "./errors";
import { builtScene, isSceneModule, screenStyle, stepBuffer, verdictLine, type CheckFinding, type CheckReport } from "./check";
import { filmsFolders, lintFiles } from "./lint";
import { sheet } from "./sheet";
import { link } from "./worktree";

/** The video formats that the eyes read. */
export const VIDEO_EXT = [".mp4", ".mov", ".webm", ".m4v", ".mkv"];

/**
 * The rules that read only the file, by the detector module that reports them. A module may report more rules than
 * these (the sound module judges the scene's clips too); a finding of a rule outside this table is not a finding of a
 * file, and the eyes leave it out.
 */
export const FILE_RULES: Record<string, string[]> = {
  stall: ["stall"],
  a11y_flash: ["a11y/flash"],
  accident: ["flash-frame"],
  dead_space: ["dead-space"],
  sound: ["sound/true-peak", "sound/mix-loudness", "sound/first-2s-level", "sound/phone-loss", "sound/digital-silence"],
};
/**
 * The rules that read only the file but take their limits or their premise from a system: the end that the system
 * asks for, a hold on one flat colour (a dip to black between two shots is an edit in a film with no system), and the
 * music as the clock of the picture (an accent, a loud bar or the drop with no picture change).
 */
export const SYSTEM_RULES: Record<string, string[]> = {
  ending: ["ending"],
  accident: ["accident"],
  sound: ["sound/onset-unmatched", "sound/hold-on-loud-bar", "sound/drop-on-change"],
};

/** Why a rule does not run on a file alone. One reason per group, in the order the list prints them. */
export const NEED = {
  scene: "they need the scene: its nodes and the ink of each text",
  sound: "they need the scene's sound clips and the track's beat grid",
  system: "they need a system for their limits: give --system <id>",
  project: "it compares the films of a project",
} as const;

/** The sound rules that judge a clip of the scene (an effect, the bed, the grid), not the mix of the file. */
const CLIP_RULES = new Set(["sound/effect-too-loud", "sound/cut-on-beat", "sound/hit-on-beat", "sound/hit-over-bed", "sound/hit-double",
  "sound/hard-start", "beat-sync", "hit-over-bed", "loudness"]);

/**
 * The plan for a file: the detector modules to run, the rules that run, and for every other rule of the catalog the
 * reason it does not run. Every rule is in exactly one of the two. Pure.
 */
export function eyesPlan(rules: Pick<DetectorRule, "id">[], hasSystem: boolean): { modules: string[]; runs: string[]; skipped: Record<string, string> } {
  const tables = hasSystem ? [FILE_RULES, SYSTEM_RULES] : [FILE_RULES];
  const runIds = new Set(tables.flatMap((t) => Object.values(t).flat()));
  const systemIds = new Set(Object.values(SYSTEM_RULES).flat());
  const skipped: Record<string, string> = {};
  for (const r of rules) {
    if (runIds.has(r.id)) continue;
    skipped[r.id] = systemIds.has(r.id) ? NEED.system : CLIP_RULES.has(r.id) ? NEED.sound : r.id === "sameness" ? NEED.project : NEED.scene;
  }
  return { modules: [...new Set(tables.flatMap((t) => Object.keys(t)))], runs: rules.filter((r) => runIds.has(r.id)).map((r) => r.id), skipped };
}

/** True when `untell check` should read the video alone: no project, or no scene module to check, or --no-scene. */
export function wantsEyes(cwd: string, o: { video?: string; film?: string; noScene?: boolean }): boolean {
  if (!o.video || o.film) return false;
  if (o.noScene) return true;
  const fw = detectFramework(cwd);
  if (!fw) return true;
  if (fw === "both") return false;
  // A project with no scene module of untell: the file is all there is to read.
  return !hasScene(cwd, fw);
}

function hasScene(cwd: string, fw: "remotion" | "hyperframes"): boolean {
  if (fw === "hyperframes") return !!builtScene(cwd);
  return filmsFolders(cwd).flatMap((d) => lintFiles([join(cwd, d)])).some((f) => /\.tsx?$/.test(f) && isSceneModule(readFileSync(f, "utf8")));
}

type Probe = { width: number; height: number; fps: number; seconds: number; audio: boolean };

/** The file's size, frame rate, length and whether it has sound, from ffprobe. */
export function probe(file: string): Probe {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height,avg_frame_rate,r_frame_rate:stream_side_data=rotation:format=duration", "-of", "json", file], { encoding: "utf8" });
  if (r.status !== 0) throw new UsageError(`ffprobe cannot read ${basename(file)}: ${(r.stderr ?? "").trim().split("\n").pop()}. Give a video file (${VIDEO_EXT.join(", ")}).`, "check");
  const j = JSON.parse(r.stdout) as { streams: { codec_type: string; width?: number; height?: number; avg_frame_rate?: string; r_frame_rate?: string; side_data_list?: { rotation?: number }[] }[]; format: { duration?: string } };
  const v = j.streams.find((s) => s.codec_type === "video");
  if (!v?.width || !v.height) throw new UsageError(`${basename(file)} has no video stream. untell check reads a film; for a sound file, run untell listen analyse <file>.`, "check");
  const rate = (s?: string) => { const [a, b] = (s ?? "0/1").split("/").map(Number); return b ? a! / b : 0; };
  const fps = rate(v.avg_frame_rate) || rate(v.r_frame_rate) || 30;
  // A phone clip carries a rotation: ffmpeg turns its frames when it decodes them, so the size turns too.
  const turned = (v.side_data_list ?? []).some((s) => Math.abs(Math.round(Number(s.rotation ?? 0))) % 180 === 90);
  return { width: turned ? v.height : v.width, height: turned ? v.width : v.height, fps, seconds: Number(j.format.duration ?? 0), audio: j.streams.some((s) => s.codec_type === "audio") };
}

/** The frame rate the checks read a file at: its own whole rate, at most 30 (the checks' limits are set at 30 fps). */
export const readFps = (fps: number) => Math.max(1, Math.min(30, Math.round(fps)));

/**
 * The frame size the checks read a file at: its own, at most 1920 px on the long side (even numbers). The file rules
 * measure shares of the frame, so a 4K file reads as its 1080p copy; at full size a 4K minute took over 3 minutes
 * and 6 GB of memory.
 */
export function readSize(w: number, h: number): { width: number; height: number } {
  const k = Math.min(1, 1920 / Math.max(w, h));
  if (k === 1) return { width: w, height: h };
  return { width: Math.max(2, Math.round((w * k) / 2) * 2), height: Math.max(2, Math.round((h * k) / 2) * 2) };
}

export type EyesOptions = { system?: string; sheet?: boolean; json?: boolean };

/** `untell check <video>` with no scene. Returns the exit code: 0 passed, 1 findings, 2 a missing tool. */
export async function eyes(cwdArg: string, videoArg: string, o: EyesOptions = {}): Promise<number> {
  const cwd = resolve(cwdArg);
  const file = resolve(cwd, videoArg);
  if (!existsSync(file)) throw new UsageError(`${videoArg} does not exist. Give the path of a video file (${VIDEO_EXT.join(", ")}).`, "check");
  if (!VIDEO_EXT.includes(extname(file).toLowerCase())) throw new UsageError(`${videoArg} is not a video file. untell check reads ${VIDEO_EXT.join(", ")}.`, "check");
  const noTools = ["ffmpeg", "ffprobe"].filter((t) => !runs(t));
  if (noTools.length) throw new MissingToolError(`untell check needs ${noTools.join(" and ")} to read a video. Install it: ${ffmpegFix()}`);
  if (o.system) readTokens(cwd, o.system);
  const out = o.json ? (s: string) => console.error(s) : (s: string) => console.log(s);
  const S = screenStyle(!!(o.json ? process.stderr.isTTY : process.stdout.isTTY) && !process.env.NO_COLOR);
  // The verdict is the first line: the step lines wait until the screen, as in a check of a scene.
  const steps = stepBuffer(out, !!process.stderr.isTTY && !process.env.NO_COLOR);
  try {
    const r = await eyesRun(cwd, file, o, steps.log);
    if (!r) return 2;
    const { report, res, ran, reportPath } = r;
    printEyes(report, res, { log: out, steps: steps.take(), S, file: shownPath(cwd, file), system: o.system ?? null, reportPath: relative(cwd, reportPath) || reportPath, cwd, ran });
    if (o.json) console.log(JSON.stringify(report, null, 1));
    return report.ok ? 0 : 1;
  }
  finally { steps.flush(); }
}

/** A file's path as the screen shows it: relative to the folder, or absolute when the file is outside it. */
export const shownPath = (cwd: string, file: string) => { const r = relative(cwd, file); return !r ? basename(file) : r.startsWith("..") ? file : r; };

export type EyesRun = { report: CheckReport; res: DetectorResult; ran: string[]; reportPath: string };

/**
 * The rules that need only the file, run on it, with no screen: the report (also written to
 * .untell/eyes/<file>/report.json), the detector's result and the rules that ran. `log` takes the step lines. Null when
 * no Python can run the detector (the reason is logged). untell check <video> prints it; untell see reads it.
 */
export async function eyesRun(cwdArg: string, fileArg: string, o: { system?: string; sheet?: boolean }, log: (s: string) => void): Promise<EyesRun | null> {
  const cwd = resolve(cwdArg), file = resolve(cwd, fileArg);
  if (o.system) readTokens(cwd, o.system);
  const shown = shownPath(cwd, file);
  const p0 = probe(file);
  const fps = readFps(p0.fps);
  const size = readSize(p0.width, p0.height);
  const p = { ...p0, ...size };
  log(`untell check  ${shown} · the file only · ${p0.seconds.toFixed(1)} s · ${p0.width} × ${p0.height}${size.width !== p0.width ? ` (read at ${size.width} × ${size.height})` : ""} · ${o.system ? `limits of ${o.system}` : "default limits (no system)"}`);

  const py = ensureDetectorPython(cwd, log);
  if (!py) return null;

  // The root the detector reads, one per file.
  const slug = basename(file).replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "film";
  const root = join(cwd, ".untell", "eyes", slug);
  const id = "film"; // the detector's film id: the root holds one film
  const rec = join(root, "out", "recordings", id), det = join(root, "out", "detector", id);
  mkdirSync(join(rec, "frames"), { recursive: true });
  mkdirSync(det, { recursive: true });
  mkdirSync(join(root, "assets", "media"), { recursive: true });
  writeFileSync(join(root, "assets", "media.json"), "{}\n");
  mkdirSync(join(root, "out"), { recursive: true });
  writeFileSync(join(root, "out", "tokens.json"), "{}\n"); // the old languages table: a film with no system reads the neutral grid
  link(systemsDir(cwd), join(root, "systems"));
  // The media table that the sound tools read: a file has no prepared media.
  mkdirSync(join(root, "src", "system"), { recursive: true });
  writeFileSync(join(root, "src", "system", "media.gen.ts"), "// No prepared media: untell check read a video file alone.\n");

  // 1. The frames, once per version of the file.
  const t0 = Date.now();
  const stamp = JSON.stringify({ file, size: statSync(file).size, mtime: statSync(file).mtimeMs, fps, ...(size.width !== p0.width ? { read: size } : {}) });
  const stampFile = join(rec, "source.json");
  let n: number;
  const cached = existsSync(stampFile) && readFileSync(stampFile, "utf8") === stamp;
  if (!cached) {
    rmSync(join(rec, "frames"), { recursive: true, force: true });
    mkdirSync(join(rec, "frames"), { recursive: true });
    const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", file, "-vf", `fps=${fps}${size.width !== p0.width ? `,scale=${size.width}:${size.height}:flags=area` : ""}`, "-q:v", "3", "-start_number", "0", join(rec, "frames", "f%04d.jpg")], { encoding: "utf8", timeout: 1800000 });
    if (r.status !== 0) throw new Error(`ffmpeg could not read the frames of ${shown}: ${(r.stderr ?? "").trim().split("\n").slice(-2).join(" ")}`);
  }
  n = 0;
  while (existsSync(join(rec, "frames", `f${String(n).padStart(4, "0")}.jpg`))) n++;
  if (n < 2) throw new UsageError(`${shown} has fewer than 2 frames. Give a film.`, "check");
  const empty = Array.from({ length: n }, () => []);
  writeFileSync(join(rec, "elements.json"), JSON.stringify({ fps, width: p.width, height: p.height, durationInFrames: n, system: o.system ?? null, frames: empty }));
  writeFileSync(join(rec, "tracks.json"), JSON.stringify({ frames: empty }));
  writeFileSync(join(det, "capture.json"), JSON.stringify({ durationInFrames: n, fps, width: p.width, height: p.height, nodes: [], ink: empty }));
  writeFileSync(join(det, "sources.json"), "[]\n");

  // 2. The sound: the file's own audio is the mix, and the file is the render.
  let soundNote = "no sound";
  const render = join(root, "out", "render", `${id}.mp4`);
  if (p.audio) {
    const wav = join(det, "sound.wav");
    if (!cached || !existsSync(wav)) {
      const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", file, "-vn", "-ac", "2", "-ar", "48000", "-c:a", "pcm_s16le", wav], { encoding: "utf8", timeout: 600000 });
      if (r.status !== 0) throw new Error(`ffmpeg could not read the sound of ${shown}: ${(r.stderr ?? "").trim().split("\n").slice(-2).join(" ")}`);
    }
    writeFileSync(join(det, "sound.json"), JSON.stringify({ hasSound: true, wav, loudness: loudnessOf(wav), clips: [], beats: {} }));
    link(file, render);
    soundNote = "the file's own audio";
  } else {
    writeFileSync(join(det, "sound.json"), JSON.stringify({ hasSound: false }));
    rmSync(render, { force: true });
  }
  writeFileSync(stampFile, stamp);
  log(`  read     ${n} frames at ${fps} fps${p.fps && Math.abs(p.fps - fps) > 0.01 ? ` (the file runs at ${+p.fps.toFixed(2)} fps)` : ""} in ${((Date.now() - t0) / 1000).toFixed(1)} s${cached ? " · from the last read" : ""} · sound: ${soundNote}`);

  // 3. The checks that need only the file.
  const rules = detectorRules();
  const plan = eyesPlan(rules, !!o.system);
  const t1 = Date.now();
  const res: DetectorResult = runDetect(root, id, py.py, plan.modules);
  const skipped: Record<string, string> = { ...plan.skipped };
  // A rule of the plan that did not apply to this file (no sound, a film too short): its own reason, in words for a file.
  for (const [k, why] of Object.entries(res.skipped)) {
    const mod = Object.keys({ ...FILE_RULES, ...SYSTEM_RULES }).find((m) => m.replace(/_/g, "-") === k || m.replace("_", "/") === k || m === k);
    const ids = mod ? [...(FILE_RULES[mod] ?? []), ...(o.system ? SYSTEM_RULES[mod] ?? [] : [])] : [k];
    for (const r of ids.filter((x) => plan.runs.includes(x))) skipped[r] = why.replace(/^a demo \(([\d.]+) s, [\d.]+ s or less\): film rules do not apply$/, "the file is $1 s long: a film rule reads a film longer than 3.5 s")
      .replace(/^sound not checked on a render: .*$/, "the file has no sound");
  }
  const ran = plan.runs.filter((r) => !(r in skipped));
  log(`  detect   ${ran.length} rules on the file in ${((Date.now() - t1) / 1000).toFixed(1)} s · ${Object.keys(skipped).length} not run (they need a scene${o.system ? "" : " or a system"}: listed below)`);

  // Only the findings of the rules a file can carry (the sound module also judges clips; a file has none).
  const mine = (c: string) => ran.includes(c);
  res.findings = res.findings.filter((f) => mine(f.check));
  res.groups = (res.groups ?? []).filter((g) => mine(g.check));
  res.verdict = undefined;
  const findings: CheckFinding[] = res.findings.map((f) => ({ check: f.check, severity: f.severity, message: messageOf(f, rules), fix: f.fix, from: f.from, to: f.to, measured: f.measured, limit: f.limit }));
  const report: CheckReport = {
    version: 1, project: cwd, framework: "none", ok: true,
    errors: findings.filter((f) => f.severity === "error").length, warnings: findings.filter((f) => f.severity === "warning").length, advice: findings.filter((f) => f.severity === "advice").length,
    film: { id: slug, scene: null, system: o.system ?? null, render: shown, capture: null },
    skipped, steps: [{ name: "detector", ok: true }], groups: res.groups ?? [], findings, declared: [], verdict: null, notes: res.notes ?? [], sheet: null,
  };
  // A check that crashed fails the run: a check that did not run must not read as a pass.
  const crashed = Object.entries(skipped).filter(([, why]) => why.startsWith("crashed"));
  report.steps = [{ name: "detector", ok: !crashed.length, ...(crashed.length ? { note: `${crashed.length} check(s) crashed: ${crashed.map(([c]) => c).join(", ")}` } : {}) }];
  report.ok = report.errors === 0 && !crashed.length;
  const reportPath = join(root, "report.json");
  const save = () => writeFileSync(reportPath, JSON.stringify(report, null, 1) + "\n");
  save();

  // 4. The review sheet, with the findings on it.
  if (o.sheet) {
    const sh = sheet(cwd, file, { findings: reportPath, quiet: true });
    report.sheet = { image: sh.sheet, json: sh.json, phone: sh.phone };
    save();
  }
  return { report, res, ran, reportPath };
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Breaks a list of ids into lines of at most `width` characters, each line after the first indented. */
export function wrapIds(ids: string[], indent: string, width = 110): string {
  const lines: string[] = [];
  let line = "";
  for (const id of ids) {
    const add = line ? `${line}, ${id}` : id;
    if (add.length + indent.length > width && line) { lines.push(line + ","); line = id; } else line = add;
  }
  if (line) lines.push(line);
  return lines.join(`\n${indent}`);
}

/** The screen of the eyes: the verdict, the causes, every finding, what did not run and why, the next command. */
export function printEyes(report: CheckReport, res: DetectorResult, o: { log: (s: string) => void; steps?: string[]; S: ReturnType<typeof screenStyle>; file: string; system: string | null; reportPath: string; cwd: string; ran: string[] }) {
  const { log, S } = o;
  const groups = res.groups ?? [];
  log(S.bold(verdictLine(report, res.verdict ?? null, S)) + (groups.length ? S.dim(` · ${plural(groups.length, "cause")}, one fix each`) : ""));
  if (groups.length) log("");
  groups.forEach((g, k) => {
    const title = g.cause.replace(/^\d+ findings share one cause: /, "").replace(/ \([\d.]+-[\d.]+ s\)$/, "");
    log(`  ${String(k + 1).padStart(2)}  ${S.mark(g.severity)} ${S.bold(title.padEnd(38))} ${S.span(g.from, g.to).padEnd(13)}${g.count > 1 ? ` ${g.count} findings, one fix` : ""}`.trimEnd());
    if (g.fix) log(`       ${S.dim("fix")}  ${g.fix}`);
  });
  if (report.findings.length) log(`\n  ${S.dim("every finding")}`);
  for (const f of report.findings) {
    log(`  ${S.mark(f.severity)} ${f.check.padEnd(22)} ${S.span(f.from ?? 0, f.to ?? f.from ?? 0)}`);
    log(`      ${S.dim(`measured ${JSON.stringify(f.measured)} · limit ${JSON.stringify(f.limit)}`)}`);
  }
  // What ran, and what did not, grouped by the reason.
  if (o.steps?.length) { log(""); for (const l of o.steps) log(l); }
  log(`\n  ${S.dim(`ran on the file (${o.ran.length}):`)} ${wrapIds(o.ran, "    ")}`);
  const byWhy = new Map<string, string[]>();
  for (const [c, why] of Object.entries(report.skipped ?? {})) byWhy.set(why, [...(byWhy.get(why) ?? []), c]);
  for (const [why, ids] of byWhy) log(`  ${S.dim(`- not run, ${why} (${ids.length}):`)}\n    ${S.dim(wrapIds(ids.sort(), "    "))}`);
  const lim = (res as DetectorResult & { limits?: { stall?: number; lufs?: number; lufsRange?: number } }).limits ?? {};
  log(`  ${S.dim(`limits: ${o.system ? `the system ${o.system}` : "the defaults of the checks"} (a still stretch over ${lim.stall ?? "?"} s, loudness ${lim.lufs ?? -16} LUFS ± ${lim.lufsRange ?? 2} LU, true peak -1 dBTP)${o.system ? "" : ". --system <id> takes a system's limits"}`)}`);
  if (report.sheet) {
    log(`\nreview sheet: ${relative(o.cwd, report.sheet.image)}\n        open it and read it: each row is a strip of time with the frames, motion, sound, cuts and findings`);
    if (report.sheet.phone) log(`phone sheet: ${relative(o.cwd, report.sheet.phone)}\n        open it at 100 %: a frame from each shot at the size a phone shows it`);
  }
  const first = groups[0];
  const again = `untell check ${o.file}${o.system ? ` --system ${o.system}` : ""}`;
  if (!report.ok && first) log(`\nnext    fix cause 1 in the film, render it again, then run: ${again}\n        untell check --explain ${first.check}  shows what it measures and why`);
  else if (!report.sheet) log(`\nnext    look at the film as one image: ${again} --sheet${report.findings.some((f) => f.check.startsWith("sound/")) ? "" : `\n        for the sound as data: untell listen mix ${o.file}`}`);
  else log(`\nnext    open the sheet and read it. A check that passes does not make a film good.`);
  log(`report  ${o.reportPath}`);
}

