// Rule: a hairline from A to B that draws itself, at any angle. With `ticks`, it is a dimension
// line: a short tick crosses each end.
//
// Rules this block enforces:
// - The width is the system stroke (or a multiple of it). The colour is a role: "rule" by default.
// - A level or an upright line sits on the pixel grid for its width (context.crisp), so a hairline is sharp.
// - The line draws from A to B on a curve that never overshoots. An overshoot would push the dash
//   offset past its end and cut a gap into the start of the line.
// - A hairline ends square; a line 4 px or wider ends round, so lines that meet at a corner join cleanly.
// - Ticks are perpendicular to the line, centred on its ends, and draw at the faster entrance pace.
// - In a one-frame system the line appears whole in one frame. `enter: "cut"` does that in any system (a match cut:
//   the line is there on the cut's frame); `exit: "cut"` leaves in one frame.
// - At `until`, the line fades out. After that it stays hidden.
// - `layer` puts the line behind content (-1), in it (0, the default) or above it (1). See Base.layer.
import { crisp, go, px, seq, cut } from "../context";
import type { ColorRole } from "../roles";
import type { Block, Ctx, Key, Node } from "../types";

export type RuleProps = {
  id?: string;
  x1: number; y1: number; x2: number; y2: number;
  /** Default: "rule" (a hairline). Use "ink" for a line that carries meaning. */
  color?: ColorRole;
  /** A multiple of the system stroke. Default: 1. */
  weight?: number;
  /** Dashes, for a construction line or a line that context alone explains. */
  dash?: boolean;
  /** Ticks across both ends: a dimension line. */
  ticks?: boolean;
  /** How long the line takes to draw: "move" (default) or the faster "enter". */
  pace?: "move" | "enter";
  /** How the line comes on: "draw" (default: it draws from A to B) or "cut" (whole, in one frame: a match cut). */
  enter?: "draw" | "cut";
  /** How it leaves at `until`: "fade" (default) or "cut" (one frame). */
  exit?: "fade" | "cut";
  /** The draw layer: -1 backdrop, 0 content (default), 1 overlay. */
  layer?: number;
  at: number;
  until?: number;
};

/** The length of a tick, and the size of a + mark: 24 px at a 1080 px short side. */
export const markSize = (ctx: Ctx) => Math.round((24 * Math.min(ctx.width, ctx.height)) / 1080);

/** Hidden before `at`, shown from frameOf(at) on (a cut, the frame rule in context.ts), faded out at `until`. */
export function shown(ctx: Ctx, at: number, until?: number): Key[] {
  return seq(cut(at, 0, 1), until !== undefined && go(ctx, until, 1, 0, "exit"));
}

/** A stroke reveal that never passes 1. */
export function drawKeys(ctx: Ctx, at: number, pace: "move" | "enter"): Key[] {
  return go(ctx, at, 0, 1, ctx.noOvershoot(pace), 1, pace);
}

export const rule: Block<RuleProps> = (p, ctx) => {
  const id = p.id ?? "rule";
  const pace = p.pace ?? "move";
  const width = ctx.stroke * (p.weight ?? 1);
  const color = p.color ?? "rule";
  // A hairline ends square, as in a technical drawing. A heavy line ends round, so two lines that meet
  // at a corner join without a notch.
  const cap = width >= 4 ? "round" : "butt";
  // A level or an upright line sits on the pixel grid for its width (crisp), so a 1 px hairline covers one row of
  // pixels at full strength, not two at part strength.
  const level = Math.abs(p.y1 - p.y2) < 0.01, upright = Math.abs(p.x1 - p.x2) < 0.01;
  const line = level ? `M${px(p.x1)} ${crisp(p.y1, width)}L${px(p.x2)} ${crisp(p.y2, width)}`
    : upright ? `M${crisp(p.x1, width)} ${px(p.y1)}L${crisp(p.x2, width)} ${px(p.y2)}`
    : `M${px(p.x1)} ${px(p.y1)}L${px(p.x2)} ${px(p.y2)}`;
  const opacity = p.exit === "cut" ? seq(cut(p.at, 0, 1), p.until !== undefined && cut(p.until, 1, 0)) : shown(ctx, p.at, p.until);
  const draw = (q: "move" | "enter") => (p.enter === "cut" ? [{ t: 0, v: 1 }] : drawKeys(ctx, p.at, q));
  const out: Node[] = [{
    id, kind: "path", d: line, stroke: color, width, cap,
    dash: p.dash ? [ctx.stroke * 4, ctx.stroke * 3] : undefined, layer: p.layer,
    tracks: { draw: draw(pace), opacity },
  }];
  if (p.ticks) {
    const len = Math.hypot(p.x2 - p.x1, p.y2 - p.y1) || 1;
    const h = markSize(ctx) / 2;
    const nx = (-(p.y2 - p.y1) / len) * h, ny = ((p.x2 - p.x1) / len) * h;
    // One node per tick: a dash pattern restarts on each subpath, so one path for both would draw them at once.
    [[p.x1, p.y1], [p.x2, p.y2]].forEach(([x, y], i) => out.push({
      id: `${id}-tick-${i}`, kind: "path", d: `M${px(x! - nx)} ${px(y! - ny)}L${px(x! + nx)} ${px(y! + ny)}`, stroke: color, width, cap: "butt", layer: p.layer,
      tracks: { draw: draw("enter"), opacity },
    }));
  }
  return out;
};
