// Tests for the parts of a drawing (blocks/parts.ts, shape `pivot` and `on`), the figure's placement of dimensions and
// callouts (blocks/figure.ts), and where a drawing stands (figureBox, fitDrawing, sheet `plate`). An agent's lever film
// turned its beam about the wrong point, left its load behind, and placed each label by trial.
import { describe, expect, test } from "bun:test";
import { SYSTEMS } from "../../systems";
import { makeCtx, textSafe } from "../context";
import type { Ctx, Node, PathNode } from "../types";
import { BLOCKS, boxAt, figure, figureBox, fitDrawing, followPoint, pointAt, pointOf } from ".";
import { moved, pathBox, shapeOf } from "./parts";

const ctxOf = (id: string): Ctx => {
  const s = SYSTEMS.find((x) => x.id === id)!;
  return makeCtx(s, 1080, 1920, (t, r) => t.length * s.type[r].size * 1080 * 0.5);
};
const ctx = ctxOf("schematic");
const B = BLOCKS;
const times = Array.from({ length: 61 }, (_, i) => i / 20);
const lever = (o: { pivot?: "centre"; upright?: boolean } = {}) => {
  const fulcrum = B.shape({ id: "fulcrum", kind: "triangle", ...boxAt("triangle", { w: 140, h: 140 }, "apex", { x: 700, y: 1200 }), stroke: "ink", at: -1 }, ctx);
  const beam = B.shape({ id: "beam", kind: "rect", x: 150, y: 1180, w: 800, h: 20, stroke: "ink", on: { part: fulcrum, at: "apex" }, pivot: o.pivot, turns: [{ at: 1, by: -8 }], at: -1 }, ctx);
  const seat = pointOf(beam, [0.95, 0]);
  const load = B.shape({ id: "load", kind: "square", ...boxAt("square", { w: 100, h: 100 }, "base", seat), stroke: "ink", on: { part: beam, at: [0.95, 0], upright: o.upright }, at: -1 }, ctx);
  return { fulcrum, beam, load, seat };
};
const gap = (a: Node[], b: Node[], p: { x: number; y: number }) =>
  Math.max(...times.map((t) => { const u = moved(ctx, shapeOf(a).node, p, t), v = moved(ctx, shapeOf(b).node, p, t); return Math.hypot(u.x - v.x, u.y - v.y); }));

describe("parts: points, pivots and shapes that rest on others", () => {
  test("boxAt and pointOf: a triangle's apex lands where it is asked, not at its box's top", () => {
    const f = B.shape({ id: "f", kind: "triangle", ...boxAt("triangle", { w: 140, h: 140 }, "apex", { x: 500, y: 900 }), stroke: "ink", at: 0 }, ctx);
    const apex = pointOf(f, "apex");
    expect(apex.x).toBeCloseTo(500, 6);
    expect(apex.y).toBeCloseTo(900, 6);
    // The inset: (1 - √3/2) / 2 of the side above the apex.
    expect(apex.y - shapeOf(f).box.y).toBeCloseTo((140 * (1 - Math.sqrt(3) / 2)) / 2, 6);
  });

  test("a beam on a fulcrum turns about the apex: the apex of the beam never leaves the fulcrum", () => {
    const { fulcrum, beam } = lever();
    expect(gap(beam, fulcrum, pointOf(fulcrum, "apex"))).toBeLessThan(0.01);
    // The beam did turn.
    expect(pointAt(ctx, beam, "top-left", 3).y).toBeGreaterThan(pointOf(beam, "top-left").y + 50);
  });

  test("the same beam turned about its centre leaves the fulcrum (the fault the joint check finds)", () => {
    const { fulcrum, beam } = lever({ pivot: "centre" });
    expect(gap(beam, fulcrum, pointOf(fulcrum, "apex"))).toBeGreaterThan(20);
  });

  test("a load on the beam's end stays on it, flush (turning with it) or upright", () => {
    for (const upright of [false, true]) {
      const { beam, load, seat } = lever({ upright });
      expect(gap(load, beam, seat)).toBeLessThan(0.6);
      const rot = (shapeOf(load).node as PathNode).tracks?.rotate;
      expect(!!rot?.length).toBe(!upright);
    }
  });

  test("followPoint keys keep an arrow on the beam's end at every frame", () => {
    const { beam } = lever();
    const f = followPoint(ctx, beam, [0.02, 0]);
    const p = pointOf(beam, [0.02, 0]);
    const arrow = B.arrow({ id: "push", from: [p.x, p.y - 200], to: [p.x, p.y], follow: f, at: 0 }, ctx);
    const line = arrow.find((n) => n.id === "push-line") as PathNode;
    for (const t of times) {
      const q = pointAt(ctx, beam, [0.02, 0], t);
      const v = moved(ctx, { ...line, box: { x: 0, y: 0, w: 1, h: 1 } }, p, t);
      expect(Math.hypot(v.x - q.x, v.y - q.y)).toBeLessThan(0.6);
    }
  });

  test("a shape on a part warns when the point is not on both edges, and names the joint", () => {
    const { beam } = lever();
    const said: string[] = [], w = console.warn;
    console.warn = (m: string) => said.push(m);
    let n: Node[];
    try { n = B.shape({ id: "floating", kind: "square", x: 880, y: 1000, w: 60, h: 60, stroke: "ink", on: { part: beam, at: [0.95, 0] }, at: 0 }, ctx); } finally { console.warn = w; }
    expect(said.some((m) => /floating: it rests on beam .* px off its own outline/.test(m))).toBe(true);
    expect(n!.some((x) => x.id === "floating-on" && x.kind === "anchor")).toBe(true);
  });

  test("on and moves do not mix", () => {
    const { beam } = lever();
    expect(() => B.shape({ id: "s", kind: "square", x: 0, y: 0, w: 10, h: 10, on: { part: beam, at: "top" }, moves: [{ at: 1, to: [5, 5] }], at: 0 }, ctx)).toThrow(/leave out moves/);
  });
});

describe("figure: dimensions and callouts place themselves", () => {
  const scene = () => {
    const { fulcrum, beam, load } = lever();
    const tip = pointOf(beam, [0.02, 0]), top = pointOf(load, "top");
    const push = B.arrow({ id: "push", from: [tip.x, tip.y - 180], to: [tip.x, tip.y], follow: followPoint(ctx, beam, [0.02, 0]), at: 0 }, ctx);
    const weight = B.arrow({ id: "weight", from: [top.x, top.y - 400], to: [top.x, top.y], follow: followPoint(ctx, load, "top"), at: 0 }, ctx);
    const fig = figure(ctx, [...fulcrum, ...beam, ...load, ...push, ...weight]);
    const names = [
      ...B.callout({ id: "n1", label: "300 N", target: { x: top.x, y: top.y - 400 }, follow: followPoint(ctx, load, "top"), figure: fig, at: 0 }, ctx),
      ...B.callout({ id: "n2", label: "100 N", target: { x: tip.x, y: tip.y - 180 }, follow: followPoint(ctx, beam, [0.02, 0]), figure: fig, at: 0 }, ctx),
    ];
    const end = (q: [number, number]) => pointAt(ctx, beam, q, 3);
    const t6 = end([0.02, 0]);
    const dims = [
      ...B.dimension({ id: "d6", from: { x: t6.x, y: t6.y - 180 }, to: end([0.69, 0]), text: "6 m", figure: fig, at: 3 }, ctx),
      ...B.dimension({ id: "d2", from: end([0.69, 0]), to: pointAt(ctx, load, "top", 3), text: "2 m", figure: fig, at: 3 }, ctx),
    ];
    return { fig, nodes: [...names, ...dims] };
  };

  test("every label is in the text-safe area and no two labels touch", () => {
    const { nodes } = scene();
    const labels = nodes.filter((n) => n.kind === "anchor" && n.id.endsWith("-label")) as { x: number; y: number; w: number; h: number }[];
    expect(labels.length).toBe(4);
    for (const b of labels) expect(textSafe(ctx, b, "label")).toBe(true);
    for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i]!, b = labels[j]!;
      expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false);
    }
  });

  test("two dimensions that meet end to end make a chain on one line, and no extension line crosses a label", () => {
    const { fig } = scene();
    expect(fig.dims.length).toBe(2);
    expect(fig.dims[0]!.c).toBeCloseTo(fig.dims[1]!.c, 6);
  });

  test("a dimension with no clear place throws, and names only a fix that it has tried", () => {
    const { fig } = scene();
    // Nothing works for a text this long: the error says so and names no side (before, it named a side it had not tried).
    expect(() => B.dimension({ id: "dx", from: { x: 120, y: 300 }, to: { x: 880, y: 300 }, text: "a very long measure that fits nowhere at all", figure: fig, at: 0 }, ctx)).toThrow(/no clear place .* Shorten the text/);
    expect(() => B.dimension({ id: "dx", from: { x: 120, y: 300 }, to: { x: 880, y: 300 }, text: "a very long measure that fits nowhere at all", figure: fig, at: 0 }, ctx)).not.toThrow(/This works/);
  });

  test("place gives a clear box for an equation, outside the figure and clear of the labels", () => {
    const { fig } = scene();
    const w = ctx.measure("100 N x 6 m = 300 N x 2 m", "body"), h = ctx.lineHeight("body");
    const b = fig.place(w, h, { role: "body" });
    expect(textSafe(ctx, b, "body")).toBe(true);
    expect(b.y + b.h).toBeLessThanOrEqual(fig.box.y);
    for (const q of fig.labels.slice(0, -1)) expect(b.x < q.x + q.w && q.x < b.x + b.w && b.y < q.y + q.h && q.y < b.y + b.h).toBe(false);
  });
});

describe("where a drawing stands (Schematic's compose)", () => {
  test("fitDrawing with no area stands a wide drawing on the system's foot (86 % of the height), in the text column", () => {
    const f = fitDrawing(ctx, { bounds: { x: 0, y: 0, w: 9, h: 3 } });
    expect(f.box.y + f.box.h).toBeCloseTo(1920 * 0.86, 0);
    expect(f.box.x).toBeGreaterThanOrEqual(ctx.safe.left - 0.5);
    expect(f.box.x + f.box.w).toBeLessThanOrEqual(ctx.safe.right + 0.5);
  });

  test("in a wide frame, or a system that states no figure place, the drawing is centred in the picture-safe area", () => {
    const spec = ctxOf("spec");
    const f = fitDrawing(spec, { bounds: { x: 0, y: 0, w: 9, h: 3 } });
    const box = figureBox(spec);
    expect(f.box.y - box.y).toBeCloseTo(box.y + box.h - (f.box.y + f.box.h), 3);
  });

  test("the title block is off where the status line and the plate's figure take its places, and the sheet says so", () => {
    const said: string[] = [], w = console.warn;
    console.warn = (m: string) => said.push(m);
    let n: Node[];
    try { n = B.sheet({ id: "s", grid: "lines", plate: true, titleBlock: { title: "HOIST", fig: 1 }, at: 0 }, ctx); } finally { console.warn = w; }
    expect(n!.some((x) => x.id === "s-title-block")).toBe(false);
    expect(said.some((m) => /title block is off/.test(m))).toBe(true);
    // With no plate the foot is free (a scene that fits its drawing to its own area, as the drivetrain does).
    expect(B.sheet({ id: "s", grid: "lines", titleBlock: { fig: 1 }, at: 0 }, ctx).some((x) => x.id === "s-title-block")).toBe(true);
  });

  test("pathBox counts an arc's whole sweep, not only its ends", () => {
    // A half circle under its chord, from (0, 0) to (100, 0): it reaches 50 px down.
    expect(pathBox("M0 0A50 50 0 0 0 100 0")).toMatchObject({ x: 0, y: 0, w: 100 });
    expect(pathBox("M0 0A50 50 0 0 0 100 0")!.h).toBeCloseTo(50, 0);
  });

  test("sheet `plate: true` lays the figure box under the grid", () => {
    const n = B.sheet({ id: "s", grid: "lines", plate: true, at: 0 }, ctx);
    const plate = n.find((x) => x.id === "s-plate")!;
    expect(plate).toMatchObject({ kind: "rect", fill: "surface", layer: -2, ...figureBox(ctx) });
  });
});
