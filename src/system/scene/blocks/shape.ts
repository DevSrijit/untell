// Shape: a circle, a square, a rectangle, a triangle or a sector (a wedge of a disc), filled or
// outlined, that enters by growing, drawing its outline, sliding in from an edge, a fade or a cut, and can
// turn in steps or move to a new place.
// Use it for geometric explanation (Primary, Cutout), pictograms, and simple marks.
//
// Rules this block enforces:
// - Shapes are flat: a fill role or an outline in the system stroke. No gradient, no shadow.
// - "grow" scales from the shape's centre on a curve that never overshoots when the shape stands for a
//   quantity (`exact`); otherwise it uses the system's enter curve, so Pop's shapes may overshoot.
// - "draw" draws the outline from its first corner; a fill, if any, fades in as the outline closes.
// - "slide" enters from the frame edge that `from` names ("left", "right", "top", "bottom"); with no `from`, from
//   the nearer side edge. It enters on the enter curve.
// - "cut" stamps the shape whole in one frame, with no fade and no motion, as a print or a cut does.
//   With `until` it also leaves in one frame. The switch falls half a frame before a frame, so both
//   renderers show it on the same frame.
// - "sector": a wedge of the disc that fits the box, from `angles[0]` to `angles[1]` in degrees,
//   clockwise from 12 o'clock. A half disc is a sector of 180 degrees: [-90, 90] is the top half.
//   "draw" outlines it from the centre.
// - `turns` rotate the shape in steps (90 degrees for Primary's grammar) at given times, from `angle` (the start
//   angle, default 0), about `pivot`: a named point of the outline ("apex", "base", "bottom-left"...), fractions of
//   the box, or a point in px. Default: the centre, or the point the shape rests on (`on`). A beam turns about the
//   fulcrum's apex with `on: { part: fulcrum, at: "apex" }` and no hand-computed move. Each step (a turn or a move)
//   takes the move time: steps closer than that throw with the two steps and the gap. A step before 0 has ended by
//   frame 0, as every block's keys fold.
// - `on: { part, at }`: the shape rests on a point of another shape (the nodes that shape returned) and rides with
//   it when the part moves or turns: flush on it, turning with it about the same point (a load on a beam's end), or,
//   with `upright: true`, upright on the point (a weight that hangs from a pin). The block warns when the point is not
//   on both outlines at rest (a gap or an overlap), and names the joint (anchor `<id>-on`) so the detector's `joint`
//   check can measure, on every frame of the render, that the shape stays on the part. `on` and `moves` do not mix.
// - The outline of a triangle is equilateral: √3/2 of its side tall, centred in its square box, so a gap of about
//   6.7 % of the side stays above the apex and under the base. Take its points from pointOf(nodes, "apex") or
//   "base" (blocks/parts.ts), not from the box.
// - It names its geometry (anchor `<id>-shape`: the kind and the drawn box), so pointOf, pointAt, followPoint and
//   `figure` can read it.
// - `moves` carry it to new places at given times, on the move curve. `to` is an offset from the drawn box;
//   `by` is a step from the place before. Both are px. The two names say which one a scene means.
// - "fade": opacity only, no scale and no move (Ma, Nocturne: a quiet arrival).
// - The default entrance comes from the system's vocabulary (scene/vocabulary.ts): "fade" in Ma and
//   Nocturne, "cut" in Cutout, Riso and Primary, "grow" elsewhere.
// - In an opaque system (Cutout, Riso, Primary) a shape is never half seen: "grow" and "slide" are at full
//   opacity from their first frame, a drawn shape's fill stamps on as the outline closes, and the shape
//   leaves in one frame at `until`.
// - In a one-frame system, every change happens in one frame.
import { appear, go, px, seq, windows } from "../context";
import { vocabulary, type ShapeEnter } from "../vocabulary";
import type { ColorRole } from "../roles";
import type { Block, Ctx, Key, Node } from "../types";
import { followPoint, motionSpans, offOutline, pointIn, pointOf, shapeOf, type ShapePoint } from "./parts";

export type ShapeProps = {
  id?: string;
  kind: "circle" | "square" | "rect" | "triangle" | "sector";
  /** For a sector: the start and end angle in degrees, clockwise from 12 o'clock. Default [0, 180] (the right half). */
  angles?: [number, number];
  /** The shape's box in px. A circle and a square use the smaller side. */
  x: number; y: number; w: number; h: number;
  fill?: ColorRole;
  stroke?: ColorRole;
  /** Outline width as a multiple of the system stroke. Default 1. */
  weight?: number;
  /** Default: the system's vocabulary. */
  enter?: ShapeEnter;
  /** For `enter: "slide"`: the frame edge it enters from. Default: the side edge nearer the shape's centre. */
  from?: "left" | "right" | "top" | "bottom";
  /** The shape stands for a quantity: never overshoot. */
  exact?: boolean;
  /**
   * Rotations about `pivot`, in degrees, each at a time, in time order. Each turn takes the system's move time
   * (one frame in a one-frame system), so two turns need at least that gap: closer ones throw with the two turns and
   * the gap. A turn before 0 has ended by frame 0, so the shape is at rest there, turned.
   */
  turns?: { at: number; by: number }[];
  /** The angle in degrees, clockwise, that the shape rests at from frame 0, before any turn. Default 0. */
  angle?: number;
  /**
   * The point the shape turns about: a named point of its outline ("centre", "apex", "base", "top-left"...), fractions
   * of its box ([0, 0] top-left, [1, 1] bottom-right), or a point in px. Default: the point it rests on (`on`), else
   * the centre.
   */
  pivot?: ShapePoint;
  /**
   * The shape rests on a point of another shape and rides with it: `part` is the nodes that shape returned, `at` a
   * point of that part (a name, fractions of its box, or px). Place the shape so the point is on its own edge too (a
   * load's base on the beam's top): pointOf(part, at) gives the point. When the part turns, the shape turns with it,
   * flush on it, about the same point; with `upright: true` it stays upright and only rides on the point (a weight that
   * hangs from a pin).
   */
  on?: { part: Node[]; at: ShapePoint; upright?: boolean };
  /**
   * Squash and stretch (Pop): at each time the shape squashes onto its base (wider and lower), then springs back on the
   * system's enter curve, past its size and back (an overshoot where the system has one). The shape scales about its
   * base, so it lands rather than pulses.
   */
  squash?: number[];
  /** Rounded corners for a rect or a square, px. */
  radius?: number;
  /**
   * Moves to new places, each at a time, in time order, on the move curve. Give each move one of two forms:
   * - `to: [dx, dy]`: the place as an offset in px from where the shape is drawn (its box). A list of places
   *   is what a scene knows, so this is the form to use.
   * - `by: [dx, dy]`: a step in px from the place before.
   * `dx` and `dy` alone are the old form: a step from the place before, as `by`. The block warns on them.
   */
  moves?: { at: number; to?: [number, number]; by?: [number, number]; dx?: number; dy?: number }[];
  layer?: number;
  z?: number;
  at: number;
  until?: number;
};

/** Opacity keys that switch in one frame: on at frameOf(at), the first frame after `at` (frame 0 for `at` at 0 or
 *  before), and off at frameOf(until), one frame after the on at the least. The rule every block keeps (context.ts). */
export function stamped(at: number, until?: number): Key[] {
  return windows([[at, until]]);
}

/** Opacity keys for a thing that comes on at `at` and goes off at `until`, each side by a fade (the system's
 *  enter or exit duration) or a cut (one frame, as `stamped`). With `at` at 0 or before, it is on from frame 0.
 *  An entrance fade that does not fit before `until` becomes a cut. */
export function onOff(ctx: Ctx, at: number, until: number | undefined, enter: "fade" | "cut", exit: "fade" | "cut"): Key[] {
  // A thing that leaves before it comes never shows.
  if (until !== undefined && until <= at) return [{ t: 0, v: 0 }];
  // A fade longer than the time the thing is on would end after it leaves: cut it instead, so keys stay in order.
  const cutOn = enter === "cut" || at <= 0 || ctx.instant || (until !== undefined && until - at < ctx.dur.enter);
  const cutOff = exit === "cut" || ctx.instant;
  if (cutOn && (cutOff || until === undefined)) return stamped(at, until);
  const on = cutOn ? stamped(at) : appear(ctx, at, undefined, 0).opacity!;
  if (until === undefined) return on;
  return cutOff ? [...on, ...stamped(until).map((k) => ({ ...k, v: 1 - k.v })).slice(1)] : seq(on, go(ctx, until, 1, 0, "exit"));
}

/**
 * Timed steps that each tween over `need` s must not overlap: the keys would run out of time order. Throws an author
 * error that names the two closest steps and the gap they need. `after`: the end of an earlier track (an entrance)
 * that the first step must not start inside.
 */
export function spaced(id: string, what: string, ats: number[], need: number, after?: { t: number; what: string }) {
  if (after && ats.length && ats[0]! < after.t - 1e-9)
    throw new Error(`shape ${id}: ${what}[0] at ${ats[0]!.toFixed(3)} s starts before ${after.what} ends (${after.t.toFixed(3)} s). Give ${what}[0] an at of ${after.t.toFixed(3)} s or later.`);
  let worst = -1, gap = Infinity;
  for (let i = 1; i < ats.length; i++) { const g = ats[i]! - ats[i - 1]!; if (g < gap) { gap = g; worst = i; } }
  if (worst > 0 && gap < need - 1e-9)
    throw new Error(`shape ${id}: ${what}[${worst - 1}] at ${ats[worst - 1]!.toFixed(3)} s and ${what}[${worst}] at ${ats[worst]!.toFixed(3)} s are ${gap.toFixed(3)} s apart (the smallest gap); each step takes the system's move time, ${need.toFixed(3)} s. Give them at least ${need.toFixed(3)} s apart, or join them into one step.`);
}

export const shape: Block<ShapeProps> = (p, ctx) => {
  const id = p.id ?? "shape";
  const s = Math.min(p.w, p.h);
  const box = p.kind === "rect" ? { x: p.x, y: p.y, w: p.w, h: p.h } : { x: p.x + (p.w - s) / 2, y: p.y + (p.h - s) / 2, w: s, h: s };
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const voc = vocabulary(ctx);
  const asked = p.enter ?? voc.shape;
  const enter = ctx.instant ? "cut" : asked;
  // On and off: a fade, or (opaque systems) one frame at full opacity.
  const show = (at: number) => ({ opacity: voc.opaque ? stamped(at, p.until) : ctx.instant ? appear(ctx, at, p.until, 0).opacity! : onOff(ctx, at, p.until, "fade", "fade") });
  const width = ctx.stroke * (p.weight ?? 1);
  const fill = p.fill ?? (p.stroke ? undefined : "ink");
  // The point it rests on, and the point it turns about (as fractions of the box: both renderers read the origin so).
  const rest = p.on ? pointOf(p.on.part, p.on.at) : null;
  // A shape on a part that turns turns with it (rigid), about the part's own pivot, unless it stays upright.
  const host = p.on ? shapeOf(p.on.part) : null;
  const rigid = !!host && !p.on!.upright && motionSpans({ tracks: { rotate: host.node.tracks?.rotate } }).length > 0;
  if (rigid && p.turns?.length) throw new Error(`shape ${id}: it rests on ${host!.id}, which turns, so it turns with it; leave out turns, or give on.upright: true`);
  const hostPivot = host ? { x: host.box.x + host.box.w * host.origin[0], y: host.box.y + host.box.h * host.origin[1] } : null;
  const pv = rigid ? hostPivot : p.pivot !== undefined ? pointIn(p.kind, box, p.pivot) : rest;
  const pivotAt: [number, number] = pv ? [(pv.x - box.x) / box.w, (pv.y - box.y) / box.h] : [0.5, 0.5];
  if (p.on && p.moves?.length) throw new Error(`shape ${id}: it rests on a part (on), so it moves with that part; leave out moves, or leave out on`);
  if (p.on && enter === "slide") throw new Error(`shape ${id}: it rests on a part (on), so it cannot slide in; give enter "draw", "fade", "grow" or "cut"`);

  // The outline as a path, from the first corner (top for a circle and a triangle).
  let d: string;
  const [a0, a1] = p.angles ?? [0, 180];
  if (p.kind === "circle" || (p.kind === "sector" && Math.abs(a1 - a0) >= 360)) {
    const r = s / 2;
    d = `M${px(cx)} ${px(cy - r)}A${r} ${r} 0 1 1 ${px(cx)} ${px(cy + r)}A${r} ${r} 0 1 1 ${px(cx)} ${px(cy - r)}Z`;
  } else if (p.kind === "sector") {
    // From the centre out to the start angle, round the arc clockwise to the end angle, and back.
    const r = s / 2, lo = Math.min(a0, a1), span = Math.abs(a1 - a0);
    const at = (deg: number) => [cx + r * Math.sin((deg * Math.PI) / 180), cy - r * Math.cos((deg * Math.PI) / 180)] as const;
    const [x0, y0] = at(lo), [x1, y1] = at(lo + span);
    d = `M${px(cx)} ${px(cy)}L${px(x0)} ${px(y0)}A${r} ${r} 0 ${span > 180 ? 1 : 0} 1 ${px(x1)} ${px(y1)}Z`;
  } else if (p.kind === "triangle") {
    // An equilateral triangle sitting on the bottom of its box, centred.
    const tw = box.w, th = (tw * Math.sqrt(3)) / 2;
    const top = box.y + (box.h - th) / 2;
    d = `M${px(cx)} ${px(top)}L${px(box.x + tw)} ${px(top + th)}L${px(box.x)} ${px(top + th)}Z`;
  } else if (p.radius && p.radius > 0) {
    // A rect or a square with rounded corners (an arc at each corner, the radius at most half the short side).
    const r = Math.min(p.radius, box.w / 2, box.h / 2), x0 = box.x, y0 = box.y, x1 = box.x + box.w, y1 = box.y + box.h;
    d = `M${px(x0 + r)} ${px(y0)}H${px(x1 - r)}A${r} ${r} 0 0 1 ${px(x1)} ${px(y0 + r)}V${px(y1 - r)}A${r} ${r} 0 0 1 ${px(x1 - r)} ${px(y1)}H${px(x0 + r)}A${r} ${r} 0 0 1 ${px(x0)} ${px(y1 - r)}V${px(y0 + r)}A${r} ${r} 0 0 1 ${px(x0 + r)} ${px(y0)}Z`;
  } else {
    d = `M${px(box.x)} ${px(box.y)}H${px(box.x + box.w)}V${px(box.y + box.h)}H${px(box.x)}Z`;
  }

  // Tracks for the whole shape.
  const tr: Partial<Record<"opacity" | "scale" | "scaleX" | "scaleY" | "x" | "y" | "rotate", Key[]>> = {};
  if (enter === "grow") {
    Object.assign(tr, show(p.at));
    tr.scale = go(ctx, p.at, 0.001, 1, p.exact ? ctx.noOvershoot("enter") : "enter", 1, "enter");
  } else if (enter === "slide") {
    Object.assign(tr, show(p.at));
    // From the edge that `from` names (default: the nearer side edge), clear of the frame.
    const side = p.from ?? (cx < ctx.width / 2 ? "left" : "right");
    if (side === "left" || side === "right") tr.x = go(ctx, p.at, side === "left" ? -(box.x + box.w + 10) : ctx.width - box.x + 10, 0, "enter", 1.4);
    else tr.y = go(ctx, p.at, side === "top" ? -(box.y + box.h + 10) : ctx.height - box.y + 10, 0, "enter", 1.4);
  } else if (asked === "cut") {
    // "cut": whole in one frame, no fade.
    tr.opacity = stamped(p.at, p.until);
  } else {
    // "fade", "draw", and a one-frame system (appear() already switches in one frame there).
    Object.assign(tr, enter === "fade" && voc.opaque ? { opacity: onOff(ctx, p.at, p.until, "fade", "fade") } : show(p.at));
  }
  // Moves, then turns, appended after the entrance. Each move ends at an offset from the drawn box. Each step tweens
  // over the move time, so steps closer than that would overlap: an author error that names the two steps.
  // In a one-frame system a step is one frame: two steps on one frame would switch out of order.
  const step = ctx.instant ? 1 / 30 : ctx.dur.move;
  const entranceEnd = (k?: Key[]) => (k && k.length ? k[k.length - 1]!.t : -Infinity);
  if (p.moves?.length) {
    spaced(id, "moves", p.moves.map((m) => m.at), step, { t: entranceEnd(tr.x ?? tr.y), what: "the slide entrance" });
    // Before the first move the shape rests at the drawn box; a move before 0 has ended by frame 0 (the guard folds it).
    const rest = (k?: Key[]) => (k ? [...k] : p.moves![0]!.at > 0 ? [{ t: 0, v: 0 }] : []);
    const xs: Key[] = rest(tr.x), ys: Key[] = rest(tr.y);
    let ox = 0, oy = 0, old = false;
    p.moves.forEach((m, i) => {
      const forms = [m.to !== undefined, m.by !== undefined, m.dx !== undefined || m.dy !== undefined].filter(Boolean).length;
      if (forms !== 1) throw new Error(`shape ${id}: moves[${i}] needs one of to: [dx, dy] (an offset from the drawn box) or by: [dx, dy] (a step from the place before)`);
      const [nx, ny] = m.to ?? (m.by ? [ox + m.by[0], oy + m.by[1]] : [ox + (m.dx ?? 0), oy + (m.dy ?? 0)]);
      old ||= m.to === undefined && m.by === undefined;
      xs.push(...go(ctx, m.at, ox, nx, "move"));
      ys.push(...go(ctx, m.at, oy, ny, "move"));
      ox = nx; oy = ny;
    });
    if (old) console.warn(`shape ${id}: moves with dx and dy step from the place before (as by). Write to: [dx, dy] for an offset from the drawn box, or by: [dx, dy] for a step`);
    tr.x = xs; tr.y = ys;
  }
  if (p.on && rigid) {
    // Flush on a turning part: the part's own place and turn, about the part's pivot.
    const k = host!.node.tracks ?? {};
    if (k.x) tr.x = k.x.map((q) => ({ ...q }));
    if (k.y) tr.y = k.y.map((q) => ({ ...q }));
    tr.rotate = k.rotate!.map((q) => ({ ...q }));
  } else if (p.on) {
    const f = followPoint(ctx, p.on.part, p.on.at);
    if (f.x) tr.x = f.x;
    if (f.y) tr.y = f.y;
  }
  if (p.turns?.length) {
    spaced(id, "turns", p.turns.map((t) => t.at), step);
    let r = p.angle ?? 0;
    // At rest at its start angle until the first turn; a turn before 0 has ended by frame 0 (the guard folds it).
    const rs: Key[] = p.turns[0]!.at > 0 ? [{ t: 0, v: r }] : [];
    for (const t of p.turns) { rs.push(...go(ctx, t.at, r, r + t.by, "move")); r += t.by; }
    tr.rotate = rs;
  } else if (p.angle) tr.rotate = [{ t: 0, v: p.angle }];

  // Squash and stretch: the scale becomes two tracks (x and y), so the squash can make it wider and lower at once.
  // In a one-frame system there is no squash (nothing tweens).
  let origin: [number, number] = pivotAt;
  const sq: { scaleX?: Key[]; scaleY?: Key[] } = {};
  if (p.squash?.length && !ctx.instant) {
    const base = tr.scale ?? [{ t: 0, v: 1 }];
    delete tr.scale;
    const sx: Key[] = [...base], sy: Key[] = [...base];
    const hit = Math.max(2 / 30, ctx.dur.enter * 0.35);
    const times = [...p.squash].sort((a, b) => a - b);
    spaced(id, "squash", times, hit + ctx.dur.enter, { t: entranceEnd(base), what: "the grow entrance" });
    for (const t of times) {
      sx.push({ t, v: 1 }, { t: t + hit, v: 1.14, curve: ctx.noOvershoot("enter") }, { t: t + hit + ctx.dur.enter, v: 1, curve: "enter" });
      sy.push({ t, v: 1 }, { t: t + hit, v: 0.84, curve: ctx.noOvershoot("enter") }, { t: t + hit + ctx.dur.enter, v: 1, curve: "enter" });
    }
    sq.scaleX = sx; sq.scaleY = sy;
    if (!p.turns?.length && !p.angle && p.pivot === undefined) origin = [0.5, 1];
  }
  Object.assign(tr, sq);
  const shapeBox = { x: box.x, y: box.y, w: box.w, h: box.h };
  const out: Node[] = [];
  if (enter === "draw") {
    if (fill) out.push({ id: `${id}-fill`, kind: "path", d, fill, layer: p.layer, z: p.z, box: shapeBox, origin: pivotAt,
      tracks: { ...tr, opacity: show(p.at + (ctx.instant ? 0 : ctx.dur.move * 0.7)).opacity } });
    out.push({ id: `${id}-line`, kind: "path", d, stroke: p.stroke ?? fill ?? "ink", width, join: "round", layer: p.layer, z: (p.z ?? 0) + 1, box: shapeBox, origin: pivotAt,
      tracks: { ...tr, draw: go(ctx, p.at, 0, 1, ctx.noOvershoot("move"), 1.2, "move") } });
  } else {
    out.push({ id, kind: "path", d, fill, stroke: p.stroke, width: p.stroke ? width : undefined, join: "round", layer: p.layer, z: p.z, box: shapeBox, origin, tracks: tr });
  }
  // Its geometry, for pointOf and figure; and the joint, for the joint check.
  const main = enter === "draw" ? `${id}-line` : id;
  out.push({ id: `${id}-shape`, kind: "anchor", ...shapeBox, at: p.at, data: { kind: p.kind, node: main } });
  if (p.on && rest) {
    const part = host!;
    // At rest the point must be on both outlines, a stroke's width at most off: else the part floats or sinks.
    const tol = Math.max(2, width * 1.5);
    const offSelf = offOutline(p.kind, box, rest), offPart = offOutline(part.kind, part.box, rest);
    if (offSelf > tol || offPart > tol) console.warn(`shape ${id}: it rests on ${part.id} at (${Math.round(rest.x)}, ${Math.round(rest.y)}), but that point is ${Math.round(Math.max(offSelf === Infinity ? 0 : offSelf, offPart === Infinity ? 0 : offPart))} px off ${offSelf > tol ? "its own" : `${part.id}'s`} outline; place the shape so the point is on both edges (pointOf gives the point)`);
    out.push({ id: `${id}-on`, kind: "anchor", x: rest.x, y: rest.y, w: 0, h: 0, at: p.at, data: { self: main, part: part.node.id, x: rest.x, y: rest.y } });
  }
  return out;
};
