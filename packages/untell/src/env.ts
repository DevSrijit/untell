// Probes of the machine and the project: which tools are installed. They only run version commands and read
// files. They never download or install anything, so `untell doctor` is safe to run at any time.
import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { spawnSync, type SpawnSyncOptions, type SpawnSyncOptionsWithStringEncoding, type SpawnSyncReturns } from "node:child_process";

/** The variables that turn off the HyperFrames CLI's usage reports and its check for a new version (both are network
 *  requests). untell sets them on every run of that CLI. */
export const HF_ENV = { HYPERFRAMES_NO_TELEMETRY: "1", DO_NOT_TRACK: "1", HYPERFRAMES_NO_UPDATE_CHECK: "1" } as const;

/** An environment for a run of the HyperFrames CLI: the given one (default: this process's), with HF_ENV over it. */
export const hfEnv = (base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv => ({ ...base, ...HF_ENV });

/**
 * Runs the HyperFrames CLI (`cmd` is the program and its first words, as hyperframesCommand gives it). Every run of
 * that CLI from untell goes through here, so each one has HF_ENV, whatever environment the caller gives.
 */
export function runHyperframes(cmd: string[], args: string[], o: SpawnSyncOptionsWithStringEncoding): SpawnSyncReturns<string>;
export function runHyperframes(cmd: string[], args: string[], o?: SpawnSyncOptions): SpawnSyncReturns<string | Buffer>;
export function runHyperframes(cmd: string[], args: string[], o: SpawnSyncOptions = {}): SpawnSyncReturns<string | Buffer> {
  return spawnSync(cmd[0]!, [...cmd.slice(1), ...args], { ...o, env: hfEnv(o.env ?? process.env) });
}

/** True when `cmd` runs. `arg` is its version flag. */
export const runs = (cmd: string, arg = "-version") => {
  const r = spawnSync(cmd, [arg], { encoding: "utf8", timeout: 15000 });
  return !r.error && r.status === 0;
};

/** The first line that `cmd arg` prints, or null when it does not run. */
export function versionOf(cmd: string, arg = "--version", env?: NodeJS.ProcessEnv): string | null {
  const r = spawnSync(cmd, [arg], { encoding: "utf8", timeout: 15000, ...(env ? { env } : {}) });
  if (r.error || r.status !== 0) return null;
  return `${r.stdout ?? ""}${r.stderr ?? ""}`.trim().split("\n")[0] ?? "";
}

/** The command that installs ffmpeg (with ffprobe) on this platform. */
export const ffmpegFix = () => platform() === "darwin" ? "brew install ffmpeg"
  : platform() === "win32" ? "winget install ffmpeg"
  : "sudo apt install ffmpeg (or your system's package manager)";

/** The project's media Python: .venv-media/bin/python. */
export const venvPython = (project: string) => join(project, ".venv-media", platform() === "win32" ? "Scripts/python.exe" : "bin/python");

/** True when `py` imports every module in `modules`. */
export function pyHas(py: string, modules: string[]): boolean {
  const r = spawnSync(py, ["-c", `import ${modules.join(", ")}`], { encoding: "utf8", timeout: 30000 });
  return !r.error && r.status === 0;
}

/** The oldest Python that untell's tools run on (the detector uses `X | None` types, new in 3.10). */
export const PY_MIN: [number, number] = [3, 10];
const pyVersions = new Map<string, [number, number] | null>();
/** The version of `py` as [major, minor], or null when it does not run. */
export function pyVersion(py: string): [number, number] | null {
  if (!pyVersions.has(py)) {
    const r = spawnSync(py, ["-c", "import sys; print(sys.version_info[0], sys.version_info[1])"], { encoding: "utf8", timeout: 15000 });
    const m = !r.error && r.status === 0 ? /(\d+) (\d+)/.exec(r.stdout ?? "") : null;
    pyVersions.set(py, m ? [Number(m[1]), Number(m[2])] : null);
  }
  return pyVersions.get(py)!;
}
/** True when `py` runs and is PY_MIN or later. */
export const pyNewEnough = (py: string) => { const v = pyVersion(py); return !!v && (v[0] > PY_MIN[0] || (v[0] === PY_MIN[0] && v[1] >= PY_MIN[1])); };
const vText = (v: [number, number] | null) => (v ? `${v[0]}.${v[1]}` : "none");
/** The Python programs on PATH that can make a .venv-media, newest first: python3.13 to python3.10, then python3. */
export const PY_CANDIDATES = ["python3.14", "python3.13", "python3.12", "python3.11", "python3.10", "python3"];
/** The first Python on PATH that is PY_MIN or later, or null. */
export const newPython = () => PY_CANDIDATES.find((p) => pyNewEnough(p)) ?? null;
/** The line that says which Python untell found and which it needs. */
export const pyTooOld = (py: string) => `${py} is Python ${vText(pyVersion(py))}, and untell's checks need Python ${PY_MIN.join(".")} or later`;

/**
 * The Python for the numpy and Pillow tools (the review sheet, the cover check): the project's .venv-media
 * when it has them, else python3 when it has them, else null.
 */
export function analysisPython(project: string): { py: string; venv: boolean } | null {
  const venv = venvPython(project);
  if (existsSync(venv) && pyNewEnough(venv) && pyHas(venv, ["numpy", "PIL"])) return { py: venv, venv: true };
  if (pyNewEnough("python3") && pyHas("python3", ["numpy", "PIL"])) return { py: "python3", venv: false };
  return null;
}

/** The cut-out model that `untell media setup` downloads. */
export const MODEL = "birefnet-general-lite";
const home = (p: string) => (p.startsWith("~") ? join(homedir(), p.slice(1)) : p);
/**
 * Where rembg keeps the model, in the order rembg reads them: its folder `<home>/models/<model>/<model>.onnx`, where
 * home is U2NET_HOME when set, else REMBG_HOME, else $XDG_DATA_HOME/rembg, else ~/.rembg; then the old flat layout
 * `<U2NET_HOME or ~/.u2net>/<model>.onnx`. The default is in the user's home folder, outside the project, so every
 * project shares one download. (Before: untell read only the flat path, so each prepare set up again.)
 */
export function modelPaths(env: NodeJS.ProcessEnv = process.env): string[] {
  const root = env.U2NET_HOME ? home(env.U2NET_HOME) : home(env.REMBG_HOME ?? (env.XDG_DATA_HOME ? join(env.XDG_DATA_HOME, "rembg") : "~/.rembg"));
  const legacy = home(env.U2NET_HOME ?? join(env.XDG_DATA_HOME ?? "~", ".u2net"));
  return [join(root, "models", MODEL, `${MODEL}.onnx`), join(legacy, `${MODEL}.onnx`)];
}
/** The model file that rembg reads: the first that exists, else the place a download writes. */
export const modelPath = (env: NodeJS.ProcessEnv = process.env) => modelPaths(env).find((f) => existsSync(f)) ?? modelPaths(env)[0]!;

/** What a command needs to run ffmpeg and a numpy Python, as lines that each name the fix. Empty when all is there. */
export function missingForAnalysis(project: string, what: string): string[] {
  const out: string[] = [];
  const noFf = ["ffmpeg", "ffprobe"].filter((t) => !runs(t));
  if (noFf.length) out.push(`${noFf.join(" and ")} (not on PATH). Install: ${ffmpegFix()}`);
  if (!analysisPython(project)) {
    const venv = existsSync(venvPython(project));
    out.push(`Python with numpy and Pillow (${venv ? ".venv-media has no numpy or Pillow" : "no .venv-media here"}, and python3 has neither). Run: untell media setup${runs("uv", "--version") ? "" : " (install uv first: https://docs.astral.sh/uv/)"}`);
  }
  return out.map((l) => `  - ${l}`).length ? [`${what} needs:`, ...out.map((l) => `  - ${l}`)] : [];
}

/** The project's listen Python: .venv-listen/bin/python (untell listen setup makes it). */
export const listenPython = (project: string) => join(project, ".venv-listen", platform() === "win32" ? "Scripts/python.exe" : "bin/python");

/** The packages of the listen tools. The core makes the music map; each extra adds one part of the analysis. */
// pillow draws listen.png (scripts/listen/plot.py); matplotlib is no longer needed.
export const LISTEN_CORE = ["numpy", "scipy", "librosa", "soundfile", "pyloudnorm", "pillow"];
export const LISTEN_EXTRAS: Record<string, { packages: string[]; modules: string[]; what: string }> = {
  stems: { packages: ["torch", "torchaudio", "demucs==4.1.0"], modules: ["torch", "demucs"], what: "the stems (drums, bass, vocals, other), with Demucs" },
  tags: { packages: ["torch", "transformers==4.46.3"], modules: ["torch", "transformers"], what: "the character tags and the brief match, with CLAP" },
};
export const LISTEN_MODULES = ["numpy", "scipy", "librosa", "soundfile", "pyloudnorm"];

/** The Python modules of the detector: numpy and Pillow for the frames, scipy for the shape checks. */
export const DETECTOR_MODULES = ["numpy", "PIL", "scipy"];
export const DETECTOR_PACKAGES = ["numpy", "pillow", "scipy"];
/** What the detector's packages cost, for the line that says so before untell installs them. */
export const DETECTOR_SIZE = "about 30 MB to download, about 100 MB on disk";

/** The detector's Python: the project's .venv-media when it has the modules, else python3 when it has them, else null. */
export function detectorPython(project: string): { py: string; venv: boolean } | null {
  const venv = venvPython(project);
  if (existsSync(venv) && pyNewEnough(venv) && pyHas(venv, DETECTOR_MODULES)) return { py: venv, venv: true };
  if (pyNewEnough("python3") && pyHas("python3", DETECTOR_MODULES)) return { py: "python3", venv: false };
  return null;
}

/**
 * The detector's Python, set up once when it is missing: a .venv-media with numpy, Pillow and scipy (with uv when
 * it is installed, else python3 -m venv). It says what it fetches and its size first. UNTELL_NO_SETUP=1 stops it.
 * Returns null, with the reason logged, when it cannot set it up.
 */
export function ensureDetectorPython(project: string, log: (s: string) => void, o: { venv?: boolean } = {}): { py: string; venv: boolean } | null {
  const have = detectorPython(project);
  // `venv`: the media tools run in the project's .venv-media, so a python3 with the modules is not enough for them.
  if (have && (!o.venv || have.venv)) return have;
  const venv = venvPython(project);
  const hasUv = runs("uv", "--version"), base = newPython();
  const fix = `Run: untell media setup${hasUv ? "" : " (install uv first: https://docs.astral.sh/uv/)"}`;
  if (process.env.UNTELL_NO_SETUP === "1") { log(`detector: no Python ${PY_MIN.join(".")} or later here has ${DETECTOR_PACKAGES.join(", ")} (UNTELL_NO_SETUP=1, so untell installs nothing). ${fix}`); return null; }
  // A .venv-media made with an old Python cannot run the checks: it is made again only when the user removes it.
  if (existsSync(venv) && !pyNewEnough(venv)) { log(`detector: ${pyTooOld(".venv-media/bin/python")}. Remove the folder .venv-media, then run untell check again: untell makes it again with Python ${PY_MIN.join(".")} or later${hasUv ? " (with uv)" : base ? ` (with ${base})` : ""}.`); return null; }
  if (!hasUv && !base) { log(`detector: no Python ${PY_MIN.join(".")} or later here (${runs("python3", "--version") ? pyTooOld("python3") : "no python3 on PATH"}). Install Python ${PY_MIN.join(".")} or later (or uv: https://docs.astral.sh/uv/), then run untell check again.`); return null; }
  log(`  python   the checks need Python with ${DETECTOR_PACKAGES.join(", ")}: untell installs them once into .venv-media (${DETECTOR_SIZE})`);
  const run = (cmd: string, args: string[]) => { const r = spawnSync(cmd, args, { cwd: project, encoding: "utf8", timeout: 900000 }); if (r.status !== 0) log(`  ${cmd} ${args.join(" ")} failed: ${(r.stderr ?? "").trim().split("\n").slice(-2).join(" ")}`); return r.status === 0; };
  const ok = hasUv
    ? (existsSync(venv) || run("uv", ["venv", "-q", ".venv-media", "--python", "3.12"])) && run("uv", ["pip", "install", "-q", "--python", venv, ...DETECTOR_PACKAGES])
    : (existsSync(venv) || run(base!, ["-m", "venv", ".venv-media"])) && run(venv, ["-m", "pip", "install", "-q", ...DETECTOR_PACKAGES]);
  if (!ok || !pyHas(venv, DETECTOR_MODULES)) { log(`detector: the setup failed. ${fix}`); return null; }
  log("  python   done: .venv-media has them (untell media setup adds the cut-out tools when a photo needs them)");
  return { py: venv, venv: true };
}
