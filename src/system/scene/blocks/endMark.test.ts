// endCard and lockup with a real mark: a product model or a prepared picture, sized by the system's end look, with
// the name at the end's role; the landing snaps to a bar with `on`.
import { describe, expect, test } from "bun:test";
import { SYSTEMS } from "../../systems";
import { DIRECTION } from "../../direction";
import { makeCtx } from "../context";
import type { Ctx, Node } from "../types";
import { standing } from "../../three/models";
import { BLOCKS } from ".";

const ctxOf = (id: string, w = 1080, h = 1920): Ctx => {
  const s = SYSTEMS.find((x) => x.id === id)!;
  return makeCtx(s, w, h, (t, r) => t.length * s.type[r].size * Math.min(w, h) * 0.5);
};
const quiet = <T,>(f: () => T): T => { const w = console.warn; console.warn = () => {}; try { return f(); } finally { console.warn = w; } };
const lamp = () => ({ objects: [standing("lamp", "model-lantern", { height: 2.6 })] });
const get = (ns: Node[], id: string) => ns.find((n) => n.id === id) as Node & { x: number; y: number; w: number; h: number; role?: string };

describe("endCard with a real mark", () => {
  test("every system states an end look", () => {
    for (const s of SYSTEMS) expect([s.id, !!DIRECTION[s.id]?.ends.look]).toEqual([s.id, true]);
  });
  for (const id of ["studio", "keynote", "matte"]) test(`${id}: a product model is the mark, at the look's size, the name at the look's role`, () => {
    const ctx = ctxOf(id), look = DIRECTION[id]!.ends.look;
    const ns = quiet(() => BLOCKS.endCard({ id: "c", name: "Ovenri", line: "Light you carry.", mark: lamp(), at: 2, until: 4 }, ctx));
    expect(ns.filter((n) => n.kind === "scene3d").length).toBe(1);
    const mark = get(ns, "c-mark-box"), name = get(ns, "c-name");
    // A model mark is 1.1 times as wide as tall, inside the text-safe width.
    expect(mark.h).toBeGreaterThanOrEqual(Math.min(look.mark * ctx.height, (ctx.safe.right - ctx.safe.left) / 1.1) * 0.95);
    expect(name.role).toBe(look.name);
    // Matte: the model stands under its name, so its floor reflection falls in the lower frame; elsewhere above it.
    if (id === "matte") expect(mark.y).toBeGreaterThan(name.y);
    else expect(mark.y + mark.h).toBeLessThanOrEqual(name.y);
  });
  test("studio's end card is larger than its plain card: the product owns the frame", () => {
    const ctx = ctxOf("studio");
    const ns = quiet(() => BLOCKS.endCard({ id: "c", name: "Ovenri", mark: lamp(), at: 2 }, ctx));
    expect(get(ns, "c-mark-box").h).toBeGreaterThanOrEqual(ctx.height * 0.28);
  });
  test("a prepared picture is the mark: a photo in the mark's box", () => {
    const ctx = ctxOf("noir");
    const ns = quiet(() => BLOCKS.endCard({ id: "c", name: "Ovenri", mark: { media: "noir-bridge" }, at: 2 }, ctx));
    expect(ns.some((n) => n.kind === "image")).toBe(true);
    expect(get(ns, "c-mark-box").h).toBeGreaterThan(ctx.height * 0.2);
  });
  test("a row lockup with a large mark in a tall frame stacks as a column", () => {
    const ctx = ctxOf("matte");
    const ns = quiet(() => BLOCKS.lockup({ id: "l", name: "Ovenri", mark: lamp(), markSize: 600, axis: "row", x: ctx.safe.left, y: 400, w: ctx.safe.right - ctx.safe.left, at: 0 }, ctx));
    const mark = get(ns, "l-mark-box"), name = get(ns, "l-name");
    expect(mark.x + mark.w > name.x).toBe(true);
  });
  test("on: the landing moves to the nearest bar, and the block says so", () => {
    const said: string[] = [], w = console.warn;
    console.warn = (m: string) => said.push(m);
    let ns: Node[];
    try { ns = BLOCKS.endCard({ id: "c", name: "Ovenri", at: 9.8, until: 12, on: { onBar: () => 9.9 } }, ctxOf("keynote")); } finally { console.warn = w; }
    expect((ns!.find((n) => n.id === "c-land") as { at: number }).at).toBeCloseTo(9.9, 5);
    expect(said.some((m) => m.includes("moved to the bar"))).toBe(true);
  });
});
