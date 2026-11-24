// `untell init`: copies the kit into a Remotion or HyperFrames project, adds the packages it needs,
// writes an example film and the agent skill, and adds untell's lines to .gitignore. It installs the framework packages
// that the kit needs and says their size; it does not install the media tools.
// It writes only new files, AGENTS.md (one marked section), .gitignore (missing lines only) and, for
// HyperFrames, the film page through `untell build` (the old page is kept as index.html.before-untell).
// It prints every action.
import { restoreTable } from "./media";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { DETECTOR_SIZE, hfEnv } from "./env";
import { formatBytes } from "./cache";
import { withProgress } from "./render";
import { addCommand, detectFramework, detectPackageManager, HYPERFRAMES_VERSION, packagesFor, TYPESCRIPT_VERSION, type Framework } from "./detect";
import { docNote, FILMS_DIR, KIT_DIR, KIT_STAMP, kitFilesFor, packStamp, registryDir, rewriteDoc, walk } from "./kit";
import { EXAMPLE, exampleRemotion, exampleScene, skill, withAgentsSection } from "./templates";
import { buildHf } from "./build";
import { detectAgents, HARNESS_NAME, SKILL_PATH, type Harness } from "./agents";
import { UsageError } from "./errors";

/** The framework versions that untell init --new writes: the versions this untell was tested with. */
export const NEW_VERSIONS = { remotion: "4.0.545", react: "19.3.1", typesReact: "19.3.0", typesWeb: "0.0.166", typescript: TYPESCRIPT_VERSION, hyperframes: HYPERFRAMES_VERSION };

/** What --new would write over or mix with: a project's own source, page, media or settings. Notes, a brief, git,
 *  agent files and untell's own package files may be in the folder. */
const NEW_BLOCKS = /^(src|films|assets|public|index\.html|tsconfig\.json|remotion\.config\.(ts|js|mjs)|hyperframes\.json|meta\.json|vite\.config\.\w+|next\.config\.\w+)$/;

/** The files of a minimal project for `framework`. Pure, for the tests. */
export function newProjectFiles(fw: Framework, name: string): Record<string, string> {
  if (fw === "hyperframes") return {
    "hyperframes.json": JSON.stringify({ $schema: "https://hyperframes.heygen.com/schema/hyperframes.json", registry: "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
      paths: { blocks: "compositions", components: "compositions/components", assets: "assets" }, media: { autoProxy: true } }, null, 2) + "\n",
    "meta.json": JSON.stringify({ id: name, name }, null, 2) + "\n",
  };
  return {
    "tsconfig.json": JSON.stringify({ compilerOptions: { target: "ES2018", module: "Preserve", moduleResolution: "Bundler", jsx: "react-jsx", strict: true, noEmit: true, lib: ["es2015"],
      esModuleInterop: true, skipLibCheck: true, forceConsistentCasingInFileNames: true, noUnusedLocals: true }, exclude: ["remotion.config.ts"] }, null, 2) + "\n",
    "remotion.config.ts": `// Remotion's settings for the CLI (remotion studio, remotion render). See https://remotion.dev/docs/config\nimport { Config } from "@remotion/cli/config";\n\nConfig.setVideoImageFormat("jpeg");\nConfig.setOverwriteOutput(true);\n`,
    "src/index.ts": `import { registerRoot } from "remotion";\nimport { RemotionRoot } from "./Root";\n\nregisterRoot(RemotionRoot);\n`,
    "src/Root.tsx": `// The compositions of this project. untell render needs no entry here; add a film here to see it in remotion studio.\nimport { Composition } from "remotion";\nimport { UntellExample } from "./films/UntellExample";\n\nexport const RemotionRoot: React.FC = () => {\n  return (\n    <>\n      <Composition {...UntellExample} />\n    </>\n  );\n};\n`,
  };
}

/** package.json for --new: the user's file (untell's own dependency stays) with the framework's packages and scripts. */
export function newPackageJson(before: Record<string, unknown> | null, fw: Framework, name: string): Record<string, unknown> {
  const v = NEW_VERSIONS;
  const pkg: Record<string, any> = { name, version: "1.0.0", private: true, ...(before ?? {}) };
  if (fw === "hyperframes") {
    pkg.type ??= "module";
    pkg.devDependencies = { ...(pkg.devDependencies ?? {}), hyperframes: v.hyperframes };
    // Each script runs the HyperFrames CLI through untell (untell hf), which turns its usage reports off as every other
    // run from untell does (env.ts). With untell installed in the project its bin is on the scripts' PATH; else npx runs it.
    const u = pkg.dependencies?.untell || pkg.devDependencies?.untell ? "untell" : "npx untell";
    pkg.scripts = { check: `${u} hf check`, render: `${u} hf render`, preview: `${u} hf preview`, ...(pkg.scripts ?? {}) };
  } else {
    pkg.dependencies = { ...(pkg.dependencies ?? {}), "@remotion/cli": v.remotion, "@remotion/player": v.remotion, remotion: v.remotion, react: v.react, "react-dom": v.react };
    // @types/web gives the DOM types under the scaffold's lib setting, as Remotion's own scaffold does.
    pkg.devDependencies = { ...(pkg.devDependencies ?? {}), "@types/react": v.typesReact, "@types/web": v.typesWeb, typescript: v.typescript };
    pkg.scripts = { dev: "remotion studio", lint: "tsc", ...(pkg.scripts ?? {}) };
  }
  return pkg;
}

/**
 * `untell init --new <framework>`: a minimal project in this folder, at the framework versions untell was tested with,
 * then npm install. The folder may hold notes, a brief, git, agent files and untell's own package files, but no project
 * files (NEW_BLOCKS). It overwrites nothing.
 */
export async function scaffold(projectArg: string, fw: Framework, o: { install?: boolean; log?: (s: string) => void } = {}) {
  const log = o.log ?? console.log;
  const project = resolve(projectArg);
  mkdirSync(project, { recursive: true });
  if (detectFramework(project)) throw new UsageError(`this folder is already a ${detectFramework(project) === "remotion" ? "Remotion" : "HyperFrames"} project. Run untell init without --new.`, "init");
  const other = readdirSync(project).filter((f) => NEW_BLOCKS.test(f));
  if (other.length) throw new UsageError(`--new makes a project in a folder that holds no project yet, and this folder has ${other.join(", ")}. Make a new folder, or run untell init in the project that is here.`, "init");
  const name = (basename(project).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "film");
  log(`untell init --new ${fw}: a minimal ${fw === "remotion" ? "Remotion" : "HyperFrames"} project at ${project}`);
  for (const [rel, text] of Object.entries(newProjectFiles(fw, name))) {
    const p = join(project, rel);
    if (existsSync(p)) continue;
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
    log(`  wrote ${rel}`);
  }
  const pj = join(project, "package.json");
  const before = existsSync(pj) ? JSON.parse(readFileSync(pj, "utf8")) as Record<string, unknown> : null;
  writeFileSync(pj, JSON.stringify(newPackageJson(before, fw, name), null, 2) + "\n");
  const v = NEW_VERSIONS;
  log(`  ${before ? "updated" : "wrote"} package.json: ${fw === "remotion" ? `remotion, @remotion/cli and @remotion/player ${v.remotion}, react ${v.react}, typescript ${v.typescript}` : `hyperframes ${v.hyperframes} (the HyperFrames CLI, in node_modules/.bin)`}`);
  const pm = detectPackageManager(project);
  const cmd = pm === "npm" ? ["npm", "install", "--no-audit", "--no-fund"] : [pm, "install"];
  if (o.install === false) { log(`  to install the packages, run: ${cmd.join(" ")}`); return; }
  log(`  running: ${cmd.join(" ")} (${fw === "remotion" ? "about 330 MB" : "about 190 MB"} in node_modules; it prints the true size after)`);
  const r = withProgress(project, "install", log, (stdio) => spawnSync(cmd[0]!, cmd.slice(1), { cwd: project, stdio, env: hfEnv() }));
  if (r.status !== 0) throw new Error(`${cmd.join(" ")} failed:\n${r.tail}\nRun it yourself, then run untell init.`);
  log(`  installed: ${formatBytes(folderBytes(join(project, "node_modules")))} in node_modules (the framework)`);
}

/**
 * Writes a minimal package.json in the folder when it has none, so a package manager installs here. With no
 * package.json, npm walks up to the first parent folder that has one and installs there. Returns true when it wrote one.
 */
export function ownPackageJson(project: string, log: (s: string) => void = () => {}): boolean {
  const pj = join(project, "package.json");
  if (existsSync(pj)) return false;
  const name = basename(project).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "film";
  writeFileSync(pj, JSON.stringify({ name, version: "1.0.0", private: true }, null, 2) + "\n");
  log(`  wrote package.json (this folder had none, so a package install would go to a parent folder)`);
  return true;
}

export type InitOptions = { framework?: Framework; agents?: Harness[]; force?: boolean; install?: boolean; build?: boolean; media?: boolean; log?: (s: string) => void };

/** The tsconfig.json that init writes in a Remotion project that has none: the kit compiles under it, and so do films. */
export const KIT_TSCONFIG = JSON.stringify({ compilerOptions: { target: "ES2022", module: "Preserve", moduleResolution: "Bundler", jsx: "react-jsx", strict: true,
  noEmit: true, lib: ["ES2022", "DOM", "DOM.Iterable"], esModuleInterop: true, skipLibCheck: true, forceConsistentCasingInFileNames: true, resolveJsonModule: true },
  exclude: ["remotion.config.ts", "node_modules", ".untell"] }, null, 2) + "\n";

const readPackageJsonSafe = (dir: string): Record<string, Record<string, string>> => { try { return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")); } catch { return {}; } };

/**
 * What a project's tsconfig.json lacks for the kit, as lines that say exactly what to change. Pure. The kit needs the
 * DOM types (a lib with "DOM", or @types/web) and JSX for React; it compiles under strict and noUncheckedIndexedAccess.
 */
export function tsconfigAdvice(text: string, pkg: Record<string, Record<string, string>>): string[] {
  let j: { compilerOptions?: Record<string, unknown> };
  try { j = JSON.parse(text.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1")); } catch { return ["untell cannot read it (it is not plain JSON); check that compilerOptions.lib has \"DOM\" and compilerOptions.jsx is \"react-jsx\"."]; }
  const o = j.compilerOptions ?? {};
  const out: string[] = [];
  const lib = Array.isArray(o.lib) ? (o.lib as string[]).map((x) => x.toLowerCase()) : null;
  const hasWebTypes = !!(pkg.devDependencies?.["@types/web"] ?? pkg.dependencies?.["@types/web"]);
  if (lib && !lib.includes("dom") && !hasWebTypes) out.push(`compilerOptions.lib is ${JSON.stringify(o.lib)}: add "DOM" and "DOM.Iterable" (the kit draws in a page), or add the @types/web package.`);
  if (o.jsx === undefined) out.push(`set compilerOptions.jsx to "react-jsx" (the kit's Remotion renderer is React).`);
  if (o.types && Array.isArray(o.types) && !(o.types as string[]).includes("three")) out.push(`compilerOptions.types lists ${JSON.stringify(o.types)}: add "three", or remove types so TypeScript finds @types/three.`);
  return out;
}

/** The lines init keeps in .gitignore: untell's own work files and the media tools' Python environment. */
export const IGNORED = [".untell/", ".venv-media/", ".venv-listen/"];

/** Adds each missing line to a .gitignore (or makes one). Returns the lines it added. */
export function withIgnores(before: string | null, lines: string[] = IGNORED): { text: string; added: string[] } {
  const have = new Set((before ?? "").split("\n").map((l) => l.trim()));
  const added = lines.filter((l) => !have.has(l) && !have.has(l.replace(/\/$/, "")));
  if (!added.length) return { text: before ?? "", added };
  const base = before && !before.endsWith("\n") ? before + "\n" : before ?? "";
  return { text: `${base}${before ? "\n" : ""}# untell\n${added.join("\n")}\n`, added };
}

/** Copies the kit and its docs into `project`. Returns the paths written, relative to the project. */
export function copyKit(project: string, fw: Framework, registry = registryDir()): string[] {
  const kit = KIT_DIR[fw];
  const written: string[] = [];
  const put = (rel: string, data: string | Buffer) => {
    const p = join(project, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, data);
    written.push(rel);
  };
  for (const rel of kitFilesFor(walk(join(registry, "kit")), fw)) {
    const src = join(registry, "kit", rel);
    put(`${kit}/${rel}`, rel.endsWith(".md") ? docNote(kit) + rewriteDoc(readFileSync(src, "utf8"), kit) : readFileSync(src));
  }
  for (const rel of walk(join(registry, "docs"))) {
    const src = join(registry, "docs", rel);
    put(`${kit}/docs/${rel}`, rel.endsWith(".md") ? docNote(kit) + rewriteDoc(readFileSync(src, "utf8"), kit) : readFileSync(src));
  }
  // The fonts load from these files, with no network request: in Remotion the kit's fonts.gen.ts imports them, and in
  // HyperFrames untell build copies the system's ones into assets/fonts.
  for (const rel of walk(join(registry, "fonts"))) put(`${kit}/fonts/${rel}`, readFileSync(join(registry, "fonts", rel)));
  return written;
}

/**
 * Writes the agent files: the skill where each harness reads it, and the AGENTS.md section (which both read).
 * The skill text is one text; each harness gets a copy at its own path.
 */
export function writeAgentFiles(project: string, fw: Framework, agents: Harness[], force: boolean, log: (s: string) => void) {
  for (const h of agents) {
    const rel = SKILL_PATH[h], p = join(project, rel);
    if (existsSync(p) && !force && readFileSync(p, "utf8") !== skill(fw)) { log(`  kept ${rel} (it is already here; --force writes it again)`); continue; }
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, skill(fw));
    log(`  wrote ${rel}: the agent skill for ${HARNESS_NAME[h]}`);
  }
  const skills = agents.map((h) => SKILL_PATH[h]);
  const file = join(project, "AGENTS.md");
  const before = existsSync(file) ? readFileSync(file, "utf8") : null;
  const after = withAgentsSection(before, fw, skills);
  if (after !== before) { writeFileSync(file, after); log(`  ${before === null ? "wrote" : "updated"} AGENTS.md: the untell section (lint after each edit, check with the sheet before done)`); }
  // A CLAUDE.md that is already here gets the same section with the same markers (Claude Code reads it, and some
  // tools make it as a copy of AGENTS.md). init never makes a CLAUDE.md of its own.
  const claude = join(project, "CLAUDE.md");
  if (existsSync(claude)) {
    const was = readFileSync(claude, "utf8"), now = withAgentsSection(was, fw, skills);
    if (now !== was) { writeFileSync(claude, now); log("  updated CLAUDE.md: the same untell section, between the same markers"); }
  }
}

export async function init(projectArg: string, opts: InitOptions = {}) {
  const log = opts.log ?? console.log;
  const project = resolve(projectArg);
  const found = detectFramework(project);
  const fw = opts.framework ?? (found === "both" ? null : found);
  if (!fw) throw new UsageError(found === "both"
    ? "This project has hyperframes.json and a remotion dependency. Run untell init --framework remotion or --framework hyperframes."
    : "No Remotion or HyperFrames project here: no remotion dependency in package.json and no hyperframes.json. To make a minimal project in this folder and init it in one step, run: npx untell init --new hyperframes (or --new remotion). To use a project you already have, run untell init in its folder, or give --cwd <folder>.", "init");
  const kit = KIT_DIR[fw], films = FILMS_DIR[fw];
  log(`untell init: ${fw === "remotion" ? "Remotion" : "HyperFrames"} project at ${project}`);

  // The packages first: a range of "remotion" without an install stops here, before any file is written.
  const pm = detectPackageManager(project);
  const pkgs = packagesFor(fw, project);

  const agents = opts.agents ?? detectAgents(project);
  log(`  agents: ${agents.map((h) => HARNESS_NAME[h]).join(" and ")}${opts.agents ? "" : " (found; --agent claude|codex|both chooses)"}`);

  // 1. The kit. With the kit already here, --agent alone adds the agent files and stops.
  if (existsSync(join(project, kit)) && !opts.force) {
    if (opts.agents) {
      log(`  kept ${kit}/ (it is already here)`);
      writeAgentFiles(project, fw, agents, false, log);
      return;
    }
    throw new Error(`${kit}/ is already here. To add the agent files only, run: untell init --agent claude|codex|both. To copy the kit again, run untell init --force (it overwrites your edits in ${kit}/).`);
  }
  const files = copyKit(project, fw);
  // The pack this kit came from: a later untell that finds another pack says so, with the fix.
  const stamp = packStamp();
  if (stamp) writeFileSync(join(project, kit, KIT_STAMP), JSON.stringify({ version: stamp.version, packedAt: stamp.packedAt }, null, 1) + "\n");
  log(`  copied the kit: ${files.length} files into ${kit}/ (scene core, the blocks, 20 systems, docs, fonts)`);
  // --force copied the kit's empty media table over the project's. The manifest still lists the media.
  if (restoreTable(project, fw)) log(`  wrote ${kit}/media.gen.ts again from untell-media.json`);
  // --force copied the kit's empty list of own systems. The project's systems folder still holds them.
  {
    const { syncOwnSystems } = await import("./own-system");
    const own = await syncOwnSystems(project).catch(() => []);
    if (own.length) log(`  wrote ${kit}/own.gen.ts and the docs of your systems again: ${own.join(", ")}`);
  }

  // 2. The example film.
  const writeNew = (rel: string, data: string, what: string) => {
    const p = join(project, rel);
    if (existsSync(p) && !opts.force) { log(`  kept ${rel} (it is already here)`); return; }
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, data);
    log(`  wrote ${rel}: ${what}`);
  };
  writeNew(`${films}/${EXAMPLE.scene}`, exampleScene(), "the example film (Riso, 4.8 s: a line, a chart and its answer)");
  if (fw === "remotion") writeNew(`${films}/${EXAMPLE.remotion}`, exampleRemotion(), "the example as a Remotion composition");

  // 3. The agent skill (for each harness) and the AGENTS.md section.
  writeAgentFiles(project, fw, agents, !!opts.force, log);

  // 3a. TypeScript (Remotion): the skill runs npx tsc --noEmit. A project with no tsconfig gets one the kit compiles
  // under; a tsconfig that lacks what the kit needs gets one line that says what to change.
  if (fw === "remotion") {
    const tsc = join(project, "tsconfig.json");
    if (!existsSync(tsc)) { writeFileSync(tsc, KIT_TSCONFIG); log("  wrote tsconfig.json: strict, with the DOM types the kit uses (npx tsc --noEmit checks your films and the kit)"); }
    else for (const l of tsconfigAdvice(readFileSync(tsc, "utf8"), readPackageJsonSafe(project))) log(`  tsconfig.json: ${l}`);
  }

  // 3c. A home for downloads and candidates that no check reads (git ignores .untell/).
  mkdirSync(join(project, ".untell", "media-src"), { recursive: true });

  // 3b. .gitignore: untell's work files and the media tools' environment stay out of git.
  const gi = join(project, ".gitignore");
  const giBefore = existsSync(gi) ? readFileSync(gi, "utf8") : null;
  const ig = withIgnores(giBefore);
  if (ig.added.length) { writeFileSync(gi, ig.text); log(`  ${giBefore === null ? "wrote" : "updated"} .gitignore: ${ig.added.join(", ")}`); }

  // 4. The packages, with the project's own package manager. A folder with no package.json (a HyperFrames project
  // with only hyperframes.json) gets one first: npm with no package.json here installs into the first parent folder
  // that has one (the home folder, on one machine), never here.
  if (opts.install !== false) ownPackageJson(project, log);
  const nm = join(project, "node_modules");
  const before = opts.install === false ? 0 : folderBytes(nm);
  let installed = false;
  const runs = [pkgs.deps.length ? addCommand(pm, pkgs.deps) : null, pkgs.devDeps.length ? addCommand(pm, pkgs.devDeps, true) : null].filter((c): c is string[] => !!c);
  for (const cmd of runs) {
    if (opts.install === false) { log(`  to add the packages, run: ${cmd.join(" ")}`); continue; }
    log(`  running: ${cmd.join(" ")}`);
    // npm's audit and funding notes are about the project's other packages, not untell's: they stay out of init's output.
    const r = withProgress(project, "install", log, (stdio) => spawnSync(cmd[0]!, [...cmd.slice(1), ...(pm === "npm" ? ["--no-audit", "--no-fund"] : [])], { cwd: project, stdio, env: hfEnv() }));
    if (r.status !== 0) throw new Error(`${cmd.join(" ")} failed:\n${r.tail}\nRun it yourself, then go on.`);
    installed = true;
  }
  // The true size of what the install added, measured on the disk (the packages and what they need).
  const added = installed ? folderBytes(nm) - before : 0;

  // 5. The HyperFrames build, then the next steps.
  if (fw === "hyperframes" && opts.build !== false) {
    log(`  building the example: untell build ${films}/${EXAMPLE.scene}`);
    await buildHf(project, join(project, films, EXAMPLE.scene), (s) => { if (!/Next: hyperframes check/.test(s)) log(`    ${s}`); });
  }
  log([
    "",
    "Next:",
    `  npx untell check ${films}/${EXAMPLE.scene}    records the example and runs every check on it (no render needed)`,
    `  npx untell render ${films}/${EXAMPLE.scene}   renders the final file, masters it and prints its size`,
    ...(fw === "remotion" ? [`  To see the example in remotion studio, add <Composition {...UntellExample} /> to your Root (import { UntellExample } from "./films/UntellExample"). untell render does not need it.`] : []),
  ].join("\n"));
  // 6. The media tools (Python, rembg, the cut-out model) are heavy, so init does not install them. The command that
  // needs a tool installs it and says what it fetches first: untell check sets up the detector's Python, untell
  // media setup the cut-out tools, untell listen setup the listen tools.
  log(installed ? `untell's packages added ${formatBytes(Math.max(0, added))}; node_modules now holds ${formatBytes(folderBytes(nm))} in all. The media tools are not installed yet: untell check sets up its Python packages the first time it needs them (${DETECTOR_SIZE}; its output says so).`
    : `untell check sets up its Python packages the first time it needs them (${DETECTOR_SIZE}; its output says so).`);
  log("For photos with cut-outs, run untell media setup (rembg and its model, about 300 MB to download). For music, run untell listen setup.");
  log(`\nAgents: ${agents.map((h) => SKILL_PATH[h]).join(" and ")}, and AGENTS.md.`);
  log("Optional: untell hooks on runs untell lint after each film edit and shows the findings to the agent.");
}


/** The bytes of the files under `dir` (links are not followed), or 0 when it does not exist. */
export function folderBytes(dir: string): number {
  let n = 0;
  const go = (d: string) => {
    let names: string[];
    try { names = readdirSync(d); } catch { return; }
    for (const name of names) {
      const p = join(d, name);
      try { const s = lstatSync(p); if (s.isDirectory()) go(p); else if (s.isFile()) n += s.size; } catch { /* gone while we read */ }
    }
  };
  go(dir);
  return n;
}
