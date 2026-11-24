// Project detection: the framework, the package manager and the exact Remotion version.
// These functions only read files. They have no side effects, so the unit tests call them directly.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type Framework = "remotion" | "hyperframes";
export type PackageManager = "bun" | "pnpm" | "yarn" | "npm";

type PackageJson = { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; packageManager?: string; scripts?: Record<string, string> };

export function readPackageJson(dir: string): PackageJson | null {
  const p = join(dir, "package.json");
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf8")) as PackageJson; } catch { return null; }
}

/**
 * The framework of the project in `dir`. A `hyperframes.json` file marks a HyperFrames project.
 * A `remotion` or `@remotion/cli` dependency marks a Remotion project. When both are present, the result
 * is "both", and the caller must ask for `--framework`.
 */
export function detectFramework(dir: string): Framework | "both" | null {
  const hf = existsSync(join(dir, "hyperframes.json"));
  const pkg = readPackageJson(dir);
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  const rem = "remotion" in deps || "@remotion/cli" in deps;
  if (hf && rem) return "both";
  if (hf) return "hyperframes";
  if (rem) return "remotion";
  return null;
}

const LOCKS: [string, PackageManager][] = [
  ["bun.lock", "bun"], ["bun.lockb", "bun"],
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["package-lock.json", "npm"], ["npm-shrinkwrap.json", "npm"],
];

/**
 * The package manager of the project in `dir`, in this order: the lock file in `dir`, the
 * `packageManager` field of package.json, the tool that started this process (npm_config_user_agent),
 * then npm. Only `dir` is read, not its parents: a lock file higher up can belong to another project.
 */
export function detectPackageManager(dir: string, env: Record<string, string | undefined> = process.env): PackageManager {
  for (const [file, pm] of LOCKS) if (existsSync(join(dir, file))) return pm;
  const field = readPackageJson(dir)?.packageManager;
  if (field) for (const pm of ["bun", "pnpm", "yarn", "npm"] as const) if (field.startsWith(`${pm}@`)) return pm;
  const agent = env.npm_config_user_agent ?? "";
  for (const pm of ["bun", "pnpm", "yarn"] as const) if (agent.startsWith(`${pm}/`)) return pm;
  return "npm";
}

/** The arguments that add exact versions of `pkgs` with `pm`. The first item is the program. */
export function addCommand(pm: PackageManager, pkgs: string[], dev = false): string[] {
  switch (pm) {
    case "bun": return ["bun", "add", "--exact", ...(dev ? ["--dev"] : []), ...pkgs];
    case "pnpm": return ["pnpm", "add", "--save-exact", ...(dev ? ["--save-dev"] : []), ...pkgs];
    case "yarn": return ["yarn", "add", "--exact", ...(dev ? ["--dev"] : []), ...pkgs];
    case "npm": return ["npm", "install", "--save-exact", ...(dev ? ["--save-dev"] : []), ...pkgs];
  }
}

const EXACT = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

/**
 * The exact Remotion version of the project. The installed package (node_modules/remotion) wins, because
 * package.json often holds a range ("4", "^4.0.0"). Without an install, an exact version in package.json
 * counts. A range without an install gives an error that tells the user to install first.
 */
export function remotionVersion(dir: string): { version: string; source: "installed" | "package.json" } {
  const installed = join(dir, "node_modules", "remotion", "package.json");
  if (existsSync(installed)) {
    const v = (JSON.parse(readFileSync(installed, "utf8")) as { version?: string }).version;
    if (v && EXACT.test(v)) return { version: v, source: "installed" };
  }
  const pkg = readPackageJson(dir);
  const spec = pkg?.dependencies?.remotion ?? pkg?.devDependencies?.remotion;
  if (spec && EXACT.test(spec)) return { version: spec, source: "package.json" };
  throw new Error(spec
    ? `remotion is "${spec}" in package.json and is not installed. Install your packages first, so untell can read the exact version.`
    : "remotion is not a dependency of this project.");
}

/** The packages that `init` adds, with exact versions. Three.js is pinned to the version the kit uses. */
export const THREE_VERSION = "0.182.0";
/** The HyperFrames CLI version that untell was tested with: init installs it when the project has no local CLI. */
export const HYPERFRAMES_VERSION = "0.9.70";
/** The TypeScript version that untell's skill step (npx tsc --noEmit) was tested with. */
export const TYPESCRIPT_VERSION = "5.9.3";
/** The GSAP version of the HyperFrames page. untell build copies its two files from the project's gsap package beside
 *  the page, so a check and a render load them with no network request. */
export const GSAP_VERSION = "3.15.0";

/**
 * The packages that `init` adds, with exact versions, so the skill's own steps run in any supported project:
 *   Remotion     three and the Player at the Remotion version (the fonts are files in the kit); the types the kit compiles
 *                with (@types/three, and @types/react and typescript when the project has none), so npx tsc --noEmit
 *                checks the kit instead of failing on a missing type package.
 *   HyperFrames  three, gsap (untell build copies it beside the page), and the HyperFrames CLI in node_modules when the project has none (hyperframes init writes
 *                npx scripts and installs nothing), at the version its scripts name.
 */
export function packagesFor(framework: Framework, dir: string): { deps: string[]; devDeps: string[] } {
  const pkg = readPackageJson(dir);
  const has = (n: string) => !!(pkg?.dependencies?.[n] ?? pkg?.devDependencies?.[n]);
  if (framework === "hyperframes") {
    const local = existsSync(join(dir, "node_modules", ".bin", "hyperframes")) || has("hyperframes");
    return { deps: [`three@${THREE_VERSION}`, ...(has("gsap") ? [] : [`gsap@${GSAP_VERSION}`])], devDeps: local ? [] : [`hyperframes@${hyperframesVersion(dir) ?? HYPERFRAMES_VERSION}`] };
  }
  const { version } = remotionVersion(dir);
  const react = (() => { try { return (JSON.parse(readFileSync(join(dir, "node_modules", "react", "package.json"), "utf8")) as { version: string }).version.split(".")[0]; } catch { return null; } })();
  // @remotion/player: untell check records a film in Remotion's own Player, at the project's Remotion version.
  return {
    deps: [`three@${THREE_VERSION}`, `@remotion/player@${version}`],
    devDeps: [`@types/three@${THREE_VERSION}`, ...(has("@types/react") || !react ? [] : [`@types/react@${react}`]), ...(has("typescript") ? [] : [`typescript@${TYPESCRIPT_VERSION}`]),
      // untell render runs Remotion's own CLI: a project that renders some other way may not have it.
      ...(hasRemotionCli(dir) ? [] : [`@remotion/cli@${version}`])],
  };
}

/** True when the project has Remotion's CLI (`untell render` runs `remotion render`). */
export function hasRemotionCli(dir: string): boolean {
  const pkg = readPackageJson(dir);
  return !!(pkg?.dependencies?.["@remotion/cli"] ?? pkg?.devDependencies?.["@remotion/cli"]) || existsSync(join(dir, "node_modules", "@remotion", "cli", "package.json"));
}

/** The one command that adds Remotion's CLI at the project's Remotion version, in the project's package manager. */
export function remotionCliFix(dir: string): string {
  return addCommand(detectPackageManager(dir), [`@remotion/cli@${remotionVersion(dir).version}`], true).join(" ");
}

/**
 * The hyperframes CLI version that the project's own scripts name ("npx --yes hyperframes@0.9.70 check"),
 * or null.
 */
export function hyperframesVersion(dir: string): string | null {
  const scripts = readPackageJson(dir)?.scripts ?? {};
  for (const s of Object.values(scripts)) {
    const m = s.match(/hyperframes@(\d+\.\d+\.\d+)/);
    if (m) return m[1]!;
  }
  return null;
}
