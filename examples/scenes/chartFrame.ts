// Where a data or diagram demo puts its one line and its chart. Not a demo: the demos of the chart and diagram blocks
// share it, so they compose one way.
// - 9:16: the line at the text-safe top (lineAndBlock); the chart under it. `bleed`: the chart's box runs on to the
//   picture-safe foot (lineAndBlock's `graphic`), in the text-safe columns, for a block that keeps its text in
//   the text-safe area and lets its marks enter the lower band (a bar chart `from: "top"`, a waffle, a ring).
// - 16:9: the line in a column at the left (36 % of the text-safe width), on the optical centre; the chart in the
//   rest, the full text-safe height. A chart composes for the wide shape, not as a scaled 9:16 frame.
// - The line is on screen at rest from frame 0 (`at` before the film): the film opens on what the chart shows.
// - The line is a headline; where a headline would take more than 28 % of the text-safe height, it is body.
import type { Ctx, Node } from "../../src/system/scene/types";
import { boxOf, lineAndBlock, type BLOCKS } from "../../src/system/scene/blocks";

export type Box = { x: number; y: number; w: number; h: number };

export function chartFrame(ctx: Ctx, B: typeof BLOCKS, text: string, o: { bleed?: boolean; role?: "headline" | "body"; at?: number; until?: number; /** Moves the line down by this many px (pairOf). */ dy?: number } = {}): { nodes: Node[]; box: Box; line: Box; tall: boolean } {
  const s = ctx.safe, tall = ctx.height > ctx.width;
  const rowsIn = (r: "headline" | "body", w: number) => B.measure("title", { id: "m", x: s.left, y: s.top, w, text, role: r, at: -10 }, ctx).h;
  // The line leaves the chart most of the text-safe height: where the headline would take more than 28 % of it
  // (Kinetic: its headline is display size), the line is set in body.
  // At 16:9 the line takes a column: where its longest word is wider than the column in headline, it is body too.
  const colW = Math.round((s.right - s.left) * 0.36);
  const longest = Math.max(...text.split(" ").map((w) => ctx.measure(w, "headline")));
  const role = o.role ?? ((tall ? rowsIn("headline", s.right - s.left) > (s.bottom - s.top) * 0.28 : longest > colW) ? "body" : "headline");
  const rows = (w: number) => rowsIn(role, w);
  const title = (b: Box) => B.title({ id: "line", text, role, x: b.x, y: b.y, w: b.w, at: o.at ?? -1, until: o.until }, ctx);
  if (tall) {
    const L = { ...lineAndBlock(ctx, { lineH: rows(s.right - s.left) }) };
    // The bleed box keeps the text-safe columns (the block's labels stay there) and runs down to the picture-safe foot.
    if (o.dy) L.line = { ...L.line, y: L.line.y + o.dy };
    return { nodes: title(L.line), box: o.bleed ? { ...L.block, h: L.graphic.y + L.graphic.h - L.block.y } : L.block, line: L.line, tall };
  }
  const gap = Math.round(ctx.lineHeight("body") * 1.5);
  const h = rows(colW);
  const y = Math.round(Math.max(s.top, s.top + (s.bottom - s.top) * 0.46 - h / 2));
  const line = { x: s.left, y, w: colW, h };
  return { nodes: title(line), box: { x: s.left + colW + gap, y: s.top, w: s.right - s.left - colW - gap, h: s.bottom - s.top }, line, tall };
}

/**
 * The line and a block as one pair, placed by what the block draws. The block is built in the frame's box first and
 * measured (boxOf). Then:
 * - 9:16: the pair moves down until it sits on the optical centre of the area from the text-safe top to the
 *   picture-safe foot (46 %, the rule of lineAndSubject), and never lower than the text-safe foot allows the block's text.
 *   A block that fills its box does not move.
 * - 16:9: the block moves down to the middle of its column.
 * With `text` empty there is no line, and the block takes the whole text-safe area.
 */
export function pairOf(ctx: Ctx, B: typeof BLOCKS, text: string, make: (box: Box) => Node[], o: { role?: "headline" | "body" } = {}): Node[] {
  const s = ctx.safe, tall = ctx.height > ctx.width;
  const F = text ? chartFrame(ctx, B, text, o) : { nodes: [] as Node[], box: { x: s.left, y: s.top, w: s.right - s.left, h: s.bottom - s.top }, line: { x: s.left, y: s.top, w: 0, h: 0 }, tall };
  const first = make(F.box);
  const b = boxOf(ctx, first);
  if (!b) return [...F.nodes, ...first];
  const free = F.box.y + F.box.h - (b.y + b.h);
  if (free < 2) return [...F.nodes, ...first];
  let dy: number;
  if (tall) {
    const m = Math.ceil(ctx.system.margin * Math.min(ctx.width, ctx.height)), foot = ctx.height - m;
    const top = text ? F.line.y : b.y, pairH = b.y + b.h - top;
    dy = Math.max(0, Math.min(free, Math.round(s.top + (foot - s.top) * 0.46 - pairH / 2 - top)));
  } else dy = Math.round(free / 2);
  if (dy < 2) return [...F.nodes, ...first];
  const box = { ...F.box, y: F.box.y + dy, h: F.box.h - dy };
  const line = tall && text ? chartFrame(ctx, B, text, { ...o, dy }).nodes : F.nodes;
  return [...line, ...make(box)];
}
