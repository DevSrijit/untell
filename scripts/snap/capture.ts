// The snap capture: the rest geometry of a film at chosen frames, read from the real renderer (Remotion's Player).
//
// It builds a page that mounts one films module, as the recorder does. The page wraps each scene, so that:
//   - the scene's nodes reach window.__nodes (the scene model: ids, kinds, roles, tracks),
//   - a list of moves (from the URL hash) applies to the nodes before they draw (applyMoves in align.ts). The
//     "after" image of a preview is this: the real renderer draws the moved nodes. Nothing is painted over.
// For each frame it returns every drawn node's painted box and opacity, and for each text its ink: the union of
// its letters' ink boxes, each letter's box, the baseline, and the cap and x heights of the font at its size.
// With a screenshot path it also writes the frame as a PNG.
import { chromium, type Browser, type Page } from "playwright-core";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import type { Move } from "../../src/system/scene/align";
import { slot } from "../perf/slots";

const ROOT = resolve(import.meta.dir, "..", "..");

export type CapEl = {
  id: string;
  kind: "text" | "rect" | "circle" | "path" | "image" | "other";
  /** The painted box, px: [left, top, right, bottom]. A path's box has no stroke; `stroke` is its width. */
  box: [number, number, number, number];
  opacity: number;
  stroke?: number;
  /** Text only. */
  ink?: [number, number, number, number];
  baseline?: number;
  cap?: number;
  xh?: number;
  fontPx?: number;
  letters?: [number, number, number, number, number][];
  text?: string;
  role?: string | null;
};
export type CapFrame = { frame: number; t: number; els: CapEl[] };
export type Capture = { film: string; module: string; width: number; height: number; fps: number; durationInFrames: number;
  safe: { left: number; right: number; top: number; bottom: number; lowBandTop: number; lowBandRight: number } | null;
  system: string | null; nodes: any[]; frames: CapFrame[] };

// Runs in the page after a seek: every drawn node (an element whose data-el is a node id), its painted box and
// opacity; for text, the ink of its letters from the font's glyph metrics (as the detector measures it).
const sample = (ids: string[]) => {
  const want = new Set(ids);
  const root = document.getElementById("root")!;
  const pen = document.createElement("canvas").getContext("2d")!;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const out: unknown[] = [];
  for (const el of Array.from(root.querySelectorAll<HTMLElement | SVGElement>("[data-el]"))) {
    const id = el.getAttribute("data-el")!;
    if (!want.has(id)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    let opacity = 1;
    for (let e: Element | null = el; e && e !== root; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity);
    if (opacity < 0.02) continue;
    const r = el.getBoundingClientRect();
    const tag = el.tagName.toLowerCase();
    const item: Record<string, unknown> = { id, box: [r.left, r.top, r.right, r.bottom].map(r1), opacity: Math.round(opacity * 1000) / 1000 };
    if (el instanceof SVGElement) {
      const ctm = (el as SVGGraphicsElement).getScreenCTM?.();
      const scale = ctm ? Math.hypot(ctm.a, ctm.b) : 1;
      // The stroke is on the drawn shape, which may sit inside the element that carries data-el (an <svg> round a
      // <path>): read it there. Read from the wrapper, a 2 px line came out as 1 px, and snap reported a half-px line
      // that the check (which reads the recorder's widths) never reported.
      const drawn = el.matches("path, line, circle, ellipse, polyline, polygon, rect") ? el : el.querySelector("path, line, circle, ellipse, polyline, polygon");
      const ds = drawn ? getComputedStyle(drawn) : cs;
      const sw = ds.stroke && ds.stroke !== "none" ? parseFloat(ds.strokeWidth) * scale : 0;
      item.kind = tag === "circle" ? "circle" : "path";
      if (sw > 0) item.stroke = r1(sw);
      out.push(item);
      continue;
    }
    const span = el.querySelector("span");
    const textNode = span ? Array.from(span.childNodes).find((n) => n.nodeType === 3) : null;
    if (!span || !textNode || !(textNode.textContent ?? "").trim()) {
      item.kind = el.querySelector("img, video, canvas") ? "image" : "rect";
      out.push(item);
      continue;
    }
    const ts = getComputedStyle(span);
    pen.font = `${ts.fontStyle} ${ts.fontWeight} ${ts.fontSize} ${ts.fontFamily}`;
    const up = ts.textTransform === "uppercase", low = ts.textTransform === "lowercase";
    const offH = (span as HTMLElement).offsetHeight;
    const scale = offH ? span.getBoundingClientRect().height / offH : 1;
    const str = textNode.textContent ?? "";
    let u = [Infinity, Infinity, -Infinity, -Infinity];
    const letters: number[][] = [];
    let baseline: number | null = null;
    for (let i = 0; i < str.length; i++) {
      let ch = str[i]!;
      if (!ch.trim()) continue;
      if (up) ch = ch.toUpperCase(); else if (low) ch = ch.toLowerCase();
      const range = document.createRange();
      range.setStart(textNode, i); range.setEnd(textNode, i + 1);
      const rc = range.getBoundingClientRect();
      const m = pen.measureText(ch);
      const k = rc.height / (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent || 1);
      const base = rc.top + m.fontBoundingBoxAscent * k;
      baseline ??= base;
      const b = [rc.left - m.actualBoundingBoxLeft * k, base - m.actualBoundingBoxAscent * k, rc.left + m.actualBoundingBoxRight * k, base + m.actualBoundingBoxDescent * k];
      u = [Math.min(u[0]!, b[0]!), Math.min(u[1]!, b[1]!), Math.max(u[2]!, b[2]!), Math.max(u[3]!, b[3]!)];
      letters.push([ch.codePointAt(0)!, ...b.map(r1)]);
    }
    if (!Number.isFinite(u[0]!)) continue;
    const sr = span.getBoundingClientRect();
    Object.assign(item, {
      kind: "text", box: [sr.left, sr.top, sr.right, sr.bottom].map(r1), ink: u.map(r1), letters, baseline: r1(baseline ?? sr.bottom),
      cap: r1(pen.measureText("H").actualBoundingBoxAscent * scale), xh: r1(pen.measureText("x").actualBoundingBoxAscent * scale),
      fontPx: r1(parseFloat(ts.fontSize) * scale), text: str.slice(0, 80), role: el.getAttribute("data-role"),
    });
    out.push(item);
  }
  return out;
};

const RUN = `snap-${process.pid}`;
const entry = join(ROOT, "web", `${RUN}.tsx`);
const tmp = [entry, join(ROOT, "web", `${RUN}.js`), join(ROOT, "web", `${RUN}.html`)];
let built = "";
process.on("exit", () => { for (const f of tmp) try { unlinkSync(f); } catch {} });

/** Builds the capture page for a films module (once per process). */
function buildPage(filmsModule: string) {
  if (built === filmsModule) return;
  // The fast capture page (scripts/perf/player.tsx): the same Player and DOM, a seek that waits for React's commit.
  writeFileSync(entry, `import { mountPlayer } from "../scripts/perf/player";
import { FILMS } from "${filmsModule}";
import { applyMoves } from "../src/system/scene/align";
const q = new URLSearchParams(location.search);
const id = q.get("comp") ?? "";
const moves = location.hash.length > 1 ? JSON.parse(decodeURIComponent(location.hash.slice(1))) : [];
const e = (FILMS as any)[id];
if (e?.props?.scene) {
  const scene = e.props.scene;
  e.props = { ...e.props, scene: (ctx: any, B: any) => {
    const nodes = applyMoves(scene(ctx, B), moves);
    (window as any).__nodes = JSON.parse(JSON.stringify(nodes));
    (window as any).__ctx = { safe: ctx.safe, width: ctx.width, height: ctx.height, system: ctx.system?.id ?? null };
    return nodes;
  } };
}
mountPlayer(FILMS);
`);
  writeFileSync(join(ROOT, "web", `${RUN}.html`), readFileSync(join(ROOT, "web", "index.html"), "utf8").replace("./player.js", `./${RUN}.js`));
  const b = spawnSync("bun", ["build", entry, "--outdir", "web", "--entry-naming", "[name].js", "--asset-naming", "fonts/[name].[ext]", "--format", "iife", "--target", "browser", "--minify",
    "--define", 'process.env.NODE_ENV="production"'], { cwd: ROOT, encoding: "utf8" });
  if (b.status !== 0) throw new Error(`snap: the capture page did not build\n${b.stdout}\n${b.stderr}`);
  built = filmsModule;
}

let browser: Browser | null = null;
export async function closeBrowser() { await browser?.close(); browser = null; }

/** Opens a film with moves applied, and waits for its fonts. */
async function open(filmsModule: string, film: string, moves: Move[]): Promise<{ page: Page; meta: { width: number; height: number; fps: number; durationInFrames: number } }> {
  buildPage(filmsModule);
  browser ??= await chromium.launch({ channel: "chrome", headless: true, args: ["--allow-file-access-from-files"] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1920 } });
  // A scene that throws while it builds ends the snap at once with its own message (and closes the browser); a wait
  // for frames that never draw kept the process alive at 0 % CPU.
  let thrown: string | null = null;
  const note = (t: string) => { if (!thrown && /^(Uncaught )?\w*Error\b/.test(t)) thrown = t.split("\n")[0]!; };
  page.on("console", (m) => { if (m.type() === "error") { note(m.text()); if (!thrown) console.error(`page: ${m.text()}`); } });
  page.on("pageerror", (e) => note(String(e)));
  const check = async () => {
    if (!thrown) return;
    await closeBrowser();
    console.error(`${film}: the scene threw while it built: ${thrown.replace(/^(Uncaught )?Error: /, "")}\n  fix: correct the scene at that error (its block and props are named in the message), then snap again.`);
    process.exit(1);
  };
  await page.goto(`file://${join(ROOT, "web", `${RUN}.html`)}?comp=${encodeURIComponent(film)}#${encodeURIComponent(JSON.stringify(moves))}`);
  await check();
  const meta = await page.evaluate(() => window.__meta);
  await check();
  if (!meta) throw new Error(`snap: no film "${film}" in ${filmsModule}`);
  await page.setViewportSize({ width: meta.width, height: meta.height });
  await page.waitForFunction(() => { const el = document.querySelector("[data-system]"); return !el || el.hasAttribute("data-ready"); }, null, { timeout: 15000, polling: 100 });
  await page.waitForTimeout(150);
  await check();
  await page.evaluate(() => window.__seek(0));
  return { page, meta };
}

/**
 * Captures a film's geometry at the given frames (every frame when `frames` is "all"), with `moves` applied.
 * With `shots`, it writes a PNG of each listed frame (frame -> path).
 */
export async function capture(filmsModule: string, film: string, frames: number[] | "all", opts: { moves?: Move[]; shots?: Record<number, string> } = {}): Promise<Capture> {
  const mod = resolve(filmsModule);
  // A machine slot while the browser works (scripts/perf/slots.ts), shared with every other untell tool.
  const release = await slot(`snap capture ${film}`);
  try {
    return await captureIn(mod, film, frames, opts);
  } finally { release(); }
}

async function captureIn(mod: string, film: string, frames: number[] | "all", opts: { moves?: Move[]; shots?: Record<number, string> }): Promise<Capture> {
  const { page, meta } = await open(mod, film, opts.moves ?? []);
  const list = frames === "all" ? Array.from({ length: meta.durationInFrames }, (_, i) => i) : [...new Set(frames)].sort((a, b) => a - b);
  const nodes: any[] = await page.evaluate(() => (window as any).__nodes ?? []);
  const ctx: any = await page.evaluate(() => (window as any).__ctx ?? null);
  const ids = nodes.map((n) => n.id);
  const system = await page.evaluate(() => document.querySelector("[data-system]")?.getAttribute("data-system") ?? null);
  const out: CapFrame[] = [];
  for (const f of list) {
    await page.evaluate((n) => window.__seek(n), Math.min(f, meta.durationInFrames - 1));
    const els = (await page.evaluate(sample, ids)) as CapEl[];
    out.push({ frame: f, t: f / meta.fps, els });
    const shot = opts.shots?.[f];
    if (shot) { mkdirSync(dirname(shot), { recursive: true }); await page.screenshot({ path: shot, clip: { x: 0, y: 0, width: meta.width, height: meta.height } }); }
  }
  await page.close();
  return { film, module: mod, ...meta, safe: ctx?.safe ?? null, system: system ?? ctx?.system ?? null, nodes, frames: out };
}
