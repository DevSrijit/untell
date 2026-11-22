// The carry scene: a number and a bar carried from a statement into a calculation.
// "343" is one text node from start to end: the hero of the first layout, a term of the sum in the
// second. The bar is one box: the distance sound covers in 1 s, which grows to 3 s.
// Fact: sound travels 343 m/s in dry air at 20 °C, so it covers 1,029 m in 3 s.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { appear, go, lines } from "../../src/system/scene/context";
import { textPlace } from "../../src/system/scene/blocks/carry";
import { baselineOf, inkOf } from "../../src/system/scene/blocks/highlight";
import { linesAtBottom, rowBoxes, settle, wrap, type Row } from "../../src/system/scene/blocks/rows";
import { pictureSafe } from "../../src/system/scene/blocks/sheet";

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const [r0, r1, r2] = rowBoxes(ctx, 3) as [Row, Row, Row];
  // The sum's role: headline when "343 m/s × 3 s" fits the row, else body (Kinetic's headline is too large for it).
  const H = ctx.measure("343 m/s × 3 s", "headline") <= r1.w ? "headline" as const : "body" as const;
  // The hero's role: display when "343 m/s" fits the row, else headline.
  const D = ctx.measure("343 m/s", "display") <= r2.w ? "display" as const : "headline" as const;
  const lh = ctx.lineHeight(H);
  const cut = 3.0; // the first layout leaves
  const move = cut + (ctx.instant ? 1 / 30 : ctx.dur.exit) + 0.1; // the number and the bar start to travel
  const landed = move + (ctx.instant ? 1 / 30 : ctx.dur.move);

  // First layout: a label on the top row; on the bottom row, the hero and under it a bar on the row's
  // anchor for the distance of one second (a third of the row).
  // At 9:16 the bar is a block in the lower band (marks only), across the picture-safe width at 3 s; at 16:9 a
  // thinner bar on the row's foot.
  const tall = ctx.height > ctx.width, P = pictureSafe(ctx);
  const air = Math.round(ctx.size("label") * 0.8);
  const barH = tall ? Math.round(ctx.height * 0.07) : Math.max(4, Math.round(ctx.size("label") * 0.6));
  const bar1 = tall ? { x: P.x, y: Math.round(ctx.safe.bottom + (P.y + P.h - ctx.safe.bottom - barH) / 2), w: Math.round(P.w / 3), h: barH }
    : { x: r2.x, y: r2.bottom - barH, w: Math.round(r2.w / 3), h: barH };
  const yHero = linesAtBottom(ctx, r2, D, 1) - (tall ? 0 : barH + air);
  const from = textPlace(ctx, "343", H, r2.x, baselineOf(ctx, D, yHero), D);

  // Second layout: the sum on the middle row, set as column arithmetic: a rule, then the result
  // aligned right under the first line. The bar stays on its anchor and grows to three seconds.
  const sum = "343 m/s × 3 s", result = "1,029 m";
  const ySum = linesAtBottom(ctx, r1, H, 1) - Math.round(lh * 1.35);
  const to = textPlace(ctx, "343", H, r1.x, baselineOf(ctx, H, ySum));
  const sumW = ctx.measure(sum, H);
  const yRes = ySum + Math.round(lh * 1.35);
  const ruleY = Math.round((inkOf(ctx, H, ySum, sum).bottom + inkOf(ctx, H, yRes, result).top) / 2);
  const bar2 = { ...bar1, w: bar1.w * 3 };

  const label = (id: string, text: string, at: number, until?: number) => {
    const ls = wrap(ctx, text, "label", r0.w);
    return lines(ctx, { id, x: r0.x, y: linesAtBottom(ctx, r0, "label", ls.length), lines: ls, role: "label", color: "inkMuted", at, until });
  };
  // The answer is a label, so the frame stays inside the prose budget with the sum on screen.
  const capLines = wrap(ctx, "About 1 km away", "label", r2.w);
  return [
    ...label("lab1", "Speed of sound in air at 20 °C", 0.3, cut),
    { id: "unit", kind: "text", x: from.x + from.w, y: yHero, text: " m/s", role: D, color: "ink", tracks: appear(ctx, 0.6, cut, 0) },
    ...B.carry({ id: "n343", text: "343", role: H, from, to, at: move, show: 0.6 }, ctx),
    ...B.carry({ id: "bar", from: bar1, to: bar2, at: move + ctx.dur.stagger * 2, show: 1.0, exact: true }, ctx),
    { id: "sum1", kind: "text", x: to.x + to.w, y: ySum, text: sum.slice(3), role: H, color: "ink", tracks: appear(ctx, landed, undefined, 0) },
    { id: "rule", kind: "path", d: `M${r1.x} ${ruleY}H${r1.x + sumW}`, stroke: "ink", width: Math.max(1, ctx.stroke * 0.75),
      tracks: { ...appear(ctx, landed + 0.3, undefined, 0), draw: go(ctx, landed + 0.3, 0, 1, ctx.noOvershoot("move")) } },
    ...lines(ctx, { id: "res", x: Math.round(r1.x + sumW - ctx.measure(result, H)), y: yRes, lines: [result], role: H, color: "ink", at: landed + 0.7 }),
    ...label("lab2", "Thunder, 3 s after the flash", move + 0.2),
    // The answer names the bar, as a scale bar's label does.
    ...settle(ctx, { id: "cap", x: r2.x, y: (tall ? linesAtBottom(ctx, r2, "label", capLines.length) : bar1.y - air - ctx.lineHeight("label") * capLines.length), lines: capLines, role: "label", color: "ink", at: landed + 1.4 }),
  ];
};
