// Prepares a HyperFrames project to use the design systems: bundles the runtime into
// <dir>/assets/vs-hyperframes.js, copies the system's font files (the symbol fallback too) into
// <dir>/assets/fonts and, for a system with grain, the grain tiles into <dir>/assets/grain.
// Usage: bun scripts/hf_project.ts <project dir> <system id> [scene file]
// With a scene file, its `scene` export is bundled in too and exposed as VS.scene, so a Remotion film
// and a HyperFrames film can share one scene definition.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { clone, cloneTree } from "./perf/cache";
import { spawnSync } from "node:child_process";
import { SYSTEMS } from "../src/system/systems";
import { GRAIN_TILES, grainOf } from "../src/system/scene/layout";

const [dir, id, scene] = process.argv.slice(2);
if (!dir || !id) throw new Error("usage: bun scripts/hf_project.ts <project dir> <system id>");
const s = SYSTEMS.find((x) => x.id === id);
if (!s) throw new Error(`unknown system ${id}`);
const ROOT = resolve(import.meta.dir, "..");
mkdirSync(join(dir, "assets", "fonts"), { recursive: true });
// Free media only: a zero credit limit makes every paid HeyGen call in media-use refuse instead of spending.
mkdirSync(join(dir, ".hyperframes"), { recursive: true });
writeFileSync(join(dir, ".hyperframes", "credit-limit.json"), JSON.stringify({ credits: 0 }) + "\n");

let entry = join(ROOT, "src/system/scene/hf-entry.ts");
if (scene) {
  entry = join(ROOT, "out", `hf-entry-${process.pid}.ts`);
  mkdirSync(join(ROOT, "out"), { recursive: true });
  await Bun.write(entry, `import "${join(ROOT, "src/system/scene/hf-entry.ts")}";\nimport { ${process.env.HF_SCENE_EXPORT ?? "scene"} as scene } from "${resolve(scene)}";\n(globalThis as any).VS.scene = scene;\n`);
}
const b = spawnSync("bun", ["build", entry, "--outfile", join(dir, "assets", "vs-hyperframes.js"),
  "--format", "iife", "--target", "browser", "--minify"], { stdio: "inherit" });
if (scene) await Bun.file(entry).delete();
if (b.status !== 0) process.exit(1);
// three.js (for 3D scenes) calls Math.random() for object ids and holds an animation loop it never runs
// here. HyperFrames' lint reads the bundle as text and rejects both, so swap them for deterministic stand-ins:
// a seeded random function and a frame-loop stub. Nothing in the scene depends on either.
{
  const out = join(dir, "assets", "vs-hyperframes.js");
  const src = readFileSync(out, "utf8");
  const pre = "var __vsRandom=(function(){var s=0x2545F491;return function(){s=(s+0x6D2B79F5)|0;var t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}})();var __vsFrame=function(){return 0};\n";
  writeFileSync(out, pre + src.replaceAll("Math.random()", "__vsRandom()").replaceAll("requestAnimationFrame", "__vsFrame"));
}

const fonts = JSON.parse(await Bun.file(join(ROOT, "systems", id, "fonts.json")).text()) as { family: string; weights: number[]; pkg: string; italic?: number[] }[];
for (const f of fonts) {
  const pkgDir = join(ROOT, "node_modules", f.pkg);
  if (!existsSync(pkgDir)) spawnSync("bun", ["add", "-d", f.pkg], { cwd: ROOT, stdio: "inherit" });
  const slug = f.family.toLowerCase().replace(/ /g, "-");
  for (const file of [...f.weights.map((w) => `${slug}-latin-${w}-normal.woff2`), ...(f.italic ?? []).map((w) => `${slug}-latin-${w}-italic.woff2`)]) {
    const src = join(pkgDir, "files", file);
    if (!existsSync(src)) throw new Error(`missing ${src}`);
    copyFileSync(src, join(dir, "assets", "fonts", file));
  }
}
// The grain tiles (made by scripts/make_grain.ts). The renderer loads them from assets/grain.
if (grainOf(s) > 0) {
  mkdirSync(join(dir, "assets", "grain"), { recursive: true });
  for (let k = 0; k < GRAIN_TILES; k++) copyFileSync(join(ROOT, "src/system/grain", `grain-${k}.png`), join(dir, "assets", "grain", `grain-${k}.png`));
}
// Prepared media (photos, cutouts, footage, sound, 3D models): only what this film's scene names. The page is
// loaded once without media and the scene's nodes are read (VS.scene is wrapped, as the detector does); every
// string in them that names a media file ("folder/file") or a media folder (a 3D model by name) is cloned in,
// with its modification time, so caches keyed by the media stamp stay valid. A file clones on APFS (no copy of the
// bytes); elsewhere it is a plain copy. Before this, every project held all of assets/media (83 folders).
const media = join(ROOT, "assets", "media");
const html0 = join(dir, "index.html");
if (existsSync(media) && existsSync(html0)) {
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ channel: "chrome", args: ["--allow-file-access-from-files"] });
  const page = await browser.newPage();
  await page.addInitScript(() => {
    let vs: Record<string, unknown> | undefined;
    Object.defineProperty(window, "VS", { configurable: true, get: () => vs, set: (v: Record<string, unknown>) => {
      vs = v;
      let scene: unknown;
      Object.defineProperty(v, "scene", { configurable: true, get: () => scene, set: (fn: (ctx: unknown, B: unknown) => unknown) => {
        scene = (ctx: unknown, B: unknown) => { const nodes = fn(ctx, B); (window as unknown as { __nodes: string }).__nodes = JSON.stringify(nodes); return nodes; };
      } });
    } });
  });
  await page.goto(`file://${resolve(html0)}`);
  const nodes = await page.waitForFunction(() => (window as unknown as { __nodes?: string }).__nodes, null, { timeout: 20000, polling: 50 }).then((h) => h.jsonValue() as Promise<string>).catch(() => null);
  await browser.close();
  const folders = new Set(readdirSync(media));
  const files = new Set<string>(), whole = new Set<string>();
  if (nodes === null) { for (const f of folders) whole.add(f); console.error(`${dir}: the scene's nodes did not show; copying all media`); }
  else for (const m of nodes.matchAll(/"([^"]+)"/g)) {
    const v = m[1]!, head = v.split("/")[0]!;
    if (!folders.has(head)) continue;
    // A bare folder name is a whole asset (a 3D model and its parts); a glTF file needs its folder too.
    if (v === head || /\.(gltf|glb)$/.test(v)) whole.add(head);
    else if (existsSync(join(media, v))) { files.add(v); files.add(`${head}/meta.json`); }
  }
  const put = (rel: string) => {
    const from = join(media, rel), to = join(dir, "assets", "media", rel);
    if (!existsSync(from)) return;
    mkdirSync(dirname(to), { recursive: true });
    if (statSync(from).isDirectory()) cloneTree(from, to, true); else clone(from, to, true);
  };
  for (const f of whole) put(f);
  for (const f of files) if (!whole.has(f.split("/")[0]!)) put(f);
}
// Media in the static HTML. HyperFrames' renderer reads <video> and <audio> clips from index.html before any
// script runs: it extracts video frames and mixes audio from that list. The scene builds its clips by
// script, so load the page once, collect them, and write them into index.html. At runtime VS.mount
// finds each by id and moves it into place instead of making a new one.
const html = join(dir, "index.html");
if (existsSync(html)) {
  const { chromium } = await import("playwright-core");
  // 3D models load with fetch, which Chrome refuses on file:// without this flag.
  const browser = await chromium.launch({ channel: "chrome", args: ["--allow-file-access-from-files"] });
  const page = await browser.newPage();
  await page.goto(`file://${resolve(html)}`);
  await page.waitForFunction(() => !!(window as unknown as { __timelines?: Record<string, unknown> }).__timelines?.main, null, { timeout: 20000, polling: 100 });
  const clips = await page.evaluate(() => Array.from(document.querySelectorAll("video.clip, audio.clip")).map((el) => {
    const attrs = Array.from(el.attributes).filter((a) => a.name !== "style").map((a) => (a.value === "" ? a.name : `${a.name}="${a.value.replace(/"/g, "&quot;")}"`));
    return `<${el.tagName.toLowerCase()} ${attrs.join(" ")}></${el.tagName.toLowerCase()}>`;
  }));
  await browser.close();
  const src = readFileSync(html, "utf8").replace(/\n?\s*<!-- vs-media -->[\s\S]*?<!-- \/vs-media -->/, "");
  const baked = clips.length ? `\n      <!-- vs-media -->\n      ${clips.join("\n      ")}\n      <!-- /vs-media -->` : "";
  writeFileSync(html, src.replace(/(<div id="root"[^>]*data-composition-id[^>]*>)/, `$1${baked}`));
  if (clips.length) console.log(`${dir}: ${clips.length} media clip(s) written into index.html`);
}
console.log(`${dir}: runtime and ${s.name} fonts${grainOf(s) > 0 ? " and grain" : ""} ready`);
