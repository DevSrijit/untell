// A real model through the product block: a brass vase, prepared as a glTF model (the media table names the file). A turntable
// under a passing light. The artist's own worn brass.
// "Pefes" is a fictional name.
import { anchor } from "../../src/system/scene/context";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { standing } from "../../src/system/three/models";
import type { Ctx, Node } from "../../src/system/scene/types";

export const seconds = 8;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const tall = ctx.height > ctx.width;
  const vase = standing("vase", "model-vase", { height: 3 });
  const shot = B.product({ id: "hero", objects: [vase], shot: "turntable", seconds, fill: tall ? 0.25 : 0.55, centreY: tall ? 0.57 : 0.55, at: 0 }, ctx);
  const obj = anchor(shot, "hero-object");
  // The caption takes the top left corner of the safe area; the object stands below it.
  const { left, top } = ctx.safe;
  const lhL = ctx.lineHeight("label"), lhC = ctx.lineHeight("caption");
  const capY = top + lhL * 0.5;
  if (capY + lhL * 1.1 + lhC + lhL > obj.y) throw new Error("model-vase: the caption reaches the object (" + Math.round(obj.y) + ")");
  return [
    ...shot,
    ...B.text({ id: "name", text: "Pefes", role: "label", color: "ink", x: left, y: capY, at: 4.6 }, ctx),
    ...B.text({ id: "line", text: "Brass, turned by hand.", role: "caption", color: "inkMuted", x: left, y: capY + lhL * 1.1, at: 5.0 }, ctx),
  ];
};
