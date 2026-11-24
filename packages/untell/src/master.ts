// `untell master <render>`: the last step of a mix. It brings the whole render to its system's loudness target
// and limits the true peak, so no scene has to tune a volume by hand. The script is the repository's scripts/master.py
// (registry/tools/master.py). It reads the target from the system's tokens in the project's kit docs (the
// work tree links them). It needs ffmpeg and any Python 3: the script uses the standard library only.
import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { readTokens } from "./build";
import { listenPython, runs, venvPython } from "./env";
import { MissingToolError, UsageError } from "./errors";
import { registryDir } from "./kit";
import { mediaPathsOrNull } from "./media-paths";
import { workEnv, workTree } from "./worktree";

/** The loudness target with no system and no --lufs: the default of the checks (untell check of a file with no system). */
export const DEFAULT_LUFS = -16;

export type MasterOptions = { system?: string; lufs?: string; peak?: string; out?: string; json?: boolean };
export type MasterResult = { version: 1; render: string; system: string | null; out: string | null; ok: boolean; done: boolean; note?: string;
  before?: { lufs: number | null; lra: number | null; truePeak: number | null }; after?: { lufs: number | null; lra: number | null; truePeak: number | null }; gain?: number; limited?: number };

/** Checks the numbers that master takes. */
export function masterArgs(o: MasterOptions): string[] {
  const out: string[] = [];
  if (o.lufs !== undefined) {
    if (!/^-?\d+(\.\d+)?$/.test(o.lufs) || Number(o.lufs) > 0 || Number(o.lufs) < -40) throw new UsageError(`--lufs takes a loudness from -40 to 0, such as -16, not "${o.lufs}".`, "master");
    out.push("--lufs", o.lufs);
  }
  if (o.peak !== undefined) {
    if (!/^-?\d+(\.\d+)?$/.test(o.peak) || Number(o.peak) > 0 || Number(o.peak) < -12) throw new UsageError(`--peak takes a true peak in dBTP from -12 to 0, such as -1, not "${o.peak}".`, "master");
    out.push("--peak", o.peak);
  }
  return out;
}

/** The system of the last untell check, or null. */
function checkedSystem(project: string): string | null {
  try { return (JSON.parse(readFileSync(join(project, ".untell", "check", "report.json"), "utf8")) as { film?: { system?: string } }).film?.system ?? null; } catch { return null; }
}

/** Masters a render and returns the result, printing nothing. untell master and untell render call it. */
export function runMaster(project: string, render: string, o: MasterOptions): { res: MasterResult; text: string[] } {
  const system = o.system ?? (o.lufs === undefined ? checkedSystem(project) : null);
  // No system and no level: the default target of the checks (the level a film with no system is checked against).
  if (!system && o.lufs === undefined) o = { ...o, lufs: String(DEFAULT_LUFS) };
  const extra = masterArgs(o);
  if (system) readTokens(project, system);
  const noTools = ["ffmpeg", "ffprobe"].filter((t) => !runs(t));
  if (noTools.length) throw new MissingToolError(`untell master needs ${noTools.join(" and ")}. Install ffmpeg: https://ffmpeg.org`);
  const py = [venvPython(project), listenPython(project)].find(existsSync) ?? "python3";
  const root = workTree(project, mediaPathsOrNull(project));
  const out = o.out ? resolve(project, o.out) : render.replace(/(\.[^./\\]+)$/, ".mastered$1");
  const args = [join(registryDir(), "tools", "master.py"), render, ...(system ? [system] : []), ...extra, "--out", out, "--json"];
  const r = spawnSync(py, args, { cwd: root, env: workEnv(root), encoding: "utf8", maxBuffer: 64 << 20 });
  if (r.error) throw new MissingToolError(`untell master needs Python 3 (${py} does not run). Install Python 3, or run untell media setup.`);
  const lines = (r.stdout ?? "").trimEnd().split("\n");
  const last = lines[lines.length - 1] ?? "";
  let res: MasterResult = { version: 1, render: relative(project, render), system, out: null, ok: r.status === 0, done: false };
  let text = lines;
  if (last.startsWith("{")) {
    const j = JSON.parse(last) as { before: MasterResult["before"]; after: MasterResult["after"]; gain: number; limited: number; ok: boolean; out: string };
    res = { ...res, before: j.before, after: j.after, gain: j.gain, limited: j.limited, ok: j.ok, done: true, out: relative(project, j.out) };
    text = lines.slice(0, -1);
  } else if (r.status === 0) {
    res.note = text.join(" ").replace(/^master: /, "") || "nothing to do";
    res.out = relative(project, render); // nothing to master: the render itself is the final file
  }
  if (r.status !== 0 && !res.done) throw new Error(`untell master failed: ${((r.stderr ?? "") + (r.stdout ?? "")).trim().split("\n").slice(-3).join(" ")}`);
  return { res, text };
}

export function master(projectArg: string, renderArg: string | undefined, o: MasterOptions): number {
  const project = resolve(projectArg);
  if (!renderArg) throw new UsageError("untell master needs a render: untell master <render.mp4> --system <id>", "master");
  const render = resolve(project, renderArg);
  if (!existsSync(render)) throw new UsageError(`${renderArg} does not exist. Render the film first (untell render <film> renders and masters it), then give the path of the video file.`, "master");
  const { res, text } = runMaster(project, render, o);
  if (!res.system && o.lufs === undefined && !o.json) console.log(`target: ${DEFAULT_LUFS} LUFS and a true peak of -1 dBTP, the defaults (no system given). --system <id> or --lufs <n> sets another target.`);
  if (o.json) console.log(JSON.stringify(res, null, 1));
  else {
    console.log(text.join("\n"));
    if (!res.done) console.log(`The render is the final file. Next: untell check --render ${res.out}`);
    else console.log(res.ok ? `Next: untell check --render ${res.out}` : "The master is not good enough: read the lines above, fix the mix in the scene, render again, then master again.");
  }
  return res.ok ? 0 : 1;
}
