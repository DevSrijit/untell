// Arrow: a line from one point to another that draws itself and ends in an arrowhead.
// Use it to point at a thing, to show that one thing leads to another, or as a pointer in a diagram.
//
// Rules this block enforces:
// - The line is straight, or a gentle curve with `bend` (a fraction of its length, positive bends left).
// - It stops `gap` px short of both ends, so it never touches the things it joins.
// - It draws from its start on a curve that never overshoots; the head appears as the line arrives.
// - Its width is the system stroke (or a multiple of it); a key arrow is heavier, not only coloured.
// - It draws in the overlay layer by default, so a panel or a box never hides it.
// - `follow` (x and y keys, as from followPoint) carries the whole arrow with a moving point: a force arrow stays on
//   the end of a beam that turns.
// - It names its shaft as a segment (anchor `<id>-shaft`, data x1 y1 x2 y2), so a label that avoids it keeps clear.
import { appear, go, px } from "../context";
import type { ColorRole } from "../roles";
import type { Block, Node } from "../types";
import { arrowHead, arrowSize } from "./flow";
import { followTracks, type Follow } from "./callout";

export type ArrowProps = {
  id?: string;
  from: [number, number];
  to: [number, number];
  /** Curvature as a fraction of the length; 0 is straight. Positive bends to the left of the direction. */
  bend?: number;
  /** Space left free at each end, px. Default: half the arrowhead length. */
  gap?: number;
  color?: ColorRole;
  /** Marks the key arrow: a heavier line. */
  key?: boolean;
  /** Draw a head at the start too. */
  both?: boolean;
  /** The keys of a moving point (followPoint), so the arrow rides with it. */
  follow?: Follow;
  layer?: number;
  at: number;
  until?: number;
};

export const arrow: Block<ArrowProps> = (p, ctx) => {
  const id = p.id ?? "arrow";
  const { len, half } = arrowSize(ctx);
  const gap = p.gap ?? len / 2;
  const [x0, y0] = p.from, [x1, y1] = p.to;
  const L = Math.hypot(x1 - x0, y1 - y0) || 1;
  const ux = (x1 - x0) / L, uy = (y1 - y0) / L;
  const a: [number, number] = [x0 + ux * gap, y0 + uy * gap];
  const b: [number, number] = [x1 - ux * gap, y1 - uy * gap];
  const bend = p.bend ?? 0;
  // The control point sits off the middle, square to the line.
  const c: [number, number] = [(a[0] + b[0]) / 2 - uy * bend * L, (a[1] + b[1]) / 2 + ux * bend * L];
  // The head points along the curve's end tangent, and the line stops at the head's base.
  const tan = bend ? [b[0] - c[0], b[1] - c[1]] : [ux, uy];
  const tl = Math.hypot(tan[0]!, tan[1]!) || 1;
  const tx = tan[0]! / tl, ty = tan[1]! / tl;
  const end: [number, number] = [b[0] - tx * len * 0.8, b[1] - ty * len * 0.8];
  const d = bend ? `M${px(a[0])} ${px(a[1])}Q${px(c[0])} ${px(c[1])} ${px(end[0])} ${px(end[1])}` : `M${px(a[0])} ${px(a[1])}L${px(end[0])} ${px(end[1])}`;
  const w = ctx.stroke * (p.key ? 2 : 1);
  const color = p.color ?? "ink";
  const layer = p.layer ?? 1;
  const drawEnd = p.at + (ctx.instant ? 1 / 30 : ctx.dur.move);
  const ride = followTracks(p.follow);
  const out: Node[] = [
    { id: `${id}-line`, kind: "path", d, stroke: color, width: w, cap: "round", join: "round", layer,
      tracks: { ...appear(ctx, p.at, p.until, 0), draw: go(ctx, p.at, 0, 1, ctx.noOvershoot("move"), 1, "move"), ...ride } },
    { id: `${id}-head`, kind: "path", d: arrowHead(b, [b[0] - tx, b[1] - ty], len, half), fill: color, layer,
      tracks: { ...appear(ctx, drawEnd - (ctx.instant ? 0 : ctx.dur.stagger), p.until, 0), ...ride } },
  ];
  if (p.both) {
    const sx = bend ? c[0] - a[0] : ux, sy = bend ? c[1] - a[1] : uy;
    const sl = Math.hypot(sx, sy) || 1;
    out.push({ id: `${id}-tail`, kind: "path", d: arrowHead(a, [a[0] + sx / sl, a[1] + sy / sl], len, half), fill: color, layer,
      tracks: { ...appear(ctx, p.at, p.until, 0), ...ride } });
    // The line starts at the tail's base, not under it.
    const first = out[0] as Extract<Node, { kind: "path" }>;
    const st: [number, number] = [a[0] + (sx / sl) * len * 0.8, a[1] + (sy / sl) * len * 0.8];
    first.d = bend ? `M${px(st[0])} ${px(st[1])}Q${px(c[0])} ${px(c[1])} ${px(end[0])} ${px(end[1])}` : `M${px(st[0])} ${px(st[1])}L${px(end[0])} ${px(end[1])}`;
  }
  out.push({ id: `${id}-shaft`, kind: "anchor", x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]), at: p.at,
    data: { x1: a[0], y1: a[1], x2: b[0], y2: b[1] } });
  return out;
};
