// Probe: where the time of one recorder seek goes, step by step, inside the page.
// Usage: bun scripts/perf/probe_seek.ts <films module> <film id> [chrome flags ...]
import { chromium } from "playwright-core";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = resolve(import.meta.dir, "../..");
const [mod, id, ...flags] = process.argv.slice(2);
const RUN = `probe-${process.pid}`;
writeFileSync(join(ROOT, "web", `${RUN}.tsx`), `import { mountPlayer } from "../src/player";\nimport { FILMS } from "${resolve(mod!)}";\nmountPlayer(FILMS);\n`);
writeFileSync(join(ROOT, "web", `${RUN}.html`), readFileSync(join(ROOT, "web", "index.html"), "utf8").replace("./player.js", `./${RUN}.js`));
spawnSync("bun", ["build", join(ROOT, "web", `${RUN}.tsx`), "--outdir", "web", "--entry-naming", "[name].js", "--asset-naming", "fonts/[name].[ext]", "--format", "iife", "--target", "browser", "--minify", "--define", 'process.env.NODE_ENV="production"'], { cwd: ROOT });
process.on("exit", () => { for (const e of ["tsx", "js", "html"]) try { unlinkSync(join(ROOT, "web", `${RUN}.${e}`)); } catch {} });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--allow-file-access-from-files", ...flags] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto(`file://${join(ROOT, "web", `${RUN}.html`)}?comp=${id}`);
await page.waitForFunction(() => { const el = document.querySelector("[data-system]"); return !el || el.hasAttribute("data-ready"); }, null, { timeout: 15000, polling: 100 });
const n = await page.evaluate(() => window.__meta!.durationInFrames);
const res = await page.evaluate(async (n) => {
  const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
  const t: Record<string, number> = { seekTo: 0, raf1: 0, raf2: 0, fonts: 0, raf3: 0, raf4: 0, images: 0, video: 0, raf5: 0, raf6: 0 };
  // The Player handle is not on window; drive the same seek through __seek, timing its awaits by wrapping rAF.
  const orig = window.requestAnimationFrame.bind(window);
  let rafWait = 0;
  (window as any).requestAnimationFrame = (cb: FrameRequestCallback) => { const a = performance.now(); return orig((ts) => { rafWait += performance.now() - a; cb(ts); }); };
  const a0 = performance.now();
  for (let f = 0; f < n; f++) await window.__seek(f);
  const total = performance.now() - a0;
  (window as any).requestAnimationFrame = orig;
  // A bare double rAF, to see one vsync.
  const b0 = performance.now();
  for (let i = 0; i < 30; i++) { await raf(); await raf(); }
  const dbl = (performance.now() - b0) / 30;
  return { total, rafWait, perFrame: total / n, doubleRaf: dbl, t };
}, n);
console.log(JSON.stringify(res));
await browser.close();
