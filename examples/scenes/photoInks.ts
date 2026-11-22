// Print media, made in prepare: a Riso picture prints ink by ink (two halftone separations, one a beat, overprinted
// with multiply and slightly off register), and a Cutout subject is a two-tone paper cut on a black card.
// Run in Riso it shows the passes; in Cutout, the paper cut. The press name is a random draw.
import type { BLOCKS } from "../../src/system/scene/blocks";
import type { Ctx, Node } from "../../src/system/scene/types";

export const seconds = 5;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe, W = S.right - S.left;
  const head = B.title({ id: "head", text: ctx.system.id === "riso" ? "Two inks, one pass a beat." : "Cut, not filtered.", role: "headline", enter: "cut",
    x: S.left, y: S.top, w: W, h: ctx.lineHeight("headline") * 3, at: 0 }, ctx);
  const top = S.top + ctx.lineHeight("headline") * 3;
  if (ctx.system.id === "riso") {
    // The photo is 1280 x 853 px; at the safe width it is under 1x.
    const h = Math.round(W * 853 / 1280);
    return [...head, ...B.photo({ id: "press", media: "riso-brayer-hands", box: { x: S.left, y: top, w: W, h }, passes: { beat: 0.8 }, motion: "still", at: 0.4 }, ctx)];
  }
  // Cutout: a black card, and the hand as cut paper on it.
  const h = Math.min(ctx.height - top - (ctx.width - S.right), Math.round(W * 1.2));
  return [
    ...head,
    ...B.shape({ id: "card", kind: "rect", x: S.left, y: top, w: W, h, fill: "ink", enter: "cut", layer: -1, at: 0.2 }, ctx),
    ...B.photo({ id: "hand", media: "cutout-hand", box: { x: S.left, y: top, w: W, h }, plate: false, paper: true, sticker: true, motion: "still", at: 0.6 }, ctx),
  ];
};
