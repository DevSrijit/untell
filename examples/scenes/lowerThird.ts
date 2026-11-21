// The lower-third scene: a speaker's name and role over the footage they speak on, at the foot of the text-safe area.
// The picture fills the frame above the low band and stays to the end; the name holds to the end too, so the last
// frame still says who speaks. The lines sit on a plate of the ground (`plate`), so they keep their contrast on any picture.
// The names are random draws.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";

export const seconds = 5.5;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const s = ctx.safe;
  const tall = ctx.height > ctx.width;
  // At 9:16 the foot of the safe area is in the low band, so the text ends by lowBandRight.
  // The height holds the name, two role lines, and the room the block keeps free below them.
  const right = tall ? s.lowBandRight : s.left + Math.round(ctx.width * 0.5);
  const h = Math.round(ctx.lineHeight("headline") + ctx.lineHeight("label") * 2 + ctx.size("label") * 2.2);
  // The footage: 1.19x at most at 9:16 (the box stops above the frame's foot, the source stays sharp).
  const box = tall ? { x: 0, y: 0, w: ctx.width, h: Math.round(ctx.width * 1.25) } : { x: Math.round(ctx.width * 0.45), y: 0, w: Math.round(ctx.width * 0.55), h: ctx.height };
  return [
    ...B.photo({ id: "shot", media: "title-jetty", box, motion: "push", amount: 0.03, at: 0 }, ctx),
    ...B.lowerThird({ id: "speaker", x: s.left, y: s.bottom - h, w: right - s.left, h,
      name: "Oreli Vantask", role: "Harbour engineer, Harnvik Works", plate: true, at: 0.6 }, ctx),
  ];
};
