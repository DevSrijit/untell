// Belt: a chain or a belt round two pulleys or sprockets, on their pitch circles. Use it with `gear`.
//
// Rules this block enforces:
// - The runs are the two outer tangents of the pitch circles. Each touches its circle at one point, at right
//   angles to the radius there, and never cuts through a circle. `outerTangents` computes them for any sizes
//   and any order (the small circle left, right, above, or equal radii); gear.test.ts proves it.
// - The wraps are arcs about each circle's own centre, round the far side of that circle (away from the other
//   one). The arc flags come from the true angles, so an arc never takes the mirror circle. The Schematic
//   reel's chain cut through its ring because of a tangent sign and these flags.
// - Two circles that overlap, or one inside the other, have no belt: the block throws and says so.
// - It draws on from the top run's start along the path (stroke reveal), or cuts in a one-frame system. A
//   chain shows its links as a dash at the link pitch (`links`, px). It is the subject's colour (accent) by
//   default: on a drive, the chain is what carries the motion.
// - It names its runs: anchors `<id>-top` and `<id>-bottom` (the run's box, data x1 y1 x2 y2), for labels.
import { go, present, px, seq } from "../context";
import type { ColorRole } from "../roles";
import type { Block, Node } from "../types";
import type { Pt } from "./gear";

export type Circle = { x: number; y: number; r: number };

export type BeltProps = {
  id?: string;
  /** The two pitch circles (centre and radius, px). */
  a: Circle; b: Circle;
  color?: ColorRole;
  /** Stroke width as a multiple of the system stroke. Default 1.5. */
  weight?: number;
  /** The link pitch in px: the chain shows as dashes of this pitch. Default: a plain belt. */
  links?: number;
  at: number;
  until?: number;
};

/**
 * The two outer tangents of circles a and b: for each side, the touch point on a and on b. "left" is the run
 * on the left of the direction from a to b (the upper run on screen when b is right of a).
 */
export function outerTangents(a: Circle, b: Circle): { left: [Pt, Pt]; right: [Pt, Pt] } {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  if (d <= Math.abs(a.r - b.r) + 1e-9 || d < 1e-9) throw new Error(`belt: one circle is inside the other (centres ${d.toFixed(1)} px apart, radii ${a.r} and ${b.r}); there is no outer tangent`);
  const ux = dx / d, uy = dy / d;
  // The common normal n: n . u = (ra - rb) / d. The touch points are c + r n on both circles.
  const cos = (a.r - b.r) / d, sin = Math.sqrt(Math.max(0, 1 - cos * cos));
  const side = (s: 1 | -1): [Pt, Pt] => {
    // Screen y points down, so (uy, -ux) is the left of u as a viewer sees it.
    const nx = ux * cos + s * uy * sin, ny = uy * cos - s * ux * sin;
    return [[a.x + a.r * nx, a.y + a.r * ny], [b.x + b.r * nx, b.y + b.r * ny]];
  };
  return { left: side(1), right: side(-1) };
}

/** The SVG flags for an arc on circle c from p to q that passes through `via`, a point on the circle. */
export function arcFlags(c: Circle, p: Pt, q: Pt, via: Pt): { large: 0 | 1; sweep: 0 | 1; span: number } {
  const ang = (pt: Pt) => Math.atan2(pt[1] - c.y, pt[0] - c.x);
  const TAU = 2 * Math.PI;
  const norm = (x: number) => ((x % TAU) + TAU) % TAU;
  const pos = norm(ang(q) - ang(p)); // the span going the way SVG calls sweep 1 (angle grows; clockwise on screen)
  const viaPos = norm(ang(via) - ang(p));
  const sweep = viaPos <= pos ? 1 : 0;
  const span = sweep ? pos : TAU - pos;
  return { large: span > Math.PI ? 1 : 0, sweep, span };
}

/** The closed belt path: the left run from a to b, the wrap round b's far side, the right run back, the wrap round a's far side. */
export function beltGeometry(a: Circle, b: Circle) {
  const t = outerTangents(a, b);
  const d = Math.hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / d, uy = (b.y - a.y) / d;
  const farA: Pt = [a.x - a.r * ux, a.y - a.r * uy], farB: Pt = [b.x + b.r * ux, b.y + b.r * uy];
  const [a1, b1] = t.left, [a2, b2] = t.right;
  const wb = arcFlags(b, b1, b2, farB), wa = arcFlags(a, a2, a1, farA);
  const P = (p: Pt) => `${px(p[0])} ${px(p[1])}`;
  const d_ = `M${P(a1)}L${P(b1)}A${px(b.r)} ${px(b.r)} 0 ${wb.large} ${wb.sweep} ${P(b2)}L${P(a2)}A${px(a.r)} ${px(a.r)} 0 ${wa.large} ${wa.sweep} ${P(a1)}Z`;
  const run = Math.hypot(b1[0] - a1[0], b1[1] - a1[1]);
  return { d: d_, left: t.left, right: t.right, length: 2 * run + wb.span * b.r + wa.span * a.r, wraps: { a: wa, b: wb } };
}

export const belt: Block<BeltProps> = (p, ctx) => {
  const id = p.id ?? "belt";
  const g = beltGeometry(p.a, p.b);
  const xs = [p.a.x - p.a.r, p.a.x + p.a.r, p.b.x - p.b.r, p.b.x + p.b.r], ys = [p.a.y - p.a.r, p.a.y + p.a.r, p.b.y - p.b.r, p.b.y + p.b.r];
  const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  const draw = ctx.instant ? {} : { draw: seq(go(ctx, p.at, 0, 1, ctx.noOvershoot("move"), 1.5, "move")) };
  // A chain: dash and gap at half the link pitch each, so the pattern repeats once per link.
  const dash: [number, number] | undefined = p.links ? [p.links * 0.5, p.links * 0.5] : undefined;
  const out: Node[] = [{ id: `${id}-path`, kind: "path", d: g.d, stroke: p.color ?? "accent", width: ctx.stroke * (p.weight ?? 1.5), cap: "butt", join: "round",
    ...(dash ? { dash } : {}), box, tracks: { ...present(p.at, p.until), ...draw } }];
  for (const [name, [s, e]] of [["top", g.left], ["bottom", g.right]] as const) {
    out.push({ id: `${id}-${name}`, kind: "anchor", x: Math.min(s[0], e[0]), y: Math.min(s[1], e[1]), w: Math.abs(e[0] - s[0]), h: Math.abs(e[1] - s[1]), at: p.at,
      data: { x1: s[0], y1: s[1], x2: e[0], y2: e[1] } });
  }
  return out;
};
