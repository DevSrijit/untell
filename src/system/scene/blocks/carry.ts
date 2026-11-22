// Carry: a match cut. One object (a box, a number, a word) moves and resizes from its place in one
// layout to its place in the next, so a section change keeps continuity: the eye follows the object
// across the cut instead of starting again.
//
// The motion is in carryTracks() / carryMotion(), so any block's node can be carried. The `carry`
// block draws one object (a text or a filled box) and carries it.
//
// Rules this block enforces:
// - The object keeps one identity: one node, moved only by x, y and scale tracks. A box uses scaleX and
//   scaleY; a text uses scale only, so its letters never stretch.
// - The node's own geometry is its last place, so at rest it sits exactly at the end box, at scale 1
//   for a box. Every move pivots on the top-left corner (origin [0, 0]), so x and y are plain offsets.
// - Moves come from the system: the "move" curve and duration. In a one-frame system the object jumps.
//   An object that shows a quantity (exact) moves on a curve that never overshoots (rule 3).
// - Text is never masked while it travels, and it keeps its role from end to end. To set a word at the
//   size of another role, textPlace() scales it and keeps its baseline where that role's baseline is.
import { appear, go, seq } from "../context";
import type { ColorRole } from "../roles";
import type { TypeRole } from "../../systems";
import type { Block, Ctx, Key, Origin, Tracks } from "../types";
import { baselineOf } from "./highlight";
import type { Box } from "./util";

export type Stop = { box: Box; /** When the move to this box starts. The first stop's time is ignored. */ at?: number };

/**
 * Tracks that carry a node through a list of boxes. `rest` is the node's own geometry (x, y, w, h as
 * drawn with no transform). The node shows at stops[0] first, then moves to each next box at its time.
 * `uniform` (for text) scales by width only, so the shape keeps its proportions.
 * Spread the result into the node: `{ ...node, ...carryMotion(...) }`, and merge any other tracks into `tracks`.
 */
export function carryMotion(ctx: Ctx, rest: Box, stops: Stop[], o: { uniform?: boolean; speed?: number; /** The object shows a quantity: never pass a place on the way. */ exact?: boolean } = {}): { origin: Origin; tracks: Tracks } {
  const place = (b: Box) => ({ x: b.x - rest.x, y: b.y - rest.y, sx: b.w / rest.w, sy: o.uniform ? b.w / rest.w : b.h / rest.h });
  const ps = stops.map((s) => place(s.box));
  const curve = o.exact ? ctx.noOvershoot("move") : "move";
  const track = (get: (q: ReturnType<typeof place>) => number): Key[] => {
    // The first place from 0, or from the first move when it comes before the film, so the keys stay in order.
    const parts: Key[][] = [[{ t: Math.min(0, ...stops.slice(1).map((s) => s.at ?? 0)), v: get(ps[0]!) }]];
    for (let i = 1; i < ps.length; i++) {
      const a = get(ps[i - 1]!), b = get(ps[i]!);
      parts.push(go(ctx, stops[i]!.at ?? 0, a, b, curve, o.speed ?? 1, "move"));
    }
    return seq(...parts);
  };
  const tracks: Tracks = { x: track((q) => q.x), y: track((q) => q.y) };
  if (o.uniform) tracks.scale = track((q) => q.sx);
  else { tracks.scaleX = track((q) => q.sx); tracks.scaleY = track((q) => q.sy); }
  return { origin: [0, 0], tracks };
}

/** Tracks that carry a node from `from` to `to`, starting at `at`. The node is drawn at `to`. */
export function carryTracks(ctx: Ctx, from: Box, to: Box, at: number, o: { uniform?: boolean; speed?: number; exact?: boolean } = {}): { origin: Origin; tracks: Tracks } {
  return carryMotion(ctx, to, [{ box: from }, { box: to, at }], o);
}

/**
 * The box of a text set in `role` but shown at the size of `as` (default: its own role), with its left
 * edge at x and its baseline at `baseline`. Use it as a carry stop. Its `scale` is the factor to the
 * role's own size.
 */
export function textPlace(ctx: Ctx, text: string, role: TypeRole, x: number, baseline: number, as: TypeRole = role): Box & { scale: number } {
  const scale = ctx.size(as) / ctx.size(role);
  const off = baselineOf(ctx, role, 0); // baseline below the box top, at scale 1
  return { x, y: baseline - off * scale, w: ctx.measure(text, role) * scale, h: ctx.lineHeight(role) * scale, scale };
}

export type CarryProps = {
  id?: string;
  /** A text to carry. Set `role` too. Without a text, the block carries a filled box. */
  text?: string;
  role?: TypeRole;
  /** Text colour, or box fill. Default: ink for text, accent for a box. */
  color?: ColorRole;
  /** Corner radius of a box in px. It scales with the box while it moves. Default 0. */
  radius?: number;
  /** Where the object is first. For a text, use textPlace() so the width matches the words. */
  from: Box;
  /** Where it ends. */
  to: Box;
  /** When it starts to move from `from` to `to`. */
  at: number;
  /** More moves after `to`, in order. */
  then?: { to: Box; at: number }[];
  /** The object shows a quantity (a bar's length): it moves on a curve that never passes its place. */
  exact?: boolean;
  /** When it appears at `from`. Default: at the start of the film, with no entrance. */
  show?: number;
  until?: number;
  z?: number;
};

/** Draws one object and carries it from box to box. */
export const carry: Block<CarryProps> = (p, ctx) => {
  const id = p.id ?? "carry";
  const boxes = [p.from, p.to, ...(p.then ?? []).map((t) => t.to)];
  const stops: Stop[] = [{ box: p.from }, { box: p.to, at: p.at }, ...(p.then ?? []).map((t) => ({ box: t.to, at: t.at }))];
  const last = boxes[boxes.length - 1]!;
  // Visible from `show` (a fade, no rise: the object must start exactly at `from`) until `until`.
  const vis: Tracks = p.show !== undefined ? appear(ctx, p.show, p.until, 0)
    : p.until !== undefined ? { opacity: [{ t: 0, v: 1 }, ...go(ctx, p.until, 1, 0, "exit")] } : {};
  if (p.text !== undefined) {
    const role = p.role ?? "headline";
    // A text's own geometry is its natural size at the last place; each stop sets its scale by width.
    const rest = { x: last.x, y: last.y, w: ctx.measure(p.text, role), h: ctx.lineHeight(role) };
    const m = carryMotion(ctx, rest, stops, { uniform: true, exact: p.exact });
    return [{ id: `${id}-text`, kind: "text", x: rest.x, y: rest.y, text: p.text, role, color: p.color ?? "ink", z: p.z ?? 5,
      origin: m.origin, tracks: { ...m.tracks, ...vis } }];
  }
  const m = carryMotion(ctx, last, stops, { exact: p.exact });
  return [{ id: `${id}-box`, kind: "rect", x: last.x, y: last.y, w: last.w, h: last.h, fill: p.color ?? "accent", radius: p.radius ?? 0, z: p.z ?? 5,
    origin: m.origin, tracks: { ...m.tracks, ...vis } }];
};
