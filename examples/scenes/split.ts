// The split scene: sound against light. Every value is computed from the speeds:
// sound in air at 20 °C is 343 m/s, so 1 km takes 1000 / 343 = 2.9 s;
// light in a vacuum is 299,792 km/s, so 1 km takes 1 / 299,792 s = 3.3 µs.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { pairOf } from "./chartFrame";

const SOUND = 343; // m/s
const LIGHT = 299_792_458; // m/s
const perKm = (v: number) => 1000 / v; // s

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const s = ctx.safe;
  const wide = ctx.width > ctx.height;
  return [
    ...pairOf(ctx, B, "", (box) => B.split({
      id: "speed",
      ...box,
      a: { heading: "Sound", points: [`${SOUND} m/s in air`, "A pressure wave", "Needs a medium", `1 km in ${perKm(SOUND).toFixed(1)} s`] },
      b: { heading: "Light", points: [`${Math.round(LIGHT / 1000).toLocaleString("en-US")} km/s`, "An electromagnetic wave", "Crosses a vacuum", `1 km in ${(perKm(LIGHT) * 1e6).toFixed(1)} µs`] },
      winner: "b",
      verdict: "Faster",
      at: 0.3,
    }, ctx)),
  ];
};
