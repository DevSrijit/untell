// The counter scene: the seconds in one year, 365 x 86,400 = 31,536,000, counted up from zero.
// Shared by the Remotion films (src/films/blocks/numbers.tsx) and the HyperFrames check.
import type { BLOCKS } from "../../src/system/scene/blocks";
import { counterLayout } from "../../src/system/scene/blocks/counter";
import { lines } from "../../src/system/scene/context";
import type { Ctx, Node } from "../../src/system/scene/types";

const SECONDS_PER_DAY = 24 * 60 * 60;
const SECONDS_PER_YEAR = 365 * SECONDS_PER_DAY;

/** A content column: the full text-safe width at 9:16, a centred 1,200 px column at 16:9. */
export function column(ctx: Ctx) {
  const wide = ctx.width > ctx.height;
  const w = wide ? Math.min(1200, ctx.safe.right - ctx.safe.left) : ctx.safe.right - ctx.safe.left;
  const x = wide ? Math.round((ctx.width - w) / 2) : ctx.safe.left;
  return { x, w, top: ctx.safe.top, bottom: ctx.safe.bottom, wide };
}

export const seconds = 6;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const c = column(ctx);
  const lhB = ctx.lineHeight("body");
  const gap = ctx.size("body") * 0.4;
  // The counter's box holds its mask pads; counterLayout gives that height at the role that fits.
  const boxH = counterLayout({ x: c.x, y: c.top + lhB * 2, w: c.w, h: ctx.lineHeight("display") + ctx.size("display") * 0.5, value: SECONDS_PER_YEAR }, ctx).h;
  const total = lhB + gap + boxH + gap + lhB;
  // The group's middle on the frame's optical centre (46 % down the area from the text-safe top to the picture-safe
  // foot), kept inside the text-safe area, so the number owns the frame.
  const foot = ctx.height - Math.ceil(ctx.system.margin * Math.min(ctx.width, ctx.height));
  const y0 = Math.round(Math.min(c.bottom - total - lhB, c.top + (foot - c.top) * 0.46 - total / 2));
  const box = { id: "year", x: c.x, y: y0 + lhB + gap, w: c.w, h: boxH, value: SECONDS_PER_YEAR, at: 0.3 };
  // The caption under the number may reach the low band at 9:16, where text ends by lowBandRight: it wraps there.
  const sumY = y0 + lhB + gap + boxH + gap;
  return [
    ...lines(ctx, { id: "year-cap", x: c.x, y: y0, lines: ["Seconds in one year"], role: "body", color: "inkMuted", at: 0.3 }),
    ...B.counter(box, ctx),
    ...B.text({ id: "year-sum", x: c.x, y: sumY, w: c.w, text: `365 days of ${SECONDS_PER_DAY.toLocaleString("en-US")} seconds`, role: "body", color: "inkMuted", at: 0.5 }, ctx),
  ];
};
