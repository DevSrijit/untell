// The kit: where it is in the package (the registry) and where it goes in a project.
// The registry holds what scripts/pack.ts copied from the repository:
//   registry/kit/**            the scene core, the blocks, the systems (src/system minus tests)
//   registry/docs/systems/**   README.md (how to choose), BLOCKS.md (the catalog), <id>/SYSTEM.md and tokens
//   registry/fonts/*.woff2     the Fontsource files of every system, for HyperFrames pages
//   registry/tools/cover.py    the cover check
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Framework } from "./detect";

/** The registry folder. The CLI is at dist/cli.js or src/cli.ts; the registry is beside both. */
export function registryDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const up of ["..", "../.."]) {
    const r = resolve(here, up, "registry");
    if (existsSync(join(r, "kit"))) return r;
  }
  throw new Error(`No registry next to ${here}. Run bun packages/untell/scripts/pack.ts first.`);
}

/** Where the kit goes in a project, relative to the project root. */
export const KIT_DIR: Record<Framework, string> = { remotion: "src/untell", hyperframes: "untell" };
/** Where the example scene goes. Its imports use "../untell/", so it sits beside the kit folder. */
export const FILMS_DIR: Record<Framework, string> = { remotion: "src/films", hyperframes: "films" };

/** Every file under `dir`, as paths relative to `dir` with "/" separators, sorted. */
export function walk(dir: string): string[] {
  const out: string[] = [];
  const go = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) go(p);
      else out.push(relative(dir, p).split(sep).join("/"));
    }
  };
  go(dir);
  return out.sort();
}

/** True for a file that only Remotion uses. A HyperFrames project does not get these. */
export const remotionOnly = (path: string) => /(^|\/)remotion\.tsx$/.test(path) || path === "film.tsx";
/** True for a test file. The registry has none; this guards a registry that someone packed by hand. */
export const isTest = (path: string) => /\.test\.tsx?$/.test(path);

/**
 * The kit files that a project of `framework` gets, relative to registry/kit.
 * Remotion gets every file (it can also build HyperFrames films). HyperFrames gets every file except the
 * Remotion renderers and the Remotion film helper, which import react and remotion.
 */
export function kitFilesFor(all: string[], framework: Framework): string[] {
  return all.filter((p) => !isTest(p) && (framework === "remotion" || !remotionOnly(p)));
}

/**
 * Rewrites the repository's paths in a copied document to the project's paths. `kit` is the kit folder
 * ("src/untell" or "untell"). The order matters: the relative import in the catalog's example goes first.
 */
/** Where a file of the public repository is on the web: the demos in examples/ are not installed in a project. */
export const REPO_BLOB = "https://github.com/devsrijit/untell/blob/main/";

export function rewriteDoc(text: string, kit: string): string {
  return text
    // A demo scene of the catalog lives in the repository only: its link goes to the repository on the web.
    .replace(/\[`(examples\/[^`]+)`\]\((?:\.\.\/)+examples\/[^)]+\)/g, `[\`$1\` in the untell repository](${REPO_BLOB}$1) (not installed in this project)`)
    .replaceAll("../../src/system/", "../untell/")
    .replaceAll("src/system/", `${kit}/`)
    .replace(/(^|[`(\s])systems\//gm, `$1${kit}/docs/systems/`);
}

/** The note at the top of every copied document. */
export const docNote = (kit: string) =>
  `> Copied by untell from the untell repository. Paths are this project's paths. That repository's own commands (\`bun scripts/...\`, ` +
  `\`python3 scripts/...\`) do not exist here: the untell skill (\`.agents/skills/untell/SKILL.md\` or \`.claude/skills/untell/SKILL.md\`) names the untell command for each. ` +
  `The "Build with it" files (\`src/films/...\`, \`examples/...\`) are not here: start from the example film beside \`${kit}\`.\n\n`;

/** The pack stamp of this untell: its version, when it was packed, and the counts of its kit. */
export type PackStamp = { version?: string; packedAt: string; kitFiles: number; systems: number; blocks?: number; fonts: number; lintRules: number; detectorRules?: number; detectorChecks: number; fallbacks: string[] };
export function packStamp(): PackStamp | null {
  try { return JSON.parse(readFileSync(join(registryDir(), "stamp.json"), "utf8")) as PackStamp; } catch { return null; }
}

/** The file in a project's kit folder that names the pack the kit came from (untell init writes it). */
export const KIT_STAMP = ".untell-pack.json";

/**
 * One line when the project's kit comes from another pack than this untell (or from an untell before 0.1.0 that wrote
 * no stamp), with the fix; null when they match or there is no kit.
 */
export function kitMismatch(project: string, fw: Framework): string | null {
  const kit = join(project, KIT_DIR[fw]);
  if (!existsSync(kit)) return null;
  const mine = packStamp();
  if (!mine) return null;
  let theirs: { packedAt?: string } | null = null;
  try { theirs = JSON.parse(readFileSync(join(kit, KIT_STAMP), "utf8")) as { packedAt?: string }; } catch { /* no stamp */ }
  if (theirs?.packedAt === mine.packedAt) return null;
  return `note: the kit in ${KIT_DIR[fw]}/ was copied by ${theirs?.packedAt ? `the untell packed ${theirs.packedAt}` : "an older untell"}, and this untell was packed ${mine.packedAt}. A check or render of a kit from another pack can fail or draw the film differently. To copy this untell's kit, run: untell init --force (it overwrites your edits in ${KIT_DIR[fw]}/; your films stay).`;
}
