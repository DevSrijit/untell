// Two product shots that cut with no overlap, then a third: the test scene for a 3D shot's first frame. Shot one
// turns a real model (the lantern); at CUT1 the second shot pushes in on the same model from another side; at CUT2 a
// shot of simple geometry follows. No shot starts before its cut. Every frame at and after a cut must show the new
// shot, drawn for its own time (src/system/three/cut.e2e.test.ts reads the frames).
import type { BLOCKS } from "../../src/system/scene/blocks";
import { standing } from "../../src/system/three/models";
import type { Ctx, Node } from "../../src/system/scene/types";

export const seconds = 3;
export const CUT1 = 1;
export const CUT2 = 2;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const lantern = (turn: number) => [standing("lantern", "model-lantern", { height: 2.6 }, { rotation: [0, turn, 0] })];
  const puck = [{ id: "puck", geometry: { kind: "cylinder" as const, r: 1, h: 0.5, radius: 0.15 }, material: { role: "surface" as const, finish: "satin" as const }, position: [0, 0.25, 0] as [number, number, number] }];
  return [
    ...B.product({ id: "s1", objects: lantern(-20), shot: "turntable", at: 0, until: CUT1 }, ctx),
    ...B.product({ id: "s2", objects: lantern(70), shot: "push", at: CUT1, until: CUT2 }, ctx),
    ...B.product({ id: "s3", objects: puck, shot: "turntable", at: CUT2, until: seconds }, ctx),
  ];
};
