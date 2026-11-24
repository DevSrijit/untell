// `untell build <scene.ts>`: makes a HyperFrames project play a scene module. Adapted from the repository's
// scripts/hf_project.ts. It bundles the scene with the project's kit into assets/vs-hyperframes.js, copies
// the system's fonts and grain, writes the page (index.html) and writes the scene's media clips into it.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { KIT_DIR, registryDir } from "./kit";
import { isSceneError, SceneError } from "./errors";
import { PAGE_MARKER, hfPage } from "./templates";
import { addCommand, detectPackageManager, GSAP_VERSION } from "./detect";

export type SceneMeta = { system: string; seconds: number; width: number; height: number };
type Tokens = { id: string; name: string; mode: string; allows: string[]; texture: { grain: number }; kinds: string[]; personality: string };
type FontEntry = { family: string; weights: number[]; pkg: string; italic?: number[] };

const GRAIN_TILES = 8;
/** The two GSAP files that a HyperFrames page loads. */
export const GSAP_FILES = ["gsap.min.js", "CustomEase.min.js"];

/** The folder of the project's gsap package that holds GSAP_FILES, or null when the project has no gsap package. */
export function gsapFiles(project: string): string | null {
  try {
    const dir = join(dirname(createRequire(join(project, "package.json")).resolve("gsap/package.json")), "dist");
    return GSAP_FILES.every((f) => existsSync(join(dir, f))) ? dir : null;
  } catch { return null; }
}
/** The grain strength of a system, as the kit's grainOf (scene/layout.ts): only a system that allows grain has it. */
export const grainOf = (t: Pick<Tokens, "allows" | "texture">) => (t.allows.includes("grain") ? t.texture.grain : 0);

/** The system docs folder: the project's own copy first, else the registry. */
export function systemsDir(project: string): string {
  const own = join(project, KIT_DIR.hyperframes, "docs", "systems");
  if (existsSync(own)) return own;
  const rem = join(project, KIT_DIR.remotion, "docs", "systems");
  if (existsSync(rem)) return rem;
  return join(registryDir(), "docs", "systems");
}

export function readTokens(project: string, id: string): Tokens {
  const p = join(systemsDir(project), id, "tokens.json");
  if (!existsSync(p)) throw new Error(`Unknown system "${id}". Run untell systems to list them.`);
  return JSON.parse(readFileSync(p, "utf8")) as Tokens;
}

/** Imports a scene module in Node: bundles it (and the kit it imports) for Node, then imports the bundle. */
/**
 * One import of a scene module per file state in a command. A scene that calls beats() at the top of its module (as
 * a first-use test did) printed beats()' warnings once for each import: three times in one check. The key holds the
 * file's time and size, so a scene that snap rewrites is read again.
 */
const IMPORTED = new Map<string, Promise<Partial<SceneMeta> & { scene?: unknown }>>();
export async function sceneExports(project: string, scene: string): Promise<Partial<SceneMeta> & { scene?: unknown }> {
  let key = "";
  try { const st = statSync(scene); key = `${resolve(project, scene)}:${st.mtimeMs}:${st.size}`; } catch { /* a missing file fails in the build below */ }
  const hit = key ? IMPORTED.get(key) : undefined;
  if (hit) return hit;
  const p = importScene(project, scene);
  if (key) { IMPORTED.set(key, p); p.catch(() => IMPORTED.delete(key)); }
  return p;
}

async function importScene(project: string, scene: string): Promise<Partial<SceneMeta> & { scene?: unknown }> {
  const { build } = await import("esbuild");
  const tmp = join(project, ".untell", `scene-${process.pid}-${Date.now()}.mjs`);
  mkdirSync(join(project, ".untell"), { recursive: true });
  try {
    try { await build({ entryPoints: [scene], bundle: true, platform: "node", format: "esm", outfile: tmp, external: ["three"], logLevel: "silent" }); }
    catch (e) { throw new Error(bundleError(project, e as { errors?: { text: string; location?: { file: string; line: number } | null }[] })); }
    return await import(pathToFileURL(tmp).href) as Partial<SceneMeta> & { scene?: unknown };
  } finally {
    rmSync(tmp, { force: true });
  }
}

/** Reads `system`, `seconds`, `width` and `height` from a scene module. */
export async function loadSceneMeta(project: string, scene: string): Promise<SceneMeta> {
  const m = await sceneExports(project, scene);
  const rel = relative(project, scene);
  if (typeof m.scene !== "function") throw new Error(`${rel} has no scene export (a function (ctx, B) => Node[])`);
  if (typeof m.system !== "string") throw new Error(`${rel} has no system export (a system id, such as "riso")`);
  if (typeof m.seconds !== "number") throw new Error(`${rel} has no seconds export (the film length in seconds)`);
  return { system: m.system, seconds: m.seconds, width: m.width ?? 1080, height: m.height ?? 1920 };
}

/**
 * three.js calls Math.random() for object ids and holds an animation loop that never runs here. HyperFrames'
 * lint reads the bundle as text and rejects both, so they become a seeded random function and a frame-loop
 * stub. Nothing in a scene depends on either. (From the repository's hf_project.ts.)
 */
export function makeDeterministic(src: string): string {
  const pre = "var __vsRandom=(function(){var s=0x2545F491;return function(){s=(s+0x6D2B79F5)|0;var t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}})();var __vsFrame=function(){return 0};\n";
  return pre + src.replaceAll("Math.random()", "__vsRandom()").replaceAll("requestAnimationFrame", "__vsFrame");
}

/** Writes the page: when there is none, or when untell wrote it. Another page is kept as a backup first. */
export function writePage(project: string, html: string): string {
  const page = join(project, "index.html");
  if (!existsSync(page)) { writeFileSync(page, html); return "wrote index.html"; }
  const current = readFileSync(page, "utf8");
  if (current.includes(PAGE_MARKER)) { writeFileSync(page, html); return "rewrote index.html (an untell page)"; }
  const backup = join(project, "index.html.before-untell");
  if (!existsSync(backup)) copyFileSync(page, backup);
  writeFileSync(page, html);
  return "replaced index.html with the film page; your page is in index.html.before-untell";
}

/** Where Google Chrome is on each platform. */
export const CHROME_PATHS = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"];

export async function launchChrome(args: string[] = []) {
  const { chromium } = await import("playwright-core");
  const exe = process.env.UNTELL_CHROME;
  try {
    return exe ? await chromium.launch({ executablePath: exe, headless: true, args }) : await chromium.launch({ channel: "chrome", headless: true, args });
  } catch (e) {
    const { MissingToolError } = await import("./errors");
    const why = (e as Error).message.split("\n")[0];
    // Chrome is there but did not start: a sandbox that stops a program from starting others (an agent's sandbox).
    const there = exe ? existsSync(exe) : CHROME_PATHS.some(existsSync);
    if (there) throw new MissingToolError(`Google Chrome is installed, but it did not start (${why}). A sandbox can stop it: an agent harness that runs commands in a sandbox (Codex in workspace-write mode, for example) does not let Chrome start. Run this command outside the sandbox, or give the agent full access for it.`);
    throw new MissingToolError(`untell needs Google Chrome to build and record a film, and it cannot start it (${why}). Install Google Chrome, or set UNTELL_CHROME to a Chrome program.`);
  }
}

/**
 * `page`: build a private page in this folder instead of the project's index.html (untell check uses it to
 * record a Remotion film). `mediaBase` is then the URL of the media folder, relative to the page.
 */
export type BuildOptions = { page?: string; mediaBase?: string; framework?: "remotion" | "hyperframes"; moves?: boolean };

/**
 * The bundle's entry: the kit's renderer, the scene, and what untell check and untell snap read on the page.
 *   __untellNodes, __untellCtx  the scene's last nodes and frame box (the detector's capture).
 *   __untellFrameKey(f)         every value that the renderer reads at frame f, from the nodes and their tracks (as
 *                               the repository's capture page keys a frame). Two frames with one key draw the same DOM, so
 *                               the recorder copies the frame. Footage while it plays, a 3D scene while it shows and
 *                               a scene that did not build give null (never equal). Grain steps a tile each frame.
 *   moves (untell snap)         with `moves`, a move list in the page's URL hash moves nodes before they draw, so a
 *                               preview is the real renderer's picture of the moved nodes (applyMoves of the kit).
 */
export function pageEntry(kit: string, entryKit: string, scene: string, moves: boolean): string {
  const k = (rel: string) => JSON.stringify(join(kit, rel));
  return [
    `import ${JSON.stringify(entryKit)};`,
    `import { scene } from ${JSON.stringify(scene)};`,
    `import { evaluate, withSystemMotion } from ${k("scene/time")};`,
    `import { GRAIN_TILES, grainOf } from ${k("scene/layout")};`,
    moves ? `import { applyMoves } from ${k("scene/align")};` : "",
    `const g = globalThis as any;`,
    moves ? `const moves = location.hash.length > 1 ? JSON.parse(decodeURIComponent(location.hash.slice(1))) : [];` : "",
    `let built: { nodes: any[]; system: any } | null = null;`,
    `g.VS.scene = (ctx: any, B: any) => {`,
    // The blocks' warnings while the scene builds (a title that shrank, a label left out): the detector reads them.
    `  const said: string[] = [], warn = console.warn;`,
    `  console.warn = (...m: any[]) => { said.push(m.map(String).join(" ")); warn(...m); };`,
    `  let nodes: any;`,
    `  try { nodes = scene(ctx, B); } finally { console.warn = warn; }`,
    `  g.__untellWarnings = said;`,
    moves ? `  if (moves.length) nodes = applyMoves(nodes, moves);` : "",
    `  g.__untellNodes = nodes;`,
    `  g.__untellCtx = { safe: ctx.safe, width: ctx.width, height: ctx.height, system: ctx.system?.id ?? null };`,
    `  built = { nodes: withSystemMotion(ctx.system, nodes, 30), system: ctx.system };`,
    `  return nodes;`,
    `};`,
    `const vals = (system: any, tracks: any, t: number, out: (number | string)[]) => {`,
    `  if (!tracks) return;`,
    `  const v: any = evaluate(system, tracks, t);`,
    `  for (const p of Object.keys(tracks).sort()) out.push(p + "=" + v[p]);`,
    `};`,
    // Chrome rasters a layer whose scale or rotation changes at a fixed scale and redraws it sharp only after it has
    // been still for some frames, so those pixels depend on the frames before. Near such a change no frame is keyed.
    `const RASTER = ["scale", "scaleX", "scaleY", "rotate", "tiltX", "tiltY"];`,
    `const moved = new Map<number, boolean>();`,
    `const rasterMoves = (f: number): boolean => {`,
    `  if (f <= 0 || !built) return false;`,
    `  if (moved.has(f)) return moved.get(f)!;`,
    `  let m = false;`,
    `  for (const n of built.nodes) for (const tr of [n.tracks, n.kind === "image" ? n.inner : undefined]) {`,
    `    if (m || !tr || !RASTER.some((k) => tr[k]?.length)) continue;`,
    `    const a: any = evaluate(built.system, tr, (f - 1) / 30), c: any = evaluate(built.system, tr, f / 30);`,
    `    if (RASTER.some((k) => a[k] !== c[k])) m = true;`,
    `  }`,
    `  moved.set(f, m);`,
    `  return m;`,
    `};`,
    `g.__untellFrameKey = (f: number): string | null => {`,
    `  if (!built) return null;`,
    `  for (let k = f - 8; k <= f + 2; k++) if (rasterMoves(k)) return null;`,
    // The values at the frame and half a frame to each side: a renderer that seeks a hair past a key (HyperFrames'
    // runtime) then still gets a key of its own at the first frame of a move.
    `  const fps = 30, t = f / fps, out: (number | string)[] = [];`,
    `  const at = [t - 0.5 / fps, t, t + 0.5 / fps];`,
    `  if (grainOf(built.system) > 0) out.push(f % GRAIN_TILES);`,
    `  for (const n of built.nodes) {`,
    `    if (n.kind === "audio") continue;`,
    `    if (n.kind === "image" && n.video) {`,
    `      const a = Math.round(n.video.at * fps), len = n.video.until !== undefined ? Math.round((n.video.until - n.video.at) * fps) : Infinity;`,
    `      if (f >= a && f < a + len) return null;`,
    `    }`,
    `    if (n.kind === "scene3d") { const s = n.spec; if (t >= s.at && (s.until === undefined || t < s.until)) return null; }`,
    `    out.push(n.id);`,
    `    for (const u of at) {`,
    `      vals(built.system, n.tracks, u, out);`,
    `      if (n.kind === "image") { vals(built.system, n.inner, u, out); for (const l of n.lights ?? []) vals(built.system, l.tracks, u, out); }`,
    `    }`,
    `  }`,
    `  return out.join(",");`,
    `};`,
    "",
  ].filter((l) => l !== "").join("\n");
}

/** The message for a bundle that does not build: a package that is not installed, else the first errors with their files. */
export function bundleError(project: string, e: { errors?: { text: string; location?: { file: string; line: number } | null }[]; message?: string }): string {
  const errs = e.errors ?? [];
  const missing = [...new Set(errs.map((x) => x.text.match(/^Could not resolve "((?:@[^/"]+\/)?[^/"]+)/)?.[1]).filter((x): x is string => !!x && !x.startsWith(".")))];
  if (missing.length) {
    const cmd = addCommand(detectPackageManager(project), missing).join(" ");
    return `the film cannot be bundled: the package${missing.length > 1 ? "s" : ""} ${missing.join(", ")} ${missing.length > 1 ? "are" : "is"} not installed in this project. Run: ${cmd}`;
  }
  const lines = errs.slice(0, 5).map((x) => `  ${x.location ? `${relative(project, x.location.file)}:${x.location.line}: ` : ""}${x.text}`);
  return `the film cannot be bundled. Fix the scene (or the kit file) at the place below, then run the command again:\n${lines.join("\n") || `  ${e.message ?? ""}`}`;
}

export async function buildHf(project: string, sceneArg: string, log: (s: string) => void = console.log, o: BuildOptions = {}): Promise<SceneMeta> {
  project = resolve(project);
  const scene = resolve(sceneArg);
  if (!existsSync(scene)) throw new Error(`no scene file ${sceneArg}`);
  const kit = join(project, KIT_DIR[o.framework ?? "hyperframes"]);
  const base = o.page ?? project;
  const entryKit = join(kit, "scene", "hf-entry.ts");
  if (!existsSync(entryKit)) throw new Error(`no kit in ${relative(process.cwd(), kit) || "."}: run untell init first`);
  const meta = await loadSceneMeta(project, scene);
  const tokens = readTokens(project, meta.system);
  const assets = join(base, "assets");
  mkdirSync(join(assets, "fonts"), { recursive: true });

  // Free media only: a zero credit limit makes every paid HeyGen call in media-use refuse instead of spending.
  if (!o.page) {
    mkdirSync(join(project, ".hyperframes"), { recursive: true });
    writeFileSync(join(project, ".hyperframes", "credit-limit.json"), JSON.stringify({ credits: 0 }) + "\n");
  }

  // The bundle: the kit's renderer and blocks (VS) and this scene (VS.scene).
  const { build } = await import("esbuild");
  const entry = join(project, ".untell", `hf-entry-${process.pid}.ts`);
  mkdirSync(join(project, ".untell"), { recursive: true });
  writeFileSync(entry, pageEntry(kit, entryKit, scene, !!o.moves));
  const out = join(assets, "vs-hyperframes.js");
  try {
    await build({ entryPoints: [entry], bundle: true, format: "iife", platform: "browser", minify: true, outfile: out, logLevel: "silent",
      define: { "process.env.NODE_ENV": '"production"' } });
  } catch (e) {
    throw new Error(bundleError(project, e as { errors?: { text: string; location?: { file: string; line: number } | null }[] }));
  } finally {
    rmSync(entry, { force: true });
  }
  writeFileSync(out, makeDeterministic(readFileSync(out, "utf8")));
  log(`bundled ${relative(project, scene)} with the kit: assets/vs-hyperframes.js`);

  // The system's fonts (the symbol fallback too), from the project's kit, else from the registry.
  const fontSrc = [join(kit, "fonts"), join(registryDir(), "fonts")].find((d) => existsSync(d))!;
  const fonts = JSON.parse(readFileSync(join(systemsDir(project), meta.system, "fonts.json"), "utf8")) as FontEntry[];
  let n = 0;
  for (const f of fonts) {
    const slug = f.family.toLowerCase().replace(/ /g, "-");
    // Each weight's file, and the weight's true italic where the family has one (fonts.json "italic").
    const files = [...f.weights.map((w) => `${slug}-latin-${w}-normal.woff2`), ...(f.italic ?? []).map((w) => `${slug}-latin-${w}-italic.woff2`)];
    for (const file of files) {
      const src = [join(fontSrc, file), join(registryDir(), "fonts", file)].find((p) => existsSync(p));
      if (!src) throw new Error(`missing font file ${file}`);
      copyFileSync(src, join(assets, "fonts", file));
      n++;
    }
  }
  log(`copied ${n} font file(s) for ${tokens.name}: assets/fonts`);
  // The grain tiles. The renderer loads them from assets/grain.
  if (grainOf(tokens) > 0) {
    mkdirSync(join(assets, "grain"), { recursive: true });
    for (let k = 0; k < GRAIN_TILES; k++) copyFileSync(join(kit, "grain", `grain-${k}.png`), join(assets, "grain", `grain-${k}.png`));
    log(`copied ${GRAIN_TILES} grain tiles: assets/grain`);
  }

  // GSAP, from the project's own gsap package, beside the page: a check and a render then load it with no network
  // request. A project without the package keeps the CDN, and the build says so with the command that adds it.
  const gsapDist = gsapFiles(project);
  let gsap: string | undefined;
  if (gsapDist) {
    mkdirSync(join(assets, "vendor"), { recursive: true });
    for (const f of GSAP_FILES) copyFileSync(join(gsapDist, f), join(assets, "vendor", f));
    gsap = "assets/vendor";
    log(`copied GSAP (${GSAP_FILES.join(", ")}): assets/vendor`);
  } else log(`warning: this project has no gsap package, so the page loads GSAP over the network. To load it from a file: ${addCommand(detectPackageManager(project), [`gsap@${GSAP_VERSION}`]).join(" ")}`);
  const html0 = hfPage({ ...meta, scene: relative(project, scene) }, o.mediaBase, gsap);
  if (o.page) { writeFileSync(join(o.page, "index.html"), html0); return meta; }
  log(writePage(project, html0));

  // Media in the static HTML. HyperFrames' renderer reads <video> and <audio> clips from index.html before
  // any script runs. The scene builds its clips by script, so load the page once, collect them and write
  // them into index.html. At runtime VS.mount finds each by id and moves it into place.
  const html = join(project, "index.html");
  let browser;
  try { browser = await launchChrome(); } catch (e) {
    log(`warning: no Chrome (${(e as Error).message.split("\n")[0]}). Media clips are not written into index.html; set UNTELL_CHROME to Chrome's path.`);
    return meta;
  }
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    // A scene that throws at build ends the build at once with its own error (no wait of 20 s for the timeline).
    let fire: (e: Error) => void = () => {};
    const threw = new Promise<never>((_, reject) => { fire = reject; });
    threw.catch(() => {});
    const note = (t: string) => { if (isSceneError(t)) fire(new SceneError(t.split("\n")[0]!)); };
    page.on("pageerror", (e) => { errors.push(String(e)); note(String(e)); });
    page.on("console", (m) => { if (m.type() === "error") note(m.text()); });
    // The blocks' warnings (a placeBehind with no clean layout, a title that does not fit): shown at build, not only
    // inside hyperframes check.
    const warned = new Set<string>();
    page.on("console", (m) => { if ((m.type() === "warning" || m.type() === "error") && !warned.has(m.text())) { warned.add(m.text()); log(`warning from the film: ${m.text()}`); } });
    await page.goto(pathToFileURL(html).href);
    try {
      await Promise.race([page.waitForFunction(() => !!(window as unknown as { __timelines?: Record<string, unknown> }).__timelines?.main, null, { timeout: 20000, polling: 100 }), threw]);
    } catch (e) {
      if (e instanceof SceneError) throw e;
      throw new Error(`the page did not register its timeline in 20 s${errors.length ? `: ${errors.join("; ")}` : ""}`);
    }
    const clips = await page.evaluate(() => Array.from(document.querySelectorAll("video.clip, audio.clip")).map((el) => {
      const attrs = Array.from(el.attributes).filter((a) => a.name !== "style").map((a) => (a.value === "" ? a.name : `${a.name}="${a.value.replace(/"/g, "&quot;")}"`));
      return `<${el.tagName.toLowerCase()} ${attrs.join(" ")}></${el.tagName.toLowerCase()}>`;
    }));
    const src = readFileSync(html, "utf8").replace(/\n?\s*<!-- vs-media -->[\s\S]*?<!-- \/vs-media -->/, "");
    const baked = clips.length ? `\n      <!-- vs-media -->\n      ${clips.join("\n      ")}\n      <!-- /vs-media -->` : "";
    writeFileSync(html, src.replace(/(<div id="root"[^>]*data-composition-id[^>]*>)/, `$1${baked}`));
    log(clips.length ? `wrote ${clips.length} media clip(s) into index.html` : "the page mounts; the scene has no media clips");
  } finally {
    await browser.close();
  }
  log(`${basename(project)}: ${tokens.name}, ${meta.seconds} s, ${meta.width} x ${meta.height}. Next: hyperframes check, then hyperframes render.`);
  return meta;
}
