// Before: B.measure("fitText") returned the unscaled box, so a line stacked under a fitted line overlapped it;
// lineInBand put its line at the text-safe top, where the text block then warned (its glyphs reach past the line box).
import { describe, expect, test } from "bun:test";
import { SYSTEMS } from "../../systems";
import { makeCtx, textSafe } from "../context";
import type { Ctx, TextNode } from "../types";
import { BLOCKS } from ".";
import { lineInBand } from "./compose";

const ctxOf = (id: string, w = 1080, h = 1920): Ctx => {
  const s = SYSTEMS.find((x) => x.id === id)!;
  return makeCtx(s, w, h, (t, r) => t.length * s.type[r].size * Math.min(w, h) * 0.55);
};
const quiet = <T,>(f: () => T): T => { const w = console.warn; console.warn = () => {}; try { return f(); } finally { console.warn = w; } };

describe("measure of a fitted line", () => {
  test.each(SYSTEMS.map((s) => [s.id]))("%s: the box is the fitted size, so a line under it does not overlap", (id) => {
    const ctx = ctxOf(id);
    const S = ctx.safe;
    const props = { id: "big", text: "Halve it", x: S.left, y: S.top, w: S.right - S.left, h: 600, at: 0 };
    const m = quiet(() => BLOCKS.measure("fitText", props, ctx));
    const lines = quiet(() => BLOCKS.fitText(props, ctx)) as TextNode[];
    const k = lines[0]!.tracks!.scale![0]!.v;
    const lh = ctx.lineHeight(lines[0]!.role);
    // fitText scales each line about its top-left (origin [0, 0]).
    const bottom = Math.max(...lines.map((l) => l.y + lh * k));
    expect(m.y + m.h).toBeCloseTo(bottom, 0);
  });
});

describe("lineInBand places the line by its ink", () => {
  const cases = SYSTEMS.flatMap((s) => (["headline", "display", "body"] as const).map((r) => [s.id, r] as [string, "headline" | "display" | "body"]));
  test.each(cases)("%s %s at 9:16: the line's glyph box passes textSafe", (id, role) => {
    const ctx = ctxOf(id);
    if (ctx.system.bleed?.includes(role)) return; // a bleed role may run past the safe area
    const { line } = lineInBand(ctx, { lineH: ctx.lineHeight(role), role });
    expect(textSafe(ctx, { x: line.x, y: line.y, w: 10, h: ctx.lineHeight(role) }, role)).toBe(true);
    const plain = lineInBand(ctx, { lineH: ctx.lineHeight(role) }).line;
    expect(textSafe(ctx, { x: plain.x, y: plain.y, w: 10, h: ctx.lineHeight(role) }, role)).toBe(true);
  });
});

// fitText's open gaps: vertical alignment in the box, and a tilted band.
describe("fitText: valign and a tilted band", () => {
  for (const id of ["nocturne", "primary", "spec"]) test(`${id}: middle and bottom sit lower by half and all of the spare height`, () => {
    const ctx = ctxOf(id);
    const S = ctx.safe;
    const box = { text: "Ten", x: S.left, y: S.top, w: S.right - S.left, h: 700, at: 0 };
    const y = (valign?: "top" | "middle" | "bottom") => (quiet(() => BLOCKS.fitText({ id: "f", ...box, valign }, ctx))[0] as TextNode).y;
    const top = y(), mid = y("middle"), bot = y("bottom");
    expect(mid).toBeGreaterThan(top);
    expect(Math.abs(bot - top - 2 * (mid - top))).toBeLessThan(1);
    const right = quiet(() => BLOCKS.fitText({ id: "r", ...box, w: 600, h: 200, align: "right" }, ctx))[0] as TextNode;
    expect(right.x).toBeGreaterThan(box.x);
  });
  for (const id of ["primary", "spec"]) test(`${id}: a band at -45 degrees turns each line, and every corner stays text-safe`, () => {
    const ctx = ctxOf(id);
    const S = ctx.safe;
    const said: string[] = [];
    const w = console.warn; console.warn = (m: string) => said.push(String(m));
    let ns: TextNode[];
    try { ns = BLOCKS.fitText({ id: "t", text: ["ONE CM", "TEN MM"], x: S.left + 40, y: S.bottom - 80, w: 700, h: 260, angle: -45, at: 0 }, ctx) as TextNode[]; }
    finally { console.warn = w; }
    expect(said.filter((m) => /text-safe/.test(m))).toEqual([]);
    for (const n of ns) expect(n.tracks?.rotate?.[0]?.v).toBe(-45);
    // The second line's corner lies down and to the right of the first's, across the band (turned by -45 degrees).
    expect(ns[1]!.x).toBeGreaterThan(ns[0]!.x);
    expect(ns[1]!.y).toBeGreaterThan(ns[0]!.y);
    const k = ns[0]!.tracks!.scale![0]!.v;
    const lw = ctx.measure("ONE CM", "display") * k, lh = ctx.lineHeight("display") * k;
    const a = (-45 * Math.PI) / 180;
    for (const [dx, dy] of [[lw, 0], [0, lh], [lw, lh]] as const) {
      const x = ns[0]!.x + dx * Math.cos(a) - dy * Math.sin(a), y = ns[0]!.y + dx * Math.sin(a) + dy * Math.cos(a);
      expect(textSafe(ctx, { x, y, w: 0, h: 0 })).toBe(true);
    }
  });
});
