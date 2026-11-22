// A ducked bed for the render proof: a music bed with one 12 dB dip from 2.0 s to 3.2 s, and a still line, so the
// render's level under the dip can be measured against the scene's mix (the bed splits into three clips of one file,
// joined by 2-frame crossfades: does each renderer play the fades as the mix says?).
import type { BLOCKS } from "../../src/system/scene/blocks";
import type { Ctx, Node } from "../../src/system/scene/types";

export const seconds = 5;
export const TRACK = "spec-music-7";
export const FROM = 20;
export const DUCK = { at: 2, depth: 12, length: 1.2 };

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => [
  ...B.music({ media: TRACK, clipStart: FROM, until: seconds, volume: 0.5, fadeIn: 0, fadeOut: 0, duck: [DUCK] }, ctx),
  ...B.text({ id: "line", text: "A dip in the bed.", role: "headline", x: ctx.safe.left, y: ctx.safe.top, w: ctx.safe.right - ctx.safe.left, at: 0 }, ctx),
];
