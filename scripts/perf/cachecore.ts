// untell's cache, with the cache folder as an argument. scripts/perf/cache.ts binds these functions to the repository's
// folder (.untell/cache at the repo root); the package (packages/untell/src/cache.ts) binds them to a project's
// .untell/cache. One copy of the code, so the repository and the package keep their caches the same way.
// Node-safe: no import.meta, no Bun API, no work at import time.
//
// Every key is a SHA-256 of everything the output depends on. A repeated picture is a hard link (link, linkTree), so
// it takes no space and `du` counts it once. A copy that must be writable is an APFS clone where the disk has them.
import { constants, copyFileSync, existsSync, linkSync, mkdirSync, readdirSync, readFileSync, readlinkSync, renameSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";

export const sha = (...parts: (string | Buffer | Uint8Array)[]) => {
  const h = createHash("sha256");
  for (const p of parts) { h.update(p); h.update("\0"); }
  return h.digest("hex");
};

/** A hash of every file under `dirs` whose name passes `keep`, by content, in a fixed order. Paths are relative to `base`. */
export function treeHash(dirs: string[], base: string, keep: (path: string) => boolean = () => true) {
  const h = createHash("sha256");
  const walk = (d: string) => {
    if (!existsSync(d)) return;
    const st = statSync(d);
    if (st.isFile()) { if (keep(d)) { h.update(relative(base, d)); h.update(readFileSync(d)); } return; }
    for (const e of readdirSync(d).sort()) { if (e === "node_modules" || e.startsWith(".")) continue; walk(join(d, e)); }
  };
  for (const d of dirs) walk(d);
  return h.digest("hex");
}

/** A stamp of a media folder: every file's path, size and modification time (no content read, so it is fast).
 *  A file that is replaced gets a new time, so the stamp changes; a file touched with the same bytes misses too. */
export function mediaStamp(dir: string) {
  const h = createHash("sha256");
  const walk = (d: string) => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else { const s = statSync(p); h.update(`${relative(dir, p)}|${s.size}|${Math.round(s.mtimeMs)}\n`); }
    }
  };
  walk(dir);
  return h.digest("hex");
}

/** Copies a file as an APFS clone when it can, else as a plain copy. With `keepTime`, the copy keeps the
 *  source's modification time (so a media stamp of the copy equals the stamp of the source). */
export function clone(src: string, dst: string, keepTime = false) {
  try { copyFileSync(src, dst, constants.COPYFILE_FICLONE); } catch { copyFileSync(src, dst); }
  if (keepTime) { const s = statSync(src); utimesSync(dst, s.atime, s.mtime); }
}

/** A second name for a file that never changes (a recorded frame, a cached render): a hard link, so it takes no
 *  space and `du` counts it once. Where a link is not possible (another disk), a clone. Nothing may write into a
 *  linked file in place: the recorder and the cache only ever replace whole files. */
export function link(src: string, dst: string) {
  try { linkSync(src, dst); } catch { clone(src, dst); }
}

/** A folder tree of hard links (see link). */
export function linkTree(src: string, dst: string) {
  mkdirSync(dst, { recursive: true });
  for (const e of readdirSync(src, { withFileTypes: true })) {
    const a = join(src, e.name), b = join(dst, e.name);
    // A symbolic link stays a symbolic link (a bundle's public folder points at assets/).
    if (e.isSymbolicLink()) symlinkSync(readlinkSync(a), b);
    else if (e.isDirectory()) linkTree(a, b); else link(a, b);
  }
}

/** Copies a folder tree file by file with clone(). */
export function cloneTree(src: string, dst: string, keepTime = false) {
  mkdirSync(dst, { recursive: true });
  for (const e of readdirSync(src, { withFileTypes: true })) {
    const a = join(src, e.name), b = join(dst, e.name);
    if (e.isDirectory()) cloneTree(a, b, keepTime); else clone(a, b, keepTime);
  }
}

/** Puts a finished folder into the cache under `key` (by rename, so readers never see half of it). */
export function store(cache: string, kind: string, key: string, from: string) {
  const dst = join(cache, kind, key);
  if (existsSync(dst)) return dst;
  mkdirSync(join(cache, kind), { recursive: true });
  const tmp = `${dst}.part-${process.pid}`;
  rmSync(tmp, { recursive: true, force: true });
  linkTree(from, tmp);
  writeFileSync(join(tmp, ".done"), "");
  try { renameSync(tmp, dst); } catch { rmSync(tmp, { recursive: true, force: true }); }
  return dst;
}

/**
 * The cached folder for `key`, or null. A hit marks the folder as used now, for prune. `need` names the files a hit
 * must hold: an entry that lacks one (a stopped run, a file deleted by hand) is a miss, and lookup removes it.
 */
export function lookup(cache: string, kind: string, key: string, need: string[] = []) {
  const d = join(cache, kind, key);
  if (!existsSync(join(d, ".done"))) return null;
  if (need.some((f) => !existsSync(join(d, f)))) { rmSync(d, { recursive: true, force: true }); return null; }
  try { const now = new Date(); utimesSync(d, now, now); } catch {}
  return d;
}

/** The cache's limits: UNTELL_CACHE_GB (default 8) and UNTELL_CACHE_DAYS (default 7: an entry not used for that long goes). */
export const cacheCap = () => ({ bytes: Number(process.env.UNTELL_CACHE_GB || 8) * 1e9, days: Number(process.env.UNTELL_CACHE_DAYS || 7) });

/** Prune on write: at most once every five minutes (a stamp file), so a busy run does not walk the cache each time. */
export function pruneSoon(cache: string) {
  const stamp = join(cache, ".pruned");
  try { if (existsSync(stamp) && Date.now() - statSync(stamp).mtimeMs < 5 * 60 * 1000) return; mkdirSync(cache, { recursive: true }); writeFileSync(stamp, ""); } catch { return; }
  const c = cacheCap();
  // Pruning is housekeeping: an error in it must never fail the command that stored something.
  try { prune(cache, c.bytes, c.days); } catch (e) { console.error(`cache prune: ${String(e).split("\n")[0]}`); }
}

/** The size of a folder in bytes. A file with several hard links counts once (by inode). */
export function du(d: string, seen = new Set<number>()): number {
  let n = 0;
  if (!existsSync(d)) return 0;
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) { n += du(p, seen); continue; }
    let st; try { st = statSync(p); } catch { continue; }
    if (st.nlink > 1) { if (seen.has(st.ino)) continue; seen.add(st.ino); }
    n += st.size;
  }
  return n;
}

/**
 * Recordings expire. After its check, a recording's findings live in the detector folder and its data in
 * elements.json and tracks.json; the pictures can be drawn again (from the cache, or by recording again). So a
 * recording older than `days` (UNTELL_RECORDINGS_DAYS, default 3) keeps its JSON files and loses its pictures,
 * preview video and inspect output. The detector sees the missing frames and records the film again when it needs them.
 */
export function pruneRecordings(dir: string, days = Number(process.env.UNTELL_RECORDINGS_DAYS || 3)) {
  if (!existsSync(dir)) return { films: 0, bytes: 0 };
  const old = Date.now() - days * 86400000;
  let films = 0, bytes = 0;
  for (const id of readdirSync(dir)) {
    const d = join(dir, id), el = join(d, "elements.json");
    if (id.startsWith(".") || !existsSync(el) || statSync(el).mtimeMs >= old) continue;
    if (existsSync(join(dir, `.${id}.lock`))) continue; // being recorded now
    for (const part of ["frames", "frames-png", "video.mp4", "purity.jpg", "inspect"]) {
      const p = join(d, part);
      if (!existsSync(p)) continue;
      bytes += statSync(p).isDirectory() ? du(p) : statSync(p).size;
      rmSync(p, { recursive: true, force: true });
    }
    films++;
  }
  return { films, bytes };
}

/** The kinds of entry in a cache folder. */
export const KINDS = ["rec", "bundles", "hf", "capture", "out", "recordings"];

/** Removes entries not used for `maxDays`, then the least recently used entries until the cache is under `maxBytes`.
 *  Sizes count each file once (by inode), so hard-linked frames are not counted twice. */
export function prune(cache: string, maxBytes: number, maxDays = Infinity) {
  const entries: { path: string; size: number; used: number }[] = [];
  for (const kind of KINDS) {
    const k = join(cache, kind);
    if (!existsSync(k)) continue;
    for (const e of readdirSync(k)) {
      // Stamps and locks (names that start with a dot) and half-written entries are not entries.
      if (e.startsWith(".") || e.includes(".part-")) continue;
      const p = join(k, e);
      let st; try { st = statSync(p); } catch { continue; }
      entries.push({ path: p, size: st.isDirectory() ? du(p) : st.size, used: st.mtimeMs });
    }
  }
  const fr = join(cache, "frames");
  if (existsSync(fr)) for (const e of readdirSync(fr)) { if (e.startsWith(".")) continue; const p = join(fr, e); let s; try { s = statSync(p); } catch { continue; } entries.push({ path: p, size: s.size, used: s.mtimeMs }); }
  let total = entries.reduce((a, e) => a + e.size, 0) + du(join(cache, "net"));
  let removed = 0;
  const old = Date.now() - maxDays * 86400000;
  for (const e of entries.sort((a, b) => a.used - b.used)) {
    if (total <= maxBytes && e.used >= old) break;
    rmSync(e.path, { recursive: true, force: true });
    total -= e.size;
    removed++;
  }
  return { removed, total };
}
