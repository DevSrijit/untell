// A stress scene for the waffle: "1 in 37". A roulette wheel with a single zero has 37 pockets, and a
// fair spin lands on zero once in 37 spins on average (2.7 %). The total is prime, so the grid has a
// short last row, and only one square fills. The sentence and the unit note are long.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";

/** When the first copy leaves. */
const UNTIL = 6.2;
/** The film's length: the exit, the second entrance, and a hold. */
export const seconds = 9.5;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const wide = ctx.width > ctx.height;
  // The block shows its exit at UNTIL; a second copy enters after it and holds to the end, so the film never
  // ends on an empty frame.
  const P = {
      id: "wheel",
      x: ctx.safe.left, y: ctx.safe.top + (wide ? 20 : 30), w: ctx.safe.right - ctx.safe.left, h: ctx.safe.bottom - ctx.safe.top - (wide ? 40 : 30),
      title: "A roulette wheel with a single zero has 37 pockets",
      total: 37,
      filled: 1,
      label: "fair spins land on the zero, on average: a chance of 2.7 %",
      unit: "Each square is one pocket; the filled square is the zero",
      at: 0.3,
  };
  return [
    ...B.waffle({ ...P, until: UNTIL }, ctx),
    ...B.waffle({ ...P, id: `${P.id}-again`, at: UNTIL + 0.9 }, ctx),
  ];
};
