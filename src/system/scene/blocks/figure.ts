// Figure: the annotation plan of one drawing, as a draughtsman lays it out. Give it the drawing's parts; then give it to
// `dimension` and `callout` as `figure`, and they place themselves outside the drawing, clear of each other, inside
// the text-safe area. No label, dimension or callout needs a place by hand.
//
// The rules, from the practice of technical drawing:
// - The figure's box is the extent of its parts at every place they pass (a beam that turns, a load that rises), so
//   no label lands where a part will move.
// - A dimension stands on a side of what it measures ("above" by default): its line runs just clear of every part and
//   label inside its span, at every place they pass, so its extension lines stay short. A dimension that would lie on
//   another dimension's line, cross a label with a line, or put its label on a line or a label moves one step out (a
//   label line and two gaps). Dimensions that meet end to end at one height make a chain on one line.
// - A dimension's label sits centred on its line, on the far side from the parts; where that is outside the text-safe
//   area or on another label, it slides along its own line, and only then past an extension line.
// - A callout's label goes next to its target where there is room: beside it, then over or under it, clear of every
//   part (where the scene draws it) and of all annotation, so a force's name sits at its arrow's tail. Where there is
//   no room next to the target, the label goes outside the figure on the side nearest the target, with a short square
//   leader. A leader never crosses another leader or a label.
// - The blocks are placed in the order the scene calls them: name the parts (callouts) first, then measure them.
// - The figure knows the whole drawing: each part's strokes (a path's lines, arcs and curves, a circle's outline, a
//   rect's edges, at every place they pass), not only its box. A label may sit inside a wheel's rim or between two
//   strands, where no stroke runs; it never sits on a stroke. It also knows the text the frame keeps for itself: in a
//   system that states a figure place (Schematic), the status line's band at the text-safe top (from the text-safe
//   top to the top of figureBox), and any box or nodes given as `keep`. No label goes there.
// - A leader has a true maximum (`maxLeader`, default 5 label lines). With no place inside it, the block throws and
//   names a fix that works.
// - `place(w, h)` gives a clear box for other text (an equation, a note) in the text-safe area, outside the figure.
// - Each block that takes the figure adds what it drew (its label, its lines), so later blocks keep clear of it.
//   Make one figure per drawing, in the scene: figure(ctx, [...beam, ...fulcrum, ...load]).
import { textSafe } from "../context";
import type { Ctx, Node } from "../types";
import type { Outline } from "./callout";
import { timedStrokes, sweptBox } from "./parts";
import type { Key } from "../types";
import { DIRECTION } from "../../direction";
import type { Box } from "./util";

export type Side = "above" | "below" | "left" | "right";
type Seg = [[number, number], [number, number]];

export type Figure = {
  /** The extent of the figure's parts over the whole film, px. Callouts take it as `outside`. */
  box: Box;
  /** Each part's box where the scene draws it (at rest), px: a label near its target keeps clear of all of them. */
  parts: Box[];
  /** Each part's box over every place it passes, px: a dimension's line runs clear of the ones in its span. */
  swept: Box[];
  /** The labels placed so far (boxes) and the lines drawn so far (segments). */
  labels: Box[];
  lines: Seg[];
  /** The leaders drawn so far: a leader crosses no other leader. */
  leaders: Seg[];
  /** The strokes of every part, at every place they pass, px. */
  strokes: Seg[];
  /** Boxes that no label may touch: the status line's band, and the boxes given as `keep`. */
  keep: Box[];
  /** The longest leader a label of this figure may take, px. */
  maxLeader: number;
  /** The same strokes, each with the time of its place (-1: a part that never moves). */
  timed: { t: number; s: Seg }[];
  /**
   * Is a label box clear of every stroke, kept box, label, line and leader of the figure (a gap round it)? With
   * `follow` (the label's x and y keys), each stroke of a moving part is tested against the label where it is at
   * that stroke's time, so a label rides beside its moving part.
   */
  clear: (b: Box, gap: number, follow?: { x?: Key[]; y?: Key[] }) => boolean;
  /** The dimension lines placed so far: the side, the line's place across that side, and its extent along it, px. */
  dims: { side: Side; c: number; lo: number; hi: number }[];
  /** A clear box for a text of w x h px, in the text-safe area outside the figure and clear of all annotation. */
  place: (w: number, h: number, o?: { role?: Parameters<typeof textSafe>[2]; prefer?: "above" | "below" }) => Box;
};

const hits = (a: Box, b: Box, g = 0) => a.x - g < b.x + b.w && b.x < a.x + a.w + g && a.y - g < b.y + b.h && b.y < a.y + a.h + g;

/** The value of linear keys at time t (the first key's value before it, the last after it). */
export function keyAt(keys: Key[] | undefined, t: number): number {
  if (!keys?.length) return 0;
  if (t <= keys[0]!.t) return keys[0]!.v;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1]!, b = keys[i]!;
    if (t <= b.t) return b.curve === "step" ? a.v : a.v + ((b.v - a.v) * (t - a.t)) / Math.max(1e-9, b.t - a.t);
  }
  return keys[keys.length - 1]!.v;
}

/** The key times of a follower (and 0), so a check sees each place it rests. */
const keyTimes = (f: { x?: Key[]; y?: Key[] } | undefined) => [...new Set([0, ...(f?.x ?? []).map((k) => k.t), ...(f?.y ?? []).map((k) => k.t)])];

/** Does the segment pass through the box (grown by g)? */
export function segHitsBox(s: Seg, b: Box, g = 0): boolean {
  const [[x1, y1], [x2, y2]] = s;
  // Fast reject: the segment's box is clear of the grown box.
  if (Math.max(x1, x2) < b.x - g || Math.min(x1, x2) > b.x + b.w + g || Math.max(y1, y2) < b.y - g || Math.min(y1, y2) > b.y + b.h + g) return false;
  const n = Math.max(2, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 3));
  for (let k = 0; k <= n; k++) {
    const x = x1 + ((x2 - x1) * k) / n, y = y1 + ((y2 - y1) * k) / n;
    if (x > b.x - g && x < b.x + b.w + g && y > b.y - g && y < b.y + b.h + g) return true;
  }
  return false;
}

/** Do two segments cross (a shared end does not count)? */
export function segsCross(a: Seg, b: Seg): boolean {
  const [[ax, ay], [bx, by]] = a, [[cx, cy], [dx, dy]] = b;
  const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d, u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
  return t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98;
}

/**
 * The band at the text-safe top that a system with a figure place keeps for its status line: from the text-safe top
 * to the top of the figure box (sheet.ts figureBox). Null in a frame that is not tall or a system with no figure place.
 */
export function statusBand(ctx: Ctx): Box | null {
  const place = DIRECTION[ctx.system.id]?.compose?.figure;
  if (!place || ctx.height / ctx.width < 1.5) return null;
  const S = ctx.safe, top = Math.round(S.top + 2 * ctx.lineHeight("headline") + ctx.lineHeight("label"));
  return { x: S.left, y: S.top - ctx.size("headline"), w: S.right - S.left, h: top - S.top + ctx.size("headline") };
}

export type FigureOptions = {
  /** Text the figure's labels keep clear of: boxes, or the nodes of text built before (a pinned status line). The
   *  status band of a system with a figure place is always kept. */
  keep?: (Box | Node[])[];
  /** The longest leader, px. Default: 5 label lines. */
  maxLeader?: number;
};

/** The figure of a drawing: give it every node of the drawing's parts (shapes, arrows, rules, gears, belts, ropes). */
export function figure(ctx: Ctx, parts: Node[], o: FigureOptions = {}): Figure {
  const boxes = parts.map((n) => sweptBox(ctx, n)).filter((b): b is Box => !!b && Number.isFinite(b.x));
  const still = parts.map((n) => sweptBox(ctx, { ...n, tracks: undefined } as Node)).filter((b): b is Box => !!b && Number.isFinite(b.x));
  if (!boxes.length) throw new Error("figure: no drawn part in these nodes; give the nodes of the drawing's shapes, arrows and lines");
  const x = Math.min(...boxes.map((b) => b.x)), y = Math.min(...boxes.map((b) => b.y));
  const box = { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
  const timed = parts.flatMap((n) => timedStrokes(ctx, n));
  const strokes = timed.map((q) => q.s);
  const keep: Box[] = [];
  const band = statusBand(ctx);
  if (band) keep.push(band);
  for (const k of o.keep ?? []) {
    if (!Array.isArray(k)) { keep.push(k); continue; }
    for (const n of k) if (n.kind === "text" || (n.kind === "anchor" && /-(label|box)$/.test(n.id))) keep.push({ x: n.x, y: n.y, w: (n as { w?: number }).w ?? ctx.measure((n as { text: string }).text, (n as { role: Parameters<Ctx["measure"]>[1] }).role), h: (n as { h?: number }).h ?? ctx.lineHeight((n as { role: Parameters<Ctx["measure"]>[1] }).role) });
  }
  const f: Figure = {
    box, parts: still, swept: boxes, labels: [], lines: [], leaders: [], dims: [], strokes, timed, keep,
    maxLeader: o.maxLeader ?? 5 * ctx.lineHeight("label"),
    clear: (b, g, follow) => {
      const still = !follow?.x?.length && !follow?.y?.length;
      const ok = still ? !f.strokes.some((s) => segHitsBox(s, b, g))
        : f.timed.every((q) => {
          // A part that never moves is tested at every place the label passes.
          const at = q.t < 0 ? keyTimes(follow) : [q.t];
          return at.every((t) => { const dx = keyAt(follow!.x, t), dy = keyAt(follow!.y, t); return !segHitsBox(q.s, { ...b, x: b.x + dx, y: b.y + dy }, g); });
        });
      return ok && !f.keep.some((q) => hits(b, q, g)) && !f.labels.some((q) => hits(b, q, g)) && ![...f.lines, ...f.leaders].some((s) => segHitsBox(s, b, g / 2));
    },
    place: (w, h, o = {}) => {
      const S = ctx.safe, gap = Math.round(ctx.size("label") * 0.6);
      const clear = (b: Box) => textSafe(ctx, b, o.role) && !hits(b, box, gap) && f.clear(b, gap);
      // Rows from the figure outwards on the preferred side, each row scanned from the text column's left edge.
      const ys: number[] = [];
      const step = Math.max(4, Math.round(h / 4));
      const above = o.prefer !== "below";
      for (let k = 0; k < 400; k++) {
        const yy = above ? box.y - gap - h - k * step : box.y + box.h + gap + k * step;
        if (yy < S.top - h || yy > S.bottom) break;
        ys.push(yy);
      }
      for (const yy of ys) for (let xx = S.left; xx + w <= S.right + 0.5; xx += step) {
        const b = { x: xx, y: yy, w, h };
        if (clear(b)) { f.labels.push(b); return b; }
      }
      throw new Error(`figure: no clear place for a text of ${Math.round(w)} x ${Math.round(h)} px ${above ? "above" : "below"} the figure in the text-safe area; shorten the text or use a smaller role`);
    },
  };
  return f;
}

/** The annotation of a figure as an outline (labels as boxes, lines as segments), for clearPlace and crosses. */
export function figureOutline(f: Figure): Outline {
  return { circles: [], segments: [...f.lines, ...f.leaders], boxes: [...f.labels, ...f.keep] };
}
