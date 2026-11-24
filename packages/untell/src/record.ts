// The frame recorder of `untell check`, `untell snap` and `untell render`. It is the repository's recorder: the frame loop,
// the size guard and the HyperFrames page setup are the repository's scripts/perf/recorder.ts, the cache is the repository's
// scripts/perf/cachecore.ts, and a Remotion film plays in the repository's capture page (scripts/perf/player.tsx, shipped as
// registry/tools/player.tsx). One recorder: the pack copies these files and bundles them as they are.
//
// Two pages, one for each framework:
//   Remotion     the scene in Remotion's own Player (the same React tree as Remotion's renderer), from the project's
//                remotion, react and @remotion/player. The seek waits for React's commit of the frame, a film that
//                throws fails at once with its error, and the scene's frame keys let a repeated frame be a copy and a
//                drawn frame come from the frame cache.
//   HyperFrames  the project's index.html with HyperFrames' runtime, seeked as HyperFrames renders it. A page that
//                untell build wrote keys its frames from the scene's nodes, so a repeated frame is a copy.
// What it adds to the repository's loop: the detector's capture in the same pass (capture.json: the ink of every text and
// every SVG shape, the scene's nodes), and the page's warnings (a block that shrank a title, a wrap) kept with the
// recording, so a recording from the cache reports them too.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import type { Browser, Page } from "playwright-core";
import { launchChrome } from "./build";
import { cacheDir, cachePrune, cloneTree, linkTree, lookup, mediaStamp, pruneRecordings, sha, store, treeHash } from "./cache";
import { CAPTURE_VERSION, inkSample, sample, sampleElements, shapeSample } from "./capture-samplers.gen";
import { useNetCacheAt } from "../../../scripts/perf/netcore";
import { JPEG_Q, PNG_EVERY, installParts, openHf, recordRange, type RangeRun } from "../../../scripts/perf/recorder";
import { lock, slot } from "../../../scripts/perf/slots";
import { isSceneError, MissingToolError, SceneError } from "./errors";
import { registryDir } from "./kit";
import { addCommand, detectPackageManager } from "./detect";

type Meta = { fps: number; width: number; height: number; durationInFrames: number };
/** Change this when the recorder writes something different: it is part of every cache key. */
export const RECORDER = `untell-record-4/capture-${CAPTURE_VERSION}`;
/**
 * The line for a job that waits for a machine slot: how many are busy and with what, that this is normal with several
 * agents on one machine, and the setting. `m` is the slot pool's own line ("waiting for a machine slot (5 in use): ...").
 */
export function slotWait(m: string): string {
  const n = m.match(/\((\d+) in use\)/)?.[1];
  const who = m.split(": ").slice(1).join(": ");
  return `waiting for a machine slot: ${n ? `all ${n}` : "every slot is"} in use by other untell or lab jobs on this machine${who ? ` (${who})` : ""}. This is normal when several agents work at once: this job starts as soon as a slot is free, and it says nothing more until then. UNTELL_SLOTS sets the number of slots (untell doctor shows it).`;
}

/** The repository recorder's Chrome flags. --allow-file-access-from-files: a page from a file may read the files beside it
 *  (3D models). --run-all-compositor-stages-before-draw: no rough raster tile in a screenshot. */
export const CHROME_FLAGS = ["--allow-file-access-from-files", "--run-all-compositor-stages-before-draw"];
/** The HyperFrames route copies a frame only after its key held this many frames (GSAP's last tween value can differ
 *  from the kit's by a fraction of a px for a frame at the end of a move). */
export const SETTLE = 1;
/** The files of a recording. The cache keeps them all; capture.json goes to the capture folder. */
const PARTS = ["frames", "frames-png", "tracks.json", "elements.json", "warnings.json", "render.json", "audio.json", "video.mp4", "capture.json", "key.txt"];

/** The page a film plays in: the Remotion Player page that untell writes, or a HyperFrames page. */
export type FilmPage = { kind: "player"; html: string; bundle: string; kit: string } | { kind: "hf"; html: string; runtime: string | null };

export type RecordOptions = {
  /** The project: the cache and the locks are in its .untell folder. */
  project: string;
  log?: (s: string) => void;
  /** The folder for capture.json (the detector's capture). Without it, the recorder does not capture. */
  capture?: string;
  /** The media folder: its stamp (path, size, time of each file) is part of the key. */
  media?: string;
  /** false: record every frame again (no recording cache and no frame cache). */
  cache?: boolean;
  /** false: draw every frame, also one that the scene says is the same as the one before. */
  reuse?: boolean;
  /** true: also write video.mp4, a preview for the review sheet. */
  video?: boolean;
};
export type RecordResult = Meta & {
  system: string | null; video: boolean; from: "cache" | "recorded"; drawn: number; reused: number; fromCache: number; retried: number; key: string; seconds: number;
  /** The page's warnings and errors while it drew the film (blocks report a shrunk title or a wrap this way). */
  warnings: string[];
  /** Footage and sound, as the Player page reports them (Remotion). */
  footage: boolean | null; sound: boolean | null;
};

/** The cache key of a recording: everything that its files depend on. Pure, for the tests. */
export function recordingKey(parts: { page: string; assets: string; media: string; runtime: string; chrome: string; capture: boolean; reuse: boolean; samplers: string; stamp: string; video?: boolean }) {
  return sha(RECORDER, parts.samplers, parts.stamp, parts.chrome, CHROME_FLAGS.join(" "), String(PNG_EVERY), String(JPEG_Q),
    parts.capture ? "capture" : "frames", parts.reuse ? "reuse" : "every", parts.video ? "video" : "", parts.page, parts.assets, parts.media, parts.runtime);
}

/** The text of the samplers and the pack stamp: a new untell gives a new key. */
const samplersText = () => [sample, sampleElements, inkSample, shapeSample].map((f) => f.toString()).join("\n");
const packStamp = () => { try { return readFileSync(join(registryDir(), "stamp.json"), "utf8"); } catch { return ""; } };

/** The repository's capture page, shipped in the registry. */
export const playerSource = () => join(registryDir(), "tools", "player.tsx");

/**
 * Writes the Remotion Player page for a scene module into `dir` (index.html and page.js) and returns it. The bundle
 * holds the repository's capture page (player.tsx), the project's kit and the scene; react, react-dom, remotion and
 * @remotion/player come from the project. With `moves`, a move list in the URL hash moves nodes before they draw
 * (untell snap's preview). The scene's nodes and frame box reach the page as __untellNodes and __untellCtx.
 */
export async function playerPage(project: string, scene: string, kit: string, dir: string, o: { moves?: boolean; mediaBase: string; seconds: number; width: number; height: number }): Promise<FilmPage> {
  const req = createRequire(join(project, "package.json"));
  try { req.resolve("@remotion/player"); req.resolve("react-dom/client"); } catch {
    let v = "<your remotion version>";
    try { v = (JSON.parse(readFileSync(req.resolve("remotion/package.json"), "utf8")) as { version: string }).version; } catch { /* not installed */ }
    throw new MissingToolError(`untell records a Remotion film in Remotion's Player, and this project has no @remotion/player. Run: ${addCommand(detectPackageManager(project), [`@remotion/player@${v}`]).join(" ")}`);
  }
  mkdirSync(dir, { recursive: true });
  const k = (rel: string) => JSON.stringify(join(kit, rel).split("\\").join("/"));
  const entry = join(dir, "entry.tsx");
  writeFileSync(entry, [
    `import { mountPlayer } from ${JSON.stringify(playerSource().split("\\").join("/"))};`,
    `import * as film from ${JSON.stringify(scene.split("\\").join("/"))};`,
    `import { BLOCKS } from ${k("scene/blocks")};`,
    `import { Blocks, SystemFilm } from ${k("remotion")};`,
    o.moves ? `import { applyMoves } from ${k("scene/align")};` : "",
    `const g = globalThis as any;`,
    o.moves ? `const moves = location.hash.length > 1 ? JSON.parse(decodeURIComponent(location.hash.slice(1))) : [];` : "",
    `const builds = new Map<any, any>();`,
    // The kit's film helper (film.tsx) draws a scene this way: the system's film round the scene's blocks.
    `function SceneFilm({ system, scene }: { system: string; scene: any }) {`,
    `  if (!builds.has(scene)) builds.set(scene, (ctx: any) => scene(ctx, BLOCKS));`,
    `  return <SystemFilm system={system}><Blocks build={builds.get(scene)} /></SystemFilm>;`,
    `}`,
    `const own = (film as any).scene;`,
    `const scene = (ctx: any, B: any) => {`,
    `  const said: string[] = [], warn = console.warn;`,
    `  console.warn = (...m: any[]) => { said.push(m.map(String).join(" ")); warn(...m); };`,
    `  let nodes: any;`,
    `  try { nodes = own(ctx, B); } finally { console.warn = warn; }`,
    `  g.__untellWarnings = said;`,
    o.moves ? `  if (moves.length) nodes = applyMoves(nodes, moves);` : "",
    `  g.__untellNodes = JSON.parse(JSON.stringify(nodes));`,
    `  g.__untellCtx = { safe: ctx.safe, width: ctx.width, height: ctx.height, system: ctx.system?.id ?? null };`,
    `  return nodes;`,
    `};`,
    `mountPlayer({ film: { component: SceneFilm, props: { system: (film as any).system, scene }, width: ${o.width}, height: ${o.height}, fps: 30, durationInFrames: ${Math.round(o.seconds * 30)} } });`,
    "",
  ].filter((l) => l !== "").join("\n"));
  const { build } = await import("esbuild");
  const projectNamed = /^(react|react-dom|remotion|@remotion\/[\w-]+|three)(\/.*)?$/;
  try {
    await build({
      entryPoints: [entry], bundle: true, format: "iife", platform: "browser", minify: true, outfile: join(dir, "page.js"), logLevel: "silent",
      jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' },
      // The kit's font files (fonts.gen.ts imports them) go beside the page under their own names: no network request.
      loader: { ".woff2": "file" }, assetNames: "fonts/[name]",
      plugins: [{
        name: "untell-project",
        setup(b) {
          // The capture page imports the repository's kit by its repository path: here it is the project's kit.
          b.onResolve({ filter: /^\.\.\/\.\.\/src\/system\// }, async (a) => b.resolve(`./${a.path.replace(/^\.\.\/\.\.\/src\/system\//, "")}`, { resolveDir: kit, kind: a.kind }));
          // One React and one Remotion: the project's, for every file (the capture page lives in untell's folder).
          b.onResolve({ filter: projectNamed }, async (a) => (a.pluginData === "project" ? undefined : b.resolve(a.path, { resolveDir: project, kind: a.kind, pluginData: "project" })));
        },
      }],
    });
  } catch (e) {
    const { bundleError } = await import("./build");
    throw new Error(bundleError(project, e as { errors?: { text: string; location?: { file: string; line: number } | null }[] }));
  } finally { rmSync(entry, { force: true }); }
  writeFileSync(join(dir, "index.html"), `<!doctype html>\n<html>\n  <head>\n    <meta charset="utf-8" />\n    <style>html, body { margin: 0; padding: 0; background: #000; overflow: hidden; }</style>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script>window.__vsAssets = ${JSON.stringify(o.mediaBase)};</script>\n    <script src="./page.js"></script>\n  </body>\n</html>\n`);
  return { kind: "player", html: join(dir, "index.html"), bundle: join(dir, "page.js"), kit };
}

/** Opens a film page and sets up __meta, __seek and __frameKey. Returns the film's size and length. */
export async function openFilm(page: Page, fp: FilmPage, hash = ""): Promise<Meta> {
  // A scene that throws while it builds (a block that refuses its props) draws nothing: the first such error ends the
  // open at once with the scene's message, never a wait of 30 s for a page that does not come.
  let thrown: string | null = null;
  let fire: (e: Error) => void = () => {};
  const threw = new Promise<never>((_, reject) => { fire = reject; });
  threw.catch(() => {});
  const note = (t: string) => { if (!thrown && isSceneError(t)) { thrown = t.split("\n")[0]!; fire(new SceneError(thrown)); } };
  page.on("pageerror", (e) => note(String(e)));
  page.on("console", (m) => { if (m.type() === "error") note(m.text()); });
  const guard = <T>(p: Promise<T>): Promise<T> => Promise.race([p, threw]);
  try { return await guard(openFilmSteps(page, fp, hash)); }
  catch (e) { if (thrown) throw new SceneError(thrown); throw e; }
}

async function openFilmSteps(page: Page, fp: FilmPage, hash: string): Promise<Meta> {
  // Name what did not load: a picture, a video, a font. A wait that ends in a timeout says this, not "timeout".
  const notReady = async (what: string) => {
    const missing = await page.evaluate(() => [
      ...Array.from(document.images).filter((i) => !i.complete || !i.naturalWidth).map((i) => decodeURI(i.currentSrc || i.src)),
      ...Array.from(document.querySelectorAll("video")).filter((v) => v.readyState < 2).map((v) => decodeURI(v.currentSrc || v.src)),
    ].map((s) => s.replace(/^file:\/\//, ""))).catch(() => [] as string[]);
    return new Error(`the film ${what} in 30 s: a picture, video, model or font did not load, or the scene threw.${missing.length ? ` Not loaded: ${missing.slice(0, 4).join(", ")}.` : ""} Check that each file the scene names is in the media folder (untell media list), and that a prepared version it asks for exists: photo({ dim: true }) needs plate-dim, made by untell media prepare <name> --system <id>.`);
  };
  if (fp.kind === "hf") {
    try { await openHf(page, fp.html, fp.runtime, { keys: true, hash, timeout: 30000 }); }
    catch (e) { if (/Timeout/i.test(String(e))) throw await notReady("page did not register its timeline"); throw e; }
  } else {
    const { pathToFileURL } = await import("node:url");
    await page.goto(`${pathToFileURL(fp.html).href}?comp=film${hash}`);
  }
  const meta = await page.evaluate(() => (window as unknown as { __meta: Meta | null }).__meta);
  if (!meta) throw new Error(`the film page did not start: ${relative(process.cwd(), fp.html)}`);
  await page.setViewportSize({ width: meta.width, height: meta.height });
  // A system film draws nothing until its fonts load; it marks itself data-ready then. Wait for it, so frame 0 is
  // the real frame 0 and not an empty ground.
  try {
    await page.waitForFunction(() => {
      const el = document.querySelector("[data-system]");
      return !el || el.hasAttribute("data-ready") || !!(window as unknown as { __timelines?: Record<string, unknown> }).__timelines?.main;
    }, null, { timeout: 30000, polling: 100 });
  } catch { throw await notReady("did not get ready"); }
  await page.evaluate(`window.__sample = ${sample.toString()}; window.__sampleElements = ${sampleElements.toString()};`);
  return meta;
}

/** A new page with the network copy, for one film. Warnings and errors go to `warn`. */
/** True when process `pid` runs on this machine. */
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === "EPERM"; } };

/** Removes the `.<id>.part-<pid>` folders in `dir` whose process no longer runs. Returns how many it removed. */
export function removeStaleParts(dir: string, id: string): number {
  let n = 0;
  let names: string[] = [];
  try { names = readdirSync(dir); } catch { return 0; }
  for (const name of names) {
    const m = name.match(/^\.(.+)\.part-(\d+)$/);
    if (!m || m[1] !== id || Number(m[2]) === process.pid || alive(Number(m[2]))) continue;
    rmSync(join(dir, name), { recursive: true, force: true });
    n++;
  }
  return n;
}

/** True for a URL that needs no network: a file, inline data, or this machine. */
export const isLocalUrl = (url: string) => /^(file|data|blob|about):/.test(url) || /^https?:\/\/(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:\d+)?(\/|$)/.test(url);

export async function filmTab(browser: Browser, project: string, warn: (s: string) => void, useCache = true) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  if (useCache) await useNetCacheAt(page, join(cacheDir(project), "net"));
  // A film page needs no network: the kit's fonts and scripts are files beside it. A request to another host is a
  // page warning that names the URL. With UNTELL_OFFLINE=1 the request also fails, as on a machine with no network
  // (the tests prove a check that way). This route runs before the network copy above (Playwright runs the last
  // route first), and hands each request it lets through to it.
  const offline = process.env.UNTELL_OFFLINE === "1";
  await page.route(() => true, async (route) => {
    const url = route.request().url();
    if (isLocalUrl(url)) return route.fallback();
    warn(`network: the page asked for ${url.slice(0, 200)}${offline ? " (blocked: UNTELL_OFFLINE=1)" : ""}`);
    return offline ? route.abort("internetdisconnected") : route.fallback();
  });
  // A film that throws while React draws it: React reports the error on the console, and the Player shows its own
  // error screen, which no seek may record. The error goes to the page's error event, where the capture page's seek
  // (player.tsx) reads it and fails the frame with the film's error.
  await page.addInitScript(() => {
    const ce = console.error.bind(console);
    console.error = (...a: unknown[]) => {
      ce(...a);
      const e = a.find((x) => x instanceof Error) as Error | undefined;
      if (e) window.dispatchEvent(new ErrorEvent("error", { error: e, message: e.message }));
    };
  });
  page.on("pageerror", (e) => warn(`page error: ${String(e).split("\n")[0]}`));
  page.on("console", (m) => { if (m.type() === "warning" || m.type() === "error") warn(`page ${m.type()}: ${m.text()}`); });
  return page;
}

/** The preview video. On macOS the hardware encoder at q75 (as the repository recorder); else, or when it fails, libx264. */
function encode(frames: string, fps: number, out: string) {
  const enc = (codec: string[]) => spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-framerate", String(fps), "-i", join(frames, "f%04d.jpg"), ...codec, out]);
  let r = process.platform === "darwin" && process.env.UNTELL_ENCODE !== "x264" ? enc(["-c:v", "h264_videotoolbox", "-q:v", "75", "-pix_fmt", "yuv420p"]) : null;
  if (!r || r.status !== 0) r = enc(["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20"]);
  return !r.error && r.status === 0;
}

const versionOf = (project: string, pkg: string) => { try { return (JSON.parse(readFileSync(createRequire(join(project, "package.json")).resolve(`${pkg}/package.json`), "utf8")) as { version: string }).version; } catch { return "?"; } };

/**
 * Records a film page into `dir`. With `capture`, the same pass also writes <capture>/capture.json in the shape of the
 * lab's detector (scripts/detect.ts, captureVersion). It takes a machine slot and the film's lock first.
 */
export async function recordFilm(fp: FilmPage, dir: string, opts: RecordOptions): Promise<RecordResult> {
  const log = opts.log ?? console.log;
  const t0 = Date.now();
  const id = dir.split(/[\\/]/).pop()!;
  const useCache = opts.cache !== false && process.env.UNTELL_NO_CACHE !== "1";
  const reuse = opts.reuse !== false;
  const cache = cacheDir(opts.project);
  const recordings = dirname(dir);
  mkdirSync(recordings, { recursive: true });
  const say = (m: string) => log(`  ${m}`);
  const unlock = await lock(join(recordings, `.${id}.lock`), `untell ${id}`, say);
  const release = await slot(`untell ${id}`, (m) => say(slotWait(m)));
  const warnings: string[] = [];
  const warn = (s: string) => { if (!warnings.includes(s)) warnings.push(s); };
  let browser: Browser | null = null;
  const work = join(recordings, `.${id}.part-${process.pid}`);
  // A part folder of a run that ended without its cleanup (a power loss, a killed check): its process is gone, so it
  // is removed now. A part of a live process (another check of this film waits on the lock) stays.
  removeStaleParts(recordings, id);
  try {
    browser = await launchChrome(CHROME_FLAGS);
    const chrome = browser.version();
    const pageDir = dirname(fp.html);
    const media = opts.media ? mediaStamp(opts.media) : "";
    const key = recordingKey({
      page: readFileSync(fp.html, "utf8") + (fp.kind === "player" ? readFileSync(fp.bundle, "utf8") : ""),
      assets: fp.kind === "hf" ? treeHash([join(pageDir, "assets")], pageDir, (p) => !/[\\/]assets[\\/]media[\\/]/.test(p)) : "",
      media, runtime: fp.kind === "hf" && fp.runtime ? readFileSync(fp.runtime, "utf8") : "",
      chrome, capture: !!opts.capture, reuse, samplers: samplersText(), stamp: packStamp(),
    });
    rmSync(work, { recursive: true, force: true });
    const finish = (r: Omit<RecordResult, "seconds" | "warnings" | "footage" | "sound" | "key">): RecordResult => {
      // The preview video for a sheet: made on demand from the frames (it is not part of the cache key).
      if (opts.video && !existsSync(join(dir, "video.mp4"))) r.video = encode(join(dir, "frames"), r.fps, join(dir, "video.mp4"));
      const facts = existsSync(join(dir, "render.json")) ? JSON.parse(readFileSync(join(dir, "render.json"), "utf8")) as { footage?: boolean | null; sound?: boolean | null } : {};
      const w = existsSync(join(dir, "warnings.json")) ? JSON.parse(readFileSync(join(dir, "warnings.json"), "utf8")) as string[] : [];
      return { ...r, key, warnings: w, footage: facts.footage ?? null, sound: facts.sound ?? null, seconds: (Date.now() - t0) / 1000 };
    };
    const place = (p: string) => (p === "capture.json" ? (opts.capture ? join(opts.capture, p) : null) : join(dir, p));
    if (useCache) {
      const hit = lookup(cache, "rec", key);
      if (hit) {
        // Hard links to the cached files: no copy, no space.
        linkTree(hit, work);
        rmSync(join(work, ".done"), { force: true });
        // key.txt is written new on every install: its time is the recording's time (the other files are hard links
        // with the time of the first recording). snap and the detector read it.
        rmSync(join(work, "key.txt"), { force: true });
        writeFileSync(join(work, "key.txt"), key);
        const t = JSON.parse(readFileSync(join(work, "tracks.json"), "utf8")) as Meta & { system: string | null };
        installParts(work, dir, PARTS, place);
        return finish({ fps: t.fps, width: t.width, height: t.height, durationInFrames: t.durationInFrames, system: t.system, video: existsSync(join(dir, "video.mp4")),
          from: "cache", drawn: 0, reused: 0, fromCache: 0, retried: 0 });
      }
    }
    if (fp.kind === "hf" && !fp.runtime) log("recorder: no HyperFrames runtime found; seeking the GSAP timeline alone (video and audio clips do not play)");
    const page = await filmTab(browser, opts.project, warn, useCache);
    const meta = await openFilm(page, fp);
    const frames = join(work, "frames"), pngs = join(work, "frames-png");
    mkdirSync(frames, { recursive: true });
    mkdirSync(pngs, { recursive: true });
    const ink: unknown[] = [], shapes: unknown[] = [];
    // The frame cache (Remotion): a frame is keyed by what draws it (the scene's pixel key), the kit, the media, the
    // browser, the size and this recorder. After an edit only the frames the edit changed take a screenshot.
    let frameKey: RangeRun["frameKey"] = null;
    if (fp.kind === "player") {
      const kitHash = sha(treeHash([fp.kit], fp.kit, (p) => /\.(ts|tsx|json|png|woff2)$/.test(p)), readFileSync(playerSource()), versionOf(opts.project, "remotion"), versionOf(opts.project, "react"));
      const fdir = join(cache, "frames");
      mkdirSync(fdir, { recursive: true });
      frameKey = (pk, kind) => join(fdir, `${sha(pk, kitHash, packStamp(), media, RECORDER, chrome, CHROME_FLAGS.join(" "), String(meta.width), String(meta.height), String(JPEG_Q), kind)}.${kind === "png" ? "png" : "jpg"}`);
    }
    let told = Date.now();
    const run: RangeRun = {
      id, meta, frames, pngs, tracks: [], elements: [], st: { drawn: 0, reused: 0, fromCache: 0, retried: 0 }, writes: [],
      noReuse: !reuse, noCache: !useCache, layoutOnly: false, exact: () => true, frameKey, settle: fp.kind === "hf" ? SETTLE : 0, log,
      // The capture samplers keep state on the page between frames, so they run on every frame, copied or not.
      after: async (pg, f) => {
        if (opts.capture) {
          ink.push(await pg.evaluate(inkSample, f % 15 === 0));
          shapes.push(await pg.evaluate(shapeSample));
        }
        if (Date.now() - told > 5000) { log(`  recording ${id}: ${f + 1} of ${meta.durationInFrames} frames`); told = Date.now(); }
      },
    };
    await recordRange(page, 0, meta.durationInFrames, run);
    await Promise.all(run.writes.splice(0));
    const got = await page.evaluate(() => {
      const w = window as unknown as { __geoms?: unknown; __untellNodes?: unknown; __untellCtx?: unknown; __untellWarnings?: string[]; __footage?: () => boolean; __sound?: () => boolean; __audio?: () => unknown };
      return { geoms: w.__geoms ?? [], nodes: w.__untellNodes ? JSON.parse(JSON.stringify(w.__untellNodes)) : null, ctx: w.__untellCtx ?? null, warnings: w.__untellWarnings ?? null,
        system: document.querySelector("[data-system]")?.getAttribute("data-system") ?? null,
        footage: w.__footage ? w.__footage() : null, sound: w.__sound ? w.__sound() : null, audio: w.__audio ? w.__audio() : null };
    });
    if (opts.capture) {
      // The shape of the repository's capture (scripts/detect.ts).
      writeFileSync(join(work, "capture.json"), JSON.stringify({ captureVersion: CAPTURE_VERSION, renderer: fp.kind === "player" ? "remotion" : "hyperframes", id, ...meta,
        recKey: key, nodes: got.nodes, ctx: got.ctx, warnings: got.warnings, ink, shapes: { geoms: got.geoms, frames: shapes } }));
    }
    writeFileSync(join(work, "tracks.json"), JSON.stringify({ id, ...meta, system: got.system, frames: run.tracks }));
    writeFileSync(join(work, "elements.json"), JSON.stringify({ id, ...meta, system: got.system, frames: run.elements }));
    writeFileSync(join(work, "warnings.json"), JSON.stringify(warnings));
    // What a render from these frames must know (untell render): footage and sound, and the sound nodes in film time.
    writeFileSync(join(work, "render.json"), JSON.stringify({ footage: got.footage, sound: got.sound }));
    writeFileSync(join(work, "audio.json"), JSON.stringify(got.audio));
    writeFileSync(join(work, "key.txt"), key);
    if (useCache) { store(cache, "rec", key, work); cachePrune(opts.project); }
    installParts(work, dir, PARTS, place);
    // Recordings past UNTELL_RECORDINGS_DAYS lose their pictures (they come back from the cache or a new recording).
    pruneOld(recordings);
    const s = run.st;
    return finish({ ...meta, system: got.system, video: false, from: "recorded", drawn: s.drawn, reused: s.reused, fromCache: s.fromCache, retried: s.retried });
  } finally {
    rmSync(work, { recursive: true, force: true });
    await browser?.close();
    release();
    unlock();
  }
}

/** At most once an hour: the pictures of recordings older than UNTELL_RECORDINGS_DAYS go (their JSON stays). */
function pruneOld(recordings: string) {
  const stamp = join(recordings, ".pruned");
  try {
    if (existsSync(stamp) && Date.now() - statSync(stamp).mtimeMs < 3600000) return;
    writeFileSync(stamp, "");
    pruneRecordings(recordings);
  } catch { /* housekeeping only */ }
}

/** Copies a recording folder (for a render that encodes from it). */
export const copyRecording = (from: string, to: string) => cloneTree(from, to);
