// Light on a picture: a rim light comes on along the lens's right edge, then a light sweep crosses it once.
// Both are cut to the cut-out's alpha, so the black ground stays black. Keynote and Matte allow both effects.
// The lens name is a random draw.
import type { BLOCKS } from "../../src/system/scene/blocks";
import type { Ctx, Node } from "../../src/system/scene/types";

export const seconds = 6;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe;
  const head = B.title({ id: "head", text: "Varo 35 mm.", role: "headline", enter: "cut", x: S.left, y: S.top, w: S.right - S.left, h: ctx.lineHeight("headline") * 2, at: 0 }, ctx);
  // The photo is 853 x 1280 px: a box at 1.1x keeps the upscale under the 1.15 warning, centred under the title.
  const w = Math.min(S.right - S.left, Math.round(853 * 1.1)), h = Math.round(w * 1280 / 853);
  const y = Math.min(ctx.height - h, S.top + ctx.lineHeight("headline") * 2);
  return [
    ...head,
    ...B.photo({ id: "lens", media: "keynote-lens", box: { x: (ctx.width - w) / 2, y, w, h }, motion: "still", at: 0,
      rim: { at: 0.6, angle: 0 }, sweep: { at: 1.8, seconds: 2.2, angle: 18 } }, ctx),
  ];
};
