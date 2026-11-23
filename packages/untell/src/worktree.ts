// The work tree: a folder in the project (.untell/lab) with the repository's layout, made of links to the project's
// own files. The repository's detector, listen, music map and master scripts find every file from one root (ROOT in
// each script). The pack script sets ROOT from UNTELL_ROOT, and untell points UNTELL_ROOT here. So the scripts
// ship as the repository wrote them, and only the links know where a project keeps its files.
//
//   assets/media          -> the media folder (public/media or assets/media)
//   assets/media.json     -> untell-media.json (the same keys: kind and file for each asset)
//   systems               -> <kit>/docs/systems (the tokens of each system)
//   src/system/media.gen.ts -> <kit>/media.gen.ts (the length and peak of each sound)
//   src/system/music.gen.ts    a file of the work tree; untell writes the kit's music table itself, under the lock
//   out/recordings/<id>   -> the film's recording (.untell/recordings/<id>)
//   out/detector/<id>/       the capture, the sound mix and the findings (real folders)
//   out/render/<id>.mp4   -> the render that the user gives, for the sound checks
//   scripts/media_cut.py  -> the package's copy (the cut-out fringe check imports clean() from it)
import { copyFileSync, existsSync, lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { npxHyperframes } from "./check";
import { hyperframesVersion } from "./detect";
import { systemsDir } from "./build";
import { registryDir } from "./kit";
import type { MediaPaths } from "./media-paths";

export const WORK = join(".untell", "lab");

/** Puts a link at `at` to `to`. It replaces what is there. Without links (some Windows setups), it copies a file. */
export function link(to: string, at: string) {
  mkdirSync(dirname(at), { recursive: true });
  // A link that already points to the target stays: two runs at the same time do not break each other.
  try { if (lstatSync(at).isSymbolicLink() && readlinkSync(at) === to) return; } catch { /* nothing there */ }
  try { lstatSync(at); rmSync(at, { recursive: true, force: true }); } catch { /* nothing there */ }
  try { symlinkSync(to, at, process.platform === "win32" ? "junction" : undefined); } catch (e) {
    if (existsSync(to) && !lstatSync(to).isDirectory()) copyFileSync(to, at); else throw e;
  }
}

/**
 * Builds (or refreshes) the work tree for the project and returns its path. With no media paths (a folder with no
 * untell kit: a render checked or mastered alone), the tree has an empty media folder, an empty manifest and an empty
 * media table, and the systems of the package.
 */
export function workTree(project: string, p: MediaPaths | null, film?: { id: string; recording?: string; render?: string | null }): string {
  const root = join(project, WORK);
  const manifest = join(root, "assets", "media.json");
  if (p) {
    mkdirSync(p.media, { recursive: true });
    link(p.media, join(root, "assets", "media"));
    if (existsSync(p.manifest)) link(p.manifest, manifest);
    else { try { rmSync(manifest, { force: true }); } catch {} writeFileSync(manifest, "{}\n"); }
  } else {
    try { if (lstatSync(join(root, "assets", "media")).isSymbolicLink()) rmSync(join(root, "assets", "media"), { force: true }); } catch { /* nothing there */ }
    mkdirSync(join(root, "assets", "media"), { recursive: true });
    try { rmSync(manifest, { force: true }); } catch {}
    writeFileSync(manifest, "{}\n");
  }
  link(systemsDir(project), join(root, "systems"));
  const table = join(root, "src", "system", "media.gen.ts");
  if (p && existsSync(p.table)) link(p.table, table);
  else if (!p) { mkdirSync(dirname(table), { recursive: true }); try { rmSync(table, { force: true }); } catch {} writeFileSync(table, "// No untell kit here: no prepared media.\n"); }
  link(join(registryDir(), "tools", "media_cut.py"), join(root, "scripts", "media_cut.py"));
  if (film) {
    mkdirSync(join(root, "out", "detector", film.id), { recursive: true });
    if (film.recording) link(film.recording, join(root, "out", "recordings", film.id));
    const render = join(root, "out", "render", `${film.id}.mp4`);
    if (film.render) link(film.render, render);
    else rmSync(render, { force: true });
  }
  return root;
}

/** The environment for a repository script that runs in the work tree. */
export const workEnv = (root: string, extra: Record<string, string> = {}) => {
  // The HyperFrames CLI for the scripts that cross-check with it (listen's beat grid): the one untell found for this
  // project, so a script never skips its cross-check for want of an environment variable.
  const hf = findHyperframes(resolve(root, "..", ".."));
  return { ...process.env, ...(hf ? { UNTELL_HYPERFRAMES: hf } : {}), UNTELL_ROOT: root, UNTELL_LISTEN_SETUP: LISTEN_SETUP, UNTELL_FONTS: process.env.UNTELL_FONTS ?? join(registryDir(), "fonts"), HYPERFRAMES_NO_TELEMETRY: "1", DO_NOT_TRACK: "1", PYTHONWARNINGS: "ignore", TOKENIZERS_PARALLELISM: "false", ...extra };
};

const found = new Map<string, string | null>();
/**
 * The HyperFrames CLI for a project: UNTELL_HYPERFRAMES, the project's node_modules/.bin, hyperframes on PATH, then
 * the copy that npx keeps for the version the project's scripts name. Null when there is none. Read once per project.
 */
export function findHyperframes(project: string): string | null {
  if (found.has(project)) return found.get(project)!;
  const bin = process.platform === "win32" ? "hyperframes.cmd" : "hyperframes";
  const env = process.env.UNTELL_HYPERFRAMES;
  let hit: string | null = env && existsSync(env) ? env : existsSync(join(project, "node_modules", ".bin", bin)) ? join(project, "node_modules", ".bin", bin) : null;
  if (!hit) {
    for (const d of (process.env.PATH ?? "").split(delimiter)) if (d && existsSync(join(d, bin))) { hit = join(d, bin); break; }
  }
  if (!hit && existsSync(join(project, "hyperframes.json"))) {
    const pkg = npxHyperframes(hyperframesVersion(project));
    const b = pkg ? join(pkg, "..", ".bin", bin) : null;
    if (b && existsSync(b)) hit = b;
  }
  found.set(project, hit);
  return hit;
}

/** The command that adds a listen package in a project: the listen scripts print it in their hints (UNTELL_LISTEN_SETUP). */
export const LISTEN_SETUP = "untell listen setup --extras";
