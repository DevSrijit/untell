// Picture shapes and speed: a triangle crop with a sticker edge, a cut-out with a sticker outline from its own
// alpha, and footage in slow motion (rate 0.5). The fact: a kernel pops at about 180 °C.
import type { BLOCKS } from "../../src/system/scene/blocks";
import type { Ctx, Node } from "../../src/system/scene/types";

export const seconds = 6;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe, W = S.right - S.left;
  const head = B.title({ id: "head", text: "Pops at 180 °C.", role: "headline", keepCase: true, enter: "cut", x: S.left, y: S.top, w: W, h: ctx.lineHeight("headline") * 2, at: 0 }, ctx);
  const gap = Math.round(ctx.lineHeight("body"));
  const top = S.top + ctx.lineHeight("headline") + gap * 2;
  const side = Math.round((W - gap) / 2);
  // The cut-out's sticker edge reaches past the subject, so its box keeps a margin round the subject.
  const handH = Math.round(side * 1.2);
  const clipY = top + Math.max(side, handH) + gap * 2;
  const clipH = Math.min(ctx.height - clipY - (ctx.width - S.right), Math.round(W * 9 / 16));
  return [
    ...head,
    ...B.photo({ id: "corn", media: "pop-popcorn", box: { x: S.left, y: top, w: side, h: side }, shape: "triangle", sticker: true, motion: "still", at: 0.3 }, ctx),
    ...B.photo({ id: "hand", media: "cutout-hand", box: { x: S.left + side + gap, y: top, w: side, h: handH }, plate: false, sticker: true, motion: "still", focus: [0.5, 0.5], at: 0.6 }, ctx),
    ...B.photo({ id: "net", media: "hoop-net", box: { x: S.left, y: clipY, w: W, h: clipH }, rate: 0.5, motion: "still", at: 1.0, until: seconds }, ctx),
  ];
};
