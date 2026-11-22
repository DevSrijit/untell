// The waveform scene: how noise cancelling works. A noise wave travels toward the ear. A speaker plays
// the same wave inverted. Where the two meet, the pressures add to zero, so the sum flattens to a line.
// The physics is exact: the sum lane is the point-by-point sum of the other two lanes in every frame.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { pairOf } from "./chartFrame";

// A hum with two weaker, higher tones: 3, 7 and 13 cycles across the lane.
const hum = [{ a: 1, k: 3 }, { a: 0.32, k: 7, phase: 0.15 }, { a: 0.16, k: 13, phase: 0.6 }];

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  return [
    ...pairOf(ctx, B, "Two waves that cancel make silence", (box) => B.waveform({
      id: "anc", ...box,
      title: "Air pressure on the way to the ear",
      lanes: [
        { label: "Noise", parts: hum, at: 0.4, enter: 0.8 },
        { label: "+ Anti-noise, inverted", invert: 0, gain: 0, gains: [{ at: 3.6, to: 1 }], at: 0.5 },
        { label: "= What the ear hears", sum: [0, 1], key: true, at: 0.6, note: { at: 5.4, text: "Silence" } },
      ],
      travel: { speed: 1.5, until: 7 },
      at: 0.3,
    }, ctx)),
  ];

};
