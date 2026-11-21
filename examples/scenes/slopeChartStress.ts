// Awkward data for the slope chart: ten items, an exact tie on the left, values packed close on both
// sides, and lines that cross. Fictional data for Shobruzisa Clinic. At 9:16 the right labels must end
// in the narrow low band, so names longer than about 12 characters do not fit there.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => [
  ...B.slopeChart({
    id: "waits",
    x: ctx.safe.left, y: ctx.safe.top, w: ctx.safe.right - ctx.safe.left, h: ctx.safe.bottom - ctx.safe.top,
    title: "Shobruzisa Clinic, median wait by clinic, days",
    fromLabel: "2024", toLabel: "2025",
    items: [
      { label: "Heart", from: 41, to: 18 },
      { label: "Skin", from: 38, to: 37 },
      { label: "Ear and nose", from: 38, to: 44 },
      { label: "Brain", from: 52, to: 49 },
      { label: "Bones", from: 29, to: 31 },
      { label: "Eyes", from: 27, to: 30 },
      { label: "Joints", from: 33, to: 36 },
      { label: "Kidneys", from: 22, to: 25 },
      { label: "Gut", from: 45, to: 47 },
      { label: "Lungs", from: 31, to: 33 },
    ],
    key: 0,
    at: 0.3,
  }, ctx),
];
