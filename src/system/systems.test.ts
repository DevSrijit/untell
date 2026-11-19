import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { contrast, hex, hexToRgb, srgbToOklch } from "./color";
import { fallbackFonts, SYSTEM_PALETTES, SYSTEMS } from "./systems";
import { MEDIA_SPEC } from "./media-spec";
import { DIRECTION } from "./direction";
import * as fontkit from "fontkit";
import { FONT_LOADERS } from "./fonts.gen";

const lc = (h: string) => srgbToOklch(hexToRgb(h));

describe("the set", () => {
  test("is 20 systems, half light and half dark", () => {
    expect(SYSTEMS.length).toBe(20);
    expect(SYSTEMS.filter((s) => s.mode === "light").length).toBe(10);
    expect(SYSTEMS.filter((s) => s.mode === "dark").length).toBe(10);
  });
  test("has unique ids", () => {
    expect(new Set(SYSTEMS.map((s) => s.id)).size).toBe(SYSTEMS.length);
  });
});

describe.each(SYSTEMS.map((s) => [s.id, s] as const))("%s", (_id, s) => {
  const r = Object.fromEntries(Object.entries(s.roles).map(([k, v]) => [k, hex(v)])) as Record<string, string>;
  const g = lc(r.ground!);

  // Global delivery invariants: no exceptions.
  test("never uses pure black or pure white", () => {
    for (const v of Object.values(r)) expect(["#000000", "#FFFFFF"]).not.toContain(v);
  });
  test("its ground matches its mode and stays flat-safe", () => {
    if (s.mode === "light") expect(g.l >= 0.88 && g.l <= 0.99).toBe(true);
    else expect(g.l >= 0.08 && g.l <= 0.23).toBe(true);
  });
  test("keeps its neutrals neutral", () => {
    for (const k of ["ground", "surface", "rule", "ink", "inkMuted"] as const) expect(s.roles[k].c).toBeLessThanOrEqual(0.021);
  });
  test("reads: ink 7:1, muted ink 4.5:1, accent text 4.5:1, text on the accent 4.5:1", () => {
    expect(contrast(r.ink!, r.ground!)).toBeGreaterThanOrEqual(7);
    expect(contrast(r.inkMuted!, r.ground!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(r.accentText!, r.ground!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(r.onAccent!, r.accent!)).toBeGreaterThanOrEqual(4.5);
  });
  test("caps every accent's chroma at 0.20", () => {
    for (const k of ["accent", "accent2", "accent3"]) if (r[k]) expect(lc(r[k]!).c).toBeLessThanOrEqual(0.2005);
  });

  // The ban list. Navy grounds and purple accents have no exception path.
  test("has no navy or ink-blue ground", () => {
    expect(g.l < 0.35 && g.c > 0.02 && g.h > 220 && g.h < 290).toBe(false);
  });
  test("has no purple or violet accent", () => {
    for (const k of ["accent", "accent2", "accent3"]) {
      if (!r[k]) continue;
      const a = lc(r[k]!);
      expect(a.c > 0.1 && a.h > 280 && a.h < 330).toBe(false);
    }
  });
  test("declares a reason for every default it breaks on purpose", () => {
    const a = lc(r.accent!);
    const cream = g.l > 0.9 && g.c > 0.01 && g.h > 50 && g.h < 100 && a.c > 0.12 && a.h > 20 && a.h < 50;
    const blackVivid = g.l < 0.25 && a.c > 0.12 && a.h > 20 && a.h < 140;
    const declared = new Set((s.exceptions ?? []).map((e) => e.rule));
    if (cream) expect(declared.has("cream-with-warm-accent")).toBe(true);
    if (blackVivid) expect(declared.has("near-black-with-one-vivid-accent")).toBe(true);
    for (const e of s.exceptions ?? []) expect(e.reason.length).toBeGreaterThan(40);
  });

  test("names a reference, a pattern, a grammar and the kinds it suits", () => {
    expect(s.reference.length).toBeGreaterThan(30);
    expect(s.pattern.length).toBeGreaterThan(20);
    expect(s.grammar.length).toBeGreaterThanOrEqual(2);
    expect(s.kinds.length).toBeGreaterThanOrEqual(2);
  });
  test("sizes body text for a phone: at least 4 % of the short side", () => {
    expect(s.type.body.size).toBeGreaterThanOrEqual(0.04);
    expect(s.type.label.size).toBeGreaterThanOrEqual(0.033);
  });
});

describe("every text role reads on its own ground", () => {
  // The roles a block draws text in: ink, inkMuted (labels, captions, axes), accentText (a result, a key value) and
  // the status roles (a badge, a terminal line). Each passes 4.5:1 (WCAG AA) on the system's ground and surface.
  // A system with grain needs more: grain moves pixels both ways, so the bar rises by twice its strength.
  test.each(SYSTEMS.map((s) => [s.id, s] as const))("%s", (_id, s) => {
    const need = 4.5 * (1 + 2 * (s.allows.includes("grain") ? s.texture.grain : 0));
    const fails: string[] = [];
    for (const fg of ["ink", "inkMuted", "accentText", "positive", "negative"] as const) for (const bg of ["ground", "surface"] as const) {
      const c = contrast(hex(s.roles[fg]), hex(s.roles[bg]));
      if (c < need) fails.push(`${fg} on ${bg} ${c.toFixed(2)}:1 (needs ${need.toFixed(2)})`);
    }
    // Text on the accent fill (a badge, a value inside its bar) is onAccent.
    const on = contrast(hex(s.roles.onAccent), hex(s.roles.accent));
    if (on < need) fails.push(`onAccent on accent ${on.toFixed(2)}:1 (needs ${need.toFixed(2)})`);
    expect(fails).toEqual([]);
  });
});

describe.each(SYSTEMS.map((s) => [s.id, s] as const))("%s, its docs agree with its data", (_id, s) => {
  test("its accent mode matches its colours", () => {
    const accent = hex(s.roles.accent), ink = hex(s.roles.ink);
    if (s.accentMode === "ink") expect(accent).toBe(ink);
    else expect(accent).not.toBe(ink);
  });
  test("it allows every effect its words ask for", () => {
    const words = `${s.motion.character} ${s.motion.transitions} ${s.texture.note} ${s.grammar.join(" ")}`.toLowerCase();
    const asks: [RegExp, string][] = [[/motion blur/, "motion-blur"], [/\blight sweep|light that passes/, "light-sweep"],
      [/contact shadow/, "contact-shadow"], [/rim light/, "rim-light"], [/halftone/, "halftone"], [/scanline/, "scanlines"],
      [/shadow bars/, "shadow-bars"], [/reflection/, "reflection"]];
    for (const [re, effect] of asks) if (re.test(words) && !/never|no bloom/.test(words.split(re)[0]!.slice(-20))) expect(s.allows).toContain(effect as never);
    if (s.texture.grain > 0) expect(s.allows).toContain("grain");
    // A texture strength is set exactly when the system allows the effect, so no strength sits unused.
    expect((s.texture.scanlines ?? 0) > 0).toBe(s.allows.includes("scanlines"));
    expect((s.texture.reflection ?? 0) > 0).toBe(s.allows.includes("reflection"));
  });
  test("every font and weight it uses has a local file and a loader", () => {
    const used = new Set(Object.values(s.type).map((t) => t.font));
    const gen = readFileSync(new URL("./fonts.gen.ts", import.meta.url), "utf8");
    for (const slot of ["display", "text", "mono"] as const) {
      const family = s.fonts[slot];
      if (!family) continue;
      expect(used.has(slot)).toBe(true); // no unused font slots
      expect(FONT_LOADERS[family]).toBeDefined(); // the Remotion adapter can load it
      const slug = family.toLowerCase().replace(/ /g, "-");
      for (const t of Object.values(s.type)) if (t.font === slot) {
        // The file ships (the Fontsource package here, the kit's fonts folder in a project), and the loader imports it.
        expect(existsSync(new URL(`../../node_modules/@fontsource/${slug}/files/${slug}-latin-${t.weight}-normal.woff2`, import.meta.url))).toBe(true);
        expect(gen).toContain(`/${slug}-latin-${t.weight}-normal.woff2"`);
      }
    }
  });
  test("its fonts make no network request in Remotion", () => {
    const gen = readFileSync(new URL("./fonts.gen.ts", import.meta.url), "utf8");
    expect(gen).not.toMatch(/https?:\/\/|google-fonts/);
  });
});

describe("the examples", () => {
  test("the HyperFrames example uses the exported Spec tokens, unchanged", () => {
    const root = new URL("../../", import.meta.url).pathname;
    expect(readFileSync(root + "examples/hyperframes/spec-compound/assets/tokens.css", "utf8")).toBe(readFileSync(root + "systems/spec/tokens.css", "utf8"));
  });
});

// Glyph coverage. A film sets numbers, units and simple maths. Each glyph below must come from the
// system's own font or from its symbol fallback (System.fonts.fallback), never from a system font.
// The test reads the Fontsource Latin files: the files the HyperFrames renderer loads.
const GLYPHS = [..."0123456789.,:;!?'\"()-/%×−±≈→←°€£$‘’“”…²³π"];
const slugOf = (f: string) => f.toLowerCase().replace(/ /g, "-");
const fontFiles = new Map<string, { hasGlyphForCodePoint: (c: number) => boolean }>();
function fontFile(family: string, weight: number) {
  const key = `${family}:${weight}`;
  if (!fontFiles.has(key)) {
    const path = new URL(`../../node_modules/@fontsource/${slugOf(family)}/files/${slugOf(family)}-latin-${weight}-normal.woff2`, import.meta.url).pathname;
    fontFiles.set(key, fontkit.create(readFileSync(path)) as unknown as { hasGlyphForCodePoint: (c: number) => boolean });
  }
  return fontFiles.get(key)!;
}

describe.each(SYSTEMS.map((s) => [s.id, s] as const))("%s glyphs", (_id, s) => {
  test("every font and weight has digits, punctuation and common symbols, or its fallback has them", () => {
    const fallback = fallbackFonts(s).map((f) => fontFile(f, 400));
    const missing: string[] = [];
    for (const t of Object.values(s.type)) {
      const family = s.fonts[t.font] ?? s.fonts.text;
      const main = fontFile(family, t.weight);
      for (const g of GLYPHS) {
        const c = g.codePointAt(0)!;
        if (!main.hasGlyphForCodePoint(c) && !fallback.some((f) => f.hasGlyphForCodePoint(c))) missing.push(`${family} ${t.weight}: ${g}`);
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });
  test("its fallback fonts have Remotion loaders", () => {
    for (const f of fallbackFonts(s)) expect(FONT_LOADERS[f]).toBeDefined();
  });
});

describe("the media spec", () => {
  const roles = (id: string) => SYSTEM_PALETTES[id]!.roles as Record<string, string>;
  const L = (h: string) => { const o = srgbToOklch(hexToRgb(h)) as unknown as { l?: number; L?: number } | number[]; return Array.isArray(o) ? o[0]! : (o.l ?? o.L)!; };
  test("covers every system", () => {
    for (const s of SYSTEMS) expect(MEDIA_SPEC[s.id], s.id).toBeDefined();
    expect(Object.keys(MEDIA_SPEC).sort()).toEqual(SYSTEMS.map((s) => s.id).sort());
  });
  test("grades from dark to light, on palette roles, with room between them", () => {
    for (const s of SYSTEMS) {
      const g = MEDIA_SPEC[s.id]!.grade, r = roles(s.id);
      const stops = g.kind === "none" ? [] : g.kind === "mono" || g.kind === "tone" ? [g.dark, g.light] : g.kind === "phosphor" ? [g.dark, g.tint] : g.stops;
      for (const x of stops) expect(r[x], `${s.id}: role ${x}`).toBeDefined();
      for (let i = 1; i < stops.length; i++) expect(L(r[stops[i]!]!), `${s.id}: ${stops[i - 1]} before ${stops[i]}`).toBeGreaterThan(L(r[stops[i - 1]!]!));
      // A picture needs a real range: its darkest and lightest tones at least 3:1 apart.
      if (stops.length) expect(contrast(r[stops[0]!]!, r[stops[stops.length - 1]!]!), s.id).toBeGreaterThanOrEqual(3);
    }
  });
  test("keeps screenshots as evidence: a system that needs only real UI or code never grades it", () => {
    for (const s of SYSTEMS) if (/^Real (screenshots|code)/.test(s.needs ?? "")) expect(MEDIA_SPEC[s.id]!.grade.kind, s.id).toBe("none");
  });
  test("its picture motion is the one its block map gives photo", () => {
    for (const [id, d] of Object.entries(DIRECTION)) {
      const m = (d.blocks.find((b) => b.block === "photo")?.props as Record<string, string> | undefined)?.motion;
      if (m) expect([id, m.includes(`"${MEDIA_SPEC[id]!.pictures.motion}"`)]).toEqual([id, true]);
    }
  });
  test("its placements agree with its other answers", () => {
    for (const s of SYSTEMS) {
      const m = MEDIA_SPEC[s.id]!;
      if (m.pictures.placements.includes("cutout-over-type")) expect(m.pictures.cutout, s.id).toBe(true);
      // A picture behind type needs a grade: prepare's plate-dim keeps the range over which the ink reads.
      if (m.pictures.placements.includes("behind-type-dimmed")) expect(m.grade.kind, s.id).not.toBe("none");
      expect(m.pictures.use === "none", s.id).toBe(m.pictures.placements.length === 0);
      expect(m.footage.use === "none", s.id).toBe(m.footage.speed === "none");
    }
  });
  test("its sound is consistent: music with a feel and a tempo, effects with a cap", () => {
    for (const s of SYSTEMS) {
      const m = MEDIA_SPEC[s.id]!;
      if (m.music.level > 0) {
        expect(m.music.feel.length, s.id).toBeGreaterThan(0);
        expect(m.music.bpm[0], s.id).toBeGreaterThanOrEqual(40);
        expect(m.music.bpm[1], s.id).toBeGreaterThan(m.music.bpm[0]);
        expect(m.music.bpm[1], s.id).toBeLessThanOrEqual(180);
      }
      expect(m.hits.allowed.length === 0, s.id).toBe(m.hits.perTen === 0);
      expect(m.hits.perTen, s.id).toBeLessThanOrEqual(12);
    }
  });
});
