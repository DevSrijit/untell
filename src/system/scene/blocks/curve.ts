// Curve: a plain drawn curve, from a function or from points: a parabola, a trajectory, a cable, a profile. An agent's Spec
// film built its parabola from raw path nodes because no block drew a plain curve (lineChart brings axes and a title,
// arrow ends in a head).
//
// Rules this block enforces:
// - The line is the system's stroke (times `weight`), in a colour role ("ink" by default), with round ends. It draws from
//   its first point to its last on a curve that never overshoots (`draw`), or shows whole in one frame (`enter: "cut"`,
//   and always in a one-frame system).
// - A function is sampled at 96 points over `domain` and mapped into `box` with y up: `range` is the value at the box's
//   foot and at its top (default: the function's own least and greatest value over the domain). Points are frame px.
// - The path is smooth: a Catmull-Rom spline through the samples, written as cubic Beziers.
// - `curvePoints` gives the same points, for a callout's `points` (what its label keeps clear of) and its `target`.
// - At `until` the line fades out (or cuts, `exit: "cut"`).
import { cut, px, seq } from "../context";
import type { ColorRole } from "../roles";
import type { Block, Ctx, Node } from "../types";
import { drawKeys, shown } from "./rule";

export type CurveProps = {
  id?: string;
  /** y = fn(x), sampled over `domain` and mapped into `box`. Give `fn` or `points`. */
  fn?: (x: number) => number;
  /** The x values of fn at the box's left and right edges. Default [0, 1]. */
  domain?: [number, number];
  /** The y values at the box's foot and top. Default: the least and greatest value of fn over the domain. */
  range?: [number, number];
  /** The box fn is drawn in, px. */
  box?: { x: number; y: number; w: number; h: number };
  /** Instead of fn: the points of the curve in frame px, in drawing order (a trace on a photo: photo's traceOn). */
  points?: [number, number][];
  /** Default "ink". */
  color?: ColorRole;
  /** A multiple of the system stroke. Default 1. */
  weight?: number;
  dash?: boolean;
  /** "draw" (default) or "cut": the whole curve in one frame. */
  enter?: "draw" | "cut";
  exit?: "fade" | "cut";
  /** How long it takes to draw: "move" (default) or the faster "enter". */
  pace?: "move" | "enter";
  layer?: number;
  at: number;
  until?: number;
};

const SAMPLES = 96;

/** The points the curve passes through, in frame px. */
export function curvePoints(p: Pick<CurveProps, "fn" | "domain" | "range" | "box" | "points">): [number, number][] {
  if (p.points) return p.points;
  if (!p.fn || !p.box) throw new Error("curve: give fn and box, or points");
  const [d0, d1] = p.domain ?? [0, 1];
  const xs = Array.from({ length: SAMPLES + 1 }, (_, i) => d0 + ((d1 - d0) * i) / SAMPLES);
  const ys = xs.map((x) => p.fn!(x));
  if (ys.some((y) => !Number.isFinite(y))) throw new Error("curve: fn gives a value that is not a finite number over the domain");
  const [r0, r1] = p.range ?? [Math.min(...ys), Math.max(...ys)];
  const span = r1 - r0 || 1, b = p.box;
  return xs.map((x, i) => [b.x + ((x - d0) / (d1 - d0)) * b.w, b.y + b.h - ((ys[i]! - r0) / span) * b.h]);
}

/** A smooth path through points: Catmull-Rom as cubic Beziers. */
export function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) throw new Error("curve: a curve needs two points or more");
  let d = `M${px(pts[0]![0])} ${px(pts[0]![1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${px(c1[0]!)} ${px(c1[1]!)} ${px(c2[0]!)} ${px(c2[1]!)} ${px(p2[0])} ${px(p2[1])}`;
  }
  return d;
}

export const curve: Block<CurveProps> = (p, ctx: Ctx) => {
  const id = p.id ?? "curve";
  const pts = curvePoints(p);
  const width = ctx.stroke * (p.weight ?? 1);
  const opacity = p.exit === "cut" ? seq(cut(p.at, 0, 1), p.until !== undefined && cut(p.until, 1, 0)) : shown(ctx, p.at, p.until);
  const draw = p.enter === "cut" ? [{ t: 0, v: 1 }] : drawKeys(ctx, p.at, p.pace ?? "move");
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  return [{ id, kind: "path", d: smoothPath(pts), stroke: p.color ?? "ink", width, cap: "round", join: "round", box,
    dash: p.dash ? [ctx.stroke * 4, ctx.stroke * 3] : undefined, layer: p.layer, tracks: { draw, opacity } } as Node];
};

