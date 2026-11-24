// The manifest, the write lock and the media table. Ported from the repository's scripts/media.ts.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, renameSync } from "node:fs";
import { marksSource, type MarkArt } from "../../../src/system/scene/markArt";
import { dirname, join } from "node:path";
import type { MediaKind, MediaPaths } from "./media-paths";

/** One asset in untell-media.json. `source` and `licence` are the user's own notes: untell never checks them. */
export type ManifestEntry = { kind: MediaKind; file: string; source?: string; licence?: string; original?: string; added?: string; treatment?: string; role?: "lead-in" };
export type Manifest = Record<string, ManifestEntry>;

export function readManifest(p: MediaPaths): Manifest {
  return existsSync(p.manifest) ? (JSON.parse(readFileSync(p.manifest, "utf8")) as Manifest) : {};
}

/** Writes a file through a temporary file and a rename, so a reader never sees half a file. */
function writeAtomic(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

export function writeManifest(p: MediaPaths, m: Manifest) {
  const sorted = Object.fromEntries(Object.keys(m).sort().map((k) => [k, m[k]!]));
  writeAtomic(p.manifest, JSON.stringify(sorted, null, 1) + "\n");
}

const sleep = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
/** A lock older than this belongs to a run that died, and the next run takes it over. */
export const LOCK_STALE_MS = 120000;
let depth = 0;

/**
 * Runs `fn` while it holds the media lock, so several agents can add and prepare media at the same time
 * without losing each other's entries. Hold it only around manifest and table writes: never around a
 * download or a Python run. The lock is a folder, because mkdir is atomic. A nested call runs inside.
 */
export function locked<T>(p: Pick<MediaPaths, "lock">, fn: () => T, waitMs = LOCK_STALE_MS): T {
  if (depth > 0) { depth++; try { return fn(); } finally { depth--; } }
  mkdirSync(dirname(p.lock), { recursive: true });
  const until = Date.now() + waitMs;
  for (;;) {
    try { mkdirSync(p.lock); break; } catch {
      try { if (Date.now() - statSync(p.lock).mtimeMs > LOCK_STALE_MS) { rmSync(p.lock, { recursive: true, force: true }); continue; } } catch {}
      if (Date.now() > until) throw new Error(`the media lock ${p.lock} is held by another run. Wait, or delete the folder if no untell command runs.`);
      sleep(50);
    }
  }
  depth = 1;
  try { return fn(); } finally { depth = 0; rmSync(p.lock, { recursive: true, force: true }); }
}

/** Changes the manifest under the lock: reads it, lets `fn` change it, writes it. */
export function updateManifest(p: MediaPaths, fn: (m: Manifest) => void) {
  locked(p, () => { const m = readManifest(p); fn(m); writeManifest(p, m); });
}

/**
 * An effect that takes this long (s) or longer to rise to its peak is a lead-in (a swell, a riser): it leads into its
 * change, and the beat rule does not hold it to a beat (sound_checks.LEAD_RISE). `media add --role lead-in` names a
 * short whoosh that carries a motion.
 */
export const LEAD_RISE = 0.15;

/** The types of the generated table. They match the repository's media.gen.ts (a unit test compares them). */
export const TABLE_TYPES = [
  "export type MediaMask = { cols: number; rows: number; data: string };",
  'export type MediaInfo = { kind: "photo" | "video"; width: number; height: number; subject: [number, number, number, number]; centre: [number, number]; grade: string; duration?: number; mask: MediaMask | null; plate?: [number, number, number] };',
  'export type SoundInfo = { kind: "sfx" | "music"; file: string; duration: number; peak: number; lufs?: number; peakDb?: number; attacks?: number[]; bands?: number[]; role?: "lead-in" };',
  "export type ModelInfo = { file: string; min: [number, number, number]; max: [number, number, number] };",
];

export type Meta = { kind?: string; file?: string; min?: number[]; max?: number[]; width?: number; height?: number; subject?: number[]; centre?: number[]; grade?: string; plateColour?: number[]; duration?: number; peak?: number; lufs?: number | null; peakDb?: number; attacks?: number[]; bands?: number[]; rise?: number; role?: string; mask?: unknown };

/** The source of media.gen.ts for these prepared assets (name to meta.json). Pure. */
export function tableSource(metas: Record<string, Meta>, mediaRel: string): string {
  const sounds: string[] = [], pictures: string[] = [], models: string[] = [];
  for (const name of Object.keys(metas).sort()) {
    const m = metas[name]!;
    const key = JSON.stringify(name);
    if (m.kind === "sfx" || m.kind === "music") {
      // The level (loudness and peak), so `hit` and `typing` set an effect against the bed.
      const level = `${typeof m.lufs === "number" ? `, lufs: ${m.lufs}` : ""}${typeof m.peakDb === "number" ? `, peakDb: ${m.peakDb}` : ""}${Array.isArray(m.attacks) && m.attacks.length > 1 ? `, attacks: ${JSON.stringify(m.attacks)}` : ""}${Array.isArray(m.bands) ? `, bands: ${JSON.stringify(m.bands)}` : ""}${m.kind === "sfx" && (m.role === "lead-in" || (typeof m.rise === "number" && m.rise >= LEAD_RISE)) ? `, role: "lead-in"` : ""}`;
      sounds.push(`  ${key}: { kind: ${JSON.stringify(m.kind)}, file: ${JSON.stringify(m.file)}, duration: ${m.duration}, peak: ${m.peak}${level} },`);
    } else if (m.kind === "model") {
      if (m.min && m.max) models.push(`  ${key}: { file: ${JSON.stringify(m.file)}, min: ${JSON.stringify(m.min)}, max: ${JSON.stringify(m.max)} },`);
    } else if (m.kind === "photo" || m.kind === "video" || m.kind === undefined) {
      pictures.push(`  ${key}: { kind: ${JSON.stringify(m.kind ?? "photo")}, width: ${m.width}, height: ${m.height}, subject: ${JSON.stringify(m.subject)}, centre: ${JSON.stringify(m.centre)}, grade: ${JSON.stringify(m.grade)},${m.duration ? ` duration: ${m.duration},` : ""}${m.plateColour ? ` plate: ${JSON.stringify(m.plateColour)},` : ""}\n    mask: ${JSON.stringify(m.mask ?? null)} },`);
    }
  }
  return [
    "// Generated by untell media. Do not edit: run untell media prepare, add, measure or remove.",
    "// Prepared media: size in px, the subject's box and centre as fractions of the photo, and a coarse alpha",
    "// mask of the cut-out (one hex digit a cell, row by row). Footage (kind \"video\") has a duration in seconds",
    `// and no mask. Sounds have a length and a peak in seconds. The files are in ${mediaRel}/<name>/.`,
    ...TABLE_TYPES,
    "export const SOUNDS: Record<string, SoundInfo> = {",
    ...sounds,
    "};",
    "export const MEDIA: Record<string, MediaInfo> = {",
    ...pictures,
    "};",
    "// 3D models (glTF binary): the bounds in the file's own units, with every node transform applied.",
    "export const MODELS: Record<string, ModelInfo> = {",
    ...models,
    "};",
    "",
  ].join("\n");
}

/** Every asset in the manifest that has a meta.json (prepared or measured), read from the media folder. */
export function readMetas(p: MediaPaths): Record<string, Meta> {
  const out: Record<string, Meta> = {};
  for (const name of Object.keys(readManifest(p))) {
    const f = join(p.media, name, "meta.json");
    if (existsSync(f)) out[name] = JSON.parse(readFileSync(f, "utf8")) as Meta;
  }
  return out;
}

/** Writes the media table from the manifest and the meta files, under the lock. */
export function writeTable(p: MediaPaths) {
  locked(p, () => {
    writeAtomic(p.table, tableSource(readMetas(p), p.mediaRel));
    // The silhouettes of the models (each model's meta.json keeps its own), under the same lock.
    const sil = join(dirname(p.table), "three", "silhouettes.gen.ts");
    if (existsSync(sil)) {
      const t: Record<string, unknown> = {};
      for (const name of Object.keys(readManifest(p))) {
        const f = join(p.media, name, "meta.json");
        if (!existsSync(f)) continue;
        const m = JSON.parse(readFileSync(f, "utf8")) as { kind?: string; silhouette?: unknown };
        if (m.kind === "model" && m.silhouette) t[name] = m.silhouette;
      }
      writeAtomic(sil, silhouettesSource(t));
    }
    // The marks table beside it (each SVG mark's paths, which drawnMark reads), under the same lock. A kit from before it
    // had none: then nothing to write.
    const marks = join(dirname(p.table), "marks.gen.ts");
    if (existsSync(marks)) {
      const t: Record<string, MarkArt> = {};
      for (const name of Object.keys(readManifest(p))) {
        const f = join(p.media, name, "meta.json");
        if (!existsSync(f)) continue;
        const m = JSON.parse(readFileSync(f, "utf8")) as { kind?: string; art?: MarkArt };
        if (m.kind === "mark" && m.art) t[name] = m.art;
      }
      writeAtomic(marks, marksSource(t));
    }
    // The plates table beside it, under the same lock (a kit from before it had none: then nothing to write).
    const plates = join(dirname(p.table), "media-plates.gen.ts");
    if (existsSync(plates)) writeAtomic(plates, platesSource(platesOf(p.media, readManifest(p))));
  });
}

/** The files a block can ask for: the plates, the cut-out, the paper, the ink layers. Sources and models are not plates. */
export const PLATE_FILE = /^(plate(-top|-dim)?\.(jpg|mp4)|subject\.png|cutout\.png|paper\.png|ink-[a-z0-9]+\.png)$/i;

/** The prepared files of each asset in the manifest that has at least one plate (as the repository's scripts/export_plates.ts). */
export function platesOf(media: string, manifest: Record<string, unknown>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const name of Object.keys(manifest).sort()) {
    const dir = join(media, name);
    if (!existsSync(join(dir, "meta.json"))) continue;
    const files = readdirSync(dir).filter((f) => PLATE_FILE.test(f)).sort();
    if (files.some((f) => f.startsWith("plate"))) out[name] = files;
  }
  return out;
}

/** The source of three/silhouettes.gen.ts: each model's silhouette table (untell media add measures it). Pure. */
export function silhouettesSource(t: Record<string, unknown>): string {
  return [
    "// Each model's silhouette from 24 yaws and 7 pitches (see silhouette.ts), so product frames a model by what it covers",
    "// and not by its box. untell media add writes it when it adds a model: do not edit it.",
    'import type { Silhouette } from "./silhouette";',
    "",
    "export const SILHOUETTES: Record<string, Silhouette> = {",
    ...Object.keys(t).sort().map((n) => `  ${JSON.stringify(n)}: ${JSON.stringify(t[n])},`),
    "};",
    "",
  ].join("\n");
}

/** The source of media-plates.gen.ts, in the repository's form. Pure. */
export function platesSource(t: Record<string, string[]>): string {
  return [
    "// The files that untell media prepare wrote for each prepared photo or clip, so the photo block can refuse, when the",
    "// scene builds, a file that is not there (a renderer would wait for it). untell writes this file: do not edit it.",
    "// A name that is not in the table is not checked.",
    "export const PLATES: Record<string, string[]> = {",
    ...Object.keys(t).map((n) => `  ${JSON.stringify(n)}: ${JSON.stringify(t[n])},`),
    "};",
    "",
  ].join("\n");
}

/**
 * The source of music.gen.ts: the kit's own types (`head`, everything before the MUSIC table) and one row for
 * each track's music map (music.json, which untell listen analyse writes). Pure.
 */
export function musicTableSource(head: string, maps: Record<string, string>): string {
  const rows = Object.keys(maps).sort().map((n) => `  ${JSON.stringify(n)}: ${withGridTrust(maps[n]!).trim()},`);
  return `${head}export const MUSIC: Record<string, MusicMap> = {\n${rows.join("\n")}${rows.length ? "\n" : ""}};\n`;
}

/**
 * A music map with the grid trust that MusicMap requires: gridTrust ("high", "medium" or "low") and gridIssues (why).
 * A map from before the trust was measured gets "medium" and no issues, as the checks read a map without it. Pure.
 */
export function withGridTrust(json: string): string {
  const m = JSON.parse(json) as Record<string, unknown>;
  if (m.gridTrust !== undefined && Array.isArray(m.gridIssues)) return json;
  return JSON.stringify({ ...m, gridTrust: m.gridTrust ?? "medium", gridIssues: Array.isArray(m.gridIssues) ? m.gridIssues : [] });
}

/** Writes the kit's music table from every asset's music.json, under the lock. The kit's types stay. */
export function writeMusicTable(p: MediaPaths): number {
  const file = join(dirname(p.table), "music.gen.ts");
  if (!existsSync(file)) return 0;
  return locked(p, () => {
    const text = readFileSync(file, "utf8");
    const cut = text.indexOf("export const MUSIC");
    if (cut < 0) throw new Error(`${file} has no MUSIC table. Run untell init --force to copy the kit again.`);
    const head = text.slice(Math.max(0, text.indexOf("export type")), cut);
    const maps: Record<string, string> = {};
    for (const name of Object.keys(readManifest(p))) {
      const f = join(p.media, name, "music.json");
      if (existsSync(f)) maps[name] = readFileSync(f, "utf8");
    }
    writeAtomic(file, "// Generated by untell listen. Do not edit: run untell listen analyse <name> or untell media remove <name>.\n"
      + "// The map of each analysed music track, in seconds into the file: beats, bars with loudness, sections, drops.\n" + musicTableSource(head, maps));
    return Object.keys(maps).length;
  });
}
