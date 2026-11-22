// Probe: the cost of one screenshot through Playwright and through a raw DevTools call, on a film's frame 0.
// Usage: bun scripts/perf/probe_shot.ts <films module> <film id>
import { chromium } from "playwright-core";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
const ROOT = resolve(import.meta.dir, "../..");
const [mod, id] = process.argv.slice(2);
const RUN = `probe-${process.pid}`;
writeFileSync(join(ROOT, "web", `${RUN}.tsx`), `import { mountPlayer } from "../scripts/perf/player";\nimport { FILMS } from "${resolve(mod!)}";\nmountPlayer(FILMS);\n`);
writeFileSync(join(ROOT, "web", `${RUN}.html`), readFileSync(join(ROOT, "web", "index.html"), "utf8").replace("./player.js", `./${RUN}.js`));
spawnSync("bun", ["build", join(ROOT, "web", `${RUN}.tsx`), "--outdir", "web", "--entry-naming", "[name].js", "--asset-naming", "fonts/[name].[ext]", "--format", "iife", "--target", "browser", "--minify", "--define", 'process.env.NODE_ENV="production"'], { cwd: ROOT });
process.on("exit", () => { for (const e of ["tsx", "js", "html"]) try { unlinkSync(join(ROOT, "web", `${RUN}.${e}`)); } catch {} });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--allow-file-access-from-files"] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto(`file://${join(ROOT, "web", `${RUN}.html`)}?comp=${id}`);
const meta = await page.evaluate(() => window.__meta!);
await page.setViewportSize({ width: meta.width, height: meta.height });
await page.waitForFunction(() => { const el = document.querySelector("[data-system]"); return !el || el.hasAttribute("data-ready"); }, null, { timeout: 15000, polling: 100 });
await page.evaluate(() => window.__seek(0));
const cdp = await page.context().newCDPSession(page);
const N = 40;
const time = async (name: string, fn: () => Promise<Buffer>) => { const a = performance.now(); let b: Buffer = Buffer.alloc(0); for (let i = 0; i < N; i++) b = await fn(); console.log(`${name}: ${((performance.now() - a) / N).toFixed(1)} ms, ${b.length} bytes`); return b; };
const pw = await time("playwright default", () => page.screenshot({ type: "jpeg", quality: 88 }));
const pwc = await time("playwright caret initial", () => page.screenshot({ type: "jpeg", quality: 88, caret: "initial" }));
const raw = await time("raw cdp clip", async () => Buffer.from((await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 88, clip: { x: 0, y: 0, width: meta.width, height: meta.height, scale: 1 }, captureBeyondViewport: false })).data, "base64"));
console.log(`caret-initial equals default: ${pw.equals(pwc)}; raw equals default: ${pw.equals(raw)}`);
await browser.close();
