// untell's cache: .untell/cache at the repo root.
//   rec/<key>/     a whole recording (frames, key frames, tracks.json, elements.json, purity.jpg, video.mp4)
//   frames/<key>.jpg|png   one frame of a scene film, keyed by what draws it (see record.ts, pixel keys)
//   net/           web fonts and CDN scripts (netcache.ts)
//   bundles/<key>/ a Remotion bundle for `untell render` (render.ts)
//   hf/<key>/      a prepared HyperFrames project (render.ts)
//   capture/<key>/ the detector's capture of a recording (detect.ts)
//   out/<key>/     a finished render (render.ts)
//   recordings/<film>/  the recordings untell render encodes from (render.ts)
// Every key is a SHA-256 of everything the output depends on. When the code cannot tell, it does not cache.
// Files are copied with APFS clones where the disk supports them: a copy then takes no time and no space
// until one side changes.
//
// Usage: bun scripts/perf/cache.ts ls | du | prune [max GB, default 8] | clear
// Limits: UNTELL_CACHE_GB (size, default 8), UNTELL_CACHE_DAYS (unused entries, default 7), applied on write;
// UNTELL_RECORDINGS_DAYS (default 3) for the pictures in out/recordings.
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as core from "./cachecore";
import { cacheCap, pruneRecordings } from "./cachecore";

export const ROOT = resolve(import.meta.dir, "../..");
export const CACHE = process.env.UNTELL_CACHE ?? join(ROOT, ".untell", "cache");
// The cache folder ignores itself, so git never sees it.
{ const dot = join(ROOT, ".untell"); try { mkdirSync(dot, { recursive: true }); if (!existsSync(join(dot, ".gitignore"))) writeFileSync(join(dot, ".gitignore"), "*\n"); } catch {} }

// The code is in cachecore.ts (Node-safe, the cache folder as an argument, shared with the package); these bind it to
// the repository's folder.
export { sha, clone, link, linkTree, cloneTree, cacheCap, pruneRecordings } from "./cachecore";
/** A hash of every file under `dirs` whose name passes `keep`, by content, in a fixed order (paths relative to the repository). */
export const treeHash = (dirs: string[], keep: (path: string) => boolean = () => true) => core.treeHash(dirs, ROOT, keep);
/** A stamp of the media folder (the repository's assets/media by default): each file's path, size and time. */
export const mediaStamp = (dir = join(ROOT, "assets", "media")) => core.mediaStamp(dir);
/** Puts a finished folder into the cache under `key` (by rename), then prunes on write. */
export function store(kind: string, key: string, from: string) {
  const dst = core.store(CACHE, kind, key, from);
  pruneSoon();
  return dst;
}
/** Prune on write: at most once every five minutes. */
export const pruneSoon = () => core.pruneSoon(CACHE);
/** The cached folder for `key`, or null. A hit marks the folder as used now, for prune. */
export const lookup = (kind: string, key: string) => core.lookup(CACHE, kind, key);
const du = (d: string) => core.du(d);
/** Removes entries not used for `maxDays`, then the least recently used, until the cache is under `maxBytes`. */
export const prune = (maxBytes: number, maxDays = Infinity) => core.prune(CACHE, maxBytes, maxDays);

if (import.meta.main) {
  const [cmd = "du", arg] = process.argv.slice(2);
  if (cmd === "ls" || cmd === "du") {
    for (const kind of ["rec", "frames", "net", "bundles", "hf", "capture", "out", "recordings"]) {
      const d = join(CACHE, kind);
      const n = existsSync(d) ? readdirSync(d).length : 0;
      console.log(`${kind.padEnd(8)} ${String(n).padStart(6)} entries  ${(du(d) / 1e6).toFixed(0).padStart(7)} MB`);
    }
    console.log(`(apparent size; clones share blocks with out/recordings) at ${CACHE}`);
  } else if (cmd === "prune") {
    const r = prune(Number(arg ?? 8) * 1e9, cacheCap().days);
    console.log(`removed ${r.removed} entries; ${(r.total / 1e9).toFixed(2)} GB left`);
    const rr = pruneRecordings(join(ROOT, "out", "recordings"));
    console.log(`recordings: ${rr.films} past their age lost their pictures (${(rr.bytes / 1e9).toFixed(2)} GB)`);
  } else if (cmd === "clear") {
    rmSync(CACHE, { recursive: true, force: true });
    console.log(`removed ${CACHE}`);
  } else console.log("usage: bun scripts/perf/cache.ts ls | du | prune [max GB] | clear");
}
