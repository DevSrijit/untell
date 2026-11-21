// The cycle scene: the water cycle. The sun drives evaporation; rising air cools and the vapour
// condenses; droplets grow until they fall; the water collects and the loop starts again.
// Shared by Remotion and HyperFrames.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { pairOf } from "./chartFrame";

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => [
  ...pairOf(ctx, B, "", (box) => B.cycle({
    id: "water",
    ...box,
    title: "The water cycle",
    steps: [
      { label: "Evaporation", note: "The sun heats the sea. Water turns to vapour and rises." },
      { label: "Condensation", note: "Rising air cools. The vapour condenses into cloud droplets." },
      { label: "Precipitation", note: "Droplets join until they are too heavy, then fall as rain or snow." },
      { label: "Collection", note: "Water runs into rivers, lakes and the sea, and the loop starts again." },
    ],
    at: 0.3,
    every: 2.4,
  }, ctx)),
];
