// Rows: a row grid for one frame. It divides the text-safe area into N rows from top to bottom, so a
// scene uses the full height of the frame and not only its upper half.
//
// Use rowBoxes() to lay out a scene; the `rows` block only draws the rows as faint guides, for debugging.
//
// Rules this helper enforces:
// - Every row is inside the text-safe area. At 9:16 a row that reaches below lowBandTop ends at
//   lowBandRight, so text set in it passes textSafe.
// - Each row has a bottom anchor: text set on it (atBottom) ends on the row's bottom edge, so the rows'
//   contents line up on shared baselines from frame to frame.
// - The guides are hairlines in the rule colour, with no text, so they never collide with the scene.
import { appear, go, present, px, seq } from "../context";
import type { ColorRole } from "../roles";
import { layoutOf } from "./highlight";
import type { TypeRole } from "../../systems";
import type { Block, Ctx, Node } from "../types";
import type { Box } from "./util";

export type Row = Box & { /** Row index from the top. */ i: number; /** The bottom anchor: y of the row's bottom edge. */ bottom: number };

export type RowOptions = {
  /** Space between rows in px. Default: half the body line height. */
  gap?: number;
  /** Relative row heights, one per row. Default: equal. */
  weights?: number[];
  /** The area to divide. Default: the text-safe area. */
  area?: Box;
};

/** The text-safe area as a box. */
export function safeBox(ctx: Ctx): Box {
  const s = ctx.safe;
  return { x: s.left, y: s.top, w: s.right - s.left, h: s.bottom - s.top };
}

/** N rows that fill the area from top to bottom. */
export function rowBoxes(ctx: Ctx, n: number, o: RowOptions = {}): Row[] {
  const a = o.area ?? safeBox(ctx);
  const gap = o.gap ?? Math.round(ctx.lineHeight("body") * 0.5);
  const ws = o.weights && o.weights.length === n ? o.weights : Array.from({ length: n }, () => 1);
  const sum = ws.reduce((p, q) => p + q, 0);
  const free = a.h - gap * (n - 1);
  const out: Row[] = [];
  let y = a.y;
  ws.forEach((wt, i) => {
    const h = Math.floor((free * wt) / sum);
    // A row that reaches into the low band ends where text there must end.
    const right = y + h > ctx.safe.lowBandTop ? Math.min(a.x + a.w, ctx.safe.lowBandRight) : a.x + a.w;
    out.push({ i, x: a.x, y, w: right - a.x, h, bottom: y + h });
    y += h + gap;
  });
  return out;
}

/** The y at which a block of height `h` starts so that it ends on the row's bottom anchor. */
export function atBottom(row: Row, h: number): number {
  return row.bottom - h;
}

/**
 * The y of the top line of `n` lines in `role`, set so that the last line ends on the row's bottom.
 * The last line's whole box ends there: its line box, and its content area when the leading is tight.
 */
export function linesAtBottom(ctx: Ctx, row: Row, role: TypeRole, n: number): number {
  const last = layoutOf(ctx, role, 0).bottom; // bottom of one line set at y = 0
  return Math.floor(row.bottom - last - ctx.lineHeight(role) * (n - 1));
}

/** The y of a first line in `role` set on the row's top edge: its whole box, content area too, starts there. */
export function linesAtTop(ctx: Ctx, row: Row, role: TypeRole): number {
  return Math.ceil(row.y - Math.min(0, layoutOf(ctx, role, 0).top));
}

/**
 * Lines that drop into place from above their masks, and leave upward. Use it on a row near the bottom
 * of the safe area: a line that rises from below (context.lines) passes the safe edge while it is masked,
 * and the checks count masked text.
 */
export function settle(ctx: Ctx, o: { id: string; x: number; y: number; lines: string[]; role: TypeRole; color?: ColorRole; at: number; until?: number; /** Extra space between lines, px. */ gap?: number }): Node[] {
  const lh = ctx.lineHeight(o.role) + (o.gap ?? 0);
  const n = o.lines.length;
  return o.lines.map((text, i) => {
    // The bottom line lands first, so the block grows up from its anchor.
    const at = o.at + (n - 1 - i) * ctx.dur.stagger;
    const until = o.until !== undefined ? o.until + i * ctx.dur.stagger : undefined;
    const reveal = ctx.instant ? [{ t: 0, v: 0 }] : seq(go(ctx, at, -100, 0), until !== undefined && go(ctx, until, 0, -100, "exit"));
    const end = until !== undefined ? until + (ctx.instant ? 0 : ctx.dur.exit) : undefined;
    return { id: `${o.id}-${i}`, kind: "text" as const, x: o.x, y: o.y + i * lh, text, role: o.role, color: o.color ?? "ink", mask: true,
      tracks: { reveal, ...present(at, end) } };
  });
}

/**
 * Breaks a text into lines no wider than `w` in `role`, at spaces. Each phrase in `keep` stays on one
 * line (a number and its unit, a word that a highlight will mark). A word wider than `w` stays whole on
 * its own line; check the result with ctx.measure if that can happen.
 */
export function wrap(ctx: Ctx, text: string, role: TypeRole, w: number, keep: string[] = []): string[] {
  const glue = "\u0000";
  let t = text;
  for (const k of keep) t = t.split(k).join(k.split(" ").join(glue));
  const words = t.split(" ").map((x) => x.split(glue).join(" "));
  const out: string[] = [];
  let cur = "";
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (!cur || ctx.measure(next, role) <= w) cur = next;
    else { out.push(cur); cur = word; }
  }
  if (cur) out.push(cur);
  return out;
}

export type RowsProps = RowOptions & {
  id?: string;
  /** How many rows. */
  n: number;
  at: number;
  until?: number;
};

/**
 * Draws the rows as faint guides: a dashed outline a third of the gap outside each row, so the outlines
 * never touch text set in the row, and a short solid tick left of each row on its bottom anchor.
 */
export const rows: Block<RowsProps> = (p, ctx) => {
  const id = p.id ?? "rows";
  const out: Node[] = [];
  const w = Math.max(1, ctx.stroke * 0.5);
  const gap = p.gap ?? Math.round(ctx.lineHeight("body") * 0.5);
  const o = Math.max(w * 2, gap * 0.35);
  rowBoxes(ctx, p.n, p).forEach((r, i) => {
    const at = p.at + i * ctx.dur.stagger;
    const x0 = px(r.x - o), x1 = px(r.x + r.w + o), y0 = px(r.y - o), y1 = px(r.bottom + o);
    out.push({ id: `${id}-row-${i}`, kind: "path", d: `M${x0} ${y0}H${x1}V${y1}H${x0}Z`, stroke: "rule", width: w, dash: [ctx.stroke * 3, ctx.stroke * 3],
      tracks: { draw: go(ctx, at, 0, 1, ctx.noOvershoot("move")), ...appear(ctx, at, p.until, 0) } });
    const tick = Math.round(ctx.size("label") * 0.6);
    out.push({ id: `${id}-anchor-${i}`, kind: "path", d: `M${px(r.x - o - tick)} ${px(r.bottom)}H${px(r.x - o - w * 2)}`, stroke: "inkMuted", width: w * 2,
      tracks: appear(ctx, at + ctx.dur.enter, p.until, 0) });
  });
  return out;
};
