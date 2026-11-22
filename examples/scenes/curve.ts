// The curve scene: a cable's parabola, y = x², drawn over a measured span, with a callout on the curve and its sag
// as a dimension-free label. The answer is drawn: the curve itself.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { curvePoints } from "../../src/system/scene/blocks";

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe;
  const w = S.right - S.left;
  const title = B.title({ id: "q", x: S.left, y: S.top, w, text: "A cable hangs in a parabola", role: "headline", maxLines: 2, at: 0 }, ctx);
  const top = B.measure("title", { id: "q", x: S.left, y: S.top, w, text: "A cable hangs in a parabola", role: "headline", maxLines: 2, at: 0 }, ctx);
  const box = { x: S.left, y: top.y + top.h + ctx.lineHeight("body") * 2, w, h: Math.round(w * 0.5) };
  const cable = { fn: (x: number) => x * x, domain: [-1, 1] as [number, number], range: [0, 1] as [number, number], box };
  const pts = curvePoints(cable);
  const low = pts[Math.round(pts.length / 2)]!;
  return [
    ...title,
    ...B.curve({ id: "cable", ...cable, weight: 2, at: 0.6 }, ctx),
    ...B.callout({ id: "low", label: "LOWEST POINT", target: { x: low[0], y: low[1] }, points: pts, at: 1.8 }, ctx),
  ];
};
