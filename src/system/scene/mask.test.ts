// A reveal mask never cuts a glyph at rest. A masked line's clip box is sized to the font's ink (layout.maskPad):
// an accent, a quote mark, a descender, an "f" or a "j", and the last glyph of a line with negative tracking.
//
// Two tests:
// 1. Geometry, with no browser: for every system and role, the pads reach past the ink extremes that the ink table
//    holds (ink.gen.ts, measured in Chrome by scripts/export_ink.ts), with room.
// 2. Pixels, in Chrome: every masked text node that the text blocks make (title, lines, quote, lowerThird,
//    kineticWords, counter) for a text full of overhanging glyphs, in every system's faces, drawn at rest with the
//    renderers' own styles (layout.textStyle and layout.maskBox). The page is drawn twice, with the masks clipping and
//    with them open; the two pictures must be the same. A control with no pad must differ, so the test can fail.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Browser } from "playwright-core";
import { SYSTEMS, type System, type TypeRole } from "../systems";
import { BLOCKS } from "./blocks";
import { lines } from "./context";
import { makeCtx } from "./context";
import { inkMetrics, loadedWeights, maskBox, maskPad, textStyle } from "./layout";
import type { Ctx, Node, TextNode } from "./types";

const ROLES: TypeRole[] = ["display", "headline", "body", "label", "caption"];
/** Glyphs that reach past their advance or their line box, in one line: accents, quotes, descenders, f and j. */
const PROBE = "Éfj “jiffy” Åquay, gf.";

describe("mask pads cover the ink (geometry)", () => {
  test.each(SYSTEMS.map((s) => [s.id, s] as const))("%s", (_id, s) => {
    for (const role of ROLES) {
      const t = s.type[role], short = 1080, size = t.size * short;
      for (const weight of loadedWeights(s, role)) {
        const m = inkMetrics(s, role, weight);
        const pad = maskPad(s, role, short, { weight, text: PROBE });
        const A = Math.round(m.ascent * size), D = Math.round(m.descent * size);
        const baseline = Math.floor((t.leading * size - (A + D)) / 2) + A;
        // Each side: the pad reaches past the ink by at least 2 px.
        expect(pad.top).toBeGreaterThanOrEqual(m.accentTop * size - baseline + 2);
        expect(pad.bottom).toBeGreaterThanOrEqual(baseline + m.inkBottom * size - t.leading * size + 2);
        expect(pad.left).toBeGreaterThanOrEqual(m.overL * size + 2);
        expect(pad.right).toBeGreaterThanOrEqual((m.overR + Math.max(0, -t.tracking)) * size + 2);
      }
    }
  });
});

// ---------------------------------------------------------------- pixels

/** The masked text nodes of the text blocks, for a text full of overhanging glyphs, at rest. */
function maskedNodes(s: System): TextNode[] {
  const W = 1080, H = 1920;
  const ctx: Ctx = makeCtx(s, W, H, (t, r) => t.length * s.type[r].size * W * 0.55);
  const x = ctx.safe.left, w = ctx.safe.right - ctx.safe.left, y = ctx.safe.top;
  const quiet = <T,>(f: () => T): T => { const c = console.warn; console.warn = () => {}; try { return f(); } catch { return [] as T; } finally { console.warn = c; } };
  const out: Node[] = [];
  for (const role of ROLES) out.push(...lines(ctx, { id: `l-${role}`, x, y, lines: [PROBE], role, at: -2 }));
  for (const role of ["display", "headline", "body"] as const) out.push(...quiet(() => BLOCKS.title({ id: `t-${role}`, x, y, w, text: PROBE, role, maxLines: 3, at: -2 }, ctx)));
  out.push(...quiet(() => BLOCKS.quote({ id: "q", x, y, w, h: 900, text: PROBE, name: "Jöf Fjällqvist", size: "headline", at: -2 }, ctx)));
  out.push(...quiet(() => BLOCKS.lowerThird({ id: "lt", x, y, w, h: 300, name: "Jöf Fjällqvist", role: "Quay fitter, Åfjord", at: -2 }, ctx)));
  out.push(...quiet(() => BLOCKS.kineticWords({ id: "kw", x, y, w, h: 900, phrases: [{ text: "Fjord jiffy quay", at: -2 }] }, ctx)));
  out.push(...quiet(() => BLOCKS.counter({ id: "c", x, y, w, h: 400, value: 1047, at: -2 }, ctx)));
  const seen = new Set<string>();
  return out.filter((n): n is TextNode => n.kind === "text" && !!n.mask).filter((n) => {
    const k = [n.role, n.weight, n.text, n.keepCase, n.width, n.align].join("|");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** The latin font file of a family and weight (the file the renderers load), cached on disk after the first fetch. */
async function fontData(family: string, weight: number): Promise<string> {
  const mod = await import(`@remotion/google-fonts/${family.replace(/ /g, "")}`);
  const files = mod.getInfo().fonts.normal[String(weight)];
  const url: string = files.latin ?? Object.values(files)[0];
  const dir = join(resolve(import.meta.dir, "../../.."), ".untell", "cache", "fonts-test");
  mkdirSync(dir, { recursive: true });
  const f = join(dir, createHash("sha256").update(url).digest("hex").slice(0, 32));
  if (!existsSync(f)) writeFileSync(f, Buffer.from(await (await fetch(url)).arrayBuffer()));
  return readFileSync(f).toString("base64");
}

let browser: Browser | null = null;
beforeAll(async () => {
  try { browser = await chromium.launch({ channel: "chrome", headless: true }); } catch { browser = null; }
});
afterAll(async () => { await browser?.close(); });

/** The page for one system: each node in a cell, drawn as both renderers draw a masked line at rest. */
function pageHtml(s: System, nodes: TextNode[], faces: { family: string; weight: number; data: string }[], zeroPad: boolean) {
  const short = 1080;
  const families = { display: `"${s.fonts.display}"`, text: `"${s.fonts.text}"`, mono: `"${s.fonts.mono ?? s.fonts.text}"` };
  const css = (o: Record<string, string | number>) => Object.entries(o).map(([k, v]) => `${k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())}:${v}`).join(";");
  let y = 40;
  const cells = nodes.map((n) => {
    const size = s.type[n.role].size * short;
    const pad = zeroPad ? { top: 0, right: 0, bottom: 0, left: 0 } : maskPad(s, n.role, short, { weight: n.weight, text: n.text });
    const outer = { position: "absolute", left: "80px", top: `${y + Math.round(size)}px`, ...(n.width ? { width: `${n.width}px`, textAlign: n.align ?? "left" } : {}) };
    const html = `<div style="${css(outer)}"><div class="mask" style="${css(maskBox(pad))}"><span style="${css({ ...textStyle(s, families as never, n.role, short, n.keepCase, n.weight), display: "block" })}">${n.text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</span></div></div>`;
    y += Math.round(size * (s.type[n.role].leading + 2.2));
    return html;
  });
  const fontCss = faces.map((f) => `@font-face{font-family:"${f.family}";font-weight:${f.weight};src:url(data:font/woff2;base64,${f.data})}`).join("");
  return { html: `<!doctype html><html><head><style>${fontCss} body{margin:0;background:#fff;color:#000} .open .mask{overflow:visible!important}</style></head><body>${cells.join("")}</body></html>`, height: y + 200 };
}

describe("a reveal mask cuts no glyph at rest (Chrome)", () => {
  // Every system: the masked page and the open page are the same picture.
  test.each(SYSTEMS.map((s) => [s.id, s] as const))("%s", async (_id, s) => {
    if (!browser) return; // no Chrome here: the geometry test above still runs
    const nodes = maskedNodes(s);
    // The blocks make masked lines in every system; else this test proves nothing.
    expect(nodes.length).toBeGreaterThan(5);
    const faces: { family: string; weight: number; data: string }[] = [];
    for (const slot of ["display", "text", "mono"] as const) {
      const family = s.fonts[slot];
      if (!family || faces.some((f) => f.family === family)) continue;
      const role = ROLES.find((r) => (s.fonts[s.type[r].font] ?? s.fonts.text) === family) ?? "body";
      for (const w of loadedWeights(s, role)) faces.push({ family, weight: w, data: await fontData(family, w) });
    }
    const shoot = async (zeroPad: boolean) => {
      const { html, height } = pageHtml(s, nodes, faces, zeroPad);
      const page = await browser!.newPage({ viewport: { width: 1600, height: Math.min(height, 12000) } });
      await page.setContent(html);
      await page.evaluate(async () => { await Promise.all([...document.fonts].map((f) => f.load())); await document.fonts.ready; });
      // The system's own faces drew the page, not a fallback.
      const loaded = await page.evaluate((fs) => fs.map((f) => document.fonts.check(`${f.weight} 40px "${f.family}"`)), faces.map(({ family, weight }) => ({ family, weight })));
      expect(loaded.every(Boolean)).toBe(true);
      const shut = await page.screenshot({ fullPage: true });
      await page.evaluate(() => document.body.classList.add("open"));
      const open = await page.screenshot({ fullPage: true });
      await page.close();
      return Buffer.compare(shut, open) === 0;
    };
    // The control: with no pad, the mask cuts the probe's overhangs, so the two pictures differ.
    expect(await shoot(true)).toBe(false);
    expect(await shoot(false)).toBe(true);
  }, 60000);
});
