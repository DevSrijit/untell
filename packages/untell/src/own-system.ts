// `untell system new <name> --from <id>` and `untell system check [<name>]`: a project's own design system.
//
// A system of the project lives in one file that the user edits: systems/<name>/system.ts, beside the films folder
// (Remotion: src/systems/, HyperFrames: systems/). It holds the system's values, its direction and its media, and the
// built-in it came from. The kit lists these files in <kit>/own.gen.ts, so SYSTEMS, DIRECTION and MEDIA_SPEC hold
// them (src/system/own.ts) and every block and renderer accepts the id. untell writes the system's docs where the
// tools read the built-ins' docs (<kit>/docs/systems/<name>/: tokens.json, tokens.css, fonts.json, SYSTEM.md), with
// the kit's own writer (systemDocs.ts), so the checks, the build, the master and the media tools read it as they read
// a built-in. The source stays outside the kit folder: untell init --force overwrites the kit, and untell writes
// own.gen.ts and the docs again from the source.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { bundleError, systemsDir } from "./build";
import { detectFramework, type Framework } from "./detect";
import { detectorRules } from "./detector";
import { UsageError } from "./errors";
import { FILMS_DIR, KIT_DIR, registryDir, rewriteDoc } from "./kit";
import { exampleScene } from "./templates";
import { screenStyle } from "./check";

/** A system name: lower-case letters, digits and hyphens, 2 to 32, starting with a letter. */
export const NAME_RE = /^[a-z][a-z0-9-]{1,31}$/;
/** Names that a system cannot take: they mean something else to the tools. */
const RESERVED = new Set(["none", "neutral", "default", "own", "all"]);

/** The folder of the project's own systems: beside the films folder (Remotion src/systems, HyperFrames systems). */
export const ownDir = (project: string, fw: Framework) => join(project, dirname(FILMS_DIR[fw]), "systems");
/** The source file of one own system. */
export const ownFile = (project: string, fw: Framework, name: string) => join(ownDir(project, fw), name, "system.ts");

/** The framework of the project's kit, or a usage error that says what to run. */
function kitFramework(project: string): Framework {
  if (existsSync(join(project, KIT_DIR.remotion))) return "remotion";
  if (existsSync(join(project, KIT_DIR.hyperframes))) return "hyperframes";
  const fw = detectFramework(project);
  throw new UsageError(fw ? "no untell kit here. Run untell init first: a system of your own lives beside the kit." : "no Remotion or HyperFrames project here. untell system works in a project with the untell kit: run untell init --new remotion|hyperframes first.", "system");
}

/** The names of the project's own systems: each folder of the systems folder that holds a system.ts. */
export function ownNames(project: string, fw: Framework): string[] {
  const d = ownDir(project, fw);
  if (!existsSync(d)) return [];
  return readdirSync(d).filter((n) => NAME_RE.test(n) && existsSync(join(d, n, "system.ts"))).sort();
}

/** The text of <kit>/own.gen.ts for these names. */
export function ownGenSource(names: string[]): string {
  return [
    "// The project's own systems. untell system new and untell system check write this file; do not edit it.",
    "// Each entry is a file in the systems folder beside the films folder (systems/<name>/system.ts).",
    'import type { OwnSystem } from "./own";',
    ...names.map((n, i) => `import own${i} from "../systems/${n}/system";`),
    "",
    `export const OWN_SYSTEMS: OwnSystem[] = [${names.map((_, i) => `own${i}`).join(", ")}];`,
    "",
  ].join("\n");
}

/** Writes <kit>/own.gen.ts when it does not list these names yet. Returns true when it wrote it. */
export function writeOwnGen(project: string, fw: Framework): boolean {
  const gen = join(project, KIT_DIR[fw], "own.gen.ts");
  if (!existsSync(join(project, KIT_DIR[fw], "own.ts"))) throw new UsageError(`the kit in ${KIT_DIR[fw]}/ has no own.ts: an older untell copied it, before systems of your own. Run untell init --force to copy this untell's kit (your films and ${relative(project, ownDir(project, fw))}/ stay).`, "system");
  const text = ownGenSource(ownNames(project, fw));
  if (existsSync(gen) && readFileSync(gen, "utf8") === text) return false;
  writeFileSync(gen, text);
  return true;
}

/** What the kit holds, read from the project's own kit. */
export type KitTables = {
  SYSTEMS: { id: string; name: string; fonts: Record<string, unknown>; [k: string]: unknown }[];
  DIRECTION: Record<string, unknown>;
  MEDIA_SPEC: Record<string, unknown>;
  BLOCKS: Record<string, unknown>;
  EFFECT_NOTE: Record<string, string>;
  ownSystems: () => { from?: string; system: { id: string } & Record<string, unknown>; direction: unknown; media?: unknown }[];
  systemFiles: (s: unknown) => Record<string, string>;
  fontList: (s: unknown) => { family: string; weights: number[]; fallback?: true }[];
};

/** Imports the project's kit tables in Node: bundles them (the own systems with them), then imports the bundle. */
export async function loadKit(project: string, fw: Framework): Promise<KitTables> {
  const kit = join(project, KIT_DIR[fw]);
  const { build } = await import("esbuild");
  const tag = `${process.pid}-${Date.now()}`;
  const entry = join(project, ".untell", `kit-${tag}.ts`), out = join(project, ".untell", `kit-${tag}.mjs`);
  mkdirSync(dirname(entry), { recursive: true });
  const at = (m: string) => JSON.stringify(join(kit, m).split("\\").join("/"));
  writeFileSync(entry, [
    `export { SYSTEMS, EFFECT_NOTE } from ${at("systems")};`,
    `export { DIRECTION } from ${at("direction")};`,
    `export { MEDIA_SPEC } from ${at("media-spec")};`,
    `export { systemFiles, fontList } from ${at("systemDocs")};`,
    `export { ownSystems } from ${at("own")};`,
    `export { BLOCKS } from ${at("scene/blocks")};`,
  ].join("\n") + "\n");
  try {
    try { await build({ entryPoints: [entry], bundle: true, platform: "node", format: "esm", outfile: out, external: ["three", "react", "remotion", "@remotion/*"], logLevel: "silent" }); }
    catch (e) { throw new Error(bundleError(project, e as { errors?: { text: string; location?: { file: string; line: number } | null }[] })); }
    // Blocks warn as they load in a few places; the tables are all this needs.
    return await import(pathToFileURL(out).href) as KitTables;
  } finally {
    rmSync(entry, { force: true });
    rmSync(out, { force: true });
  }
}

/** The note at the top of an own system's SYSTEM.md. */
const docHead = (rel: string) => `> Written by untell from \`${rel}\`. Edit that file, then run \`untell system check\`: it writes this file again.\n\n`;

/** Writes the docs of each own system (tokens.json, tokens.css, fonts.json, SYSTEM.md) into <kit>/docs/systems/<name>/. */
export function writeOwnDocs(project: string, fw: Framework, tables: KitTables, names: string[]): string[] {
  const kit = KIT_DIR[fw];
  const done: string[] = [];
  for (const o of tables.ownSystems().filter((x) => names.includes(x.system.id))) {
    const dir = join(project, kit, "docs", "systems", o.system.id);
    mkdirSync(dir, { recursive: true });
    const files = tables.systemFiles(o.system);
    const tokens = { ...JSON.parse(files["tokens.json"]!), own: { from: o.from ?? null, source: relative(project, ownFile(project, fw, o.system.id)).split("\\").join("/") } };
    writeFileSync(join(dir, "tokens.json"), JSON.stringify(tokens, null, 1) + "\n");
    const srcRel = relative(project, ownFile(project, fw, o.system.id)).split("\\").join("/");
    writeFileSync(join(dir, "tokens.css"), files["tokens.css"]!.replace(/^\/\* (.+?): generated by [^*]+\*\//, `/* $1: written by untell from ${srcRel}. Edit that file, not this one. */`));
    // The built-ins' fonts ship under the SIL OFL; a system of yours may use any family its project loads.
    files["SYSTEM.md"] = files["SYSTEM.md"]!.replace(/Fonts are Google Fonts under the SIL Open Font License\. Load them; never fall back to a system font\./, "The kit loads the fonts this system names. Never fall back to a system font.");
    writeFileSync(join(dir, "fonts.json"), files["fonts.json"]!);
    // A copy of a system with a placeholder accent (Mark) is where the brand colour goes: its doc says so.
    files["SYSTEM.md"] = files["SYSTEM.md"]!.replace(/Placeholder\. For the brand colour, copy the system:[^|]*\|/, `The brand colour: set it in roles.accent (with accentText and onAccent); \`untell system check ${o.system.id}\` checks the text on it. |`);
    writeFileSync(join(dir, "SYSTEM.md"), docHead(relative(project, ownFile(project, fw, o.system.id)).split("\\").join("/")) + rewriteDoc(files["SYSTEM.md"]!, kit));
    done.push(o.system.id);
  }
  return done;
}

/** The newest change to the sources of the own systems, in ms. */
const newestSource = (project: string, fw: Framework, names: string[]) => Math.max(0, ...names.map((n) => statSync(ownFile(project, fw, n)).mtimeMs));
/** The oldest of the docs that untell wrote for the own systems, in ms (0 when one is missing). */
function oldestDocs(project: string, fw: Framework, names: string[]): number {
  let t = Infinity;
  for (const n of names) {
    const p = join(project, KIT_DIR[fw], "docs", "systems", n, "tokens.json");
    if (!existsSync(p)) return 0;
    t = Math.min(t, statSync(p).mtimeMs);
  }
  return t === Infinity ? 0 : t;
}

/**
 * Brings own.gen.ts and the docs of the own systems up to date with their sources: after an edit of a system.ts, or
 * after untell init --force copied an empty own.gen.ts. Quiet when nothing changed; a project with no own systems
 * costs one folder read. The commands that read a system's tokens run it first.
 */
export async function syncOwnSystems(project: string, log: (s: string) => void = () => {}): Promise<string[]> {
  let fw: Framework;
  try { fw = kitFramework(project); } catch { return []; }
  const names = ownNames(project, fw);
  const genFile = join(project, KIT_DIR[fw], "own.gen.ts");
  if (!names.length && (!existsSync(genFile) || readFileSync(genFile, "utf8") === ownGenSource([]))) return [];
  if (!existsSync(join(project, KIT_DIR[fw], "own.ts"))) return [];
  const wrote = writeOwnGen(project, fw);
  if (!names.length) return [];
  if (!wrote && oldestDocs(project, fw, names) >= newestSource(project, fw, names)) return [];
  const tables = await loadKit(project, fw);
  const done = writeOwnDocs(project, fw, tables, names);
  log(`untell: wrote the docs of your system${done.length > 1 ? "s" : ""} ${done.join(", ")} from ${relative(project, ownDir(project, fw))}/ (the source changed)`);
  return done;
}

/** A value as TypeScript source on one line: keys bare where they can be. */
function compact(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "undefined";
  const key = (k: string) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k));
  if (Array.isArray(v)) return `[${v.map(compact).join(", ")}]`;
  const e = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined);
  return e.length ? `{ ${e.map(([k, x]) => `${key(k)}: ${compact(x)}`).join(", ")} }` : "{}";
}

/** A value as TypeScript source: a short object or array on one line, a long one over several. */
export function tsLiteral(v: unknown, indent = ""): string {
  const one = compact(v);
  if (v === null || typeof v !== "object" || one.length + indent.length <= 110) return one;
  const next = indent + "  ";
  if (Array.isArray(v)) return `[\n${v.map((x) => next + tsLiteral(x, next)).join(",\n")},\n${indent}]`;
  const key = (k: string) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k));
  return `{\n${Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined).map(([k, x]) => `${next}${key(k)}: ${tsLiteral(x, next)}`).join(",\n")},\n${indent}}`;
}

/** The source of a new own system: a copy of a built-in under a new id and name. */
export function ownSource(name: string, from: string, system: Record<string, unknown>, direction: unknown, media: unknown, kitRel: string): string {
  const title = name.split("-").map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ");
  const data = { from, system: { ...system, id: name, name: title }, direction, ...(media ? { media } : {}) };
  return `// The design system "${name}", copied from ${from} by untell system new. It is yours: edit its values here.
// A film uses it with: export const system = "${name}". The kit reads this file through ${kitRel}/own.gen.ts.
// After an edit, run: untell system check ${name}. It checks the values and writes the docs that the tools read
// (${kitRel}/docs/systems/${name}/). Colours are OKLCH (l 0-1, c 0-0.4, h 0-360); sizes are shares of the frame's short
// side; times are seconds; frames are at 30 fps. \`from\` keeps the block hands (charts, kinetic words, wipes, code)
// of ${from}; remove it to draw them in the plain hand.
import type { OwnSystem } from "../../${basename(kitRel)}/own";

const own: OwnSystem = ${tsLiteral(data)};

export default own;
`;
}

type Problem = { severity: "error" | "warning"; field: string; problem: string; fix: string };

/** The facts a system is checked against: what the kit and the checks know. */
export type CheckFacts = { builtins: string[]; blocks: string[]; rules: string[]; effects: string[]; fw: Framework; loaders: string[] | null; loaderWeights?: Record<string, number[]> | null; fontFiles: (file: string) => boolean;
  contrast: (a: string, b: string) => number; hex: (o: { l: number; c: number; h: number }) => string; fontList: KitTables["fontList"] };

const ROLES = ["ground", "surface", "rule", "ink", "inkMuted", "accent", "accentText", "onAccent", "series1", "series2", "series3", "series4", "series5", "positive", "negative"];
const TYPE_ROLES = ["display", "headline", "body", "label", "caption"];
const KINDS_OF_END = ["card", "lockup", "offer", "paper", "event", "cut"];

/**
 * Checks one own system: the values the kit reads, the direction fields the checks read, the contrast of the text
 * roles, and its fonts. Each problem names the field (as it is in the source file) and the fix. Pure.
 */
export function validateOwn(o: { from?: string; system: Record<string, unknown>; direction: Record<string, unknown> | undefined }, f: CheckFacts): Problem[] {
  const out: Problem[] = [];
  const err = (field: string, problem: string, fix: string) => out.push({ severity: "error", field, problem, fix });
  const warn = (field: string, problem: string, fix: string) => out.push({ severity: "warning", field, problem, fix });
  const s = o.system as Record<string, any>;
  const num = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
  const is = (v: unknown) => (v === undefined ? "is missing" : `is ${JSON.stringify(v)}`);
  const str = (v: unknown) => typeof v === "string" && v.trim().length > 0;
  const oneOf = (field: string, v: unknown, list: readonly string[]) => { if (!list.includes(v as string)) err(field, is(v), `use one of: ${list.join(", ")}`); };
  const range = (field: string, v: unknown, lo: number, hi: number, unit = "") => { if (!num(v, lo, hi)) err(field, is(v), `give a number from ${lo} to ${hi}${unit}`); };

  // The values every block and renderer reads.
  if (o.from !== undefined && !f.builtins.includes(o.from)) err("from", `names "${o.from}", which is not a built-in system`, `use one of: ${f.builtins.join(", ")}, or remove from (the blocks then draw in the plain hand)`);
  for (const k of ["name", "reference", "pattern", "personality"]) if (!str(s[k])) err(`system.${k}`, "is empty", "write it in words: the docs and untell systems show it");
  oneOf("system.mode", s.mode, ["light", "dark"]);
  oneOf("system.accentMode", s.accentMode, ["fixed", "ink", "brand"]);
  const roles = (s.roles ?? {}) as Record<string, { l: number; c: number; h: number }>;
  for (const r of [...ROLES, ...Object.keys(roles).filter((k) => !ROLES.includes(k))]) {
    const c = roles[r];
    if (!c) { if (ROLES.includes(r)) err(`system.roles.${r}`, "is missing", "give an OKLCH colour: { l: 0.5, c: 0.1, h: 30 }"); continue; }
    if (!["accent2", "accent3", ...ROLES].includes(r)) { err(`system.roles.${r}`, "is not a colour role", `the roles are ${[...ROLES, "accent2", "accent3"].join(", ")}`); continue; }
    if (!num(c.l, 0, 1) || !num(c.c, 0, 0.4) || !num(c.h, 0, 360)) err(`system.roles.${r}`, is(c), "give OKLCH: l from 0 to 1, c from 0 to 0.4, h from 0 to 360");
  }
  const fonts = (s.fonts ?? {}) as Record<string, unknown>;
  for (const k of ["display", "text"]) if (!str(fonts[k])) err(`system.fonts.${k}`, "is missing", "give a font family name");
  const type = (s.type ?? {}) as Record<string, Record<string, unknown>>;
  for (const r of TYPE_ROLES) {
    const t = type[r];
    if (!t) { err(`system.type.${r}`, "is missing", "give { font, size, weight, tracking, leading }"); continue; }
    oneOf(`system.type.${r}.font`, t.font, ["display", "text", "mono"]);
    if (t.font === "mono" && !str(fonts.mono)) err(`system.type.${r}.font`, 'is "mono", and system.fonts has no mono family', "give system.fonts.mono, or set this role in display or text");
    range(`system.type.${r}.size`, t.size, 0.01, 0.4, " (a share of the frame's short side)");
    if (!(typeof t.weight === "number" && t.weight >= 100 && t.weight <= 900 && t.weight % 100 === 0)) err(`system.type.${r}.weight`, is(t.weight), "give a weight from 100 to 900, in steps of 100");
    range(`system.type.${r}.tracking`, t.tracking, -0.2, 0.5, " em");
    range(`system.type.${r}.leading`, t.leading, 0.7, 2.5);
  }
  if (num(type.body?.size, 0, 1) && (type.body!.size as number) < 0.04) warn("system.type.body.size", `is ${type.body!.size}: body text under 4 % of the short side is small on a phone`, "give 0.04 or more");
  range("system.margin", s.margin, 0, 0.25, " (a share of the short side)");
  if (!(Number.isInteger(s.columns) && s.columns >= 1 && s.columns <= 24)) err("system.columns", is(s.columns), "give a whole number from 1 to 24");
  range("system.radius", s.radius, 0, 200, " px at 1080");
  range("system.stroke", s.stroke, 0.5, 40, " px at 1080");
  const m = (s.motion ?? {}) as Record<string, any>;
  for (const k of ["enter", "move", "exit"]) {
    const b = m[k];
    if (!(Array.isArray(b) && b.length === 4 && b.every((x: unknown) => num(x, -2, 3)) && num(b[0], 0, 1) && num(b[2], 0, 1))) err(`system.motion.${k}`, is(b), "give a cubic Bezier curve: [x1, y1, x2, y2] with x1 and x2 from 0 to 1");
  }
  for (const k of ["enter", "move", "exit", "stagger"]) if (!(Number.isInteger(m.frames?.[k]) && m.frames[k] >= (k === "stagger" ? 0 : 1) && m.frames[k] <= 120)) err(`system.motion.frames.${k}`, is(m.frames?.[k]), "give a whole number of frames at 30 fps, from 1 to 120");
  for (const k of ["character", "transitions"]) if (!str(m[k])) err(`system.motion.${k}`, "is empty", "say it in words: SYSTEM.md shows it");
  range("system.texture.grain", s.texture?.grain, 0, 1);
  const d = (s.density ?? {}) as Record<string, unknown>;
  if (!(Number.isInteger(d.maxWords) && (d.maxWords as number) >= 1)) err("system.density.maxWords", is(d.maxWords), "give the most words of prose on screen at once: a whole number");
  range("system.density.minHoldBase", d.minHoldBase, 0.1, 10, " s");
  range("system.density.minHoldPerWord", d.minHoldPerWord, 0, 2, " s");
  if (!Array.isArray(s.allows) || s.allows.some((e: string) => !f.effects.includes(e))) err("system.allows", is(s.allows), `list effects from: ${f.effects.join(", ")} (or none: [])`);
  if (!Array.isArray(s.grammar) || !s.grammar.length) err("system.grammar", "is empty", "give one rule per line for how the system builds a frame");
  if (!Array.isArray(s.kinds) || !s.kinds.length) err("system.kinds", "is empty", "list the kinds of film it suits");

  // The contrast of the text roles: every role that a block sets text in, on the ground and on a surface (WCAG AA,
  // 4.5:1); grain moves pixels both ways, so a system with grain needs more.
  const hexOf = (r: string) => (roles[r] && num(roles[r]!.l, 0, 1) ? f.hex(roles[r]!) : null);
  const grain = Array.isArray(s.allows) && s.allows.includes("grain") && num(s.texture?.grain, 0, 1) ? s.texture.grain as number : 0;
  const need = 4.5 * (1 + 2 * grain);
  const pair = (fg: string, bg: string) => {
    const a = hexOf(fg), b = hexOf(bg);
    if (!a || !b) return;
    const c = f.contrast(a, b);
    if (c < need - 1e-9) err(`system.roles.${fg}`, `${fg} on ${bg} reads ${c.toFixed(2)}:1; text needs ${need.toFixed(2)}:1${grain ? ` (4.5:1, more for the grain of ${grain})` : ""}`,
      `move the lightness (l) of roles.${fg} away from roles.${bg} (now l ${roles[fg]!.l} against ${roles[bg]!.l})`);
  };
  for (const fg of ["ink", "inkMuted", "accentText", "positive", "negative"]) for (const bg of ["ground", "surface"]) pair(fg, bg);
  pair("onAccent", "accent");
  const ink = hexOf("ink"), ground = hexOf("ground");
  if (ink && ground && f.contrast(ink, ground) < 7) warn("system.roles.ink", `ink on ground reads ${f.contrast(ink, ground).toFixed(2)}:1; the built-in systems give their main text 7:1`, "move roles.ink further from roles.ground");

  // The fonts: each family and weight that a type role names, for the project's framework.
  if (!out.some((p) => p.field.startsWith("system.fonts") || /^system\.type\.\w+(\.font)?$/.test(p.field))) {
    for (const fam of f.fontList(s)) {
      if (f.fw === "remotion" && f.loaders && !f.loaders.includes(fam.family))
        err(fam.fallback ? "system.fonts.fallback" : `system.fonts (${fam.family})`, `"${fam.family}" has no loader in the kit's fonts.gen.ts, so Remotion cannot load it`,
          `use a family that FONT_LOADERS in fonts.gen.ts lists, or add a loader for "${fam.family}" there (a function that loads the font files and returns fontFamily and waitUntilDone)`);
      else if (f.fw === "remotion" && f.loaderWeights?.[fam.family]) {
        // The kit's loaders load local files: a weight with no file of its own cannot load.
        const have = f.loaderWeights[fam.family]!;
        const miss = fam.weights.filter((w) => !have.includes(w));
        if (miss.length) err(fam.fallback ? "system.fonts.fallback" : `system.fonts (${fam.family})`, `the kit has no font file for ${fam.family} ${miss.join(", ")} (it has ${have.join(", ")})`,
          `use a weight the kit has, or put ${miss.map((w) => `${fam.family.toLowerCase().replace(/ /g, "-")}-latin-${w}-normal.woff2`).join(", ")} into the kit's fonts folder (WOFF2, Latin, one file per weight, normal style) and add each to ${fam.family}'s loader in fonts.gen.ts`);
      }
      if (f.fw === "hyperframes") {
        const slug = fam.family.toLowerCase().replace(/ /g, "-");
        const miss = fam.weights.filter((w) => !f.fontFiles(`${slug}-latin-${w}-normal.woff2`));
        if (miss.length) err(fam.fallback ? "system.fonts.fallback" : `system.fonts (${fam.family})`, `no font file for ${fam.family} ${miss.join(", ")}`,
          `put ${miss.map((w) => `${slug}-latin-${w}-normal.woff2`).join(", ")} into the kit's fonts folder (WOFF2, Latin, one file per weight, normal style)`);
      }
    }
  }

  // The direction: the fields that the checks and the blocks read.
  const dir = o.direction as Record<string, any> | undefined;
  if (!dir) { err("direction", "is missing", "copy a direction from a built-in system: untell system new <name> --from <id> writes one"); return out; }
  oneOf("direction.hook.show", dir.hook?.show, ["picture", "line", "both"]);
  range("direction.hook.by", dir.hook?.by, 0, 5, " s");
  if (dir.hook?.role !== undefined) oneOf("direction.hook.role", dir.hook.role, TYPE_ROLES);
  if (dir.hook?.area !== undefined) range("direction.hook.area", dir.hook.area, 0, 1, " (a share of the frame)");
  range("direction.space.emptyShare", dir.space?.emptyShare, 0, 1);
  range("direction.space.emptyRun", dir.space?.emptyRun, 0.1, 60, " s");
  range("direction.maxStill", dir.maxStill, 0.3, 30, " s");
  if (dir.maxStillBeats !== undefined) range("direction.maxStillBeats", dir.maxStillBeats, 1, 64, " beats");
  oneOf("direction.ends.kind", dir.ends?.kind, KINDS_OF_END);
  range("direction.ends.hold", dir.ends?.hold, 0, 10, " s");
  if (dir.ends?.block !== undefined && !f.blocks.includes(dir.ends.block)) err("direction.ends.block", `names "${dir.ends.block}", which is not a block`, "name a block of the catalog (docs/systems/BLOCKS.md)");
  for (const k of ["name", "line"]) if (dir.ends?.look) oneOf(`direction.ends.look.${k}`, dir.ends.look[k], TYPE_ROLES);
  range("direction.mix.lufs", dir.mix?.lufs, -40, 0, " LUFS");
  range("direction.mix.range", dir.mix?.range, 0.5, 10, " LU");
  oneOf("direction.mix.music", dir.mix?.music, ["bed", "clock", "none"]);
  oneOf("direction.mix.entry", dir.mix?.entry, ["drop", "swell", "section", "start", "none"]);
  if (!Array.isArray(dir.moves)) err("direction.moves", "is missing", "list two to four moves");
  else dir.moves.forEach((mv: Record<string, any>, i: number) => {
    if (!mv.allows) return;
    if (!f.blocks.includes(mv.allows.block)) err(`direction.moves[${i}].allows.block`, `names "${mv.allows.block}", which is not a block`, "name the block that draws the move");
    const bad = (mv.allows.checks ?? []).filter((c: string) => !f.rules.includes(c));
    if (bad.length) err(`direction.moves[${i}].allows.checks`, `names ${bad.join(", ")}, which no check has`, "name rules from untell check --rules");
  });
  for (const k of ["blocks", "avoid"]) if (Array.isArray(dir[k])) dir[k].forEach((b: { block: string }, i: number) => { if (!f.blocks.includes(b.block)) err(`direction.${k}[${i}].block`, `names "${b.block}", which is not a block`, "name a block of the catalog (docs/systems/BLOCKS.md)"); });
  return out;
}

/** The family names that the kit's fonts.gen.ts can load in Remotion, or null when the kit has no such file. */
export function fontLoaders(project: string, fw: Framework): string[] | null {
  const p = join(project, KIT_DIR[fw], "fonts.gen.ts");
  if (!existsSync(p)) return null;
  const t = readFileSync(p, "utf8");
  const i = t.indexOf("FONT_LOADERS");
  return i < 0 ? null : [...t.slice(i).matchAll(/^\s+"([^"]+)":/gm)].map((m) => m[1]!);
}

/** The weights that each family's loader in the kit's fonts.gen.ts has a file for, or null for a kit whose loaders
 *  have no list of files (an older kit). */
export function loaderWeights(project: string, fw: Framework): Record<string, number[]> | null {
  const p = join(project, KIT_DIR[fw], "fonts.gen.ts");
  if (!existsSync(p)) return null;
  const out: Record<string, number[]> = {};
  for (const m of readFileSync(p, "utf8").matchAll(/^\s+"([^"]+)": local\("[^"]+", \{([^}]*)\}\)/gm)) out[m[1]!] = [...m[2]!.matchAll(/(\d+):/g)].map((x) => Number(x[1]));
  return Object.keys(out).length ? out : null;
}

/** `untell system new <name> --from <id>`. */
export async function systemNew(project: string, name: string | undefined, from: string | undefined, o: { force?: boolean; log?: (s: string) => void } = {}): Promise<number> {
  const log = o.log ?? console.log;
  if (!name) throw new UsageError("untell system new needs a name: untell system new <name> --from <id>", "system");
  if (!NAME_RE.test(name) || RESERVED.has(name)) throw new UsageError(`"${name}" cannot name a system. Use 2 to 32 lower-case letters, digits and hyphens, starting with a letter${RESERVED.has(name) ? `; "${name}" means something else to untell` : ""}.`, "system");
  if (!from) throw new UsageError(`untell system new needs the built-in system to copy: untell system new ${name} --from <id>. untell systems lists them.`, "system");
  const fw = kitFramework(project);
  const S = screenStyle(!!process.stdout.isTTY && !process.env.NO_COLOR);
  const file = ownFile(project, fw, name);
  if (existsSync(file) && !o.force) throw new UsageError(`${relative(project, file)} is already here. Edit it, or give --force to copy ${from} over it.`, "system");
  writeOwnGen(project, fw);
  const tables = await loadKit(project, fw);
  const builtins = tables.SYSTEMS.map((s) => s.id).filter((id) => !tables.ownSystems().some((x) => x.system.id === id));
  if (builtins.includes(name)) throw new UsageError(`"${name}" is a built-in system. Give your system a name of its own.`, "system");
  const src = tables.SYSTEMS.find((s) => s.id === from);
  if (!src) throw new UsageError(`there is no system "${from}" to copy. untell systems lists them.`, "system");
  // A copy of an own system keeps the built-in it came from, so it keeps the same block hands.
  const base = tables.ownSystems().find((x) => x.system.id === from)?.from ?? from;
  const kitRel = KIT_DIR[fw];
  log(`untell system new  ${name} \u00b7 a copy of ${from}`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, ownSource(name, base, src, tables.DIRECTION[from], tables.MEDIA_SPEC[from], kitRel));
  log(`  wrote  ${relative(project, file).padEnd(32)} the values you edit: colours, type, motion, direction and media`);
  writeOwnGen(project, fw);
  log(`  wrote  ${`${kitRel}/own.gen.ts`.padEnd(32)} the kit's list of your systems`);
  const after = await loadKit(project, fw);
  writeOwnDocs(project, fw, after, [name]);
  log(`  wrote  ${`${kitRel}/docs/systems/${name}/`.padEnd(32)} tokens.json, tokens.css, fonts.json and SYSTEM.md, which the tools read`);
  log(`\n${S.green(`done: ${name} is a copy of ${from}`)}. Every command takes it: a film names it with export const system = "${name}".`);
  log(`next    edit ${relative(project, file)}, then run: untell system check ${name}`);
  return 0;
}

export type SystemCheckOptions = { film?: boolean; json?: boolean; log?: (s: string) => void };
type FilmResult = { system: string; errors: number; warnings: number; findings: { check: string; severity: string; node?: string; from?: number }[]; ok: boolean; note?: string };

/** `untell system check [<name>]`: each own system (or one), its values, its direction, its contrast, its fonts and a film in it. */
export async function systemCheck(project: string, nameArg: string | undefined, o: SystemCheckOptions = {}): Promise<number> {
  const log = o.json ? (s: string) => console.error(s) : (o.log ?? console.log);
  const S = screenStyle(!!(o.json ? process.stderr.isTTY : process.stdout.isTTY) && !process.env.NO_COLOR);
  const fw = kitFramework(project);
  const names = ownNames(project, fw);
  if (nameArg && !names.includes(nameArg)) {
    const builtin = existsSync(join(registryDir(), "docs", "systems", nameArg, "tokens.json"));
    throw new UsageError(builtin ? `${nameArg} is a built-in system: its own tests check it. To make a system of your own from it: untell system new <name> --from ${nameArg}` : `no system "${nameArg}" in ${relative(project, ownDir(project, fw))}/. ${names.length ? `Yours: ${names.join(", ")}.` : "Make one: untell system new <name> --from <id>."}`, "system");
  }
  if (!names.length) throw new UsageError(`no system of your own in ${relative(project, ownDir(project, fw))}/. Make one: untell system new <name> --from <id> (untell systems lists the built-ins).`, "system");
  const todo = nameArg ? [nameArg] : names;
  writeOwnGen(project, fw);
  let tables: KitTables;
  try { tables = await loadKit(project, fw); }
  catch (e) {
    log(`untell system check  ${todo.join(", ")}\n\n${S.red(`x failed: the kit does not build with your system${todo.length > 1 ? "s" : ""}`)}\n\n  ${(e as Error).message}\n\nnext    fix the line it names, then run: untell system check${nameArg ? ` ${nameArg}` : ""}`);
    return 1;
  }
  const { contrast, hex } = await kitColor(project, fw);
  const own = tables.ownSystems();
  const facts: CheckFacts = {
    builtins: tables.SYSTEMS.map((s) => s.id).filter((id) => !own.some((x) => x.system.id === id)),
    blocks: Object.keys(tables.BLOCKS), rules: detectorRules().map((r) => r.id), effects: Object.keys(tables.EFFECT_NOTE), fw,
    loaders: fontLoaders(project, fw), loaderWeights: loaderWeights(project, fw), contrast, hex, fontList: tables.fontList,
    fontFiles: (f) => [join(project, KIT_DIR[fw], "fonts", f), join(registryDir(), "fonts", f)].some(existsSync),
  };
  const results: { name: string; from: string | null; problems: Problem[]; film: { mine: FilmResult; theirs: FilmResult | null; added: FilmResult["findings"] } | null }[] = [];
  let failed = false;
  for (const name of todo) {
    const sys = own.find((x) => x.system.id === name);
    const rel = relative(project, ownFile(project, fw, name));
    log(`untell system check  ${name}${sys?.from ? ` \u00b7 from ${sys.from}` : ""} \u00b7 ${rel}`);
    if (!sys) { results.push({ name, from: null, problems: [{ severity: "error", field: "export default", problem: "the file exports no system", fix: "end the file with: export default own;" }], film: null }); failed = true; continue; }
    const problems: Problem[] = [];
    if (sys.system.id !== name) problems.push({ severity: "error", field: "system.id", problem: `is "${sys.system.id}", and the folder is ${name}`, fix: `set system.id to "${name}", or rename the folder` });
    problems.push(...validateOwn(sys as never, facts));
    // The docs only from values that hold: a missing field would stop the writer with a bare TypeError.
    if (problems.some((x) => x.severity === "error")) log(`  docs      not written: fix the errors first (the tools read the docs of the last good version)`);
    else {
      try {
        writeOwnDocs(project, fw, tables, [name]);
        log(`  docs      wrote ${KIT_DIR[fw]}/docs/systems/${name}/ (tokens.json, tokens.css, fonts.json, SYSTEM.md)`);
      } catch (e) {
        problems.push({ severity: "error", field: "system", problem: `the docs could not be written: ${(e as Error).message}`, fix: "compare the file with a fresh copy: untell system new <other name> --from " + (sys.from ?? "<id>") });
        log("  docs      not written");
      }
    }
    const partOf = (x: Problem) => x.field.startsWith("direction") ? "direction" : x.field.startsWith("system.fonts") ? "fonts" : /reads [\d.]+:1/.test(x.problem) ? "contrast" : "values";
    const part = (p: string) => problems.filter((x) => partOf(x) === p);
    const line = (label: string, ps: Problem[], ok: string) => {
      const e = ps.filter((x) => x.severity === "error").length, w = ps.length - e;
      log(`  ${label.padEnd(9)} ${e ? S.red(`${e} error${e > 1 ? "s" : ""}`) : w ? S.yellow(`${w} warning${w > 1 ? "s" : ""}`) : "passed"}${e || w ? "" : ` \u00b7 ${ok}`}`);
    };
    line("values", part("values"), "colours, type, layout, motion, density");
    line("direction", part("direction"), "hook, space, stillness, ends, mix, moves");
    line("contrast", part("contrast"), "each text role 4.5:1 or more on the ground and a surface");
    line("fonts", part("fonts"), tables.fontList(sys.system).map((x) => `${x.family} ${x.weights.join(", ")}`).join("; "));
    let film: (typeof results)[number]["film"] = null;
    if (o.film !== false && !problems.some((x) => x.severity === "error")) film = await filmIn(project, fw, name, sys.from ?? null, log, S);
    else if (o.film !== false) log(`  film      not run: fix the errors first`);
    results.push({ name, from: sys.from ?? null, problems, film });
    if (problems.some((x) => x.severity === "error") || (film && film.added.some((f) => f.severity === "error")) || (film && !film.mine.ok && film.mine.note)) failed = true;
  }

  // The verdict, the causes and the next command.
  const all = results.flatMap((r) => r.problems.map((p) => ({ ...p, name: r.name })));
  const filmErrors = results.flatMap((r) => (r.film?.added ?? []).filter((f) => f.severity === "error").map((f) => ({ name: r.name, f })));
  const e = all.filter((x) => x.severity === "error").length + filmErrors.length, w = all.length - all.filter((x) => x.severity === "error").length;
  const verdict = failed ? S.red(`x failed: ${e} error${e === 1 ? "" : "s"}${w ? `, ${w} warning${w === 1 ? "" : "s"}` : ""}`) : w ? S.yellow(`! passed with ${w} warning${w === 1 ? "" : "s"}`) : S.green("passed");
  log(`\n${S.bold(verdict)}`);
  const causes = [...all.filter((x) => x.severity === "error"), ...all.filter((x) => x.severity === "warning")];
  causes.forEach((c, k) => {
    log(`  ${String(k + 1).padStart(2)}  ${S.mark(c.severity)} ${S.bold(`${todo.length > 1 ? `${c.name}: ` : ""}${c.field}`)} ${c.problem}`);
    log(`       ${S.dim("fix")}  ${c.fix}`);
  });
  // The film's errors, one cause for each rule (a value such as a small label role gives one error on each label).
  const byRule = new Map<string, { name: string; check: string; nodes: string[]; from: number }>();
  for (const x of filmErrors) {
    const k = `${x.name} ${x.f.check}`, g = byRule.get(k) ?? { name: x.name, check: x.f.check, nodes: [], from: x.f.from ?? 0 };
    if (x.f.node && !g.nodes.includes(x.f.node)) g.nodes.push(x.f.node);
    g.from = Math.min(g.from, x.f.from ?? 0);
    byRule.set(k, g);
  }
  [...byRule.values()].forEach((g, k) => log(`  ${String(causes.length + k + 1).padStart(2)}  ${S.mark("error")} ${S.bold(`${g.name}: the example film`)} ${g.check}${g.nodes.length ? ` on ${g.nodes.slice(0, 4).join(", ")}${g.nodes.length > 4 ? ` and ${g.nodes.length - 4} more` : ""}` : ""} from ${g.from.toFixed(2)} s, an error of the frame rules in your system\n       ${S.dim("fix")}  untell check --explain ${g.check} says what it measures; change the value of your system that it reads`));
  const file = (n: string) => relative(project, ownFile(project, fw, n));
  if (failed) log(`\nnext    fix 1 in ${file(causes[0]?.name ?? todo[0]!)}, then run: untell system check${nameArg ? ` ${nameArg}` : ""}`);
  else log(`\nnext    use it in a film: export const system = "${todo[0]}"; then untell check <film>`);
  if (o.json) console.log(JSON.stringify({ version: 1, ok: !failed, systems: results }, null, 1));
  return failed ? 1 : 0;
}

/** The kit's colour functions (hex and contrast), bundled for Node. */
async function kitColor(project: string, fw: Framework): Promise<{ contrast: CheckFacts["contrast"]; hex: CheckFacts["hex"] }> {
  const { build } = await import("esbuild");
  const out = join(project, ".untell", `color-${process.pid}.mjs`);
  try {
    await build({ entryPoints: [join(project, KIT_DIR[fw], "color.ts")], bundle: true, platform: "node", format: "esm", outfile: out, logLevel: "silent" });
    return await import(pathToFileURL(out).href) as never;
  } finally { rmSync(out, { force: true }); }
}

/**
 * The example film in the system: does it pass untell check on its own? The check runs the frame rules only (--demo):
 * the rules that read the system's values (type size, contrast, the safe areas, collisions, cut text). The story rules
 * (the hook, the end, stillness, the reveal) judge a film against its system's direction, and the example film is made
 * for Riso, so they judge the film, not the system. An error fails the step. Only when the film has errors does the
 * step run it in the system it came from: where the film is clean there, each error is the system's. Where the film has
 * errors there too (it does not suit that system), only an error that the source does not have fails the step, and
 * the line says so. The film lives in .untell/system-check/; the project's last check report and its HyperFrames page
 * are put back as they were.
 */
async function filmIn(project: string, fw: Framework, name: string, from: string | null, log: (s: string) => void, S: ReturnType<typeof screenStyle>) {
  const dir = join(project, ".untell", "system-check");
  mkdirSync(dir, { recursive: true });
  const kitRel = relative(dir, join(project, KIT_DIR[fw])).split("\\").join("/");
  const sceneFor = (id: string) => {
    const p = join(dir, `${id}-film.ts`);
    writeFileSync(p, exampleScene().replace(/export const system = "[\w-]+";/, `export const system = "${id}";`).replaceAll('"../untell/', `"${kitRel}/`));
    return p;
  };
  // What a check writes over: the report that master and listen mix read, and the built HyperFrames page.
  const keep = [join(project, ".untell", "check", "report.json"), ...(fw === "hyperframes" ? [join(project, "index.html"), join(project, "assets", "vs-hyperframes.js")] : [])];
  const saved = keep.map((p) => [p, existsSync(p) ? readFileSync(p) : null] as const);
  const { check } = await import("./check");
  const run = async (id: string): Promise<FilmResult> => {
    const t0 = Date.now();
    const l = console.log, er = console.error;
    console.log = () => {}; console.error = () => {};
    let r: Record<string, any> | null = null, note: string | undefined;
    try {
      await check(project, { film: sceneFor(id), json: true, demo: true });
      r = JSON.parse(readFileSync(join(project, ".untell", "check", "report.json"), "utf8"));
    } catch (e) { note = (e as Error).message.split("\n")[0]; }
    finally { console.log = l; console.error = er; }
    const fs = ((r?.findings ?? []) as FilmResult["findings"]).filter((f) => !f.check.startsWith("lint/"));
    const errors = fs.filter((f) => f.severity === "error").length, warnings = fs.filter((f) => f.severity === "warning").length;
    const stepsOk = !r || (r.steps as { name: string; ok: boolean }[]).filter((s) => s.name !== "lint").every((s) => s.ok || /error/.test((s as { note?: string }).note ?? ""));
    log(`  film      the example film in ${id}, frame rules: ${note ? S.red(`did not run: ${note}`) : errors ? S.red(`${errors} error${errors > 1 ? "s" : ""}`) : warnings ? S.yellow(`passed with ${warnings} warning${warnings > 1 ? "s" : ""}`) : "passed"} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    return { system: id, errors, warnings, findings: fs.map((f) => ({ check: f.check, severity: f.severity, ...(f.node ? { node: f.node } : {}), ...(f.from !== undefined ? { from: f.from } : {}) })), ok: !note && stepsOk, ...(note ? { note } : {}) };
  };
  try {
    // On its own: a film with no error passes, whatever the source gives.
    const mine = await run(name);
    if (!mine.errors || !from) return { mine, theirs: null, added: mine.findings.filter((f) => f.severity === "error") };
    const theirs = await run(from);
    if (!theirs.errors) {
      log(`            the film is clean in ${from}, so each error is your system's`);
      return { mine, theirs, added: mine.findings.filter((f) => f.severity === "error") };
    }
    // The film has errors in the source too: it does not suit that system. Only an error the source does not have counts.
    const key = (f: FilmResult["findings"][number]) => `${f.check} ${f.node ?? ""} ${f.severity}`;
    const base = new Set(theirs.findings.map(key));
    const added = mine.findings.filter((f) => f.severity === "error" && !base.has(key(f)));
    log(`            ${S.dim(`the example film has ${theirs.errors} error${theirs.errors > 1 ? "s" : ""} in ${from} too, so it does not suit ${from}: only an error that ${from} does not have fails the step (${added.length}). Check a film of your own in the system: untell check <film>`)}`);
    return { mine, theirs, added };
  } finally {
    for (const [p, data] of saved) { if (data) writeFileSync(p, data); else rmSync(p, { force: true }); }
    rmSync(dir, { recursive: true, force: true });
  }
}

/** `untell system <sub>`: new and check. */
export async function systemCommand(cwd: string, sub: string | undefined, rest: string[], o: { from?: string; force?: boolean; json?: boolean; noFilm?: boolean }): Promise<number> {
  const project = resolve(cwd);
  if (sub === "new") { if (rest.length > 1) throw new UsageError(`untell system new takes one name, not ${rest.length}.`, "system"); return systemNew(project, rest[0], o.from, { force: o.force }); }
  if (sub === "check") { if (rest.length > 1) throw new UsageError(`untell system check takes one name or none, not ${rest.length}.`, "system"); return systemCheck(project, rest[0], { film: !o.noFilm, json: o.json }); }
  throw new UsageError(sub ? `untell system has no "${sub}". It has new and check.` : "untell system needs new or check: untell system new <name> --from <id>, untell system check [<name>].", "system");
}

/** The built-in a system came from (tokens.json `own.from` of an own system), or null. */
export function fromOf(project: string, id: string): string | null {
  try { return (JSON.parse(readFileSync(join(systemsDir(project), id, "tokens.json"), "utf8")) as { own?: { from?: string | null } }).own?.from ?? null; } catch { return null; }
}
