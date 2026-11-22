// Pulley: a wheel with a groove and no teeth, for a rope or a belt that runs on it. It turns about its own centre and
// may move (a moving wheel of a hoist). Use it with `rope`; use `gear` for a wheel with teeth.
//
// Rules this block enforces:
// - The rope runs on the groove radius `r`. The rim is drawn a little outside it (`rim`, default 8 % of r), so the
//   rope sits in the groove and never cuts the rim.
// - Key marks (four short radial ticks inside the rim, a quarter turn apart, and the axle) turn with the wheel, so a
//   turn reads at a glance on a wheel with no teeth. The marks are symmetric about the centre, so their drawn box stays
//   centred at every angle and they turn about the wheel's centre (three ticks gave a box whose centre drifted 34 px
//   as it turned, and the HyperFrames check said the pivot drifted).
// - `turns` and `moves` take the system's move curve, as `shape` does, so a wheel that rolls up its rope turns in step
//   with its rise: give the same times to both, and the turn from rollDegrees (the rope's run over the wheel). Only the
//   key marks turn: a round rim looks the same at any angle, so a part that hangs from the rim (a strap, with shape
//   `on`) rides with the wheel and stays upright.
// - A wheel that turns while it moves reads in the HyperFrames check as a pivot that drifts (it measures the marks'
//   centre, and the move carries it). The block warns: turn a moving wheel before or after its move.
// - It is a `shape` (a circle on the rim), so pointOf, pointAt, followPoint and `figure` read it. It names its groove:
//   anchor `<id>-groove` (data cx, cy, r), which `rope` reads.
import type { ColorRole } from "../roles";
import type { Block, Key, Node, PathNode } from "../types";
import { go, px } from "../context";
import { shape, spaced, type ShapeProps } from "./shape";

export type PulleyProps = {
  id?: string;
  /** The centre, px. */
  cx: number; cy: number;
  /** The groove radius, px: where the rope runs. */
  r: number;
  /** The rim's radius, px. Default: 1.08 x r. */
  rim?: number;
  /** Moves of the wheel, as shape `moves` (offsets in px from where it is drawn, on the move curve). */
  moves?: ShapeProps["moves"];
  /** Turns in degrees, clockwise, each at a time, on the move curve (rollDegrees gives a rolling turn). */
  turns?: { at: number; by: number }[];
  color?: ColorRole;
  /** The outline weight as a multiple of the system stroke. Default 1. */
  weight?: number;
  enter?: ShapeProps["enter"];
  at: number;
  until?: number;
};

/** The turn in degrees of a wheel of groove radius r when a length of rope runs over it (or it rolls that far on its rope). */
export const rollDegrees = (length: number, r: number) => (length / r) * (180 / Math.PI);

export const pulley: Block<PulleyProps> = (p, ctx) => {
  const id = p.id ?? "pulley";
  if (!(p.r > 0)) throw new Error(`pulley ${id}: r must be a radius over 0 px`);
  const R = p.rim ?? p.r * 1.08;
  if (R < p.r) throw new Error(`pulley ${id}: the rim (${R} px) is inside the groove (${p.r} px); give rim over r`);
  const wheel = shape({ id, kind: "circle", x: p.cx - R, y: p.cy - R, w: 2 * R, h: 2 * R, stroke: p.color ?? "ink", weight: p.weight, moves: p.moves, enter: p.enter, at: p.at, until: p.until }, ctx);
  const main = wheel.find((n): n is PathNode => n.kind === "path" && (n.id === id || n.id === `${id}-line`))!;
  // Key marks: four ticks inside the rim, a quarter turn apart, and the axle. They share the rim's box and tracks.
  const a = R * 0.62, b = R * 0.86, axle = Math.max(2, R * 0.1);
  let d = "";
  for (let k = 0; k < 4; k++) {
    const t = (k * Math.PI) / 2 - Math.PI / 4, c = Math.cos(t), s = Math.sin(t);
    d += `M${px(p.cx + a * c)} ${px(p.cy + a * s)}L${px(p.cx + b * c)} ${px(p.cy + b * s)}`;
  }
  d += `M${px(p.cx)} ${px(p.cy - axle)}A${axle} ${axle} 0 1 1 ${px(p.cx)} ${px(p.cy + axle)}A${axle} ${axle} 0 1 1 ${px(p.cx)} ${px(p.cy - axle)}Z`;
  const { draw: _draw, ...tracks } = main.tracks ?? {};
  // A turn that overlaps a move (see the header).
  const step = ctx.instant ? 1 / 30 : ctx.dur.move;
  const clash = (p.turns ?? []).find((t) => (p.moves ?? []).some((m) => Math.abs(m.at - t.at) < step));
  if (clash) console.warn(`pulley ${id}: the turn at ${clash.at.toFixed(2)} s overlaps a move; the HyperFrames check reads a wheel that turns while it moves as a drifting pivot. Turn it before or after the move.`);
  if (p.turns?.length) {
    spaced(id, "turns", p.turns.map((t) => t.at), ctx.instant ? 1 / 30 : ctx.dur.move);
    let r = 0;
    const rs: Key[] = p.turns[0]!.at > 0 ? [{ t: 0, v: 0 }] : [];
    for (const t of p.turns) { rs.push(...go(ctx, t.at, r, r + t.by, "move")); r += t.by; }
    tracks.rotate = rs;
  }
  const keys: Node = { id: `${id}-keys`, kind: "path", d, stroke: p.color ?? "ink", width: ctx.stroke * (p.weight ?? 1), cap: "butt", box: main.box, origin: [0.5, 0.5], tracks };
  return [...wheel, keys, { id: `${id}-groove`, kind: "anchor", x: p.cx - p.r, y: p.cy - p.r, w: 2 * p.r, h: 2 * p.r, at: p.at, data: { cx: p.cx, cy: p.cy, r: p.r } }];
};
