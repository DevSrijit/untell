// The cache of a project: .untell/cache. The code is the repository's scripts/perf/cachecore.ts (bundled as it is), bound
// here to the project's folder.
//   rec/<key>/      a whole recording (frames, key frames, tracks.json, elements.json, capture.json)
//   frames/<key>    one frame of a Remotion scene film, keyed by what draws it
//   net/            web fonts and CDN scripts that a film page loads
//   out/<key>/      a finished render (untell render)
// Every key is a SHA-256 of everything the output depends on. When the code cannot tell, it does not cache.
// A repeated picture is a hard link, so it takes no space and is counted once.
// Limits: UNTELL_CACHE_GB (default 8) and UNTELL_CACHE_DAYS (default 7), applied when the cache stores something.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as core from "../../../scripts/perf/cachecore";

export { sha, treeHash, mediaStamp, clone, cloneTree, link, linkTree, store, lookup, du, pruneRecordings, cacheCap } from "../../../scripts/perf/cachecore";

/** The cache folder of a project. UNTELL_CACHE moves it. */
export const cacheDir = (project: string) => process.env.UNTELL_CACHE ?? join(project, ".untell", "cache");

/** Prune on write: at most once every five minutes, by size and age. */
export const cachePrune = (project: string) => core.pruneSoon(cacheDir(project));

export type CacheStatus = { dir: string; bytes: number; entries: number; kinds: Record<string, { entries: number; bytes: number }> };

/** What the cache holds. Sizes count a hard-linked file once. */
export function cacheStatus(project: string): CacheStatus {
  const dir = cacheDir(project);
  const kinds: CacheStatus["kinds"] = {};
  for (const k of ["rec", "frames", "out", "net"]) {
    const d = join(dir, k);
    kinds[k] = { entries: existsSync(d) ? readdirSync(d).filter((e) => !e.startsWith(".") && !e.includes(".part-") && !e.endsWith(".json")).length : 0, bytes: core.du(d) };
  }
  return { dir, bytes: core.du(dir), entries: kinds.rec!.entries, kinds };
}

/** Removes the least recently used entries until the cache is under `maxBytes`. */
export const prune = (project: string, maxBytes: number) => core.prune(cacheDir(project), maxBytes);

export const formatBytes = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} kB`);
