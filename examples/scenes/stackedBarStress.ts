// A stress scene for the stacked bar: the primes below 100, 1,000 and 10,000, split by their last digit.
// It has six parts, two of them tiny (only the prime 2 ends in 2, and only 5 ends in 5), long names,
// a tiny key part, and two rows at 16:9 (one at 9:16). The counts are computed here with a sieve.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";

function primesBelow(n: number): number[] {
  const sieve = new Uint8Array(n);
  const out: number[] = [];
  for (let i = 2; i < n; i++) {
    if (sieve[i]) continue;
    out.push(i);
    for (let j = i * i; j < n; j += i) sieve[j] = 1;
  }
  return out;
}
const DIGITS = [1, 2, 3, 5, 7, 9];
const byDigit = (n: number) => { const ps = primesBelow(n); return DIGITS.map((d) => ps.filter((q) => q % 10 === d).length); };

/** When the first copy leaves. */
const UNTIL = 7.2;
/** The film's length: the exit, the second entrance, and a hold. */
export const seconds = 10.5;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const wide = ctx.width > ctx.height;
  // The block shows its exit at UNTIL; a second copy enters after it and holds to the end, so the film never
  // ends on an empty frame.
  const P = {
      id: "primes",
      x: ctx.safe.left, y: ctx.safe.top + (wide ? 0 : 20), w: ctx.safe.right - ctx.safe.left, h: ctx.safe.bottom - ctx.safe.top - (wide ? 0 : 20),
      title: "Prime numbers by their last digit, % of all primes below each limit",
      parts: ["Ends in 1", "Ends in 2 (only the prime 2)", "Ends in 3", "Ends in 5 (only the prime 5)", "Ends in 7", "Ends in 9"],
      // Two rows: below 100 the primes 2 and 5 are each 4 % of the whole, and below 10,000 they are
      // each 0.1 %. A third row (below 1,000) does not fit the 16:9 safe height with these names.
      rows: wide ? [
        { label: "Below 100", values: byDigit(100) },
        { label: "Below 10,000", values: byDigit(10000) },
      ] : [{ label: "Below 10,000", values: byDigit(10000) }],
      key: 1,
      decimals: 1,
      at: 0.3,
  };
  return [
    ...B.stackedBar({ ...P, until: UNTIL }, ctx),
    ...B.stackedBar({ ...P, id: `${P.id}-again`, at: UNTIL + 0.9 }, ctx),
  ];
};
