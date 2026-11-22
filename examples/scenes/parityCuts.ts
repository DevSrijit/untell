// A parity scene for two props of the kit: a rule that enters and leaves by a cut (`enter: "cut"`,
// `exit: "cut"`), and a figure window whose label strip sits at its top (photo `frame: "figure"`, `labelAt: "top"`).
// Run: bun scripts/hf_check.ts examples/scenes/parityCuts.ts spec 3 --compare src/films/blocks/three.tsx parity-cuts-spec
import type { BLOCKS } from "../../src/system/scene/blocks";
import type { Ctx, Node } from "../../src/system/scene/types";

export const seconds = 3;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe, w = S.right - S.left;
  const fig = { x: S.left, y: S.top + 160, w, h: Math.round(w * 0.75) };
  return [
    ...B.rule({ id: "cut-rule", x1: S.left, y1: S.top + 60, x2: S.right, y2: S.top + 60, color: "ink", enter: "cut", exit: "cut", at: 0.5, until: 2.2 }, ctx),
    ...B.photo({ id: "fig", media: "noir-bridge", box: fig, frame: "figure", label: "FIG. 1  BRIDGE, 1:200", labelAt: "top", motion: "still", at: 0.3 }, ctx),
  ];
};
