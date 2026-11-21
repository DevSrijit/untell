// The meter scene, from the fictional cast. Moce Fand has walked 7,420 of her 10,000 daily steps (a bar,
// 74 %), and Liba has saved $3,600 of a $5,000 goal (a ring, 72 %). Both quantities grow, so their
// values roll up with the fill. Only the ring takes the accent: Graphite allows one accent per frame.
import type { BLOCKS } from "../../src/system/scene/blocks";
import type { Ctx, Node } from "../../src/system/scene/types";
import { column } from "./counter";

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const c = column(ctx);
  const steps = { id: "steps", title: "Moce Fand, steps today", value: 7420, target: 10000, count: true, accent: false, at: 0.3 };
  const savings = { id: "savings", title: "Liba's savings, $", value: 3600, target: 5000, format: { prefix: "$" }, targetLabel: "Goal",
    shape: "ring" as const, count: true, at: 0.8 };
  if (c.wide) {
    const gap = 100, w = (c.w - gap) / 2, h = 640, y = Math.round((ctx.height - h) / 2);
    return [...B.meter({ ...steps, x: c.x, y, w, h }, ctx), ...B.meter({ ...savings, x: c.x + w + gap, y, w, h }, ctx)];
  }
  // At 9:16 the bar takes the top of the safe area. The ring takes the rest, and since it reaches below
  // lowBandTop, its box ends by lowBandRight.
  const barH = 340, top = c.top + 24;
  return [
    ...B.meter({ ...steps, x: c.x, y: top, w: c.w, h: barH }, ctx),
    ...B.meter({ ...savings, x: c.x, y: top + barH + 40, w: ctx.safe.lowBandRight - c.x, h: c.bottom - top - barH - 40 }, ctx),
  ];
};
