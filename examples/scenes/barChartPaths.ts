// The bar-chart layouts that the other scenes do not reach, three charts one after another:
// 1. Vertical bars with negative values (fictional Traibryn Academy data).
// 2. Vertical bars on an axis that starts at 50, with a break mark (fictional Ceaklafeni Clinic data).
// 3. Three series, every value printed, the third series drawn as an outline. The data is computed:
//    $100 compounded once a year, value = 100 · (1 + r)^years.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";

const rates = [3, 5, 7];
const grow = (r: number, y: number) => 100 * (1 + r / 100) ** y;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const box = { x: ctx.safe.left, y: ctx.safe.top, w: ctx.safe.right - ctx.safe.left, h: ctx.safe.bottom - ctx.safe.top };
  return [
    ...B.barChart({
      id: "clubs", ...box,
      title: "Traibryn Academy, change in club members",
      categories: ["Chess", "Choir", "Drama", "Robots", "Art"],
      series: [{ label: "Change", values: [12, -5, 3, 18, -2] }],
      key: 3, orientation: "vertical",
      at: 0.3, until: 4.8,
    }, ctx),
    ...B.barChart({
      id: "wards", ...box,
      title: "Ceaklafeni Clinic, resting heart rate, beats a minute",
      categories: ["Ward 1", "Ward 2", "Ward 3", "Ward 4"],
      series: [{ label: "Mean", values: [64, 78, 71, 96] }],
      key: 3, base: 50, orientation: "vertical",
      at: 5.2, until: 9.7,
    }, ctx),
    ...B.barChart({
      id: "growth", ...box,
      title: "Value of $100 after 10, 20 and 30 years, $",
      categories: rates.map((r) => `${r} %`),
      series: [10, 20, 30].map((y) => ({ label: `${y} years`, values: rates.map((r) => grow(r, y)) })),
      key: 2, orientation: "vertical",
      at: 10.1,
    }, ctx),
  ];
};
