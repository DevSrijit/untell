// The annotate scene: Newton's second law, with each symbol named by an arrow and a label.
// Each label is an obstacle for the next, so no two labels meet.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { lines } from "../../src/system/scene/context";
import { annotateLayout, type AnnotateProps } from "../../src/system/scene/blocks/annotate";
import { inkOf } from "../../src/system/scene/blocks/highlight";
import { linesAtBottom, linesAtTop, rowBoxes, type Row } from "../../src/system/scene/blocks/rows";
import type { Box } from "../../src/system/scene/blocks/util";

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const [r0, r1] = rowBoxes(ctx, 3) as [Row, Row, Row];
  const F = "F = ma";
  const fw = ctx.measure(F, "display");
  const fx = Math.round(r1.x + (r1.w - fw) / 2), fy = linesAtBottom(ctx, r1, "display", 1);
  // Each symbol's ink box: from its left edge to its right, from its top to its bottom.
  const glyph = (before: string, ch: string): Box => {
    const ink = inkOf(ctx, "display", fy, ch);
    return { x: fx + (before ? ctx.measure(before, "display") : 0), y: ink.top, w: ctx.measure(ch, "display"), h: ink.bottom - ink.top };
  };
  const syms = [glyph("", "F"), glyph("F = ", "m"), glyph("F = m", "a")];
  const eq = glyph("F ", "=");
  const title: Box = { x: r0.x, y: linesAtTop(ctx, r0, "label"), w: ctx.measure("Newton's second law", "label"), h: ctx.lineHeight("label") };
  const obstacles: Box[] = [title, ...syms, eq];
  const notes: (Omit<AnnotateProps, "obstacles" | "at"> & { at: number })[] = [
    { id: "nF", target: syms[0]!, label: "Force, in newtons", prefer: "above", at: 1.5 },
    { id: "nm", target: syms[1]!, label: "Mass, in kg", prefer: "below", at: 2.6 },
    { id: "na", target: syms[2]!, label: "Acceleration, in m/s²", prefer: "above", at: 3.7 },
  ];
  const out: Node[] = [
    ...lines(ctx, { id: "title", x: r0.x, y: linesAtTop(ctx, r0, "label"), lines: ["Newton's second law"], role: "label", color: "inkMuted", at: 0.3 }),
    ...lines(ctx, { id: "eq", x: fx, y: fy, lines: [F], role: "display", at: 0.5 }),
  ];
  // Each placed label and leader is an obstacle for the next, so no labels meet and no leaders cross.
  const points: [number, number][] = [];
  for (const n of notes) {
    const p: AnnotateProps = { ...n, obstacles: [...obstacles], points: [...points] };
    const L = annotateLayout(p, ctx);
    if (L.ok) { obstacles.push(L.label); points.push(...L.points); }
    out.push(...B.annotate(p, ctx));
  }
  return out;
};
