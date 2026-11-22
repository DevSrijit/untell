// A product film made in code: a small speaker with a matte body and a metal ring, shot on a turntable
// under a passing light. The caption reads where the object is not, using the block's anchor.
import { anchor } from "../../src/system/scene/context";
import type { BLOCKS } from "../../src/system/scene/blocks";
import type { Object3D } from "../../src/system/three/spec";
import type { Ctx, Node } from "../../src/system/scene/types";

export const seconds = 9;

const speaker: Object3D[] = [
  { id: "shell", geometry: { kind: "cylinder", r: 0.95, h: 1.7, radius: 0.32 }, material: { role: "surface", finish: "matte" }, position: [0, 0.85, 0] },
  { id: "band", geometry: { kind: "cylinder", r: 0.957, h: 0.5, radius: 0.02 }, material: { role: "rule", finish: "satin" }, position: [0, 0.62, 0] },
  { id: "ring", geometry: { kind: "torus", r: 0.82, tube: 0.045 }, material: { role: "accent", finish: "metal" }, position: [0, 1.71, 0], rotation: [90, 0, 0] },
  { id: "led", geometry: { kind: "sphere", r: 0.035 }, material: { role: "accent", finish: "gloss" }, position: [0, 1.15, 0.93] },
];

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const tall = ctx.height > ctx.width;
  const shot = B.product({ id: "hero", objects: speaker, shot: "turntable", seconds, fill: tall ? 0.5 : 0.42, centreY: tall ? 0.4 : 0.47, at: 0 }, ctx);
  const obj = anchor(shot, "hero-object");
  const { left, bottom } = ctx.safe;
  const lhL = ctx.lineHeight("label"), lhC = ctx.lineHeight("caption");
  // The caption sits under the object when it fits inside the safe area; otherwise above or beside it.
  const h = lhL * 1.1 + lhC;
  const below = obj.y + obj.h + lhL * 1.5;
  const above = obj.y - h - lhL * 1.5;
  // Below, else above, else beside the object (a wide frame has room at the side).
  const capY = below + h <= bottom ? below : above >= ctx.safe.top ? above : obj.y + obj.h / 2 - h / 2;
  return [
    ...shot,
    ...B.text({ id: "name", text: "Hearth One", role: "label", color: "ink", x: left, y: capY, at: 5.6 }, ctx),
    ...B.text({ id: "line", text: "Quiet, made solid.", role: "caption", color: "inkMuted", x: left, y: capY + lhL * 1.1, at: 6.0 }, ctx),
  ];
};
