// The product block's default framing, one object at a time: a turntable with no framing props (no fill, no room, no
// centreY), so the block frames the object by itself. The contact sheets compare objects of different build: a lantern
// (a cage of thin metal round clear glass), an armchair (mass), a vase (tall and slim) and a desk lamp (a thin arm and a
// small shade: a desk lamp). The object's silhouette must cover the hook's share of the frame through the
// whole turn.
import type { BLOCKS } from "../../src/system/scene/blocks";
import { lineAbove } from "../../src/system/scene/blocks";
import { anchor } from "../../src/system/scene/context";
import { standing } from "../../src/system/three/models";
import type { Ctx, Node } from "../../src/system/scene/types";

export const seconds = 3;

/** The four objects, as a film would stand them. */
export const OBJECTS = {
  lantern: () => standing("lantern", "model-lantern", { height: 2.6 }),
  armchair: () => standing("chair", "model-armchair", { height: 2 }),
  vase: () => standing("vase", "model-vase", { height: 3 }),
  lamp: () => standing("lamp", "velora-lamp", { height: 2.8 }),
} as const;

export const frameScene = (object: keyof typeof OBJECTS) => (ctx: Ctx, B: typeof BLOCKS): Node[] =>
  B.product({ id: "hero", objects: [OBJECTS[object]()], shot: "turntable", at: 0 }, ctx);

/**
 * The block map's composition for a product system ("top"): a headline at the text-safe top, the object in the room
 * under it, the line placed by lineAbove on the object's drawn bounds. The room's top is the line's foot plus a gap.
 */
export const lineScene = (object: keyof typeof OBJECTS, text = ["Light where", "the work is."]) => (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe, w = S.right - S.left, gap = Math.round(ctx.lineHeight("body"));
  const lineH = Math.ceil(B.measure("title", { id: "m", x: S.left, y: S.top, w, text, role: "headline", maxLines: 2, at: -10 }, ctx).h);
  const top = Math.round(S.top + lineH + gap);
  const room = { x: 0, y: top, w: ctx.width, h: Math.round(ctx.height * 0.97) - top };
  const shot = B.product({ id: "hero", objects: [OBJECTS[object]()], shot: "turntable", room, at: 0 }, ctx);
  return [...shot, ...B.title({ id: "line", text, role: "headline", maxLines: 2, ...lineAbove(ctx, anchor(shot, "hero-object-extent"), lineH), at: 0.2 }, ctx)];
};
