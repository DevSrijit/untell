// The steps scene: Euclid's algorithm for the greatest common divisor of 252 and 105.
// Every value is computed: 252 = 2 x 105 + 42, 105 = 2 x 42 + 21, 42 = 2 x 21 + 0, so gcd = 21.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { pairOf } from "./chartFrame";

const gcdSteps = (a: number, b: number) => {
  const out: { title: string; detail: string }[] = [];
  while (b > 0) {
    const q = Math.floor(a / b), r = a % b;
    out.push({ title: `Divide ${a} by ${b}`, detail: `${a} = ${q} × ${b} + ${r}` });
    [a, b] = [b, r];
  }
  out.push({ title: `The answer is ${a}`, detail: `gcd = ${a}, the last divisor` });
  return out;
};

// Each step holds 2.4 s: long enough to read one line of arithmetic.
export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const s = ctx.safe;
  return [
    ...pairOf(ctx, B, "", (box) => B.steps({
      id: "gcd",
      ...box,
      steps: gcdSteps(252, 105),
      hold: 2.4,
      at: 0.3,
    }, ctx)),
  ];
};
