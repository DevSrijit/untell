// The matrix scene: one byte (8 bits) written in three bases. Every value is computed.
// 255 in base 2, 10, 16 is 11111111, 255, FF. Bits per digit is log2(base).
// A byte splits into whole digits only when log2(base) divides 8: base 2 (8 digits) and base 16 (2 digits).
// Base 16 is the key column: the shortest exact form of a byte.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { pairOf } from "./chartFrame";

const BASES = [2, 10, 16];
const bits = (b: number) => Math.log2(b);
const group = (s: string) => (s.length > 4 ? s.replace(/(.{4})(?=.)/g, "$1 ") : s); // 11111111 -> 1111 1111

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  return [
    ...pairOf(ctx, B, "Base 16 writes a byte in two digits", (box) => B.matrix({
      id: "bases", ...box,
      title: "One byte, written in three bases",
      columns: BASES.map((b) => `Base ${b}`),
      rows: [
        { label: "255 is", cells: BASES.map((b) => group((255).toString(b).toUpperCase())) },
        { label: "Digits", cells: BASES.map((b) => String((255).toString(b).length)) },
        { label: "Bits per digit", cells: BASES.map((b) => (Number.isInteger(bits(b)) ? String(bits(b)) : bits(b).toFixed(2))) },
        { label: "Splits evenly", cells: BASES.map((b) => Number.isInteger(8 / bits(b))) },
      ],
      key: 2,
      at: 0.3,
    }, ctx)),
  ];

};
