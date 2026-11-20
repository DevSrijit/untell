// The shape block: a square draws, a circle grows inside it, and a triangle slides in and turns in 90-degree steps.
// The pair is the subject: one line over it, the square as large as the frame allows (lineAndSubject), the
// triangle beside it at 16:9 and under it at 9:16 (shapes are graphics: they may use the lower band).
// The fact: a square and a circle of the same width; the circle covers pi / 4 of the square, about 79 %.
import type { Ctx, Node } from "../../src/system/scene/types";
import { lineAndSubject, type BLOCKS } from "../../src/system/scene/blocks";

export const seconds = 7;
export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe, w = S.right - S.left;
  const tall = ctx.height > ctx.width;
  const text = ["A circle fills", "79 % of its square."];
  const lineH = B.measure("title", { id: "m", x: S.left, y: S.top, w, text, role: "headline", keepCase: true, at: -10 }, ctx).h;
  const L = lineAndSubject(ctx, { lineH, aspect: tall ? 0.75 : 1.5, area: 0.36 });
  const side = Math.round(tall ? L.subject.w : Math.min(L.subject.h, L.subject.w * 0.62));
  const sq = { x: L.subject.x + (tall ? 0 : 0), y: L.subject.y, w: side, h: side };
  const t = Math.round(side * 0.42);
  const tri = tall ? { x: sq.x + side - t, y: sq.y + side + Math.round(side * 0.08), w: t, h: t } : { x: sq.x + side + Math.round(side * 0.12), y: sq.y + side - t, w: t, h: t };
  return [
    ...B.title({ id: "h", x: L.line.x, y: L.line.y, w, text, role: "headline", keepCase: true, at: 0 }, ctx),
    ...B.shape({ id: "sq", kind: "square", ...sq, stroke: "ink", weight: 2, enter: "draw", at: 0.4 }, ctx),
    ...B.shape({ id: "ci", kind: "circle", ...sq, fill: "accent", enter: "grow", exact: true, at: 1.4 }, ctx),
    ...B.shape({ id: "tri", kind: "triangle", ...tri, fill: "ink", enter: "slide", at: 2.4, turns: [{ at: 3.8, by: 90 }, { at: 4.8, by: 90 }] }, ctx),
  ];
};
