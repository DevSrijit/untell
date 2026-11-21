// The stacked-bar scene: what a $300,000 home really costs, on a 30-year and a 15-year loan.
// Shared by the Remotion films (src/films/blocks/parts.tsx) and the HyperFrames check.
//
// The numbers are computed here. The buyer pays $60,000 down and borrows $240,000 at 6.5 % a year,
// paid monthly. Over 30 years the interest is $306,107, half of all the money paid. Over 15 years
// it is $136,318, less than a third.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { pairOf } from "./chartFrame";

/** Total interest on a loan paid monthly over `years`. */
export function interest(loan: number, rate: number, years: number) {
  const r = rate / 12, n = years * 12;
  return (loan * r) / (1 - (1 + r) ** -n) * n - loan;
}

export const seconds = 7;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  return [
    ...pairOf(ctx, B, "Over 30 years, half is interest", (box) => B.stackedBar({
      id: "home", ...box,
      title: "Where the money goes on a $300,000 home, % of all paid",
      parts: ["Down payment", "Loan", "Interest"],
      rows: [
        { label: "30-year loan at 6.5 %", values: [60000, 240000, interest(240000, 0.065, 30)] },
        { label: "15-year loan at 6.5 %", values: [60000, 240000, interest(240000, 0.065, 15)] },
      ],
      key: 2,
      at: 0.3,
    }, ctx)),
    ...B.hold({ at: 4, until: seconds }, ctx),
  ];

};
