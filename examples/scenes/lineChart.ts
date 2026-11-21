// The line-chart scene: $200 a month at 7 % a year, compounded monthly, deposits at each month's end. One saver starts
// at 25, the other at 35; at 65 the first has $524,963 and the second $243,994: about twice as much. Every value is
// computed here. Shared by the Remotion film (src/films/blocks/lineChartDemo.tsx) and the HyperFrames film.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { chartFrame } from "./chartFrame";

// The lines and the labels land by about 3.8 s; the film holds 2.7 s on the answer.
export const seconds = 6.5;
const balance = (years: number) => { const r = 0.07 / 12, m = years * 12; return m <= 0 ? 0 : (200 * ((1 + r) ** m - 1)) / r; };
const ages = Array.from({ length: 41 }, (_, i) => 25 + i);

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const line = ctx.system.density.maxWords >= 7 ? "Start at 25: twice the money at 65" : "Start ten years sooner";
  // At 9:16 the plot climbs the frame down to the picture-safe foot; its labels sit inside it where text is safe.
  const F = chartFrame(ctx, B, line, { bleed: true });
  return [
    ...F.nodes,
    ...B.lineChart({
      id: "growth", ...F.box,
      title: "Balance by age, $200 a month at 7 %",
      xLabels: ages.map(String),
      xEvery: 10,
      series: [
        { label: "Starts at 25", values: ages.map((a) => balance(a - 25)) },
        { label: "Starts at 35", values: ages.map((a) => balance(a - 35)) },
      ],
      format: { prefix: "$", compact: true },
      callout: { index: 40, label: "$524,963" },
      at: 0.1,
    }, ctx),
    ...B.hold({ at: 3.7, until: seconds }, ctx),
  ];
};
