// The floor reflection (effect "reflection", Matte): a table lamp made in code stands on the dark floor, and the
// floor gives back a faint, matte mirror of it that turns with it. "Kosel" is a fictional name, drawn at random.
// The reflection is the renderer's: a system that does not allow it draws the same scene with no mirror.
import { anchor } from "../../src/system/scene/context";
import type { BLOCKS } from "../../src/system/scene/blocks";
import type { Object3D } from "../../src/system/three/spec";
import type { Ctx, Node } from "../../src/system/scene/types";

export const seconds = 8;

const lamp: Object3D[] = [
  { id: "base", geometry: { kind: "cylinder", r: 0.7, h: 0.18, radius: 0.06 }, material: { role: "surface", finish: "matte" }, position: [0, 0.09, 0] },
  { id: "stem", geometry: { kind: "cylinder", r: 0.07, h: 1.5, radius: 0.03 }, material: { role: "accent", finish: "metal" }, position: [0, 0.93, 0] },
  { id: "shade", geometry: { kind: "lathe", profile: [[0.12, 0], [0.62, -0.05], [0.95, -0.62], [0.9, -0.66], [0.56, -0.12], [0.1, -0.06]] }, material: { role: "surface", finish: "matte" }, position: [0, 2.3, 0] },
];

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const tall = ctx.height > ctx.width;
  const shot = B.product({ id: "hero", objects: lamp, shot: "turntable", seconds, fill: tall ? 0.42 : 0.4, centreY: tall ? 0.42 : 0.44, at: 0 }, ctx);
  const obj = anchor(shot, "hero-object");
  const { left, top } = ctx.safe;
  const lhL = ctx.lineHeight("label");
  // The caption takes the top left corner of the safe area, clear of the lamp.
  if (top + lhL * 2.4 > obj.y && left + ctx.measure("Kosel desk lamp", "label") > obj.x) throw new Error("floorReflection: the caption reaches the lamp");
  return [
    ...shot,
    ...B.text({ id: "name", text: "Kosel desk lamp", role: "label", color: "ink", x: left, y: top + lhL * 0.5, at: 0 }, ctx),
    ...B.text({ id: "line", text: "Brass stem, matte shade.", role: "label", color: "inkMuted", x: left, y: top + lhL * 1.6, at: 0.4 }, ctx),
    ...B.hold({ at: 4, until: seconds }, ctx),
  ];
};
