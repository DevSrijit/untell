// Awkward data for the dumbbell: changes in both directions, one row with no change, rows with close
// values, and long row labels. Fictional data for Nyljeahi Academy.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => [
  ...B.dumbbell({
    id: "reading",
    x: ctx.safe.left, y: ctx.safe.top, w: ctx.safe.right - ctx.safe.left, h: ctx.safe.bottom - ctx.safe.top,
    title: "Nyljeahi Academy, minutes of reading a day",
    fromLabel: "Autumn", toLabel: "Spring",
    rows: [
      { label: "Year 7", from: 24, to: 31 },
      { label: "Year 8", from: 28, to: 22 },
      { label: "Year 9", from: 19, to: 19 },
      { label: "Year 10", from: 21, to: 23 },
      { label: "Year 11 (exam year)", from: 35, to: 12 },
      { label: "Sixth form, humanities", from: 40, to: 46 },
      { label: "Sixth form, sciences", from: 15, to: 16 },
    ],
    sort: "change",
    key: 4,
    at: 0.3,
  }, ctx),
];
