// The area-chart scene: what a 30-year home loan costs, year by year. Shared by the Remotion films
// (src/films/blocks/parts.tsx) and the HyperFrames check. One definition, two renderers.
//
// The numbers are computed here: a $240,000 loan at 6.5 % a year, paid monthly over 30 years.
// The monthly payment is $1,516.96. Over 30 years the interest comes to $306,107, which is more
// than the $240,000 that was borrowed.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { chartFrame } from "./chartFrame";

/** Interest and principal paid so far, at the end of each year (index 0 is the start). */
export function amortize(loan: number, rate: number, years: number) {
  const r = rate / 12, n = years * 12;
  const pay = (loan * r) / (1 - (1 + r) ** -n);
  let bal = loan, interest = 0, principal = 0;
  const out = { interest: [0], principal: [0] };
  for (let m = 1; m <= n; m++) {
    const i = bal * r;
    interest += i;
    principal += pay - i;
    bal -= pay - i;
    if (m % 12 === 0) { out.interest.push(interest); out.principal.push(principal); }
  }
  return out;
}

const loan = amortize(240000, 0.065, 30);
const years = Array.from({ length: 31 }, (_, i) => String(i));

// The areas and their labels land by about 2.8 s; the film holds 2.7 s on the answer.
export const seconds = 5.5;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const line = ctx.system.density.maxWords >= 5 ? "The interest outgrows the loan" : "Interest beats the loan";
  // At 9:16 the areas climb the frame down to the picture-safe foot; the labels sit inside where text is safe.
  const F = chartFrame(ctx, B, line, { bleed: true });
  return [
    ...F.nodes,
    ...B.areaChart({
      id: "loan", ...F.box,
      title: "Paid so far on a $240,000 loan at 6.5 %, by year",
      xLabels: years,
      xEvery: 10,
      series: [
        { label: "Interest", values: loan.interest },
        { label: "Principal", values: loan.principal },
      ],
      format: { prefix: "$", compact: true },
      endFormat: { prefix: "$" },
      at: 0.1,
    }, ctx),
    ...B.hold({ at: 2.4, until: seconds }, ctx),
  ];
};
