// Box: an outlined rectangle that draws its own outline, with an optional fill and a label.
// Use it for a region (a memory area, a zone, a group of things), a frame around a part, or a node.
//
// Rules this block enforces:
// - The outline is one path with the system stroke and corner radius. It draws from the top-left
//   corner, clockwise, on a curve that never overshoots. `dash` makes it a dashed region.
// - A fill, when given, fades in under the outline as the outline closes.
// - A label sits inside the top-left corner, or above the box with `labelOutside`, and must fit:
//   a label wider than the box is cut with an ellipsis and the block warns.
// - The label passes the text-safe check; when it does not, the block warns.
import { appear, go, px, textSafe } from "../context";
import type { ColorRole } from "../roles";
import type { TypeRole } from "../../systems";
import type { Block, Node } from "../types";

export type BoxProps = {
  id?: string;
  x: number; y: number; w: number; h: number;
  stroke?: ColorRole;
  fill?: ColorRole;
  dash?: boolean;
  /** A heavier outline, for the key box. */
  key?: boolean;
  label?: string;
  labelRole?: TypeRole;
  labelColor?: ColorRole;
  labelOutside?: boolean;
  layer?: number;
  at: number;
  until?: number;
};

/** A rounded rectangle path from the top-left corner, clockwise. */
function rounded(x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  if (!r) return `M${px(x)} ${px(y)}H${px(x + w)}V${px(y + h)}H${px(x)}Z`;
  return `M${px(x + r)} ${px(y)}H${px(x + w - r)}A${r} ${r} 0 0 1 ${px(x + w)} ${px(y + r)}V${px(y + h - r)}A${r} ${r} 0 0 1 ${px(x + w - r)} ${px(y + h)}` +
    `H${px(x + r)}A${r} ${r} 0 0 1 ${px(x)} ${px(y + h - r)}V${px(y + r)}A${r} ${r} 0 0 1 ${px(x + r)} ${px(y)}Z`;
}

export const box: Block<BoxProps> = (p, ctx) => {
  const id = p.id ?? "box";
  const w = ctx.stroke * (p.key ? 2 : 1);
  const layer = p.layer;
  const drawn = ctx.instant ? 1 / 30 : ctx.dur.move * 1.3;
  const out: Node[] = [];
  if (p.fill) out.push({ id: `${id}-fill`, kind: "rect", x: px(p.x), y: px(p.y), w: px(p.w), h: px(p.h), fill: p.fill, radius: ctx.radius, layer,
    tracks: appear(ctx, p.at + drawn * 0.6, p.until, 0) });
  out.push({ id: `${id}-line`, kind: "path", d: rounded(p.x, p.y, p.w, p.h, ctx.radius), stroke: p.stroke ?? "ink", width: w, join: "round", layer,
    dash: p.dash ? [ctx.stroke * 5, ctx.stroke * 4] : undefined, box: { x: p.x, y: p.y, w: p.w, h: p.h },
    tracks: { ...appear(ctx, p.at, p.until, 0), draw: go(ctx, p.at, 0, 1, ctx.noOvershoot("move"), 1.3, "move") } });
  if (p.label) {
    const role = p.labelRole ?? "label";
    const pad = Math.max(ctx.size(role) * 0.5, ctx.radius * 0.6);
    const room = p.w - pad * 2;
    let text = p.label;
    if (ctx.measure(text, role) > room) {
      while (text.length > 1 && ctx.measure(text + "…", role) > room) text = text.slice(0, -1);
      text = text.trimEnd() + "…";
      console.warn(`box ${id}: label "${p.label}" cut to fit`);
    }
    const lh = ctx.lineHeight(role);
    const lx = p.labelOutside ? p.x : p.x + pad;
    const ly = p.labelOutside ? p.y - lh - ctx.size(role) * 0.35 : p.y + pad * 0.7;
    if (!textSafe(ctx, { x: lx, y: ly, w: ctx.measure(text, role), h: lh }, role)) console.warn(`box ${id}: label is outside the text-safe area`);
    out.push({ id: `${id}-label`, kind: "text", x: px(lx), y: px(ly), text, role, color: p.labelColor ?? "inkMuted", layer,
      tracks: appear(ctx, p.at + drawn * 0.5, p.until, 0) });
  }
  return out;
};
