// Writes src/system/scene/ink.gen.ts: the ink metrics of every font and weight that a system loads, measured
// once in Chrome from the same font files the renderers load. Usage: bun scripts/export_ink.ts
//
// For each family and weight it measures, as fractions of the font size:
//   cap     the height of a capital (H) above the baseline
//   x       the x-height (x)
//   digit   the height of the figures (0-9)
//   ascent  the font's ascent, and descent, the font's descent: the content area that CSS centres in the line box
//   asc     the height of lower-case ascenders (b d f h k l t), desc the depth of descenders (g j p q y), capDesc the
//           depth of the capitals that reach below the baseline (Q J)
//   inkTop  the highest ink above the baseline of the plain glyphs (ASCII and the typographic quotes and dashes), and
//           inkBottom the deepest ink below the baseline of any glyph (descenders, commas, a cedilla)
//   accentTop  the highest ink of the accented letters (À, É, Å): a mask reaches this high only for a text that
//           holds such a letter
//   overL   how far any glyph's ink reaches left of its own origin, and overR how far it reaches right of its advance
//           (an "f", a "j", an italic, a quote mark). A reveal mask is sized from these four (layout.maskPad), so it
//           never cuts a glyph at rest.
// Both renderers and every block read this one table (layout.inkMetrics), so a text that a block centres by its
// ink sits at the same place in Remotion and in HyperFrames, and in a test with no browser.
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { SYSTEMS } from "../src/system/systems";
import { loadedWeights } from "../src/system/scene/layout";
import { useNetCache } from "./perf/netcache";

const ROOT = resolve(import.meta.dir, "..");

// Every family and the weights the systems load for it. The symbol fallback fonts draw only the glyphs a family
// lacks; a block centres by the family's own metrics.
const want = new Map<string, Set<number>>();
for (const s of SYSTEMS) {
  for (const role of Object.keys(s.type) as (keyof typeof s.type)[]) {
    const family = s.fonts[s.type[role].font] ?? s.fonts.text;
    const set = want.get(family) ?? new Set<number>();
    for (const w of loadedWeights(s, role)) set.add(w);
    want.set(family, set);
  }
}

// The latin file of each family and weight, from the font loaders the Remotion renderer uses.
const faces: { family: string; weight: number; url: string }[] = [];
for (const [family, weights] of [...want].sort((a, b) => a[0].localeCompare(b[0]))) {
  const mod = await import(`@remotion/google-fonts/${family.replace(/ /g, "")}`);
  const info = mod.getInfo();
  for (const w of [...weights].sort((a, b) => a - b)) {
    const files = info.fonts.normal[String(w)];
    if (!files) throw new Error(`${family} has no weight ${w} in its loader`);
    faces.push({ family, weight: w, url: files.latin ?? Object.values(files)[0] });
  }
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
await useNetCache(page);
await page.goto("about:blank");
const rows = await page.evaluate(async (faces) => {
  const out: Record<string, Record<number, { cap: number; x: number; digit: number; ascent: number; descent: number; asc: number; desc: number; capDesc: number; inkTop: number; accentTop: number; inkBottom: number; overL: number; overR: number }>> = {};
  // Every glyph a block's text can hold: printable ASCII, the Latin-1 letters and the typographic marks. All are in
  // the latin file of each family, so no fallback font draws them.
  const plain = [...Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)), ..."“”‘’–—…·×÷°±"].filter((c) => c !== " ");
  const accented = [..."ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖØÙÚÛÜÝàáâãäåæçèéêëìíîïñòóôõöøùúûüýÿ"];
  const S = 1000;
  const pen = document.createElement("canvas").getContext("2d")!;
  for (const f of faces) {
    const name = `ink-${f.family}-${f.weight}`;
    const face = new FontFace(name, `url(${f.url})`, { weight: String(f.weight) });
    await face.load();
    document.fonts.add(face);
    pen.font = `${f.weight} ${S}px "${name}"`;
    const H = pen.measureText("H"), x = pen.measureText("x"), d = pen.measureText("0123456789");
    const up = pen.measureText("bdfhklt"), down = pen.measureText("gjpqy"), capDown = pen.measureText("QJ");
    const r = (v: number) => Math.round((v / S) * 10000) / 10000;
    // The extremes over every glyph, each measured alone (so a glyph's reach past its own advance shows).
    let top = 0, accent = 0, bottom = 0, left = 0, right = 0;
    for (const c of [...plain, ...accented]) {
      const m = pen.measureText(c);
      if (plain.includes(c)) top = Math.max(top, m.actualBoundingBoxAscent);
      else accent = Math.max(accent, m.actualBoundingBoxAscent);
      bottom = Math.max(bottom, m.actualBoundingBoxDescent);
      left = Math.max(left, m.actualBoundingBoxLeft);
      right = Math.max(right, m.actualBoundingBoxRight - m.width);
    }
    (out[f.family] ??= {})[f.weight] = { cap: r(H.actualBoundingBoxAscent), x: r(x.actualBoundingBoxAscent), digit: r(d.actualBoundingBoxAscent),
      ascent: r(H.fontBoundingBoxAscent), descent: r(H.fontBoundingBoxDescent),
      asc: r(up.actualBoundingBoxAscent), desc: r(down.actualBoundingBoxDescent), capDesc: r(Math.max(0, capDown.actualBoundingBoxDescent)),
      inkTop: r(top), accentTop: r(Math.max(top, accent)), inkBottom: r(bottom), overL: r(Math.max(0, left)), overR: r(Math.max(0, right)) };
  }
  return out;
}, faces);
await browser.close();

const lines = [
  "// Generated by scripts/export_ink.ts. Do not edit.",
  "// Ink metrics per family and weight, as fractions of the font size, measured in Chrome from the font files.",
  "export type InkMetrics = { cap: number; x: number; digit: number; ascent: number; descent: number; asc: number; desc: number; capDesc: number; inkTop: number; accentTop: number; inkBottom: number; overL: number; overR: number };",
  `export const INK: Record<string, Record<number, InkMetrics>> = ${JSON.stringify(rows, null, 2)};`,
  "",
];
writeFileSync(join(ROOT, "src/system/scene/ink.gen.ts"), lines.join("\n"));
console.log(`wrote src/system/scene/ink.gen.ts (${faces.length} faces in ${Object.keys(rows).length} families)`);
