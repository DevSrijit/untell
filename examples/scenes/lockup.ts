// The lockup scene: a mark and a name on one axis, as one unit, at the size of a title card. The line under the
// name says what the thing is. The name is a random draw.
// At 16:9 the line is set in headline: a phone shows a wide frame at about half the scale of a tall one, and body
// letters are then too small to read. A short line keeps it under the name's width, and the card under five words of
// prose (Mark's density limit).
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";

export const seconds = 6;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe, x = S.left, W = S.right - S.left;
  const tall = ctx.height > ctx.width;
  const L = { id: "brand", name: "Torvane", line: "Bicycle lamps", mark: "circle" as const, axis: (tall ? "column" : "row") as "column" | "row",
    role: "display" as const, lineRole: (tall ? "body" : "headline") as "body" | "headline", x, w: W, at: 0.2 };
  const m = B.measure("lockup", { ...L, y: S.top, at: -10 }, ctx);
  // The lockup's middle on the frame's optical centre (46 % down the area from the text-safe top to the picture-safe
  // foot), held inside the text-safe area: a name with its mark is a poster, centred on the frame.
  const pfoot = ctx.height - Math.ceil(ctx.system.margin * Math.min(ctx.width, ctx.height));
  const y = Math.round(Math.min(S.bottom - m.h, S.top + (pfoot - S.top) * 0.46 - m.h / 2));
  return B.lockup({ ...L, y }, ctx);
};
