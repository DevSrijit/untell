// The bar-chart scene: how long money takes to double at each annual return, compounded once a year.
// Every value is computed: years = ln 2 / ln(1 + r). The key bar is 7 %: about ten years.
// 9:16: the bars hang from a rail under their labels (`from: "top"`) and run down into the lower band, where the
// platform allows marks but no text. 16:9: the bars rise from a baseline beside the line.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { chartFrame } from "./chartFrame";

// The last bar lands at about 2.4 s; the film holds 2.6 s on the answer.
export const seconds = 5;
const rates = [1, 2, 3, 5, 7, 10];
const years = rates.map((r) => Math.log(2) / Math.log(1 + r / 100));

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  // A system that allows few words on screen (Kinetic: 4) gets the short form of the line.
  const line = ctx.system.density.maxWords >= 6 ? "Ten years to double at 7 %" : "Ten years at 7 %";
  const F = chartFrame(ctx, B, line, { bleed: true });
  return [
    ...F.nodes,
    ...B.barChart({
      id: "double", ...F.box,
      title: "Years for money to double, by annual return",
      categories: rates.map((r) => `${r} %`),
      series: [{ label: "Years", values: years }],
      key: 4,
      format: { decimals: 1 },
      from: F.tall ? "top" : "bottom",
      at: 0.2,
    }, ctx),
    ...B.hold({ at: 2.4, until: seconds }, ctx),
  ];
};
