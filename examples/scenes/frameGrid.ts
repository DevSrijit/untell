// The frameGrid scene: the grid of the system in this frame. The outline is the text-safe area,
// the lines are the system's columns, and the + marks register the corners. The column lines then
// step back to ticks, and labels state the grid's measured values.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { frameFor } from "../../src/system/frame";

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe, x = S.left;
  const geo = frameFor(ctx.system, ctx.width, ctx.height);
  // The text area, as the grid draws it: the safe area, never nearer an edge than the margin.
  const areaW = Math.round(ctx.width - geo.left - geo.right);
  const areaH = Math.round(ctx.height - Math.max(geo.safe.top, geo.margin) - Math.max(geo.safe.bottom, geo.margin));
  const lhL = ctx.lineHeight("label");
  return [
    ...B.frameGrid({ id: "grid", columns: "lines", columnsUntil: 2.3, at: 0 }, ctx),
    // The rule in headline on the optical centre of the outline, the measured values in body above it.
    ...B.text({ id: "facts", text: [`${geo.columns} columns`, `Gutter ${Math.round(geo.gutter)} px`, `Text area ${areaW} × ${areaH} px`], role: "body", color: "inkMuted", keepCase: true, x, y: S.top + lhL, stagger: true, at: 2.7 }, ctx),
    ...B.title({ id: "rule", text: "Text stays inside the outline.", role: "headline", x, y: Math.round(S.top + (S.bottom - S.top) * 0.46), w: S.right - S.left, at: 3.1 }, ctx),
  ];
};
