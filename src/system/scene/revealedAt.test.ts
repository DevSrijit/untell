// revealedAt on a chart with labels: the frame it returns is the frame on which every part of the chart (bars, value
// labels, category labels, title, axis) has arrived and rests, so a hit placed there never lands before a label.
import { describe, expect, test } from "bun:test";
import { SYSTEMS } from "../systems";
import { FPS, makeCtx } from "./context";
import { revealedAt, nodesOf } from "./beats";
import { valueAt } from "./time";
import type { Node } from "./types";
import { BLOCKS, landOn } from "./blocks";

const PROPS = ["opacity", "x", "y", "scale", "scaleX", "scaleY", "draw", "reveal"] as const;

describe("revealedAt on a bar chart with labels", () => {
  for (const id of ["spec", "pop", "graphite", "console"]) test(`${id}: every part rests from the returned frame on, and one frame earlier some part still moves`, () => {
    const s = SYSTEMS.find((x) => x.id === id)!;
    const ctx = makeCtx(s, 1080, 1920, (t, r) => t.length * s.type[r].size * 1080 * 0.5);
    const w = console.warn; console.warn = () => {};
    let nodes: Node[];
    try {
      nodes = BLOCKS.barChart({ id: "chart", x: ctx.safe.left, y: ctx.safe.top + 200, w: ctx.safe.right - ctx.safe.left, h: 900, title: "Looks left, thousands",
        categories: ["1", "2", "3", "4"], series: [{ label: "left", values: [500, 250, 125, 62] }], at: 0.5 }, ctx);
    } finally { console.warn = w; }
    const t = revealedAt(s, nodes!, "chart");
    const f = Math.round(t * FPS);
    const parts = nodesOf(nodes!, "chart");
    const value = (n: Node, p: (typeof PROPS)[number], fr: number) => valueAt(s, n.tracks?.[p], p, fr / FPS);
    const still = (fr: number) => parts.every((n) => PROPS.every((p) => !n.tracks?.[p]?.length || Math.abs(value(n, p, fr) - value(n, p, fr + 1)) < 1e-3));
    for (let k = f; k < f + 20; k++) expect([k, still(k)]).toEqual([k, true]);
    expect(still(f - 1)).toBe(false);
    // The labels count: the last text to arrive is shown at full opacity by then.
    const texts = parts.filter((n) => n.kind === "text");
    expect(texts.length).toBeGreaterThan(4);
    for (const n of texts) if (n.tracks?.opacity?.length) expect(value(n, "opacity", f)).toBeGreaterThan(0.999);
  });
});

// landOn: a slide timed one enter duration before a beat arrived 3 frames late (a first-use test: a slide
// runs 1.4 x the enter duration, and a node arrives on the frame after its motion ends). landOn lands it on the beat.
describe("landOn", () => {
  for (const id of ["primary", "spec", "riso", "pop"]) test(`${id}: a slide, a grow and a title arrive on the first frame at or after the time`, () => {
    const s = SYSTEMS.find((x) => x.id === id)!;
    const ctx = makeCtx(s, 1080, 1920, (t, r) => t.length * s.type[r].size * 1080 * 0.5);
    for (const t of [2, 2.517, 3.333]) {
      const want = Math.ceil(t * FPS - 1e-6);
      for (const enter of ["slide", "grow"] as const) {
        const nodes = landOn(ctx, t, (at, c) => BLOCKS.shape({ id: "pointer", kind: "triangle", x: 400, y: 800, w: 100, h: 100, fill: "ink", enter, from: "right", at }, c));
        expect([enter, t, Math.round(revealedAt(s, nodes, "pointer") * FPS)]).toEqual([enter, t, want]);
      }
      const title = landOn(ctx, t, (at, c) => BLOCKS.title({ id: "ttl", text: "Ten mm", role: "headline", x: ctx.safe.left, y: 300, w: 600, at }, c));
      expect(Math.round(revealedAt(s, title, "ttl") * FPS)).toBe(want);
    }
    // Started one enter duration before the beat, the slide lands late: the fault landOn fixes.
    const plain = BLOCKS.shape({ id: "p", kind: "triangle", x: 400, y: 800, w: 100, h: 100, fill: "ink", enter: "slide", from: "right", at: 2 - ctx.dur.enter }, ctx);
    expect(Math.round(revealedAt(s, plain, "p") * FPS)).toBeGreaterThan(60);
    expect(() => landOn(ctx, 0.1, (at, c) => BLOCKS.shape({ id: "q", kind: "rect", x: 400, y: 800, w: 100, h: 100, fill: "ink", enter: "slide", at }, c))).toThrow("Land it on a later time");
  });
});
