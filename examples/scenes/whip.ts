// A whip pan (Courtside): the view whips from one panel to the next in 5 frames, blurred along its travel only
// while it moves, and lands sharp on the beat. The caption stays pinned through the whip. The score is fictional.
import type { BLOCKS } from "../../src/system/scene/blocks";
import { withView } from "../../src/system/scene/context";
import { pin, whip } from "../../src/system/scene/screen";
import type { Ctx, Node } from "../../src/system/scene/types";

export const seconds = 5;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe, W = ctx.width;
  const out: Node[] = [];
  ["98", "101"].forEach((score, i) => {
    const v = withView(ctx, { x: i * W });
    out.push(...B.shape({ id: `slab${i}`, kind: "rect", x: i * W + S.left, y: S.top + ctx.lineHeight("headline") * 3, w: S.right - S.left, h: Math.round((S.bottom - S.top) * 0.35),
      fill: i ? "accent" : "surface", enter: "cut", at: 0 }, v));
    out.push(...B.text({ id: `score${i}`, x: i * W + S.left, y: S.top + ctx.lineHeight("headline"), text: score, role: "headline", at: 0 }, v));
  });
  out.push(...whip(B.camera({ moves: [] }, ctx), ctx, [{ at: 2, dx: W, frames: 5 }]));
  out.push(...pin(B.text({ id: "caption", x: S.left, y: S.bottom - ctx.lineHeight("body"), text: "Q4", role: "label", at: 0 }, ctx)));
  return out;
};
