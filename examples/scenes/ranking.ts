// The ranking scene: what $1,000 grows to under five plans, after 1 year and after 30 years.
// Every value is computed here. After 1 year the bonus plan leads; after 30 years compounding at 7 %
// leads ($7,612), and the bonus plan falls to fourth.
import type { BLOCKS } from "../../src/system/scene/blocks";
import { pairOf } from "./chartFrame";
import type { Ctx, Node } from "../../src/system/scene/types";

const compound = (rate: number, start = 1000) => (years: number) => start * (1 + rate) ** years;
const simple = (rate: number) => (years: number) => 1000 * (1 + rate * years);
const PLANS: [string, (y: number) => number][] = [
  ["3 % + $150 bonus", compound(0.03, 1150)],
  ["8 % simple", simple(0.08)],
  ["7 % compound", compound(0.07)],
  ["6 % compound", compound(0.06)],
  ["2 % compound", compound(0.02)],
];

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const rows = PLANS.map(([label, grow]) => ({ label, before: Math.round(grow(1)), after: Math.round(grow(30)) }));
  return [
    ...pairOf(ctx, B, "At 30 years, compounding wins", (box) => B.ranking({ id: "plans", ...box, w: (ctx.height > ctx.width) ? ctx.safe.lowBandRight - box.x : box.w, title: "Value of $1,000 by plan, in $", states: ["After 1 year", "After 30 years"],
      rows, key: 2, format: { prefix: "$" }, at: 0.3 }, ctx)),
  ];

};
