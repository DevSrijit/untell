// The big-stat scene: two figures from the fictional cast. Trickhimy Academy grew from 1,209 to
// 1,284 students (+6.2 %), and the number rolls up from last year's count. Kyhatebrou Clinic cut its
// average wait from 24 to 18 minutes (−25 %): down is good here, so the change shows as positive.
import type { BLOCKS } from "../../src/system/scene/blocks";
import { bigStatRole, smallerRole } from "../../src/system/scene/blocks/bigStat";
import type { Ctx, Node } from "../../src/system/scene/types";
import { column } from "./counter";

const pct = (now: number, then: number) => ((now - then) / then) * 100;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const c = column(ctx);
  const students = { id: "students", value: 1284, label: "Trickhimy Academy students", count: { from: 1209 },
    delta: { value: pct(1284, 1209), format: { suffix: " %", decimals: 1 }, context: "on 2025" }, at: 0.9 };
  const wait = { id: "wait", value: 18, format: { suffix: " min" }, label: "Kyhatebrou Clinic wait",
    delta: { value: pct(18, 24), format: { suffix: " %" }, context: "on 2025", good: "down" as const }, at: 0.3 };
  if (c.wide) {
    const gap = 80, w = (c.w - gap) / 2, h = 440, y = Math.round((ctx.height - h) / 2);
    const a = { ...students, x: c.x, y, w, h, at: 0.3 }, b = { ...wait, x: c.x + w + gap, y, w, h, at: 0.9 };
    // Side by side, the left stat enters first, and both numbers share the smaller role that fits.
    const role = smallerRole(bigStatRole(a, ctx), bigStatRole(b, ctx));
    return [...B.bigStat({ ...a, role }, ctx), ...B.bigStat({ ...b, role }, ctx)];
  }
  // At 9:16 the still stat sits above lowBandTop; the rolling one sits below it, so it ends by lowBandRight.
  // A rolling digit leaves upward through its mask, and the checks measure its box unclipped, so a
  // counter keeps well clear of the safe top.
  const h1 = ctx.safe.lowBandTop - c.top - 20;
  const a = { ...wait, x: c.x, y: c.top + 24, w: c.w, h: h1 - 24 };
  const b = { ...students, x: c.x, y: ctx.safe.lowBandTop + 20, w: ctx.safe.lowBandRight - c.x, h: c.bottom - ctx.safe.lowBandTop - 20 };
  // Both numbers share the smaller role that fits, so the two stats read as one set.
  const role = smallerRole(bigStatRole(a, ctx), bigStatRole(b, ctx));
  return [...B.bigStat({ ...a, role }, ctx), ...B.bigStat({ ...b, role }, ctx)];
};
