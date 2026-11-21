// A stress scene for the area chart: the same $240,000 loan at 6.5 %, paid over 15 years.
// Here the two areas cross. Interest leads at first. In month 100 (year 8.3) the principal repaid
// overtakes it, so the context area shows above the key area for the last seven years. The title and the
// context name are long, and the film also shows the exit.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { amortize } from "./areaChart";

const loan = amortize(240000, 0.065, 15);
const years = Array.from({ length: 16 }, (_, i) => String(i));

/** When the first copy leaves. */
const UNTIL = 6.2;
/** The film's length: the exit, the second entrance, and a hold. */
export const seconds = 9.5;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const wide = ctx.width > ctx.height;
  // The block shows its exit at UNTIL; a second copy enters after it and holds to the end, so the film never
  // ends on an empty frame.
  const P = {
      id: "short",
      x: ctx.safe.left, y: ctx.safe.top + (wide ? 0 : 40), w: ctx.safe.right - ctx.safe.left, h: wide ? ctx.safe.bottom - ctx.safe.top : 700,
      title: "Interest and principal paid so far on a 15-year $240,000 home loan at 6.5 % a year, by year",
      xLabels: years,
      xEvery: 5,
      series: [
        { label: "Interest paid", values: loan.interest },
        { label: "Principal repaid on the loan", values: loan.principal },
      ],
      format: { prefix: "$", compact: true },
      endFormat: { prefix: "$" },
      at: 0.3,
  };
  return [
    ...B.areaChart({ ...P, until: UNTIL }, ctx),
    ...B.areaChart({ ...P, id: `${P.id}-again`, at: UNTIL + 0.9 }, ctx),
  ];
};
