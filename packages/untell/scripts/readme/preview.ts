#!/usr/bin/env bun
// Renders README.md through GitHub's own Markdown API (gh api /markdown, which sanitises as github.com does) and
// takes screenshots at desktop and phone width, in the light and the dark theme. The page style is a small copy of
// GitHub's README column (880 px of text in a 1012 px box); it is close, not exact.
//
// Usage: bun packages/untell/scripts/readme/preview.ts [README.md|packages/untell/README.md]
// Output: out/readme/screens/<name>-{desktop,phone}-{light,dark}.png (full page).
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { chromium } from "playwright-core";

const ROOT = resolve(import.meta.dir, "../../../..");
const file = resolve(ROOT, process.argv[2] ?? "README.md");
const name = file.includes("packages/untell") ? "npm" : "github";
const r = spawnSync("gh", ["api", "-X", "POST", "/markdown", "-f", "mode=gfm", "-f", "context=devsrijit/untell", "-F", `text=@${file}`], { encoding: "utf8", maxBuffer: 16 << 20 });
if (r.status !== 0) throw new Error(r.stderr);
// The npm page loads its pictures from the public repository, which does not exist yet: show the local files.
const body = r.stdout.replaceAll("https://raw.githubusercontent.com/devsrijit/untell/main/", `file://${ROOT}/`);

const css = `
:root{--fg:#1f2328;--muted:#59636e;--border:#d1d9e0;--bg:#ffffff;--code:#f6f8fa;--link:#0969da}
@media (prefers-color-scheme: dark){:root{--fg:#f0f6fc;--muted:#9198a1;--border:#3d444d;--bg:#0d1117;--code:#151b23;--link:#4493f8}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif}
.box{max-width:1012px;margin:24px auto;border:1px solid var(--border);border-radius:6px}
.box>.head{padding:8px 16px;border-bottom:1px solid var(--border);font-size:14px;font-weight:600}
article{padding:32px;max-width:880px;margin:0 auto;box-sizing:content-box}
h1,h2{border-bottom:1px solid var(--border);padding-bottom:.3em;margin:24px 0 16px;font-weight:600}
h1{font-size:2em} h2{font-size:1.5em}
p,ul,table,pre,.highlight,picture{margin:0 0 16px}
img{max-width:100%;box-sizing:content-box}
a{color:var(--link);text-decoration:none}
code{font:85% ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--code);padding:.2em .4em;border-radius:6px}
pre{font:85% ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--code);padding:16px;border-radius:6px;overflow:auto}
pre code{background:none;padding:0}
table{border-collapse:collapse;display:block;overflow:auto;width:max-content;max-width:100%}
td,th{border:1px solid var(--border);padding:6px 13px;font-size:14px}
th{font-weight:600}
@media (max-width:600px){.box{margin:0;border:0} article{padding:16px}}
`;
const out = join(ROOT, "out/readme/screens");
mkdirSync(out, { recursive: true });
const html = join(out, `${name}.html`);
writeFileSync(html, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><base href="file://${dirname(file)}/"><style>${css}</style><div class="box"><div class="head">${basename(file)}</div><article>${body}</article></div>`);

const browser = await chromium.launch({ channel: "chrome", headless: true });
for (const [view, width] of [["desktop", 1280], ["phone", 390]] as const) {
  for (const scheme of ["light", "dark"] as const) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme, deviceScaleFactor: view === "phone" ? 2 : 1 });
    const page = await ctx.newPage();
    await page.goto(`file://${html}`);
    await page.waitForLoadState("networkidle");
    const shot = join(out, `${name}-${view}-${scheme}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    const broken = await page.evaluate(() => [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.currentSrc || i.src));
    const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    console.log(`${shot}${broken.length ? `  BROKEN: ${broken.join(", ")}` : ""}${over ? "  HORIZONTAL SCROLL" : ""}`);
    await ctx.close();
  }
}
await browser.close();
