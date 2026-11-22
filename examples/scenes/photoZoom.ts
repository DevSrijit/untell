// A photo with `zoom` in a round crop (Pop's sticker): the inner picture is larger than its clip on purpose.
// HyperFrames' container_overflow must not report it (the clip hides the overflow).
import type { BLOCKS } from "../../src/system/scene/blocks";
import type { Ctx, Node } from "../../src/system/scene/types";

export const seconds = 3;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const s = Math.round(ctx.width * 0.6);
  return B.photo({ id: "sticker", media: "noir-bridge", box: { x: Math.round((ctx.width - s) / 2), y: Math.round(ctx.height * 0.3), w: s, h: s }, shape: "circle", zoom: 1.4, motion: "push", at: 0 }, ctx);
};
