// Awkward data for the bar chart, three charts one after another:
// 1. Long category names, negative values and one tiny value (fictional Citrucar Academy data).
// 2. Twelve categories in two series, with vertical bars asked for. The labels cannot fit, so the chart
//    turns horizontal. The data is computed: exact doubling time against the rule of 72.
// 3. An axis that does not start at zero, with a break mark (fictional Bryfeneart Clinic data).
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";

const rates = Array.from({ length: 12 }, (_, i) => i + 1);

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const box = { x: ctx.safe.left, y: ctx.safe.top, w: ctx.safe.right - ctx.safe.left, h: ctx.safe.bottom - ctx.safe.top };
  return [
    ...B.barChart({
      id: "enrol", ...box,
      title: "Citrucar Academy, change in enrolment, %",
      categories: ["Mathematics and Computer Science", "Modern Languages", "Physical Education and Health", "Visual and Performing Arts", "Natural Sciences", "History"],
      series: [{ label: "Change", values: [12.4, -3.1, 0.2, -8.5, 6.0, 1.5] }],
      key: 0,
      format: { decimals: 1 },
      at: 0.3, until: 5,
    }, ctx),
    ...B.barChart({
      id: "rule72", ...box,
      title: "Years to double: exact and by the rule of 72",
      categories: rates.map((r) => `${r} %`),
      series: [
        { label: "Exact", values: rates.map((r) => Math.log(2) / Math.log(1 + r / 100)) },
        { label: "Rule of 72", values: rates.map((r) => 72 / r) },
      ],
      key: 0,
      orientation: "vertical",
      format: { decimals: 1 },
      at: 5.4, until: 10.4,
    }, ctx),
    ...B.barChart({
      id: "pulse", ...box,
      title: "Bryfeneart Clinic, resting heart rate by ward, beats a minute",
      categories: ["Cardiology", "Maternity", "Oncology", "Surgery", "Paediatrics"],
      series: [{ label: "Mean", values: [64, 78, 74, 71, 96] }],
      key: 4,
      base: 50,
      at: 10.8,
    }, ctx),
  ];
};
