// An agent's case (Spec): the pieces the agent built by hand.
// - curve: a plain curve from a function or points, that draws, cuts in one frame, and gives its points to a callout.
// - rule: `enter: "cut"` (a match cut needs the line whole on the cut's frame).
// - photo: the figure's label strip at the top; traceOn maps source pixels to the screen through the zoom and focus.
import { describe, expect, test } from "bun:test";
import { MEDIA } from "../../media.gen";
import { SYSTEMS } from "../../systems";
import { frameOf, makeCtx } from "../context";
import { valueAt } from "../time";
import type { Ctx, Node, TextNode } from "../types";
import { BLOCKS, curvePoints, traceOn } from ".";
import { scene } from "../../../../examples/scenes/curve";

const ctxOf = (id: string): Ctx => { const s = SYSTEMS.find((x) => x.id === id)!; return makeCtx(s, 1080, 1920, (t, r) => t.length * s.type[r].size * 1080 * 0.55); };

describe("curve", () => {
  test("a parabola maps into its box with y up, draws on a curve that never passes 1, and cuts in one frame", () => {
    const ctx = ctxOf("spec");
    const box = { x: 100, y: 800, w: 800, h: 400 };
    const pts = curvePoints({ fn: (x) => x * x, domain: [-1, 1], range: [0, 1], box });
    expect(pts[0]).toEqual([100, 800]);
    expect(pts[48]![1]).toBeCloseTo(1200, 5);
    const [n] = BLOCKS.curve({ id: "c", fn: (x) => x * x, domain: [-1, 1], range: [0, 1], box, at: 1 }, ctx);
    for (let f = 0; f < 60; f++) expect(valueAt(ctx.system, n!.tracks!.draw!, "draw", f / 30)).toBeLessThanOrEqual(1 + 1e-9);
    const [m] = BLOCKS.curve({ id: "c", points: pts, box, enter: "cut", at: 1 }, ctx);
    expect(valueAt(ctx.system, m!.tracks!.opacity!, "opacity", frameOf(1) / 30)).toBe(1);
    expect(valueAt(ctx.system, m!.tracks!.draw!, "draw", frameOf(1) / 30)).toBe(1);
  });
  test("the scene: a callout on the curve keeps its label off the curve", () => {
    for (const id of ["spec", "schematic", "console"]) {
      const ns = scene(ctxOf(id), BLOCKS);
      expect(ns.some((n) => n.id === "cable")).toBe(true);
      expect(ns.some((n) => n.id.startsWith("low"))).toBe(true);
    }
  });
});

describe("rule enter cut", () => {
  test("the line is whole on the frame of its at", () => {
    const ctx = ctxOf("spec");
    const ns = BLOCKS.rule({ id: "r", x1: 100, y1: 500, x2: 900, y2: 500, ticks: true, enter: "cut", at: 2 }, ctx);
    for (const n of ns) {
      expect(valueAt(ctx.system, n.tracks!.opacity!, "opacity", frameOf(2) / 30)).toBe(1);
      expect(valueAt(ctx.system, n.tracks!.opacity!, "opacity", (frameOf(2) - 1) / 30)).toBe(0);
      expect(valueAt(ctx.system, n.tracks!.draw!, "draw", frameOf(2) / 30)).toBe(1);
    }
  });
});

describe("photo figure label and traceOn", () => {
  const media = Object.keys(MEDIA).find((k) => MEDIA[k]!.kind === "photo" && MEDIA[k]!.grade === "spec") ?? Object.keys(MEDIA).find((k) => MEDIA[k]!.kind === "photo")!;
  test("labelAt top: the strip and its label sit at the top of the window, the picture under it", () => {
    const ctx = ctxOf("spec");
    const box = { x: 120, y: 600, w: 840, h: 600 };
    const quiet = <T,>(f: () => T) => { const w = console.warn; console.warn = () => {}; try { return f(); } finally { console.warn = w; } };
    const ns = quiet(() => BLOCKS.photo({ id: "f", media, box, frame: "figure", label: "FIG. 1", labelAt: "top", motion: "still", at: 0 }, ctx));
    const label = ns.find((n): n is TextNode => n.id === "f-figure-label" && n.kind === "text")!;
    const img = ns.find((n) => n.id === "f" && n.kind === "image") as Extract<Node, { kind: "image" }>;
    expect(label.y).toBeLessThan(img.y);
    expect(img.y + img.h).toBeCloseTo(box.y + box.h, 5);
  });
  test("traceOn: the focus point stays put through a zoom, and a point moves away from it by the zoom", () => {
    const ctx = ctxOf("spec");
    const box = { x: 100, y: 600, w: 880, h: 520 };
    const quiet = <T,>(f: () => T) => { const w = console.warn; console.warn = () => {}; try { return f(); } finally { console.warn = w; } };
    const info = MEDIA[media]!;
    const a = traceOn(quiet(() => BLOCKS.photo({ id: "p", media, box, focus: [0.4, 0.5], motion: "still", at: 0 }, ctx)), "p");
    const b = traceOn(quiet(() => BLOCKS.photo({ id: "p", media, box, focus: [0.4, 0.5], zoom: 2, motion: "still", at: 0 }, ctx)), "p");
    const f = a(info.width * 0.4, info.height * 0.5), g = b(info.width * 0.4, info.height * 0.5);
    expect(g.x).toBeCloseTo(f.x, 3);
    expect(g.y).toBeCloseTo(f.y, 3);
    const p = a(info.width * 0.9, info.height * 0.5), q = b(info.width * 0.9, info.height * 0.5);
    expect(q.x - g.x).toBeCloseTo(2 * (p.x - f.x), 3);
  });
});
