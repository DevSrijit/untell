// Gear: a sprocket or a spur gear on its pitch circle, which turns about its own centre. Use it with `belt`
// for a chain or belt drive, and for any mechanism a film explains.
//
// Rules this block enforces:
// - The gear is drawn on its pitch radius `r`: the teeth reach 0.26 x the tooth pitch outside it and the roots
//   0.2 inside. Gears that share a chain or mesh must share a tooth pitch: `pitchRadius(teeth, pitch)` gives
//   the radius, so the ratio on screen is the true ratio.
// - It turns about its centre only, on a linear curve (a machine has no ease), for the number of turns the
//   scene gives. `ratioTurns` gives the driven gear's turns from the driver's, so the drawing does not lie.
// - Key marks on the hub (two short radial lines on one diameter) turn with the teeth, so the turn reads at a
//   glance. They are symmetric, so the hub's box stays centred and it spins about its own centre.
// - It draws on with the system's shape entrance: the outline draws (stroke reveal), or cuts in a one-frame
//   system. Strokes are the system stroke times `weight` (fitDrawing gives a heavier weight to a drawing that
//   fills the frame); the colour is ink unless the scene marks this gear as the subject.
// - It names its centre and pitch circle: anchor `<id>-pitch` (the pitch circle's box, data cx, cy, r), so a
//   belt, a callout or a dimension can attach to the true geometry.
import { go, present, px, seq } from "../context";
import type { ColorRole } from "../roles";
import type { Block, Ctx, Key, Node } from "../types";

export type Pt = [number, number];

export type GearProps = {
  id?: string;
  /** The centre, px. */
  cx: number; cy: number;
  /** The pitch radius, px. */
  r: number;
  /** The number of teeth. */
  teeth: number;
  /** Turns, in time order: from `at` to `until` the gear turns `turns` times (negative: anticlockwise). */
  turns?: { at: number; until: number; turns: number }[];
  /** The start angle in degrees (0: a tooth points straight up). */
  angle?: number;
  color?: ColorRole;
  /** The outline weight as a multiple of the system stroke. Default 1. A drawing fitted large takes fitDrawing's weight. */
  weight?: number;
  /** Hub size as a share of the pitch radius. Default 0.22. 0: no hub. */
  hub?: number;
  at: number;
  until?: number;
};

const polar = (c: Pt, r: number, a: number): Pt => [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
const P = (p: Pt) => `${px(p[0])} ${px(p[1])}`;

/** The pitch radius of a gear with `teeth` teeth at a tooth pitch of `pitch` px (arc length per tooth). */
export const pitchRadius = (teeth: number, pitch: number) => (teeth * pitch) / (2 * Math.PI);

/** How many times a driven gear turns while the driver turns `turns` times: driver teeth over driven teeth. */
export const ratioTurns = (driverTeeth: number, drivenTeeth: number, turns: number) => (turns * driverTeeth) / drivenTeeth;

/** A sprocket outline on pitch radius r with n teeth: flat flanks and a flat tip, the first tooth at `rot` from straight up. */
export function sprocketPath(c: Pt, r: number, n: number, rot = 0): string {
  const pitch = (2 * Math.PI * r) / n;
  const tip = r + pitch * 0.26, root = r - pitch * 0.2;
  const d = (2 * Math.PI) / n;
  let s = "";
  for (let i = 0; i < n; i++) {
    const a = i * d - Math.PI / 2 + rot;
    const pts: Pt[] = [polar(c, root, a - 0.5 * d), polar(c, root, a - 0.26 * d), polar(c, tip, a - 0.12 * d), polar(c, tip, a + 0.12 * d), polar(c, root, a + 0.26 * d)];
    pts.forEach((p, k) => (s += `${i === 0 && k === 0 ? "M" : "L"}${P(p)}`));
  }
  return s + "Z";
}

/** A circle as a path from its top, clockwise: two half arcs. */
export function circlePath(c: Pt, r: number): string {
  return `M${P([c[0], c[1] - r])}A${px(r)} ${px(r)} 0 1 1 ${P([c[0], c[1] + r])}A${px(r)} ${px(r)} 0 1 1 ${P([c[0], c[1] - r])}Z`;
}

/** The outer radius of a gear's teeth. */
export const tipRadius = (r: number, teeth: number) => r + ((2 * Math.PI * r) / teeth) * 0.26;

/** Rotation keys for a list of turns: linear inside each span, held between spans. */
export function turnKeys(turns: { at: number; until: number; turns: number }[], start = 0): Key[] | undefined {
  if (!turns.length) return undefined;
  // At rest until the first span; a span that starts before 0 is folded to frame 0 by the guard, as every block's.
  const keys: Key[] = turns[0]!.at > 0 ? [{ t: 0, v: start }] : [];
  let v = start;
  turns.forEach((t, i) => {
    const prev = turns[i - 1];
    if (prev && t.at < prev.until - 1e-9) throw new Error(`gear: turns[${i - 1}] runs to ${prev.until.toFixed(3)} s and turns[${i}] starts at ${t.at.toFixed(3)} s, inside it. Start turns[${i}] at ${prev.until.toFixed(3)} s or later, or join the two spans into one.`);
  });
  for (const t of turns) {
    keys.push({ t: t.at, v }, { t: t.until, v: v + t.turns * 360, curve: "linear" });
    v += t.turns * 360;
  }
  return keys;
}

/** The shape entrance for a drawn outline: a stroke reveal, or nothing in a one-frame system. */
const drawOn = (ctx: Ctx, at: number) => (ctx.instant ? {} : { draw: seq(go(ctx, at, 0, 1, ctx.noOvershoot("move"), 1, "move")) });

export const gear: Block<GearProps> = (p, ctx) => {
  const id = p.id ?? "gear";
  const c: Pt = [p.cx, p.cy];
  const rot = ((p.angle ?? 0) * Math.PI) / 180;
  const tip = tipRadius(p.r, p.teeth);
  const box = { x: p.cx - tip, y: p.cy - tip, w: 2 * tip, h: 2 * tip };
  const turn = turnKeys(p.turns ?? []);
  const color = p.color ?? "ink";
  const show = present(p.at, p.until);
  const tracks = { ...show, ...drawOn(ctx, p.at), ...(turn ? { rotate: turn } : {}) };
  const out: Node[] = [];
  out.push({ id: `${id}-teeth`, kind: "path", d: sprocketPath(c, p.r, p.teeth, rot), stroke: color, width: ctx.stroke * (p.weight ?? 1), join: "miter", box, origin: [0.5, 0.5], tracks });
  const hub = p.hub ?? 0.22;
  if (hub > 0) {
    const hr = p.r * hub;
    // Two key marks on one diameter: the hub's box stays centred on the gear, so it spins about its own centre.
    const key = [-Math.PI / 2, Math.PI / 2].map((a) => `M${P(polar(c, hr, rot + a))}L${P(polar(c, hr * 2.2, rot + a))}`).join("");
    // The hub path shares the teeth's box, so it turns about the same centre.
    out.push({ id: `${id}-hub`, kind: "path", d: circlePath(c, hr) + key, stroke: color, width: ctx.stroke * (p.weight ?? 1), box, origin: [0.5, 0.5], tracks });
  }
  out.push({ id: `${id}-pitch`, kind: "anchor", x: p.cx - p.r, y: p.cy - p.r, w: 2 * p.r, h: 2 * p.r, at: p.at, data: { cx: p.cx, cy: p.cy, r: p.r, tip } });
  return out;
};
