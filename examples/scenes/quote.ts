// The quote scene: one statement from the fictional cast, sized from the safe area so it works at 9:16 and 16:9.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";

// Long enough for the slowest system (Ma) to land the attribution and hold it.
export const seconds = 10;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const s = ctx.safe;
  const wide = ctx.width > ctx.height;
  return [
    ...B.quote({
      id: "statement",
      x: s.left + (wide ? (s.right - s.left) * 0.08 : 0), y: s.top, w: (s.right - s.left) * (wide ? 0.84 : 1), h: s.bottom - s.top,
      text: "We stopped asking patients to repeat their history. Each nurse got an hour back.",
      name: "Sart Gre",
      job: "Head of Nursing, Raikavavea Clinic",
      at: 0.4,
    }, ctx),
  ];
};
