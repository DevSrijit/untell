// Packs the kit from the repository into packages/untell/registry and builds the CLI to dist/cli.js.
// Usage: bun packages/untell/scripts/pack.ts
//
// The pack copies repository files unchanged. A repository script finds its files from one root and reads it from the
// environment (UNTELL_ROOT, UNTELL_SYSTEMS, UNTELL_HYPERFRAMES), so untell runs it as the repository wrote it.
// A few repository files cannot read their difference from the environment. For each of those the pack looks for a
// marker in the file first ("untell:pack <name>", or the native form of the behaviour), and only when the marker
// is missing it falls back to an older anchor. Each fallback is printed at the end ("fallback anchors"), so the
// list of patches that remain is always visible. A fallback that no longer matches stops the pack with the file
// and the marker to add.
//
// It reads the repository (src/system, systems/, node_modules/@fontsource/*, scripts/inspect, scripts/listen,
// scripts/review_sheet.py, scripts/master.py, scripts/media_*.py, scripts/snap/preview.py, scripts/lint/rules.ts)
// and writes only under packages/untell. It never copies assets/media: the stock licences forbid redistribution.
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { isTest, walk } from "../src/kit";
import { RULES, tellsDoc } from "../src/lint";
import { blocksDocCut, extractDecl, labCommandsIn, mapLabCommands, nativeRoot, ownerName, rootLine, setupHint, importClosure } from "./anchors";

const PKG = resolve(import.meta.dir, "..");
const LAB = resolve(PKG, "../..");
const REG = join(PKG, "registry");

rmSync(REG, { recursive: true, force: true });
const put = (rel: string, data: string | Buffer) => { const p = join(REG, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, data); };
const lab = (rel: string) => readFileSync(join(LAB, rel), "utf8");
/** The patches that used a fallback anchor in this pack: "<file>: <what>". */
const fallbacks: string[] = [];
const note = (f: string | null) => { if (f) fallbacks.push(f); };

// 1. The kit: src/system minus tests. media.gen.ts and music.gen.ts list this repository's own media, so the kit gets
// their types and empty tables (generated data, not a patch: the types are taken as they are).
const SRC = join(LAB, "src/system");
/** Files under src/system that are repository tools, not kit code. */
const LAB_ONLY = new Set(["three/make_silhouettes.ts"]);
let kitCount = 0;
/** The font files that the kit's fonts.gen.ts imports from its fonts folder: section 3 must ship each one. */
const kitFonts: string[] = [];
for (const rel of walk(SRC)) {
  if (isTest(rel)) continue;
  // Scripts for this repository only, in the kit's folders (they read the repository's media and use Bun's import.meta.dir): not for a project.
  if (LAB_ONLY.has(rel)) continue;
  if (rel === "media.gen.ts") {
    const text = readFileSync(join(SRC, rel), "utf8");
    const types = text.match(/^export type .*$/gm);
    if (!types || types.length < 3) throw new Error("src/system/media.gen.ts: fewer than 3 exported types. Check that the repository's media table still exports its types on one line each.");
    // Every table the repository exports (SOUNDS, MEDIA and any new one), empty.
    const tables = [...text.matchAll(/^export const (\w+): (Record<string, \w+>) =/gm)].map((m) => `export const ${m[1]}: ${m[2]} = {};`);
    if (!tables.includes("export const MEDIA: Record<string, MediaInfo> = {};")) throw new Error("src/system/media.gen.ts: no MEDIA table. Check the repository's media table.");
    put("kit/media.gen.ts", [
      "// Prepared media for this project: size in px, the subject's box and centre, and a coarse alpha mask.",
      "// untell copies no media, so both tables start empty. Each entry names a folder in the media folder",
      "// (HyperFrames: assets/media/<name>/, Remotion: public/media/<name>/).",
      ...types,
      ...tables,
      "",
    ].join("\n"));
  } else if (rel === "music.gen.ts") {
    // The repository's music maps are of this repository's own tracks. The kit gets the types (gridTrust and gridIssues among them) and an empty table.
    const text = readFileSync(join(SRC, rel), "utf8");
    const cut = text.indexOf("export const MUSIC");
    if (cut < 0) throw new Error("src/system/music.gen.ts: no MUSIC table. Check the repository's music table.");
    put("kit/music.gen.ts", "// The map of each prepared music track (beats, bars, sections, drops, grid trust). untell copies no media, so it starts empty.\n"
      + text.slice(text.indexOf("export type"), cut) + "export const MUSIC: Record<string, MusicMap> = {};\n");
  } else if (rel === "three/silhouettes.gen.ts") {
    // The repository models' silhouettes: the kit gets the type and an empty table; untell media add writes a project's own.
    const text = readFileSync(join(SRC, rel), "utf8");
    if (!/^export const SILHOUETTES: Record<string, Silhouette> = \{/m.test(text) || !/import type \{ Silhouette \} from "\.\/silhouette";/.test(text)) throw new Error("src/system/three/silhouettes.gen.ts: no SILHOUETTES table or no Silhouette import. Check the repository's silhouette table.");
    const { silhouettesSource } = await import("../src/media-store");
    put("kit/three/silhouettes.gen.ts", silhouettesSource({}));
  } else if (rel === "marks.gen.ts") {
    // The repository's own marks: the kit gets the import and an empty table; untell media add writes a project's own.
    const text = readFileSync(join(SRC, rel), "utf8");
    if (!/^export const MARKS: Record<string, MarkArt> = \{/m.test(text)) throw new Error("src/system/marks.gen.ts: no MARKS table. Check the repository's marks table.");
    const { marksSource } = await import("../../../src/system/scene/markArt");
    put("kit/marks.gen.ts", marksSource({}));
  } else if (rel === "media-plates.gen.ts") {
    // The prepared files of this repository's own media: the kit gets the table's type and an empty table (untell media
    // prepare writes it in a project, under the media lock).
    const text = readFileSync(join(SRC, rel), "utf8");
    if (!/^export const PLATES: Record<string, string\[\]> = \{/m.test(text)) throw new Error("src/system/media-plates.gen.ts: no PLATES table. Check the repository's plates table.");
    const { platesSource } = await import("../src/media-store");
    put("kit/media-plates.gen.ts", platesSource({}));
  } else if (rel === "scene/BLOCKS.md") {
    // The repository's block contract ends with tasks for repository agents. They do not apply in a user's project.
    const r = blocksDocCut(readFileSync(join(SRC, rel), "utf8"), "src/system/scene/BLOCKS.md");
    note(r.fallback);
    put(`kit/${rel}`, r.text);
  } else if (rel === "fonts.gen.ts") {
    // The repository imports each font file from its Fontsource package; the kit imports it from its own fonts folder
    // (init copies registry/fonts there). Each import line carries the marker "untell:pack font".
    const text = readFileSync(join(SRC, rel), "utf8");
    const marked = text.split("\n").filter((l) => l.includes("untell:pack font")).length;
    const out = text.replace(/"@fontsource\/[\w-]+\/files\/([\w-]+\.woff2)"; \/\/ untell:pack font/g, (_, f: string) => { kitFonts.push(f); return `"./fonts/${f}";`; });
    if (!marked || kitFonts.length !== marked) throw new Error(`src/system/fonts.gen.ts: ${marked} import(s) carry "untell:pack font", ${kitFonts.length} matched the form "@fontsource/<package>/files/<file>.woff2". Run bun scripts/export_systems.ts.`);
    put(`kit/${rel}`, out);
  } else put(`kit/${rel}`, readFileSync(join(SRC, rel)));
  kitCount++;
}
// The Remotion film helper. It is a template in kit-extra, because it imports kit files that are only beside it here.
put("kit/film.tsx", readFileSync(join(PKG, "kit-extra/film.tsx.tpl"), "utf8").replace(/^\/\/ Template:.*\n/, ""));
kitCount++;
// The scene API in one import (types, blocks, withSnap and SnapRel), unless the repository writes its own.
if (!existsSync(join(SRC, "scene/index.ts"))) { put("kit/scene/index.ts", readFileSync(join(PKG, "kit-extra/scene-index.ts.tpl"), "utf8").replace(/^\/\/ Template:.*\n/, "")); kitCount++; }

// 2. The docs: the systems folder (README, catalog, each system's SYSTEM.md and tokens) and the playbooks.
const SYS = join(LAB, "systems");
const ids = readdirSync(SYS).filter((d) => existsSync(join(SYS, d, "tokens.json"))).sort();
if (ids.length !== 20) throw new Error(`expected 20 systems in systems/, found ${ids.length}`);
for (const f of ["README.md", "BLOCKS.md"]) put(`docs/systems/${f}`, readFileSync(join(SYS, f)));
for (const id of ids) for (const f of ["SYSTEM.md", "tokens.json", "tokens.css", "fonts.json"]) put(`docs/systems/${id}/${f}`, readFileSync(join(SYS, id, f)));
for (const f of readdirSync(join(SYS, "playbooks")).filter((f) => f.endsWith(".md")).sort()) {
  const r = ownerName(readFileSync(join(SYS, "playbooks", f), "utf8"), `systems/playbooks/${f}`);
  note(r.fallback);
  put(`docs/playbooks/${f}`, r.text);
}
// The guide to a block of your own (docs/guide/blocks.md): in the kit's docs beside the playbooks, and in the package's
// docs. One source; the package test own-block.test.ts builds its worked example.
{
  const guide = readFileSync(join(LAB, "docs/guide/blocks.md"), "utf8");
  if (!/```ts\n\/\/ films\/blocks\/tally\.ts/.test(guide)) throw new Error("docs/guide/blocks.md: no worked example (a ts fence that starts with // films/blocks/tally.ts)");
  put("docs/playbooks/BLOCK.md", guide);
  writeFileSync(join(PKG, "docs", "BLOCK.md"), guide);
}

// 3. The fonts, for both frameworks (init copies them into the kit's fonts folder): every family and weight that a system names, from the repository's
// Fontsource packages, with each package's licence (all are SIL Open Font License).
type FontEntry = { family: string; weights: number[]; pkg: string; italic?: number[] };
const fonts = new Map<string, string>();
const pkgs = new Set<string>();
for (const id of ids) {
  for (const f of JSON.parse(readFileSync(join(SYS, id, "fonts.json"), "utf8")) as FontEntry[]) {
    const slug = f.family.toLowerCase().replace(/ /g, "-");
    pkgs.add(f.pkg);
    for (const w of f.weights) fonts.set(`${slug}-latin-${w}-normal.woff2`, join(LAB, "node_modules", f.pkg, "files", `${slug}-latin-${w}-normal.woff2`));
    // The true italic of a face, where the family has one (fonts.json "italic"): quote's emphasis sets one word in it.
    for (const w of f.italic ?? []) fonts.set(`${slug}-latin-${w}-italic.woff2`, join(LAB, "node_modules", f.pkg, "files", `${slug}-latin-${w}-italic.woff2`));
  }
}
// The review sheet and listen.png set their words in Geist and their numbers in Geist Mono (registry/fonts): they ship
// in every install, whether a system names them or not.
for (const f of ["geist-latin-500-normal.woff2", "geist-latin-600-normal.woff2", "geist-mono-latin-400-normal.woff2"]) {
  const pkg = f.startsWith("geist-mono") ? "@fontsource/geist-mono" : "@fontsource/geist";
  fonts.set(f, join(LAB, "node_modules", pkg, "files", f));
  pkgs.add(pkg);
}
for (const f of kitFonts) if (!fonts.has(f)) throw new Error(`the kit's fonts.gen.ts imports fonts/${f}, and no system's fonts.json names it. Run bun scripts/export_systems.ts.`);
for (const [name, src] of fonts) {
  if (!existsSync(src)) throw new Error(`missing font file ${src}: install the repository's packages (bun install)`);
  put(`fonts/${name}`, readFileSync(src));
}
for (const p of pkgs) {
  const lic = ["LICENSE", "LICENSE.md", "LICENSE.txt", "OFL.txt"].map((f) => join(LAB, "node_modules", p, f)).find(existsSync);
  if (!lic) throw new Error(`no licence file in ${p}`);
  put(`fonts/licenses/${p.replace("@fontsource/", "")}.txt`, readFileSync(lic));
}

// 4. The tools that read their paths from the environment, copied unchanged.
//   review_sheet.py   lists findings without a time under its header and reads untell lint --json
//   media_treat.py    reads the systems folder from UNTELL_SYSTEMS (a missing system is an error there)
//   media_video.py    takes source.mp4, .mov, .webm or .m4v, and turns the size of a rotated clip
//   media_cut.py      the cut-out cleanup (cutout_fringe imports clean() from it through the work tree)
//   master.py         its root from UNTELL_ROOT
//   snap/preview.py   the before and after image of untell snap
const shipped: string[] = [];
const ship = (rel: string, text: string) => { put(rel, text); shipped.push(rel); };
const native = (labRel: string, rel: string, mustHave: string[] = []) => {
  const text = lab(labRel);
  for (const m of mustHave) if (!text.includes(m)) throw new Error(`${labRel} does not read ${m}. untell copies it unchanged and sets ${m}; add it to the script (see the pack script's header).`);
  ship(rel, text);
};
native("scripts/review_sheet.py", "tools/review_sheet.py", ["findingsListed"]);
native("scripts/media_treat.py", "tools/media_treat.py", ["UNTELL_SYSTEMS"]);
native("scripts/media_video.py", "tools/media_video.py", ["source.*"]);
native("scripts/media_cut.py", "tools/media_cut.py");
native("scripts/master.py", "tools/master.py", ["UNTELL_ROOT"]);
native("scripts/snap/preview.py", "tools/snap/preview.py");
for (const f of ["media_photo.py", "media_sound.py"]) put(`tools/${f}`, readFileSync(join(PKG, "kit-extra", f)));
// The recorder's capture page for a Remotion film: the repository's scripts/perf/player.tsx, byte for byte. Its kit imports
// (../../src/system/...) resolve to the project's kit when untell bundles it (src/record.ts, playerPage).
{
  const player = lab("scripts/perf/player.tsx");
  const kitImports = [...player.matchAll(/from "(\.[^"]+)"/g)].map((m) => m[1]!);
  const odd = kitImports.filter((i) => !i.startsWith("../../src/system/"));
  if (odd.length) throw new Error(`scripts/perf/player.tsx imports ${odd.join(", ")}. untell resolves only ../../src/system/ (the kit) in a project; import the kit, or teach src/record.ts the new path.`);
  ship("tools/player.tsx", player);
}

// 5. The detector, untell listen and the music map. Each finds its files from one root (ROOT). It reads ROOT
// from UNTELL_ROOT when the repository script has the native line; else the pack sets that one line (a fallback).
// untell builds a work tree in the project (.untell/lab, see src/worktree.ts) with the repository's layout, made of
// links to the project's own files.
const rooted = (rel: string, text = lab(`scripts/${rel}`)) => {
  const r = rootLine(text, `scripts/${rel}`);
  note(r.fallback);
  return r.text;
};
const INSPECT = join(LAB, "scripts/inspect");
const detectPy = readFileSync(join(INSPECT, "detect.py"), "utf8");
const checkList = detectPy.match(/^CHECKS = \[([\s\S]*?)\]/m);
if (!checkList) throw new Error("scripts/inspect/detect.py: no CHECKS list. untell runs the checks that it names.");
const CHECK_NAMES = [...checkList[1]!.matchAll(/"(\w+)"/g)].map((m) => m[1]!);
const checkFiles = readdirSync(join(INSPECT, "checks")).filter((f) => f.endsWith(".py")).sort();
for (const n of CHECK_NAMES) if (!checkFiles.includes(`${n}.py`)) throw new Error(`scripts/inspect/detect.py names check ${n}, but scripts/inspect/checks/${n}.py is missing`);
// The helper modules in scripts/inspect that detect.py and the checks import (and what those import).
const helpers = importClosure(join(INSPECT, "detect.py"), [join(INSPECT, "checks")], INSPECT, checkFiles.map((f) => join(INSPECT, "checks", f)));
for (const f of ["detect.py", "cover.py", ...helpers]) ship(`tools/inspect/${f}`, rooted(`inspect/${f}`));
for (const f of checkFiles) ship(`tools/inspect/checks/${f}`, rooted(`inspect/checks/${f}`));

// The rule catalog for untell check --rules and --explain: the repository's checks/rules.py (one entry per rule id the
// checks report). A check module that the catalog does not cover gets an entry from its docstring.
const checkId = (n: string) => { for (const p of ["a11y_", "motion_", "align_"]) if (n.startsWith(p)) return `${p.slice(0, -1)}/${n.slice(p.length).replace(/_/g, "-")}`; return n.replace(/_/g, "-"); };
type CatalogRule = { id: string; family: string; severity: string; line: string; measures: string; limit: string; fix: string; module: string };
const rr = spawnSync("python3", [join(INSPECT, "checks/rules.py")], { encoding: "utf8" });
if (rr.status !== 0) throw new Error(`scripts/inspect/checks/rules.py failed: ${rr.stderr}`);
let catalog = JSON.parse(rr.stdout) as CatalogRule[];
for (const n of CHECK_NAMES) {
  const id = checkId(n);
  if (catalog.some((r) => r.module === `${n}.py` || r.id === id || r.id.startsWith(`${id}/`))) continue;
  const doc = readFileSync(join(INSPECT, "checks", `${n}.py`), "utf8").match(/^\s*"""([\s\S]*?)"""/)?.[1]?.trim() ?? id;
  catalog.push({ id, family: "Other", severity: "error", line: doc.split("\n")[0]!, measures: doc, limit: "", fix: "", module: `${n}.py` });
}
// The catalog's text names repository commands in some fixes (bun scripts/snap/cli.ts ...). In a project the command is
// untell's. The map is a table of repository command to untell command; a repository command that it does not know is listed.
{
  const before = JSON.stringify(catalog);
  const mapped = mapLabCommands(before);
  if (mapped.count) note(`scripts/inspect/checks/rules.py: ${mapped.count} repository command(s) in rule text mapped to untell commands`);
  catalog = JSON.parse(mapped.text) as CatalogRule[];
  const left = labCommandsIn(mapped.text);
  if (left.length) throw new Error(`the rule catalog names a repository command that untell does not map:\n${left.map((l) => `  ${l}`).join("\n")}\nAdd it to LAB_COMMANDS in packages/untell/scripts/anchors.ts.`);
}
put("tools/inspect/rules.json", JSON.stringify(catalog, null, 1) + "\n");
// The checks' per-system table of HyperFrames findings that a system's direction overrides (untell check reads
// it as tools/inspect/hf_overrides.json). Shipped as the repository writes it, when the repository has one.
for (const f of ["hf_overrides.json", "checks/hf_overrides.json"]) if (existsSync(join(INSPECT, f))) { put("tools/inspect/hf_overrides.json", readFileSync(join(INSPECT, f))); break; }
// The check modules that detect.py runs, in its order (untell check passes a subset with --only).
put("tools/inspect/checks.json", JSON.stringify([...CHECK_NAMES, "cover"]) + "\n");

// The capture samplers: the ink of every text and the geometry of every SVG shape (scripts/detect.ts), and every
// text and painted element (scripts/record.ts). They run in the page, so they are taken as source text into one
// module that the package's recorder imports. One copy of each sampler: the repository's.
{
  const det = lab("scripts/detect.ts"), rec = lab("scripts/record.ts");
  const parts = [
    ["sample", rec, "scripts/record.ts"], ["sampleElements", rec, "scripts/record.ts"],
    ["inkSample", det, "scripts/detect.ts"], ["shapeSample", det, "scripts/detect.ts"],
  ] as const;
  const capV = det.match(/captureVersion: (\d+)/)?.[1];
  if (!capV) throw new Error("scripts/detect.ts: no captureVersion. The package's recorder writes the version that the repository's capture writes.");
  writeFileSync(join(PKG, "src/capture-samplers.gen.ts"), [
    "// Generated by scripts/pack.ts from the repository's scripts/record.ts and scripts/detect.ts. Do not edit: pack again.",
    "// The recorder's and the detector's samplers. They run in the page after each seek: every text element and every",
    "// painted element (tracks.json, elements.json), the ink of every text (with each letter on some frames) and the",
    "// painted geometry of every SVG shape (capture.json).",
    "/* eslint-disable */",
    "// @ts-nocheck",
    `/** The capture version of the repository's detector (scripts/detect.ts). The checks read the fields of this version. */`,
    `export const CAPTURE_VERSION = ${capV};`,
    "",
    ...parts.flatMap(([name, text, file]) => [`export ${extractDecl(text, name, file)}`, ""]),
    "// untell snap's sampler (scripts/snap/capture.ts): each drawn node's painted box, and each text's letter ink.",
    `export ${extractDecl(lab("scripts/snap/capture.ts"), "sample", "scripts/snap/capture.ts").replace(/^const sample = /, "const snapSample = ")}`,
    "",
  ].join("\n"));
}

// untell listen: the repository's listen scripts. The setup hint names untell's command when the repository script reads it
// from UNTELL_LISTEN_SETUP; else the pack sets the hint (a fallback).
for (const f of readdirSync(join(LAB, "scripts/listen")).filter((f) => f.endsWith(".py")).sort()) {
  let text = rooted(`listen/${f}`);
  if (f === "listen.py") { const r = setupHint(text, "scripts/listen/listen.py"); note(r.fallback); text = r.text; }
  ship(`tools/listen/${f}`, text);
}
// The music map: it reads listen.json and writes music.json beside each track. untell writes the kit's
// music.gen.ts itself, under the media lock (src/media-store.ts), so the script's own table goes to the work tree.
ship("tools/music_map.py", rooted("music_map.py"));

// 6. Licence and source guards on everything the package ships.
{
  const { essentiaHits, scanTree, sourceHits } = await import("./guards");
  const roots = [REG, join(PKG, "docs")];
  const src = [...scanTree(roots, sourceHits), ...sourceHits(readFileSync(join(PKG, "README.md"), "utf8"), "README.md")];
  if (src.length) throw new Error(`a media source is named in shipped text (untell names no source):\n${src.map((h) => `  ${h.file}:${h.line}: ${h.text}`).join("\n")}`);
  const ess = scanTree(roots, essentiaHits);
  if (ess.length) throw new Error(`a shipped file imports essentia (AGPL; untell is MIT):\n${ess.map((h) => `  ${h.file}:${h.line}: ${h.text}`).join("\n")}`);
}
// No shipped script may reach a repository file outside its own folder: every root comes from UNTELL_ROOT.
for (const rel of shipped.filter((r) => r.endsWith(".py"))) {
  const bad = readFileSync(join(REG, rel), "utf8").split("\n").find((l) => !nativeRoot(l) && (/__file__\)\.resolve\(\)\.parents\[[2-9]\]/.test(l) || /HERE\.parents\[/.test(l)));
  if (bad) throw new Error(`registry/${rel}: a repository path is left: ${bad.trim()}. Make the line read UNTELL_ROOT.`);
}

// 7. The tells catalog, from the repository's lint rules (src/lint.ts imports them, so dist/cli.js has the same rules).
if (!RULES.length) throw new Error("scripts/lint/rules.ts has no rules; untell lint would find nothing");
writeFileSync(join(PKG, "docs", "TELLS.md"), tellsDoc());

// The counts that docs quote (untell --version --json reads them): from this repository's own tables, never typed by hand.
const blockCount = Object.keys((await import(join(LAB, "src/system/scene/blocks/index.ts"))).BLOCKS).length;
const version = (JSON.parse(readFileSync(join(PKG, "package.json"), "utf8")) as { version: string }).version;
put("stamp.json", JSON.stringify({ version, packedAt: new Date().toISOString(), kitFiles: kitCount, systems: ids.length, blocks: blockCount, fonts: fonts.size, lintRules: RULES.length,
  detectorRules: catalog.length, detectorChecks: CHECK_NAMES.length + 1, fallbacks }, null, 1) + "\n");

// 8. Every untell command that a shipped playbook names must exist in the CLI, with its subcommand and flags.
{
  const { namedCommands, unknownCommands } = await import("./guards");
  const { COMMAND_TABLE } = await import("../src/help");
  const dir = join(REG, "docs/playbooks");
  const bad = readdirSync(dir).flatMap((f) => unknownCommands(namedCommands(readFileSync(join(dir, f), "utf8"), `docs/playbooks/${f}`), COMMAND_TABLE));
  if (bad.length) throw new Error(`a playbook names a command that untell does not have:\n${bad.map((b) => `  ${b.file}:${b.line}: ${b.text} (${b.why})`).join("\n")}`);
}

// 9. The CLI, for Node 18 or later. esbuild and playwright-core stay external: they are dependencies.
rmSync(join(PKG, "dist"), { recursive: true, force: true });
const b = spawnSync("bun", ["build", join(PKG, "src/cli.ts"), "--target", "node", "--outfile", join(PKG, "dist/cli.js"),
  "--external", "esbuild", "--external", "playwright-core"], { stdio: "inherit" });
if (b.status !== 0) process.exit(1);
const out = join(PKG, "dist/cli.js");
const js = readFileSync(out, "utf8");
if (!js.startsWith("#!")) writeFileSync(out, "#!/usr/bin/env node\n" + js);
chmodSync(out, 0o755);
{
  const { essentiaHits, sourceHits } = await import("./guards");
  const text = readFileSync(out, "utf8");
  const hits = [...sourceHits(text, "dist/cli.js"), ...essentiaHits(text, "dist/cli.js")];
  if (hits.length) throw new Error(`dist/cli.js names a media source or loads essentia:\n${hits.map((h) => `  ${h.file}:${h.line}: ${h.text}`).join("\n")}`);
  // Node has no import.meta.dir: a repository module that uses it must not be in the CLI.
  if (/import\.meta\.(dir|path)\b/.test(text)) throw new Error("dist/cli.js uses import.meta.dir or import.meta.path, which Node does not have. A lab module with a root of its own was bundled: import a Node-safe module instead.");
  // The repository's own folder must not be in the CLI (a path of the machine that packed it).
  if (text.includes(LAB)) throw new Error(`dist/cli.js holds the path ${LAB}. Make the bundled code find its files at run time.`);
  // Bun's API does not exist in Node.
  const bun = text.split("\n").find((l) => /\bBun\.(spawn|write|file|which|build|serve|env|argv)\b/.test(l));
  if (bun) throw new Error(`dist/cli.js calls Bun's API, which Node does not have: ${bun.trim().slice(0, 160)}. A bundled lab module must use node: modules.`);
}
// 10. No path of this machine and no repository name in anything that ships (the README and LICENSE name the author on purpose).
{
  const { scanTree, machineHits } = await import("./guards");
  const hits = [...scanTree([REG, join(PKG, "docs"), join(PKG, "dist")], machineHits), ...(existsSync(join(PKG, "CHANGELOG.md")) ? machineHits(readFileSync(join(PKG, "CHANGELOG.md"), "utf8"), "CHANGELOG.md") : [])];
  if (hits.length) throw new Error(`a shipped file names this machine or the repository:\n${hits.slice(0, 20).map((h) => `  ${h.file}:${h.line}: ${h.text}`).join("\n")}`);
}
console.log(`packed: ${kitCount} kit files, ${ids.length} systems, ${fonts.size} font files, ${RULES.length} lint rules (docs/TELLS.md), ${catalog.length} detector rules, ${shipped.length} repository scripts; built dist/cli.js`);
console.log(fallbacks.length ? `fallback anchors (${fallbacks.length}): these repository files have no native form or marker yet:\n${fallbacks.map((f) => `  ${f}`).join("\n")}` : "fallback anchors: none");
