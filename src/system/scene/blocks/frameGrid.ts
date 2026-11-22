// Frame grid: the visible grid of a system for this frame, drawn as hairlines in the style of a
// spec sheet. It shows the text-safe area as an outline, the system's columns, and a + mark at
// each corner of the outline.
//
// Rules this block enforces:
// - The outline is the text-safe area: the area that text may use in this frame and system.
// - The columns are the system's own: its column count and a gutter of 2.2 % of the short side.
//   At 9:16 they fill the text-safe area, not the margins.
// - Column lines cross the area that text uses. So they never stay under text: `columns: "ticks"`
//   marks each gutter with short ticks outside the outline only, and `columnsUntil` fades the
//   column lines out (the ticks stay) before text arrives.
// - Every line draws on a curve that never overshoots. The outline draws first, then the columns
//   from left to right, then the + marks appear one after another.
// - At `until`, everything fades out. After that it stays hidden.
import { frameFor } from "../../frame";
import type { ColorRole } from "../roles";
import type { Block, Node } from "../types";
import { cross } from "./cross";
import { drawKeys, markSize, shown } from "./rule";

export type FrameGridProps = {
  id?: string;
  /** "lines": column lines across the area, with ticks outside it. "ticks": ticks only. "none". Default: "lines". */
  columns?: "lines" | "ticks" | "none";
  /** When the column lines fade out, to leave the area clear for text. The ticks stay. */
  columnsUntil?: number;
  /** The outline runs to the edges of the frame (default), or stops at the corners. */
  bleed?: boolean;
  /** + marks at the four corners of the outline. Default: true. */
  marks?: boolean;
  /** Default: "rule". */
  color?: ColorRole;
  at: number;
  until?: number;
};

export const frameGrid: Block<FrameGridProps> = (p, ctx) => {
  const id = p.id ?? "grid";
  const geo = frameFor(ctx.system, ctx.width, ctx.height);
  const color = p.color ?? "rule";
  const bleed = p.bleed ?? true;
  const columns = p.columns ?? "lines";
  // The text-safe area, unrounded: ctx.safe is 1 px inside it on every side.
  const L = geo.left, R = ctx.width - geo.right;
  const T = Math.max(geo.safe.top, geo.margin), B = ctx.height - Math.max(geo.safe.bottom, geo.margin);
  // A line sits on whole pixels for an even width and on half pixels for an odd one, so it stays crisp.
  const snap = (v: number, w = ctx.stroke) => Math.round(v) + (Math.round(w) % 2 === 1 ? 0.5 : 0);
  const [l, r, t, b] = [snap(L), snap(R), snap(T), snap(B)];
  const out: Node[] = [];
  const line = (key: string, d: string, at: number, w = ctx.stroke, until = p.until, pace: "move" | "enter" = "move") =>
    out.push({ id: `${id}-${key}`, kind: "path", d, stroke: color, width: w, cap: "butt", tracks: { draw: drawKeys(ctx, at, pace), opacity: shown(ctx, at, until) } });

  // The outline: two horizontal lines, then two vertical lines, all drawn together.
  const x0 = bleed ? 0 : l, x1 = bleed ? ctx.width : r, y0 = bleed ? 0 : t, y1 = bleed ? ctx.height : b;
  line("top", `M${x0} ${t}H${x1}`, p.at);
  line("bottom", `M${x0} ${b}H${x1}`, p.at);
  line("left", `M${l} ${y0}V${y1}`, p.at);
  line("right", `M${r} ${y0}V${y1}`, p.at);

  // Columns: both edges of each gutter. Lines cross the area at half the stroke; ticks stand outside it.
  if (columns !== "none" && geo.columns > 1) {
    const tick = markSize(ctx) / 2;
    const thin = Math.max(1, ctx.stroke * 0.5);
    const edges: number[] = [];
    for (let c = 1; c < geo.columns; c++) {
      const e = L + c * geo.colW + (c - 1) * geo.gutter;
      edges.push(e, e + geo.gutter);
    }
    const start = p.at + (ctx.instant ? 0 : ctx.dur.move * 0.5);
    edges.forEach((e, i) => {
      const x = snap(e), xc = snap(e, thin);
      const at = start + Math.floor(i / 2) * (ctx.instant ? 0 : ctx.dur.stagger);
      line(`tick-t-${i}`, `M${x} ${t - tick}V${t}`, at, ctx.stroke, p.until, "enter");
      line(`tick-b-${i}`, `M${x} ${b}V${b + tick}`, at, ctx.stroke, p.until, "enter");
      if (columns === "lines") {
        out.push({ id: `${id}-col-${i}`, kind: "path", d: `M${xc} ${t}V${b}`, stroke: color, width: thin, cap: "butt",
          tracks: { draw: drawKeys(ctx, at, "move"), opacity: shown(ctx, at, p.columnsUntil ?? p.until) } });
      }
    });
  }

  // + marks at the corners: top left, top right, bottom left, bottom right.
  if (p.marks ?? true) {
    const at = p.at + (ctx.instant ? 0 : ctx.dur.move * 0.6);
    [[l, t], [r, t], [l, b], [r, b]].forEach(([x, y], i) =>
      out.push(...cross({ id: `${id}-mark-${i}`, x: x!, y: y!, at: at + i * ctx.dur.stagger, until: p.until }, ctx)));
  }
  return out;
};
