// Rope: an open rope from a fixed end, over and under pulleys, to a free end (a hoist, a crane, a block and tackle).
// Its strands change length as the wheels and the free end move. `belt` is the closed loop; this is the open run.
//
// Rules this block enforces:
// - The run is a list of stops: a point (the anchor, the free end; `follow` keys when it moves) or a wheel (the nodes
//   of a `pulley`, or of a circle `shape`) with the way the rope turns round it ("cw" or "ccw", clockwise as a viewer
//   sees it). The first and the last stop are points.
// - Each strand is the common tangent from one stop to the next, so it meets each wheel at right angles to the radius,
//   on the side the turn gives. Each wrap is an arc of the wheel's groove between the strand that comes in and the one
//   that goes out.
// - As the wheels and the ends move, each strand keeps its direction (parallel strands, as in a hoist): its end slides
//   along its own line and the strand grows or shrinks; each wrap rides with its wheel. A strand that would turn
//   throws and names it. The keys are on each frame of the motion, so the rope stays on its wheels in both renderers.
// - `light` lights a part of the run in the accent (the active path): the strands from stop `from` to stop `to` and
//   the wraps between them, at twice the rope's weight (a hairline in the accent is lost on a phone), as one accent
//   element (its nodes share one group).
// - It names each strand: anchor `<id>-s<i>-line` (data x1 y1 x2 y2, at rest), so labels keep clear of it.
import { px } from "../context";
import type { ColorRole } from "../roles";
import type { Block, Key, Node } from "../types";
import { vocabulary } from "../vocabulary";
import { keyAt } from "./figure";
import { boxOf, motionSpans, motionTimes, moved, shapeOf } from "./parts";
import { onOff } from "./shape";
import type { Follow } from "./callout";

export type RopeStop = { x: number; y: number; follow?: Follow } | { wheel: Node[]; turn: "cw" | "ccw" };

export type RopeProps = {
  id?: string;
  /** The stops from the fixed end to the free end (see the header). */
  run: RopeStop[];
  color?: ColorRole;
  /** The stroke as a multiple of the system stroke. Default 1. */
  weight?: number;
  /** The active path: stops `from` to `to` light in `color` (default "accent") at `at`. */
  light?: { from: number; to: number; at: number; color?: ColorRole };
  at: number;
  until?: number;
};

type P = { x: number; y: number };
type Circ = { c: P; s: number };

export const rope: Block<RopeProps> = (p, ctx) => {
  const id = p.id ?? "rope";
  const run = p.run;
  if (run.length < 2 || "wheel" in run[0]! || "wheel" in run[run.length - 1]!) throw new Error(`rope ${id}: the run needs a point at each end and at least two stops`);
  // Each stop's centre at rest, its signed radius (a point is a circle of 0), and its offset at time t.
  const stops = run.map((q, i) => {
    if (!("wheel" in q)) return { c: { x: q.x, y: q.y }, r: 0, sign: 0, at: (t: number) => ({ x: keyAt(q.follow?.x, t), y: keyAt(q.follow?.y, t) }), spans: motionSpans({ tracks: { x: q.follow?.x, y: q.follow?.y } }) };
    const g = q.wheel.find((n) => n.kind === "anchor" && n.id.endsWith("-groove"));
    const sh = shapeOf(q.wheel);
    const c = { x: sh.box.x + sh.box.w / 2, y: sh.box.y + sh.box.h / 2 };
    const r = g?.kind === "anchor" ? Number(g.data!.r) : sh.box.w / 2;
    if (sh.kind !== "circle") throw new Error(`rope ${id}: stop ${i} is a ${sh.kind}, not a wheel; give a pulley or a circle shape`);
    return { c, r, sign: q.turn === "cw" ? -1 : 1, at: (t: number) => { const m = moved(ctx, sh.node, c, t); return { x: m.x - c.x, y: m.y - c.y }; }, spans: motionSpans(sh.node) };
  });
  const times = [0, ...motionTimes(stops.flatMap((s) => s.spans).sort((a, b) => a[0] - b[0]))];
  // The common tangent from circle a to circle b (signed radii: the contact is c + s n, n the left normal of the run).
  const tangent = (a: Circ, b: Circ): [P, P] => {
    const dx = b.c.x - a.c.x, dy = b.c.y - a.c.y, d = Math.hypot(dx, dy), k = (a.s - b.s) / d;
    if (d < 1e-6 || Math.abs(k) > 1) throw new Error(`rope ${id}: two stops overlap, so no strand joins them`);
    const ux = dx / d, uy = dy / d, vx = -uy, vy = ux, m = Math.sqrt(1 - k * k);
    const nx = k * ux + m * vx, ny = k * uy + m * vy;
    return [{ x: a.c.x + a.s * nx, y: a.c.y + a.s * ny }, { x: b.c.x + b.s * nx, y: b.c.y + b.s * ny }];
  };
  const geometry = (t: number) => {
    const cs: Circ[] = stops.map((s) => { const o = s.at(t); return { c: { x: s.c.x + o.x, y: s.c.y + o.y }, s: s.sign * s.r }; });
    return cs.slice(1).map((b, i) => tangent(cs[i]!, b));
  };
  const rest = geometry(0);
  const all = times.map((t) => ({ t, g: geometry(t) }));
  const voc = vocabulary(ctx);
  const how = ctx.instant || voc.opaque || voc.text === "cut" ? "cut" : "fade";
  const sw = ctx.stroke * (p.weight ?? 1);
  const lin = (ks: Key[]) => ks.map((k, i) => (i ? { ...k, curve: "linear" as const } : k));
  const strand = (i: number, color: ColorRole, width: number, opacity: Key[], extra: Partial<Node> = {}): Node[] => {
    const [a0, b0] = rest[i]!;
    const L = (g: [P, P]) => Math.hypot(g[1].x - g[0].x, g[1].y - g[0].y);
    const ux = (b0.x - a0.x) / L(rest[i]!), uy = (b0.y - a0.y) / L(rest[i]!);
    for (const { t, g } of all) {
      const [a, b] = g[i]!, l = L(g[i]!);
      if (l > 1 && Math.abs(((b.x - a.x) / l) * uy - ((b.y - a.y) / l) * ux) > 0.01)
        throw new Error(`rope ${id}: strand ${i} (stop ${i} to stop ${i + 1}) turns at ${t.toFixed(2)} s as the parts move; the rope keeps each strand's direction (parallel strands), so move the wheels along their strands`);
    }
    const Lmax = Math.max(...all.map(({ g }) => L(g[i]!)));
    const moving = times.length > 1;
    const tracks = moving ? {
      x: lin(all.map(({ t, g }) => ({ t, v: Math.round((g[i]![0].x - a0.x) * 100) / 100 }))),
      y: lin(all.map(({ t, g }) => ({ t, v: Math.round((g[i]![0].y - a0.y) * 100) / 100 }))),
      draw: lin(all.map(({ t, g }) => ({ t, v: Math.round((L(g[i]!) / Lmax) * 1e4) / 1e4 }))),
    } : {};
    const end = { x: a0.x + ux * Lmax, y: a0.y + uy * Lmax };
    return [{ id: `${extra.id ?? `${id}-s${i}`}`, kind: "path", d: `M${px(a0.x)} ${px(a0.y)}L${px(end.x)} ${px(end.y)}`, stroke: color, width, cap: "butt", box: boxOf([a0, end]), ...extra, tracks: { opacity, ...tracks } } as Node];
  };
  const wrap = (j: number, color: ColorRole, width: number, opacity: Key[], extra: Partial<Node> = {}): Node[] => {
    const s = stops[j]!, from = rest[j - 1]![1], to = rest[j]![0];
    const ang = (q: P) => Math.atan2(q.y - s.c.y, q.x - s.c.x);
    const TAU = 2 * Math.PI, cw = s.sign < 0;
    const span = ((cw ? ang(to) - ang(from) : ang(from) - ang(to)) % TAU + TAU) % TAU;
    if (span < 1e-3) return [];
    const d = `M${px(from.x)} ${px(from.y)}A${s.r} ${s.r} 0 ${span > Math.PI ? 1 : 0} ${cw ? 1 : 0} ${px(to.x)} ${px(to.y)}`;
    const moving = s.spans.length > 0;
    const tracks = moving ? { x: lin(times.map((t) => ({ t, v: Math.round(s.at(t).x * 100) / 100 }))), y: lin(times.map((t) => ({ t, v: Math.round(s.at(t).y * 100) / 100 }))) } : {};
    const pts = Array.from({ length: 17 }, (_, k) => { const a = ang(from) + (cw ? 1 : -1) * (span * k) / 16; return { x: s.c.x + s.r * Math.cos(a), y: s.c.y + s.r * Math.sin(a) }; });
    return [{ id: `${extra.id ?? `${id}-w${j}`}`, kind: "path", d, stroke: color, width, cap: "butt", box: boxOf(pts), ...extra, tracks: { opacity, ...tracks } } as Node];
  };
  const on = onOff(ctx, p.at, p.until, how, how);
  const out: Node[] = [];
  for (let i = 0; i < rest.length; i++) {
    if (i > 0) out.push(...wrap(i, p.color ?? "ink", sw, on));
    out.push(...strand(i, p.color ?? "ink", sw, on));
    const [a, b] = rest[i]!;
    out.push({ id: `${id}-s${i}-line`, kind: "anchor", x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y), at: p.at, data: { x1: a.x, y1: a.y, x2: b.x, y2: b.y } });
  }
  if (p.light) {
    const { from, to } = p.light;
    if (!(from >= 0 && to < run.length && to > from)) throw new Error(`rope ${id}: light from ${from} to ${to} is not a part of the run (stops 0 to ${run.length - 1})`);
    const lit = onOff(ctx, Math.max(p.at, p.light.at), p.until, how, how), c = p.light.color ?? "accent", group = `${id}-lit`;
    for (let i = from; i < to; i++) {
      if (i > from) out.push(...wrap(i, c, 2 * sw, lit, { id: `${id}-lit-w${i}`, group, z: 2 }));
      out.push(...strand(i, c, 2 * sw, lit, { id: `${id}-lit-s${i}`, group, z: 2 }));
    }
  }
  return out;
};

/** The rope's length over its straight strands at time t, px (the wraps keep their length as strands stay parallel). */
export function ropeStrandLength(nodes: Node[], t: number): number {
  return nodes.filter((n) => n.kind === "path" && /-s\d+$/.test(n.id) && !/-lit-/.test(n.id)).reduce((sum, n) => {
    const m = (n as { d: string }).d.match(/M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)/)!;
    const L = Math.hypot(Number(m[3]) - Number(m[1]), Number(m[4]) - Number(m[2]));
    return sum + L * (n.tracks?.draw ? keyAt(n.tracks.draw, t) : 1);
  }, 0);
}
