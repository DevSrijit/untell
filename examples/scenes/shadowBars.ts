// Shadow bars (Noir): a hard key light through a blind falls on the street picture, and the bars' phase is solved
// so every letter of the title stays in the light. The bars cut on with the light, on one frame.
// The film's title is a random draw.
import type { BLOCKS } from "../../src/system/scene/blocks";
import { shadowBars } from "../../src/system/scene/blocks/shadowBars";
import type { Ctx, Node } from "../../src/system/scene/types";

export const seconds = 5;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe, W = S.right - S.left;
  // The plate fills the lower part of the frame; its source is 910 x 1280 px, so the box keeps it near 1x.
  const pw = Math.min(ctx.width, 1000), ph = Math.round(pw * 1280 / 910);
  const plane = { x: (ctx.width - pw) / 2, y: ctx.height - ph, w: pw, h: ph };
  const title = B.text({ id: "title", x: S.left, y: Math.max(S.top, plane.y + ctx.lineHeight("display")), w: W, text: "Harbour", role: "display", at: 0.6 }, ctx);
  return [
    ...B.photo({ id: "street", media: "noir-bridge", box: plane, motion: "still", at: 0 }, ctx),
    ...title,
    ...shadowBars({ id: "blind", plane, angle: -10, period: Math.round(ctx.lineHeight("display") * 1.9), duty: 0.4, stretch: 2, keepLit: title, at: 1.4 }, ctx),
  ];
};
