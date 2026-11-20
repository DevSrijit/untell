// Pane: one window for a terminal, a code block or a picture. Use it so every window in a film has the same
// panel, the same border, the same inset and the same title place, and so their edges align.
//
// Rules this block enforces:
// - The panel is the system's surface with a hairline border in the rule colour and the system radius. A
//   picture pane has no fill ("none"): the picture fills the inner box and the border sits on top.
// - The inset is the same for every pane in a system: 0.6 x the code role's size, unless the scene gives one.
//   `paneLayout` returns the inner box; terminal and codeBlock place their text in it.
// - The title is small text in inkMuted (ui.ts smallRole: the label role, or caption where label is under the phone
//   floor), above the panel, on the inner box's left edge. So the title, the text
//   column and the next pane's title share one left edge.
// - `paneStack` stacks panes in one column: every pane gets the same left and right edge, and one gap.
//   The Console reel had panes 6 px apart because each one took its own margin.
// - A pane shows from frame 0 when `at` is 0 or before, and cuts on and off with its content.
// - It names its inner box: anchor `<id>-inner`, so a scene can put content in it.
// - It draws no window chrome: no title-bar dots (lint rule tell/window-chrome). The title is a label above it.
// - With no box, a pane takes the system's window box (ui.ts windowBox): the hook's share, a tall pane at 9:16 under
//   one line, a wide one at 16:9. Two panes with no box take the same box.
import { present, textSafe } from "../context";
import type { Block, Ctx, Node } from "../types";
import { codeRole } from "./codeBlock";
import { fitWords } from "./util";
import { smallRole, windowBox } from "./ui";

export type Box = { x: number; y: number; w: number; h: number };

export type PaneProps = {
  id?: string;
  /** The panel's box in px. Default: windowBox(ctx), under its title when it has one. */
  x?: number; y?: number; w?: number; h?: number;
  /** With no box: the height of the line above the pane, px. Default: two rows of headline at 9:16, one at 16:9. */
  lineH?: number;
  /** A label above the panel, on the text column's left edge. */
  title?: string;
  /** "surface" for text (default), "none" for a picture under the border. */
  fill?: "surface" | "none";
  /** The distance from the panel's edge to its content, px. Default: paneInset(ctx). */
  inset?: { x: number; y: number };
  /** Draw order. Default: content (no layer), or 1 for a pane with `fill: "none"`, so its border draws above the picture. */
  layer?: number;
  at: number;
  until?: number;
};

/** The default inset for every pane in a system: 0.6 x the code role's size. */
export const paneInset = (ctx: Ctx) => Math.round(ctx.size(codeRole(ctx)) * 0.6);

/** The height of the title row above a pane: the label's line height and a small gap. */
export const paneTitleHeight = (ctx: Ctx) => Math.ceil(ctx.size(smallRole(ctx)) * ctx.system.type[smallRole(ctx)].leading) + Math.round(paneInset(ctx) * 0.8);

/** The geometry of a pane: the panel, the inner box for content, and the title's place. */
export function paneLayout(ctx: Ctx, p: Pick<PaneProps, "x" | "y" | "w" | "h" | "inset" | "title" | "lineH">) {
  if (p.x === undefined || p.y === undefined || p.w === undefined || p.h === undefined) {
    if ([p.x, p.y, p.w, p.h].some((v) => v !== undefined)) throw new Error("pane: give all of x, y, w and h, or none (the system's window box)");
    // The system's window box; a title takes its row inside the box's top.
    const b = windowBox(ctx, { lineH: p.lineH });
    const t = p.title ? paneTitleHeight(ctx) : 0;
    p = { ...p, x: b.x, y: b.y + t, w: b.w, h: b.h - t };
  }
  const ix = p.inset?.x ?? paneInset(ctx), iy = p.inset?.y ?? paneInset(ctx);
  const x = p.x!, y = p.y!, w = p.w!, h = p.h!;
  const panel: Box = { x, y, w, h };
  const inner: Box = { x: x + ix, y: y + iy, w: w - 2 * ix, h: h - 2 * iy };
  const title = p.title ? { x: inner.x, y: y - paneTitleHeight(ctx), w: inner.w, h: Math.ceil(ctx.size(smallRole(ctx)) * ctx.system.type[smallRole(ctx)].leading) } : null;
  return { panel, inner, title, inset: { x: ix, y: iy } };
}

/**
 * Panes in one column with shared edges: the same x and w for all, one gap between them. Each height is
 * the pane's own; a title row is added above the panes that have a title. Returns the panel boxes.
 */
export function paneStack(ctx: Ctx, o: { x: number; w: number; top: number; gap: number; panes: { h: number; title?: boolean }[] }): Box[] {
  // The label's glyph box reaches above its line box; start the first title that far down, so it passes textSafe.
  const over = Math.max(0, Math.ceil((ctx.size(smallRole(ctx)) * 1.4 - ctx.lineHeight(smallRole(ctx))) / 2));
  let y = o.top + (o.panes[0]?.title ? over : 0);
  return o.panes.map((p) => {
    if (p.title) y += paneTitleHeight(ctx);
    const b = { x: o.x, y, w: o.w, h: p.h };
    y += p.h + o.gap;
    return b;
  });
}

/** The panel rect of a pane: shared by pane, terminal and codeBlock, so they draw the same window. */
export function panelNode(ctx: Ctx, id: string, b: Box, fill: "surface" | "none", tracks: Node["tracks"], layer?: number): Node {
  const stroke = { stroke: "rule" as const, strokeWidth: Math.max(1, ctx.stroke * 0.5), radius: ctx.radius };
  if (fill === "none") {
    // A border only: a path, so the picture under it shows. Its corners follow the system radius.
    const r = Math.min(ctx.radius, b.w / 2, b.h / 2), h = stroke.strokeWidth / 2;
    const x0 = b.x + h, y0 = b.y + h, x1 = b.x + b.w - h, y1 = b.y + b.h - h;
    const d = r > 0
      ? `M${x0 + r} ${y0}H${x1 - r}A${r} ${r} 0 0 1 ${x1} ${y0 + r}V${y1 - r}A${r} ${r} 0 0 1 ${x1 - r} ${y1}H${x0 + r}A${r} ${r} 0 0 1 ${x0} ${y1 - r}V${y0 + r}A${r} ${r} 0 0 1 ${x0 + r} ${y0}Z`
      : `M${x0} ${y0}H${x1}V${y1}H${x0}Z`;
    return { id, kind: "path", d, stroke: "rule", width: stroke.strokeWidth, box: b, pane: true, tracks, ...(layer !== undefined ? { layer } : {}) };
  }
  return { id, kind: "rect", ...b, fill: "surface", ...stroke, pane: true, tracks, ...(layer !== undefined ? { layer } : {}) };
}

export const pane: Block<PaneProps> = (p, ctx) => {
  const id = p.id ?? "pane";
  const L = paneLayout(ctx, p);
  const show = present(p.at, p.until);
  const out: Node[] = [panelNode(ctx, `${id}-panel`, L.panel, p.fill ?? "surface", show, p.layer ?? (p.fill === "none" ? 1 : undefined))];
  if (p.title && L.title) {
    // A word is never cut: the title keeps its leading words, or the block throws.
    const t = fitWords(p.title, L.title.w, (x) => ctx.measure(x, smallRole(ctx)));
    if (!t) throw new Error(`pane ${id}: the title "${p.title}" does not fit ${Math.round(L.title.w)} px; widen the pane or shorten the title`);
    if (t.cut) console.warn(`pane ${id}: the title was shortened to "${t.text}" to fit`);
    if (!textSafe(ctx, { ...L.title, w: ctx.measure(t.text, smallRole(ctx)) }, smallRole(ctx))) console.warn(`pane ${id}: the title is outside the text-safe area`);
    out.push({ id: `${id}-title`, kind: "text", x: L.title.x, y: L.title.y, text: t.text, role: smallRole(ctx), color: "inkMuted", tracks: present(p.at, p.until) });
  }
  out.push({ id: `${id}-inner`, kind: "anchor", ...L.inner, at: p.at });
  return out;
};
