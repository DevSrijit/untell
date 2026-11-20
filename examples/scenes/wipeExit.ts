// The panel wipe of an agent's first Courtside film: it sweeps in, holds behind the words, sweeps off, and a whip then pans a
// frame width to the right. Its exit must read as the whole panel sliding off, and no edge of it may show after the whip.
import type { BLOCKS } from "../../src/system/scene/blocks";
import { withView } from "../../src/system/scene/context";
import type { Ctx, Node } from "../../src/system/scene/types";

export const seconds = 5;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe, W = ctx.width;
  return [
    ...B.wipe({ id: "panel", at: 0.5, style: "panel", layer: -1, hold: 1.5 }, ctx),
    ...B.kineticWords({ id: "words", x: S.left, y: S.top, w: S.right - S.left, h: (S.bottom - S.top) * 0.5, phrases: [{ text: "TWO LENGTHS", at: 0.6 }], until: 2.4 }, ctx),
    ...B.camera({ id: "camera", moves: [], whips: [{ at: 3.2, dx: W, frames: 5 }] }, ctx),
    ...B.kineticWords({ id: "end", x: W + S.left, y: S.top, w: S.right - S.left, h: (S.bottom - S.top) * 0.5, phrases: [{ text: "FRIDAY", at: 3.4 }] }, withView(ctx, { x: W })),
  ];
};
