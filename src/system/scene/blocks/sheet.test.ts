// A drawing fills its area: fitDrawing scales the geometry to the picture-safe width, keeps room for the labels,
// and reports the scale and the outline weight. The drivetrain sample fills the width of a 9:16 frame.
import { describe, expect, test } from "bun:test";
import { scene as drivetrain } from "../../../../examples/scenes/drivetrain";
import { SYSTEMS } from "../../systems";
import { makeCtx } from "../context";
import { BLOCKS } from ".";
import { gear } from "./gear";
import { drawingWeight, fitDrawing, pictureSafe } from "./sheet";

const ctxOf = (id: string, w = 1080, h = 1920) => {
  const s = SYSTEMS.find((x) => x.id === id)!;
  return makeCtx(s, w, h, (t, r) => t.length * s.type[r].size * Math.min(w, h) * 0.52);
};
const quiet = <T,>(f: () => T): T => { const w = console.warn; console.warn = () => {}; try { return f(); } finally { console.warn = w; } };

describe("fitDrawing", () => {
  test("the picture-safe area is the frame inside the system margin, wider than the text-safe area at 9:16", () => {
    const ctx = ctxOf("schematic");
    const P = pictureSafe(ctx);
    expect(P.x).toBe(Math.ceil(ctx.system.margin * 1080));
    expect(P.w).toBeGreaterThan(ctx.safe.right - ctx.safe.left);
  });

  test("it takes the largest scale that fits the area after the label room, and centres the drawing", () => {
    const ctx = ctxOf("schematic");
    const f = fitDrawing(ctx, { bounds: { x: 0, y: 0, w: 500, h: 100 }, area: { x: 100, y: 200, w: 800, h: 600 }, room: { top: 50, bottom: 50 } });
    expect(f.k).toBeCloseTo(800 / 500);
    expect(f.box).toMatchObject({ x: 100, w: 800 });
    expect(f.box.y + f.box.h / 2).toBeCloseTo(200 + 50 + 250);
    expect(f.at(500, 100)).toEqual({ x: 900, y: f.box.y + f.box.h });
    expect(f.scale).toBe(`${(500 / 800).toFixed(2)} mm/px`);
    const tall = fitDrawing(ctx, { bounds: { x: 0, y: 0, w: 100, h: 500 }, area: { x: 0, y: 0, w: 800, h: 600 }, room: { top: 50, bottom: 50 } });
    expect(tall.k).toBeCloseTo(1);
    expect(() => fitDrawing(ctx, { bounds: { x: 0, y: 0, w: 1, h: 1 }, area: { x: 0, y: 0, w: 100, h: 60 }, room: { top: 40, bottom: 40 } })).toThrow(/no room/);
  });

  test("a large drawing takes a heavier outline, in half steps up to twice the stroke", () => {
    const ctx = ctxOf("schematic");
    expect(drawingWeight(ctx, 300)).toBe(1);
    expect(drawingWeight(ctx, 820)).toBe(1.5);
    expect(drawingWeight(ctx, 2000)).toBe(2);
    const g = gear({ id: "g", cx: 500, cy: 500, r: 200, teeth: 40, weight: 1.5, at: 0 }, ctx);
    expect((g[0] as { width: number }).width).toBeCloseTo(ctx.stroke * 1.5);
  });
});

describe.each(["schematic", "spec", "console", "pop"].flatMap((s) => [[s, 1080, 1920], [s, 1920, 1080]] as const))("the drivetrain in %s at %ix%i", (sys, w, h) => {
  const ctx = ctxOf(sys, w, h);
  const nodes = quiet(() => drivetrain(ctx, BLOCKS));
  const tips = nodes.filter((n) => n.kind === "anchor" && n.id.endsWith("-pitch")).map((n) => n.kind === "anchor" ? n.data! : {});
  const left = Math.min(...tips.map((d) => Number(d.cx) - Number(d.tip))), right = Math.max(...tips.map((d) => Number(d.cx) + Number(d.tip)));

  test("the drawing fills most of the picture-safe width", () => {
    const P = pictureSafe(ctx);
    expect((right - left) / P.w).toBeGreaterThan(w < h ? 0.9 : 0.5);
  });

  test("every leader is short: under four label lines past the drawing's edge", () => {
    const lh = ctx.lineHeight("label");
    for (const n of nodes) if (n.kind === "anchor" && n.id.endsWith("-leader-line")) {
      const len = Math.hypot(Number(n.data!.x2) - Number(n.data!.x1), Number(n.data!.y2) - Number(n.data!.y1));
      expect(len).toBeLessThan(Math.max(4 * lh, 0.16 * Math.min(w, h)));
    }
  });
});
