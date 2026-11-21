// drawnMark and the mark format (scene/markArt.ts): the path data is read as SVG reads it, the file format refuses what
// untell does not read, and the block draws each path, fills it, places it by the system's rules and locks it up.
import { describe, expect, test } from "bun:test";
import { SYSTEMS } from "../../systems";
import { DIRECTION } from "../../direction";
import { MARKS } from "../../marks.gen";
import { makeCtx } from "../context";
import { evaluate } from "../time";
import { artBounds, parseMarkSvg, parsePath, pathData, segPoints, type MarkArt } from "../markArt";
import { heroBox } from "./compose";
import { BLOCKS } from ".";
import type { Node } from "../types";

const ctxOf = (id: string, w = 1080, h = 1920) => {
  const s = SYSTEMS.find((x) => x.id === id)!;
  return makeCtx(s, w, h, (t, r) => t.length * s.type[r].size * Math.min(w, h) * 0.5);
};
const SQUARE: MarkArt = { viewBox: [0, 0, 100, 100], paths: [{ d: "M0 0H100V100H0Z", paint: "fill" }, { d: "M110 0h20v100h-20z", paint: "fill" }] };

describe("path data", () => {
  test("relative commands, H and V, S and T become absolute M, L, C, Q and Z", () => {
    expect(pathData(parsePath("m10 10 h20 v20 l-5 5z"))).toBe("M10 10L30 10L30 30L25 35Z");
    expect(pathData(parsePath("M0 0C0 10 10 10 10 0S20 -10 20 0"))).toBe("M0 0C0 10 10 10 10 0C10 -10 20 -10 20 0");
    expect(pathData(parsePath("M0 0Q5 10 10 0T20 0"))).toBe("M0 0Q5 10 10 0Q15 -10 20 0");
  });
  test("arc flags written with no space between them", () => {
    expect(pathData(parsePath("M0 0a10 10 0 1110 10"))).toBe("M0 0A10 10 0 1 1 10 10");
  });
  test("an arc's points lie on its circle, on the side its flags give", () => {
    // A half circle from (0, 0) to (20, 0) with radius 10, clockwise on screen: it bows up (y < 0).
    const pts = segPoints(parsePath("M0 0A10 10 0 0 1 20 0"));
    for (const [x, y] of pts) expect(Math.hypot(x - 10, y)).toBeCloseTo(10, 6);
    expect(Math.min(...pts.map((p) => p[1]))).toBeCloseTo(-10, 3);
  });
  test("bad data throws with where", () => {
    expect(() => parsePath("L0 0")).toThrow(/start with M/);
    expect(() => parsePath("M0 0L5")).toThrow(/number was expected/);
    expect(() => parsePath("M0 0A1 1 0 2 0 3 3")).toThrow(/arc flag/);
  });
});

describe("the SVG file", () => {
  test("basic shapes become paths in document order; a line keeps its width; evenodd is kept", () => {
    const art = parseMarkSvg(`<svg viewBox="0 0 200 100"><rect x="0" y="0" width="50" height="50" rx="10"/><circle cx="100" cy="50" r="20"/>
      <polyline points="150 0 200 50" fill="none" stroke="#000" stroke-width="6"/><path d="M0 0H10V10H0ZM2 2H8V8H2Z" style="fill-rule:evenodd"/></svg>`);
    expect(art.paths.map((p) => p.paint)).toEqual(["fill", "fill", "stroke", "fill"]);
    expect(art.paths[2]!.width).toBe(6);
    expect(art.paths[3]!.rule).toBe("evenodd");
    // The rect's corners are arcs of 10.
    expect(art.paths[0]!.d).toContain("A10 10 0 0 1 50 10");
  });
  test("width and height stand in for a viewBox", () => expect(parseMarkSvg(`<svg width="40" height="20"><rect width="40" height="20"/></svg>`).viewBox).toEqual([0, 0, 40, 20]));
  test("what untell does not read is refused with the fix", () => {
    expect(() => parseMarkSvg(`<svg viewBox="0 0 1 1"><path transform="scale(2)" d="M0 0H1V1Z"/></svg>`)).toThrow(/apply the transforms/i);
    expect(() => parseMarkSvg(`<svg viewBox="0 0 1 1"><use href="#a"/></svg>`)).toThrow(/use element/);
    expect(() => parseMarkSvg(`<svg viewBox="0 0 1 1"><text>A</text></svg>`)).toThrow(/outlines/);
    expect(() => parseMarkSvg(`<svg viewBox="0 0 1 1"><path d="M0 0H1V1Z" fill="url(#g)"/></svg>`)).toThrow(/flat/);
    expect(() => parseMarkSvg(`<svg><path d="M0 0H1V1Z"/></svg>`)).toThrow(/viewBox/);
    expect(() => parseMarkSvg(`<svg viewBox="0 0 1 1"><path d="M0 0H1V1Z" fill="none"/></svg>`)).toThrow(/paints no shape/);
  });
  test("defs, gradients and comments are skipped; their shapes do not draw", () => {
    const art = parseMarkSvg(`<svg viewBox="0 0 10 10"><!-- <rect width="9" height="9"/> --><defs><rect id="r" width="3" height="3"/></defs><rect width="10" height="10"/></svg>`);
    expect(art.paths.length).toBe(1);
  });
  test("the repository's marks parse to the table it holds", () => {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const file = join(import.meta.dir, "../../../../assets/media/nozith-mark/mark.svg");
    if (require("node:fs").existsSync(file)) expect(parseMarkSvg(readFileSync(file, "utf8"))).toEqual(MARKS["nozith-mark"]!);
  });
});

describe("drawnMark", () => {
  const ctx = ctxOf("mark");
  const byId = (ns: Node[], id: string) => ns.find((n) => n.id === id)!;
  test("each path draws its outline, then its fill lands; colours are roles, one path in the accent", () => {
    const ns = BLOCKS.drawnMark({ mark: SQUARE, accent: 1, times: [1, 2], fills: [2, 3], fillWith: "cut", at: 1 }, ctx);
    const line0 = byId(ns, "mark-p0-line"), fill1 = byId(ns, "mark-p1-fill");
    expect([line0.kind === "path" && line0.stroke, fill1.kind === "path" && fill1.fill]).toEqual(["ink", "accent"]);
    expect(evaluate(ctx.system, line0.tracks, 0.9).opacity).toBe(0);
    expect(evaluate(ctx.system, line0.tracks, 1.5).draw).toBeGreaterThan(0);
    expect(evaluate(ctx.system, line0.tracks, 1.5).draw).toBeLessThan(1);
    expect(evaluate(ctx.system, byId(ns, "mark-p0-fill").tracks, 1.95).opacity).toBe(0);
    expect(evaluate(ctx.system, byId(ns, "mark-p0-fill").tracks, 2.1).opacity).toBe(1);
    // The mark is one group: one picture and one mover for the checks.
    expect(new Set(ns.filter((n) => n.kind === "path").map((n) => n.group))).toEqual(new Set(["mark"]));
  });
  test("a path at or before 0 is drawn and filled on frame 0", () => {
    const ns = BLOCKS.drawnMark({ mark: SQUARE, times: [-1, 1], at: -1 }, ctx);
    const v = (id: string) => evaluate(ctx.system, byId(ns, id).tracks, 0);
    expect([v("mark-p0-line").draw, v("mark-p0-line").opacity, v("mark-p0-fill").opacity, v("mark-p1-line").opacity]).toEqual([1, 1, 1, 0]);
  });
  test("with no box, a mark later in the film fits the system's hero box, centred, its aspect kept", () => {
    const ns = BLOCKS.drawnMark({ mark: SQUARE, at: 3 }, ctx);
    const a = byId(ns, "mark-box") as Extract<Node, { kind: "anchor" }>;
    const b = artBounds(SQUARE), hero = heroBox(ctx, b.w / b.h);
    expect(a.w / a.h).toBeCloseTo(b.w / b.h, 3);
    expect(Math.abs(a.x + a.w / 2 - (hero.x + hero.w / 2))).toBeLessThanOrEqual(1);
    expect(a.w * a.h / (ctx.width * ctx.height)).toBeCloseTo(DIRECTION.mark!.hook.area!, 2);
  });
  test("with its defaults, a mark that opens a Mark film meets Mark's hook: the unit module on frame 0, in the accent, its parts at the hook's area", () => {
    const ns = BLOCKS.drawnMark({ mark: SQUARE, at: 0 }, ctx);
    const v = (id: string, t: number) => evaluate(ctx.system, byId(ns, id).tracks, t);
    // The unit module is drawn and filled on frame 0; the next path draws from 0.
    expect([v("mark-p0-line", 0).draw, v("mark-p0-fill", 0).opacity]).toEqual([1, 1]);
    expect(v("mark-p1-fill", 0).opacity).toBe(0);
    expect((byId(ns, "mark-p0-fill") as Extract<Node, { kind: "path" }>).fill).toBe("accent");
    // What shows by the hook's time (the unit module: its box is 100 of the 130 px width) covers the hook's area.
    const hook = DIRECTION.mark!.hook;
    const a = byId(ns, "mark-box") as Extract<Node, { kind: "anchor" }>;
    const unit = (a.w * 100) / 130 * a.h;
    expect(unit / (ctx.width * ctx.height)).toBeGreaterThanOrEqual(hook.area!);
    // "none" keeps every path in ink.
    expect((byId(BLOCKS.drawnMark({ mark: SQUARE, accent: "none", at: 0 }, ctx), "mark-p0-fill") as Extract<Node, { kind: "path" }>).fill).toBe("ink");
  });
  test("its line: placed over the mark, and gone before the mark moves into the lockup", () => {
    const ns = BLOCKS.drawnMark({ mark: SQUARE, line: { text: "Two parts." }, lockup: { name: "Velmira", line: "Glass", at: 3 }, at: 0 }, ctx);
    const line = ns.filter((n) => n.id.startsWith("mark-line") && n.kind === "text") as Extract<Node, { kind: "text" }>[];
    expect(line.length).toBeGreaterThan(0);
    const a = byId(ns, "mark-box") as Extract<Node, { kind: "anchor" }>;
    for (const l of line) {
      expect(l.y + ctx.lineHeight("headline")).toBeLessThanOrEqual(a.y + 1);
      expect(evaluate(ctx.system, l.tracks, 0).opacity).toBe(1);
      expect(evaluate(ctx.system, l.tracks, 3).opacity).toBe(0);
    }
  });
  test("the lockup in a tall frame: the name and the line over the mark, the mark keeps its size, centred, and the end holds", () => {
    const ns = BLOCKS.drawnMark({ mark: SQUARE, times: [0, 0.5], lockup: { name: "Velmira", line: "Glass", at: 3 }, at: 0 }, ctx);
    const mb = byId(ns, "mark-lock-mark-box") as Extract<Node, { kind: "anchor" }>;
    const box = byId(ns, "mark-box") as Extract<Node, { kind: "anchor" }>;
    const line = byId(ns, "mark-lock-line-box") as Extract<Node, { kind: "anchor" }>;
    const v = evaluate(ctx.system, byId(ns, "mark-p0-fill").tracks, 5);
    expect(box.x + box.w / 2 + v.x).toBeCloseTo(mb.x + mb.w / 2, 0);
    expect(box.y + box.h / 2 + v.y).toBeCloseTo(mb.y + mb.h / 2, 0);
    expect(v.scale).toBeCloseTo(1, 6);
    expect(mb.x + mb.w / 2).toBeCloseTo(ctx.width / 2, 0);
    // The words end over the mark, inside the text-safe area.
    expect(line.y + line.h).toBeLessThanOrEqual(mb.y);
    expect(line.y + line.h).toBeLessThanOrEqual(ctx.safe.bottom);
    expect(ns.some((n) => n.kind === "hold")).toBe(true);
    expect(evaluate(ctx.system, byId(ns, "mark-lock-name").tracks, 2.9).opacity).toBe(0);
    expect(evaluate(ctx.system, byId(ns, "mark-lock-name").tracks, 5).opacity).toBe(1);
  });
  test("the lockup in a wide frame: the mark over the name, as large as it was built where the room allows, never under the end look's height", () => {
    const wide = ctxOf("mark", 1920, 1080);
    const ns = BLOCKS.drawnMark({ mark: { viewBox: [0, 0, 1, 1], paths: [SQUARE.paths[0]!] }, lockup: { name: "Velmira", line: "Glass", at: 3 }, at: 0 }, wide);
    const mb = byId(ns, "mark-lock-mark-box") as Extract<Node, { kind: "anchor" }>;
    const name = byId(ns, "mark-lock-name-box") as Extract<Node, { kind: "anchor" }>;
    const built = byId(ns, "mark-box") as Extract<Node, { kind: "anchor" }>;
    expect(mb.h).toBeGreaterThanOrEqual(Math.round(DIRECTION.mark!.ends.look.mark * wide.height));
    expect(mb.h).toBeLessThanOrEqual(Math.round(built.h) + 1);
    expect(name.y + name.h).toBeLessThanOrEqual(wide.safe.bottom + 1);
    expect(mb.x + mb.w / 2).toBeCloseTo(wide.width / 2, 0);
    expect(name.y).toBeGreaterThanOrEqual(mb.y + mb.h);
  });
  test("a system with no direction of its own gets the defaults (a user's system)", () => {
    const s = { ...SYSTEMS.find((x) => x.id === "mark")!, id: "my-own" };
    const c = makeCtx(s, 1080, 1920, (t, r) => t.length * s.type[r].size * 1080 * 0.5);
    expect(() => BLOCKS.drawnMark({ mark: SQUARE, lockup: { name: "Velmira", at: 4 }, at: 0 }, c)).not.toThrow();
  });
  test("times it cannot honour throw with what to give", () => {
    expect(() => BLOCKS.drawnMark({ mark: SQUARE, times: [0.5, 1], at: 1 }, ctx)).toThrow(/before at/);
    expect(() => BLOCKS.drawnMark({ mark: SQUARE, times: [1, 1], fills: [0.5, 2], at: 1 }, ctx)).toThrow(/fills\[0\]/);
    expect(() => BLOCKS.drawnMark({ mark: SQUARE, times: [1], at: 1 }, ctx)).toThrow(/2 paths/);
    expect(() => BLOCKS.drawnMark({ mark: SQUARE, accent: 2, at: 1 }, ctx)).toThrow(/accent 2/);
    expect(() => BLOCKS.drawnMark({ mark: SQUARE, times: [1, 1], fills: [1.2, 1.4], lockup: { name: "A", at: 1.3 }, at: 1 }, ctx)).toThrow(/lockup.at/);
    expect(() => BLOCKS.drawnMark({ mark: "no-such-mark", at: 0 }, ctx)).toThrow(/untell media add/);
  });
  test("the same nodes in both frameworks: the nodes are plain data, and evenodd reaches the node", () => {
    const art = parseMarkSvg(`<svg viewBox="0 0 10 10"><path fill-rule="evenodd" d="M0 0H10V10H0ZM2 2H8V8H2Z"/></svg>`);
    const ns = BLOCKS.drawnMark({ mark: art, at: 0 }, ctx);
    expect(JSON.parse(JSON.stringify(ns))).toEqual(ns);
    const f = byId(ns, "mark-p0-fill");
    expect(f.kind === "path" && f.fillRule).toBe("evenodd");
  });
});
