// The dumbbell scene: the temperatures at which common substances melt and boil at sea-level pressure.
// Each row is the range in which the substance is a liquid. Values are standard handbook figures,
// rounded to the degree. The key row is water: liquid from 0 °C to 100 °C.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { pairOf } from "./chartFrame";

export const seconds = 8;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => [
  ...pairOf(ctx, B, "Water is liquid from 0 to 100 °C", (box) => B.dumbbell({
    id: "liquid", ...box,
    title: "Liquid range at sea-level pressure, °C",
    fromLabel: "Melts", toLabel: "Boils",
    rows: [
      { label: "Water", from: 0, to: 100 },
      { label: "Mercury", from: -38.83, to: 356.73 },
      { label: "Ethanol", from: -114.1, to: 78.37 },
      { label: "Ammonia", from: -77.73, to: -33.34 },
      { label: "Benzene", from: 5.53, to: 80.1 },
      { label: "Acetone", from: -94.7, to: 56.05 },
      { label: "Bromine", from: -7.2, to: 58.8 },
    ],
    key: 0,
    format: { decimals: 0 },
    at: 0.3,
  }, ctx)),
  ...B.hold({ at: 4.5, until: seconds }, ctx),
];
