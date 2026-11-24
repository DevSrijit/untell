// `untell listen`: an agent cannot hear, so untell measures what a sound engineer hears and writes it as data.
// The scripts are the repository's scripts/listen/*.py and scripts/music_map.py (registry/tools). They run in the
// project's .venv-listen, in the work tree (worktree.ts), so they read the project's media.
//
//   untell listen setup [--extras [stems|tags|all]]   the Python tools (uv); the extras are large
//   untell listen analyse <name|file> ...              a track: listen.json, listen.md, listen.png; the music map
//   untell listen fx <name|file> ...                   an effect: listen.json and listen.md
//   untell listen mix <render> [--system <id>] [--nodes <file>]   the final mix against the system's target
//   untell listen compare "<brief>" [<name> ...]       ranks the analysed tracks for a brief
//
// For a track in the project (untell media add), analyse also writes music.json beside it and the kit's
// music table (<kit>/music.gen.ts), so music({ peakAt }) and beats() work.
import { findHyperframes, link } from "./worktree";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { readTokens } from "./build";
import { LISTEN_CORE, LISTEN_EXTRAS, LISTEN_MODULES, listenPython, pyHas, runs } from "./env";
import { MissingToolError, UsageError } from "./errors";
import { registryDir } from "./kit";
import { kindOfExt, mediaPaths, mediaPathsOrNull, type MediaPaths } from "./media-paths";
import { readManifest, writeMusicTable } from "./media-store";
import { captureFor } from "./sheet";
import { workEnv, workTree } from "./worktree";

export type ListenArgs = { positional: string[]; opt: (name: string) => string | undefined; flag: (name: string) => boolean; extras?: string | boolean };

const SETUP_HINT = "Run: untell listen setup";

/** Which extras a --extras value names. No value (true) means all of them. */
export function parseExtras(v: string | boolean | undefined): string[] {
  if (v === undefined || v === false) return [];
  if (v === true || v === "all") return Object.keys(LISTEN_EXTRAS);
  const names = v.split(",").map((s) => s.trim()).filter(Boolean);
  for (const n of names) if (!LISTEN_EXTRAS[n]) throw new UsageError(`--extras takes stems, tags or all, not "${n}".`, "listen");
  return names;
}

/** The pip packages for the core and the chosen extras, without repeats. */
export function listenPackages(extras: string[]): string[] {
  return [...new Set([...LISTEN_CORE, ...extras.flatMap((e) => LISTEN_EXTRAS[e]!.packages)])];
}

/** `untell listen setup`: .venv-listen with the core, and the extras when asked. Like untell media setup. */
export function listenSetup(project: string, extras: string[], json: boolean): number {
  const { py, pkgs, state } = installListen(project, extras, json);
  if (json) console.log(JSON.stringify({ version: 1, python: relative(project, py), packages: pkgs, ...state }, null, 1));
  return 0;
}

/** Installs the listen tools into .venv-listen. With `json`, every line goes to stderr, so stdout stays the caller's. */
function installListen(project: string, extras: string[], json: boolean) {
  const log = json ? (s: string) => console.error(s) : (s: string) => console.log(s);
  if (!runs("uv", "--version")) throw new MissingToolError(`untell listen needs its Python tools, and setting them up needs uv. Install uv (https://docs.astral.sh/uv/getting-started/installation/), then run: untell listen setup`);
  const py = listenPython(project);
  const run = (cmd: string, args: string[]) => spawnSync(cmd, args, { cwd: project, stdio: ["ignore", json ? 2 : "inherit", "inherit"] }).status === 0;
  if (!existsSync(py) && !run("uv", ["venv", "-q", ".venv-listen", "--python", "3.12"])) throw new Error("uv could not make .venv-listen. Check that uv can install Python 3.12: uv python install 3.12");
  const pkgs = listenPackages(extras);
  log(`installing into .venv-listen: ${pkgs.join(" ")}${extras.length ? " (the extras are large: torch is about 1 GB)" : ""}`);
  if (!run("uv", ["pip", "install", "-q", "--python", py, ...pkgs])) throw new Error(`uv could not install ${pkgs.join(" ")}. Read the uv error above, then run untell listen setup again.`);
  const state = listenState(project);
  log(`listen tools ready: the core${state.extras.length ? ` and ${state.extras.join(", ")}` : ""}.${state.missingExtras.length ? ` Add ${state.missingExtras.join(" and ")} with: untell listen setup --extras` : ""}`);
  if (!runs("ffmpeg")) log("Also install ffmpeg: untell listen mix and the music map need it.");
  return { py, pkgs, state };
}

/** What the project's listen environment can do. */
export function listenState(project: string): { core: boolean; extras: string[]; missingExtras: string[] } {
  const py = listenPython(project);
  if (!existsSync(py)) return { core: false, extras: [], missingExtras: Object.keys(LISTEN_EXTRAS) };
  const core = pyHas(py, LISTEN_MODULES);
  const extras = Object.keys(LISTEN_EXTRAS).filter((e) => pyHas(py, LISTEN_EXTRAS[e]!.modules));
  return { core, extras, missingExtras: Object.keys(LISTEN_EXTRAS).filter((e) => !extras.includes(e)) };
}

/**
 * The listen Python, set up on first use: with no .venv-listen (or one without the core), untell installs the core
 * once, as untell listen setup does (the large extras stay opt-in). With no uv, the error names the one command.
 */
export function needListen(project: string, json = false, install = installListen): string {
  const py = listenPython(project);
  if (existsSync(py) && pyHas(py, LISTEN_MODULES)) return py;
  (json ? console.error : console.log)(`untell listen: setting up its Python tools in .venv-listen once (the same as untell listen setup)...`);
  try { install(project, [], json); } catch (e) { throw new MissingToolError(`${(e as Error).message}${/untell listen setup/.test((e as Error).message) ? "" : ` ${SETUP_HINT}`}`); }
  if (!existsSync(py) || !pyHas(py, LISTEN_MODULES)) throw new MissingToolError(`.venv-listen still has no ${LISTEN_MODULES.join(", ")} after the setup. ${SETUP_HINT}`);
  return py;
}

const tool = (...p: string[]) => join(registryDir(), "tools", ...p);

/** Runs a listen script in the work tree. With `json`, its own output goes to stderr. */
function runPy(py: string, root: string, args: string[], json: boolean, capture = false) {
  const r = spawnSync(py, args, { cwd: root, env: workEnv(root), encoding: "utf8", maxBuffer: 256 << 20, stdio: capture ? "pipe" : ["ignore", json ? 2 : "inherit", "inherit"] });
  if (r.status !== 0) throw new Error(`${basename(args[0]!)} failed${capture ? `: ${(r.stderr ?? "").trim().split("\n").slice(-3).join(" ")}` : " (its error is above)"}`);
  return r.stdout ?? "";
}

/**
 * Where a listen item is: an asset of the project (its folder in the media folder), or a file. A file gets a
 * folder in .untell/listen/<name>/ (a link to it), so listen writes its results there and not beside the file.
 */
export function resolveItem(project: string, p: MediaPaths | null, item: string): { name: string; arg: string; dir: string; asset: boolean } {
  const m = p ? readManifest(p) : {};
  if (m[item]) return { name: item, arg: item, dir: join(p!.media, item), asset: true };
  const file = resolve(project, item);
  if (!existsSync(file)) throw new UsageError(`"${item}" is not an asset of this project and not a file. untell media list shows the assets.`, "listen");
  if (kindOfExt(extname(file)) !== "audio" && kindOfExt(extname(file)) !== "video") throw new UsageError(`${item} is not a sound file (MP3, WAV, M4A, AAC, OGG, FLAC or Opus).`, "listen");
  const name = basename(file).replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "sound";
  const dir = join(project, ".untell", "listen", name);
  mkdirSync(dir, { recursive: true });
  // A copy, not a link: listen writes its results beside the real file of a link.
  const at = join(dir, `source${extname(file).toLowerCase()}`);
  if (!existsSync(at) || statSync(at).size !== statSync(file).size || statSync(at).mtimeMs < statSync(file).mtimeMs) copyFileSync(file, at);
  return { name, arg: at, dir, asset: false };
}

type ListenJson = { rhythm?: { bpm: number; confidence: string }; sections?: { start: number; end: number; role: string }[]; drops?: { t: number }[]; dynamics?: { lufsIntegrated: number; truePeakDb: number; loudnessRange?: number }; duration?: number; class?: string };

/** The loudness range (LU) under which a track with no drop is flat: no bar stands out for a reveal. */
export const FLAT_LU = 2;

/** A note for a track with no measured drop and almost no loudness range, or null. */
export function flatNote(name: string, d: ListenJson): string | null {
  const lra = d.dynamics?.loudnessRange;
  if ((d.drops?.length ?? 0) > 0 || lra === undefined || lra >= FLAT_LU) return null;
  return `note: ${name} has no measured drop and a loudness range of ${lra.toFixed(1)} LU (under ${FLAT_LU} LU): no bar stands out, so a reveal has nothing in the music to land on. For a film with a reveal, choose a track with a drop or a clear build, or put the reveal on a hit.`;
}

/** Analyses tracks (or effects, with `fx`) and, for a project track, writes its music map and the kit's music table. */
export function analyse(project: string, items: string[], a: ListenArgs, fx = false): number {
  const json = a.flag("--json");
  if (!items.length) throw new UsageError(`untell listen ${fx ? "fx" : "analyse"} needs a sound: an asset name (untell media list) or a file.`, "listen");
  const py = needListen(project, json);
  let p: MediaPaths | null = null;
  try { p = mediaPaths(project); } catch { /* no kit: files only */ }
  const root = p ? workTree(project, p) : null;
  // The beat grid's cross-check runs the HyperFrames CLI. Without it, say so once, before the analysis.
  if (!fx && !findHyperframes(project)) (json ? console.error : console.log)(`note: no HyperFrames CLI here, so listen cannot cross-check the beat grid: its trust is at most "medium", and a grid the CLI would call low trust reads as medium. ${p?.framework === "hyperframes" ? "Run untell init again (it installs the project's CLI), or set UNTELL_HYPERFRAMES to a hyperframes program." : "To add the cross-check, install it (npm install --save-dev hyperframes) or set UNTELL_HYPERFRAMES."}`);
  const out: unknown[] = [];
  for (const it of items) {
    const r = resolveItem(project, p, it);
    const wt = root ?? join(project, ".untell", "lab");
    if (!root) { mkdirSync(join(wt, "assets"), { recursive: true }); writeFileSync(join(wt, "assets", "media.json"), "{}\n"); }
    const args = [tool("listen", "listen.py"), fx ? "fx" : "analyse", r.arg];
    if (!fx && a.flag("--force")) args.push("--force");
    if (!fx && a.flag("--no-stems")) args.push("--no-stems");
    // --drop <s>: the track's drop is at this track time (as a render showed it); listen pins the map's drop there.
    const drop = a.opt("--drop");
    if (drop !== undefined) {
      if (fx || items.length !== 1 || !(Number(drop) >= 0)) throw new UsageError(`--drop takes one track and its drop as a track time in seconds: untell listen analyse <track> --drop 79.1, not "${drop}".`, "listen");
      args.push("--drop", drop, "--force");
    }
    if (a.flag("--no-clap")) args.push("--no-clap");
    if (!fx && !r.asset && existsSync(join(r.dir, "listen.json")) && !a.flag("--force")) args.push("--force"); // a file can change under the same name
    const kept = !fx && r.asset && existsSync(join(r.dir, "listen.json")) && !a.flag("--force") && drop === undefined && !lacksCrossCheck(join(r.dir, "listen.json"), project);
    runPy(py, wt, args, json);
    const lj = join(r.dir, "listen.json");
    if (!existsSync(lj)) throw new Error(`listen wrote no ${relative(project, lj)}. Read its message above.`);
    let music: string | null = null;
    if (!fx && r.asset && p && root) {
      runPy(py, root, [tool("music_map.py"), r.name], true, true);
      const n = writeMusicTable(p);
      music = join(r.dir, "music.json");
      (json ? console.error : console.log)(`${r.name}: music map ${relative(project, music)}; ${p.kit}/music.gen.ts has ${n} track(s). music({ media: "${r.name}", peakAt }) and beats("${r.name}", ...) can use it now.`);
    } else if (!fx && !r.asset) {
      (json ? console.error : console.log)(`${r.name}: the results are in ${relative(project, r.dir)}/. To use it in a film, add it first: untell media add ${relative(project, resolve(project, it))} --as <name>`);
    }
    const d = JSON.parse(readFileSync(lj, "utf8")) as ListenJson;
    out.push({ name: r.name, asset: r.asset, listen: relative(project, lj), md: relative(project, join(r.dir, "listen.md")),
      png: existsSync(join(r.dir, "listen.png")) ? relative(project, join(r.dir, "listen.png")) : null, music: music ? relative(project, music) : null,
      ...(fx ? { class: d.class, duration: d.duration } : { bpm: d.rhythm?.bpm, confidence: d.rhythm?.confidence, sections: d.sections?.length, drops: d.drops?.map((x) => x.t),
        lufs: d.dynamics?.lufsIntegrated, truePeak: d.dynamics?.truePeakDb, duration: d.duration }) });
    const flat = fx ? null : flatNote(r.name, d);
    if (flat) (json ? console.error : console.log)(flat);
    if (kept) (json ? console.error : console.log)(`note: ${r.name} was analysed before, so these are the old results. To analyse it again (a new file, a new listen tool): untell listen analyse ${r.name} --force`);
    if (!json) console.log(`  read ${relative(project, join(r.dir, "listen.md"))}${existsSync(join(r.dir, "listen.png")) ? ` and look at ${relative(project, join(r.dir, "listen.png"))}` : ""}`);
  }
  if (json) console.log(JSON.stringify({ version: 1, items: out }, null, 1));
  return 0;
}

/** The last untell check's film: its system and the capture with its nodes. */
/** A kept analysis made with no HyperFrames CLI, now that one is found (UNTELL_HYPERFRAMES counts): listen.py analyses
 *  it again, so it is not "the old results". */
export function lacksCrossCheck(listenJson: string, project: string): boolean {
  try {
    const v = (JSON.parse(readFileSync(listenJson, "utf8")) as { validation?: { hyperframes?: string } }).validation;
    return v?.hyperframes === "not available" && !!findHyperframes(project);
  } catch { return false; }
}

function lastCheck(project: string): { system: string | null; capture: string | null } {
  try {
    const r = JSON.parse(readFileSync(join(project, ".untell", "check", "report.json"), "utf8")) as { film?: { system: string | null; capture: string | null } };
    const capture = r.film?.capture ? join(project, r.film.capture) : null;
    return { system: r.film?.system ?? null, capture: capture && existsSync(capture) ? capture : null };
  } catch { return { system: null, capture: null }; }
}

/** `untell listen mix <render>`: the final mix against its parts and the system's target. */
export function mix(project: string, a: ListenArgs): number {
  const json = a.flag("--json");
  const renderArg = a.positional[0];
  if (!renderArg) throw new UsageError("untell listen mix needs a render: untell listen mix <render.mp4> [--system <id>]", "listen");
  const render = resolve(project, renderArg);
  if (!existsSync(render)) throw new UsageError(`${renderArg} does not exist. Render the film first, then give the path of the video file.`, "listen");
  const py = needListen(project, json);
  if (!runs("ffmpeg")) throw new MissingToolError("untell listen mix needs ffmpeg. Install it: https://ffmpeg.org");
  const last = lastCheck(project);
  // The render's own film: untell render writes its scene beside the file (<render>.untell.json). Its capture and its
  // system win over the last check's, which can be another film.
  let own: { scene: string | null; capture: string | null; system: string | null } = { scene: null, capture: null, system: null };
  try {
    const facts = JSON.parse(readFileSync(`${render}.untell.json`, "utf8")) as { scene?: string | null };
    if (facts.scene && existsSync(join(project, facts.scene))) {
      own = { scene: facts.scene, capture: captureFor(project, render), system: readFileSync(join(project, facts.scene), "utf8").match(/export\s+const\s+system\s*=\s*["']([\w-]+)["']/)?.[1] ?? null };
    }
  } catch { /* a render that untell did not write: the last check's film */ }
  // No system: the default target of the checks (-16 LUFS within 2 LU), and a line that says so.
  const system = a.opt("--system") ?? own.system ?? last.system;
  if (system) readTokens(project, system);
  const root = workTree(project, mediaPathsOrNull(project));
  const notes: string[] = system ? [] : ["no system given: the mix is measured against the default target, -16 LUFS within 2 LU (--system <id> takes a system's target)"];
  let nodes = a.opt("--nodes") ? resolve(project, a.opt("--nodes")!) : own.scene ? own.capture : last.capture;
  if (nodes && !existsSync(nodes)) throw new UsageError(`--nodes ${a.opt("--nodes")} does not exist. Give a capture.json (untell check writes one) or a JSON list of audio nodes.`, "listen");
  if (!nodes) {
    nodes = join(project, ".untell", "listen", "no-nodes.json");
    mkdirSync(join(project, ".untell", "listen"), { recursive: true });
    writeFileSync(nodes, "[]\n");
    notes.push(`${own.scene ? `no check of ${own.scene} yet (run untell check ${own.scene} first, or give --nodes)` : "no scene nodes (run untell check first, or give --nodes)"}: the loudness and the phone check are measured, but no hit is judged against the bed`);
  }
  for (const n of notes) (json ? console.error : console.log)(`note: ${n}`);
  const md = runPy(py, root, [tool("listen", "listen.py"), "mix", render, nodes, system ?? "default"], json, true);
  const out = `${render}.mix.json`;
  if (json) console.log(JSON.stringify({ version: 1, render: relative(project, render), system, nodes: relative(project, nodes), notes, mix: JSON.parse(readFileSync(out, "utf8")), file: relative(project, out) }, null, 1));
  else console.log(`${md.trimEnd()}\nnumbers: ${relative(project, out)}`);
  return 0;
}

/** Each analysed track by name: an asset of the project with a listen.json, or a file analysed by its path. */
export function analysedTracks(project: string, p: MediaPaths | null): Record<string, string> {
  const out: Record<string, string> = {};
  const files = join(project, ".untell", "listen");
  if (existsSync(files)) for (const n of readdirSync(files)) if (existsSync(join(files, n, "listen.json"))) out[n] = join(files, n);
  if (p) for (const n of Object.keys(readManifest(p))) if (existsSync(join(p.media, n, "listen.json"))) out[n] = join(p.media, n);
  return out;
}

/** `untell listen compare "<brief>" [names]`: ranks the analysed tracks (assets and files) for a brief in words. */
export function compare(project: string, a: ListenArgs): number {
  const json = a.flag("--json");
  const [brief, ...names] = a.positional;
  if (!brief) throw new UsageError('untell listen compare needs a brief in words: untell listen compare "calm, steady, ends clean" [<name> ...]', "listen");
  const py = needListen(project, json);
  const p = mediaPathsOrNull(project);
  workTree(project, p);
  // Every analysed track: the project's assets, and the files analysed by path (.untell/listen/<name>/). The repository's
  // compare reads <root>/assets/media/*/listen.json, so a small tree of links gives it both (an asset wins a name).
  const tracks = analysedTracks(project, p);
  const have = Object.keys(tracks);
  if (!have.length) throw new UsageError("no analysed track here. Analyse a candidate first: untell listen analyse <file or asset name>", "listen");
  for (const n of names) if (!have.includes(n)) throw new UsageError(`"${n}" has no analysis. Run untell listen analyse ${n} first. Analysed: ${have.join(", ")}`, "listen");
  const croot = join(project, ".untell", "lab-compare");
  rmSync(croot, { recursive: true, force: true });
  for (const [n, dir] of Object.entries(tracks)) link(dir, join(croot, "assets", "media", n));
  const text = runPy(py, croot, [tool("listen", "listen.py"), "compare", brief, ...names, ...(json ? ["--json"] : [])], json, true);
  if (!json) { console.log(text.trimEnd()); return 0; }
  const last = text.trimEnd().split("\n").pop() ?? "[]";
  console.log(JSON.stringify({ version: 1, brief, ranked: JSON.parse(last) }, null, 1));
  return 0;
}

export const LISTEN_HELP = `untell listen: what a sound sounds like, as data, because an agent cannot hear

  untell listen setup [--extras [stems|tags|all]]
        the Python tools in .venv-listen (uv): numpy, scipy, librosa, soundfile, pyloudnorm, pillow.
        The first listen command sets them up itself; run this to set them up before, or for the extras.
        --extras adds the stems (torch, torchaudio, demucs) and the character tags (torch, transformers 4.46.3).
        Example: untell listen setup
  untell listen analyse <name|file> ... [--force] [--no-stems] [--no-clap] [--theme dark|light]
  untell listen analyse <track> --drop <seconds>    pin the track's drop at this track time (as a render showed it)
        a track: tempo, beats, bars, sections, the drop, loudness and key, in listen.json, listen.md and
        listen.png. For a track in the project, also its music map and <kit>/music.gen.ts, so
        music({ peakAt }) and beats() can use it.  Example: untell listen analyse bed
  untell listen fx <name|file> ... [--no-clap]
        an effect: its class, length and transients.  Example: untell listen fx thud
  untell listen mix <render> [--system <id>] [--nodes <capture.json>]
        the final mix: loudness against the system's target, each hit against the bed, the phone check.
        The system and the nodes come from the last untell check when you do not give them. With no system,
        the default target: -16 LUFS within 2 LU. Any video file works, also with no project.
        Example: untell listen mix out/kestrel-run.mp4 --system riso
  untell listen compare "<brief>" [<name> ...]
        ranks the analysed tracks for a brief in words, with the reasons.
        Example: untell listen compare "steady pulse, one clear drop, ends clean"

  --json   one JSON document on stdout (the progress goes to stderr)

The models of the extras download on first use (Demucs about 80 MB, CLAP about 600 MB). untell ships none.
Without an extra, analyse says what it skips and the command that adds it.`;

export async function listen(projectArg: string, sub: string | undefined, a: ListenArgs): Promise<number> {
  const project = resolve(projectArg);
  switch (sub) {
    case "setup": return listenSetup(project, parseExtras(a.extras), a.flag("--json"));
    case "analyse": case "analyze": return analyse(project, a.positional, a);
    case "fx": return analyse(project, a.positional, a, true);
    case "mix": return mix(project, a);
    case "compare": return compare(project, a);
    case undefined: case "help": console.log(LISTEN_HELP); return sub ? 0 : 2;
    default: throw new UsageError(`untell listen has no "${sub}". It has setup, analyse, fx, mix and compare.`, "listen");
  }
}
