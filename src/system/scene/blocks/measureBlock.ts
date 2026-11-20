// Measure: the box a block draws, before the scene places anything under it. Many films stacked blocks by guessing
// a block's height. B.measure(name, props, ctx) builds the block and returns the box round every node it draws.
//
// Rules:
// - The box holds every drawn node (text, box, picture, path, circle) at its place at rest: the x and y tracks at
//   their last key. Anchors, holds, sound and the camera draw nothing and do not count.
// - A text node is as wide as its measured text (or its fixed width) and as tall as its role's line height. A scale
//   at rest scales a text, box or picture about its origin for fitText (its lines at one static scale), so its box
//   is the one drawn.
// - A path counts by its `box` when it has one, else by the points in its outline.
// - It builds the block as a scene does, so the block's own warnings and errors show here too.
// - `wrapped`: how many of the block's lines wrap onto more than one row (codeBlock lines; their anchors carry
//   `rows`). A scene that gets a wrap can shorten the line before it sets it.
import { MEASURING } from "./handover";
import { FPS, revealedAt } from "../beats";
import { evaluate } from "../time";
import type { Ctx, Node } from "../types";

export type MeasuredBox = { x: number; y: number; w: number; h: number; wrapped?: number };

/** The points of an SVG path outline (absolute M, L, H, V, C, Q, A commands; enough for the paths blocks draw). */
function pathPoints(d: string): [number, number][] {
  const out: [number, number][] = [];
  let x = 0, y = 0;
  for (const m of d.matchAll(/([MLHVCQAZmlhvcqaz])([^MLHVCQAZmlhvcqaz]*)/g)) {
    const c = m[1]!, n = (m[2]!.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number);
    if (c === "H") for (const v of n) { x = v; out.push([x, y]); }
    else if (c === "V") for (const v of n) { y = v; out.push([x, y]); }
    else if (c === "A") for (let i = 0; i + 6 < n.length + 0; i += 7) { x = n[i + 5]!; y = n[i + 6]!; out.push([x, y]); }
    else if (c === "M" || c === "L" || c === "C" || c === "Q") for (let i = 0; i + 1 < n.length; i += 2) { x = n[i]!; y = n[i + 1]!; out.push([x, y]); }
  }
  return out;
}

/** The box round a list of nodes at rest (see the header), or null when nothing is drawn. */
export function boxOf(ctx: Ctx, nodes: readonly Node[], scaled = false): MeasuredBox | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (ax: number, ay: number, bx: number, by: number) => { x0 = Math.min(x0, ax); y0 = Math.min(y0, ay); x1 = Math.max(x1, bx); y1 = Math.max(y1, by); };
  for (const n of nodes) {
    if (n.kind === "audio" || n.kind === "anchor" || n.kind === "hold" || n.kind === "camera" || n.kind === "scene3d") continue;
    const end = Math.max(0, ...Object.values(n.tracks ?? {}).flatMap((k) => (k ?? []).map((q) => q.t)));
    const v = evaluate(ctx.system, n.tracks, end + 1);
    const dx = v.x, dy = v.y;
    // A scale at rest (fitText sets its lines with a static scale) scales the box about the node's origin (a share of
    // its own box: text [0, 0.5] by default, other nodes the centre). Before: an unscaled fitText box let a line
    // stacked under it overlap it.
    const sx = scaled ? v.scale * v.scaleX : 1, sy = scaled ? v.scale * v.scaleY : 1;
    const [ox, oy] = n.origin ?? (n.kind === "text" ? [0, 0.5] : [0.5, 0.5]);
    const addScaled = (x: number, y: number, w: number, h: number) => {
      const px = x + ox * w, py = y + oy * h;
      add(px - ox * w * sx, py - oy * h * sy, px + (1 - ox) * w * sx, py + (1 - oy) * h * sy);
    };
    if (n.kind === "text") {
      const w = n.width ?? ctx.measure(n.text, n.role, { ...(n.keepCase ? { keepCase: true } : {}), ...(n.weight !== undefined ? { weight: n.weight } : {}) });
      addScaled(n.x + dx, n.y + dy, w, ctx.lineHeight(n.role));
    } else if (n.kind === "rect" || n.kind === "image") addScaled(n.x + dx, n.y + dy, n.w, n.h);
    else if (n.kind === "circle") add(n.cx - n.r + dx, n.cy - n.r + dy, n.cx + n.r + dx, n.cy + n.r + dy);
    else if (n.kind === "path") {
      if (n.box) add(n.box.x + dx, n.box.y + dy, n.box.x + n.box.w + dx, n.box.y + n.box.h + dy);
      else for (const [px, py] of pathPoints(n.d)) add(px + dx, py + dy, px + dx, py + dy);
    }
  }
  return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Builds a block so that its entrance arrives on time `t`: its last part comes to rest on the first frame at or after
 * `t` (revealedAt), so a hit `on` the block plays on `t`. Use it to land an entrance on a beat.
 * An entrance does not arrive at `at + ctx.dur.enter`: a slide runs 1.4 x the enter duration and arrives 3 to 6
 * frames late, a drawn shape later still, and a grow or a fade up to 2 frames early (measured in Primary, Spec, Pop,
 * Courtside and Riso). landOn measures the block itself, so it holds for any entrance.
 * `build(at, c)` is the block call with the start time `at` and the context `c`: give `c` to the block. landOn builds
 * it on copies of the context to measure the arrival (as B.measure does), then once on `ctx`. `id`: the node to land
 * (a node id, or a block id for all its parts); default: every node the block draws.
 *   const pointer = landOn(ctx, G.onBeat(2), (at, c) => B.shape({ id: "pointer", ..., enter: "slide", at }, c));
 */
export function landOn(ctx: Ctx, t: number, build: (at: number, c: Ctx) => Node[], id?: string): Node[] {
  const target = Math.ceil(t * FPS - 1e-6) / FPS;
  const arrival = (nodes: Node[]) => {
    if (id !== undefined) return revealedAt(ctx.system, nodes, id);
    const ids = [...new Set(nodes.filter((n) => n.kind !== "audio" && n.kind !== "anchor" && n.kind !== "hold" && n.kind !== "camera").map((n) => n.id))];
    if (!ids.length) throw new Error("landOn: the block draws nothing, so it has no entrance to land");
    return Math.max(...ids.map((k) => revealedAt(ctx.system, nodes, k)));
  };
  const probe = (at: number) => {
    const copy = { ...ctx };
    MEASURING.add(copy);
    const warn = console.warn;
    console.warn = () => {}; // the final build says the block's warnings once
    try { return build(at, copy); } finally { console.warn = warn; }
  };
  let at = target - ctx.dur.enter;
  for (let k = 0; k < 4; k++) {
    const off = arrival(probe(at)) - target;
    if (Math.abs(off) < 0.5 / FPS) break;
    at -= off;
  }
  at = Math.round(at * FPS * 1000) / (FPS * 1000);
  if (at < 0) throw new Error(`landOn: the entrance takes ${(target - at).toFixed(2)} s to arrive, so it cannot arrive by ${t.toFixed(2)} s from a start at 0 or later. Land it on a later time.`);
  return build(at, ctx);
}

/** The box a block draws with these props: build it as a scene does, then take boxOf its nodes. */
export function measureBlock<T extends Record<string, (p: never, ctx: Ctx) => Node[]>, K extends keyof T>(blocks: T, name: K, props: Parameters<T[K]>[0], ctx: Ctx): MeasuredBox {
  // A copy of the context: the blocks keep what they built per context (the hand-over of two texts in one place, a
  // list's selection), and a measured block is not part of the scene. Built with the scene's own context, it stayed
  // as a phantom text that the next block in its place had to hand over from.
  const copy = { ...ctx };
  MEASURING.add(copy);
  const nodes = blocks[name]!(props as never, copy);
  // fitText sets its lines at one static scale: its box is the fitted one. (kineticWords scales each phrase on its
  // own; its box stays the unscaled line boxes, which its scenes already stack by.)
  const b = boxOf(ctx, nodes, name === "fitText");
  if (!b) throw new Error(`measure: ${String(name)} draws nothing with these props`);
  const wrapped = nodes.filter((n) => n.kind === "anchor" && Number(n.data?.rows ?? 1) > 1).length;
  return wrapped ? { ...b, wrapped } : b;
}
