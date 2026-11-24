// `untell sheet <video>`: the review sheet. A whole film in one image, for a model to read: frames on a time
// grid, the motion line (flat means a stall), the waveform with beats or onsets, cut marks and the findings.
// It also writes <sheet>.json with the exact numbers. The script is the repository's scripts/review_sheet.py, copied
// into registry/tools by the pack script. It needs ffmpeg and a Python with numpy and Pillow.
import { existsSync, readFileSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { analysisPython, missingForAnalysis } from "./env";
import { MissingToolError, UsageError } from "./errors";
import { registryDir } from "./kit";
import { mediaPaths } from "./media-paths";

/** `align`: the detector's align.json; the sheet draws the scene's guides and each alignment miss on its frames. */
/** `capture`: the capture.json of untell check (thin changes, a label that types or a line that draws, count as motion). */
export type SheetOptions = { capture?: string; out?: string; step?: string; beats?: string; findings?: string; cols?: string; quiet?: boolean; align?: string; theme?: string };
/** `phone`: the phone sheet (<sheet stem>.phone.jpg): a frame from each shot at 390 px wide, the size a phone shows it. */
export type SheetResult = { code: number; sheet: string; json: string; phone: string };

/** The sheet's path for a video: <video without extension>.sheet.jpg, beside the video. */
export const sheetPathFor = (video: string, out?: string) => resolve(out ?? video.replace(/\.[^./\\]+$/, "") + ".sheet.jpg");

/** --beats: a beats JSON file, or the name of a track that `untell media beats` measured. */
export function beatsFile(project: string, value: string): string {
  const asFile = resolve(project, value);
  if (existsSync(asFile)) return asFile;
  try {
    const p = join(mediaPaths(project).media, value, "beats.json");
    if (existsSync(p)) return p;
  } catch { /* no framework here: only a file can name the beats */ }
  throw new UsageError(`--beats ${value}: no such file, and no track "${value}" with beats. Run untell media beats ${value}, or give a beats JSON file.`, "sheet");
}

/**
 * The film's capture for a video: the capture.json of the last untell check of the scene that untell render wrote
 * beside the video (<video>.untell.json), or null.
 */
export function captureFor(project: string, video: string): string | null {
  try {
    const facts = JSON.parse(readFileSync(`${video}.untell.json`, "utf8")) as { scene?: string | null };
    if (!facts.scene) return null;
    const p = join(project, ".untell", "lab", "out", "detector", basename(facts.scene).replace(/\.[^.]+$/, ""), "capture.json");
    return existsSync(p) ? p : null;
  } catch { return null; }
}

/** Makes the review sheet. Throws MissingToolError, with the fix for each tool, when a tool is missing. */
export function sheet(projectArg: string, videoArg: string | undefined, o: SheetOptions = {}): SheetResult {
  const project = resolve(projectArg);
  if (!videoArg) throw new UsageError("untell sheet needs a video: untell sheet <video.mp4>. Render the film first.", "sheet");
  const video = resolve(project, videoArg);
  if (!existsSync(video)) throw new UsageError(`${videoArg} does not exist. Render the film first, then give the path of the video file.`, "sheet");
  if (![".mp4", ".mov", ".webm", ".m4v", ".mkv"].includes(extname(video).toLowerCase())) throw new UsageError(`${videoArg} is not a video file (mp4, mov, webm, m4v or mkv).`, "sheet");
  for (const [k, v] of [["--step", o.step], ["--cols", o.cols]] as const) if (v !== undefined && !(Number(v) > 0)) throw new UsageError(`${k} takes a number above 0, not "${v}".`, "sheet");
  const missing = missingForAnalysis(project, "untell sheet");
  if (missing.length) throw new MissingToolError(missing.join("\n"));
  const py = analysisPython(project)!;
  const out = sheetPathFor(video, o.out && resolve(project, o.out));
  const args = [join(registryDir(), "tools", "review_sheet.py"), video, "--out", out];
  if (o.step) args.push("--step", o.step);
  if (o.cols) args.push("--cols", o.cols);
  if (o.beats) args.push("--beats", beatsFile(project, o.beats));
  if (o.align && existsSync(resolve(project, o.align))) args.push("--align", resolve(project, o.align));
  // The capture: --capture, else the one of the scene that untell render wrote beside the video. With it, a label that
  // types or a line that draws counts as motion on the sheet, as it does in the detector.
  if (o.capture !== undefined && !existsSync(resolve(project, o.capture))) throw new UsageError(`--capture ${o.capture} does not exist. Run untell check <film> first: it writes .untell/lab/out/detector/<film>/capture.json.`, "sheet");
  const cap = o.capture !== undefined ? resolve(project, o.capture) : captureFor(project, video);
  if (cap) args.push("--capture", cap);
  // The theme: --theme, else UNTELL_THEME, else the script's default (dark).
  const theme = o.theme ?? process.env.UNTELL_THEME;
  if (theme) { if (theme !== "dark" && theme !== "light") throw new UsageError(`--theme is dark or light, not "${theme}".`, "sheet"); args.push("--theme", theme); }
  if (o.findings) {
    const f = resolve(project, o.findings);
    if (!existsSync(f)) throw new UsageError(`--findings ${o.findings} does not exist. Give the JSON that untell check --json or untell lint --json writes.`, "sheet");
    args.push("--findings", f);
  }
  const r = spawnSync(py.py, args, { cwd: project, encoding: "utf8", maxBuffer: 64 << 20, env: { ...process.env, UNTELL_FONTS: process.env.UNTELL_FONTS ?? join(registryDir(), "fonts") } });
  const text = `${r.stdout ?? ""}${r.stderr ?? ""}`.trimEnd();
  const json = out.replace(/\.[^./\\]+$/, "") + ".json";
  if (r.status !== 0) {
    console.error(text);
    throw new Error(`the review sheet failed for ${videoArg} (${py.py}). Check that ffmpeg can read the video: ffprobe ${videoArg}`);
  }
  if (!o.quiet) console.log(text + (cap ? `\nmotion: the frames and the film's capture (${relative(project, cap)}): a label that types or a line that draws counts as motion` : ""));
  return { code: 0, sheet: out, json, phone: out.replace(/\.[^./\\]+$/, "") + ".phone.jpg" };
}
