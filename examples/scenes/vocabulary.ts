// The vocabulary scene: one scene, many systems, and each system's own motion with no `.map` patch. The title,
// the photo (a figure window), the cog shape, the line of maths and the ground change all take their entrance
// and exit from the system's vocabulary (src/system/scene/vocabulary.ts).
// The fact: a 52-tooth chainring turns a 13-tooth cog 52 / 13 = 4 times per turn of the pedals.
import type { Ctx, Node } from "../../src/system/scene/types";
import { overflow, type BLOCKS } from "../../src/system/scene/blocks";

export const seconds = 9;
const OUT = 5.2; // the first part leaves
const GROUND = 5.5; // the ground changes

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe, x = S.left, W = S.right - S.left;
  const wide = ctx.width > ctx.height;
  const top = S.top + overflow(ctx, "headline", true).top;
  const bottomOf = (ns: Node[]) => Math.max(...ns.map((n) => (n.kind === "text" ? n.y + ctx.lineHeight(n.role) : 0)));

  // The text column: the full width at 9:16, the left half at 16:9.
  const tw = wide ? Math.round(W * 0.44) : W;
  const head = B.title({ id: "head", text: "A 52-tooth ring turns a 13-tooth cog four times.", role: "headline", x, y: top, w: tw,
    h: (S.bottom - S.top) * (wide ? 0.6 : 0.3), at: 0, until: OUT, exit: "fade" }, ctx);
  const gap = ctx.lineHeight("label");
  const mathY = bottomOf(head) + gap;
  const math = B.text({ id: "math", text: "52 T ÷ 13 T = 4", role: "body", keepCase: true, x, y: mathY, at: 1.8, until: OUT }, ctx);

  // The figure: under the text at 9:16, on the right at 16:9 (3:2 there, like the photo).
  const fy = wide ? top : bottomOf(math) + gap * 2;
  const fw = wide ? W - tw - gap * 2 : W;
  // At 9:16 the figure fills the column down to the safe bottom (a taller crop of the ring), so the lower third is used.
  const fh = wide ? Math.min(Math.round(fw / 1.5) + gap * 2, S.bottom - fy) : S.bottom - fy; // the label strip stays text-safe
  const fx = wide ? S.right - fw : x;
  const figure = B.photo({ id: "ring", media: "schematic-chainring", box: { x: fx, y: fy, w: fw, h: fh }, frame: "figure", label: "FIG. 1  CHAINRING, 52 T",
    motion: "push", amount: 0.03, at: 0.8, until: OUT }, ctx);

  // The cog: a circle beside the maths, a quarter of the ring's size.
  const cog = Math.round(ctx.lineHeight("body") * 1.2);
  const mathW = ctx.measure("52 T ÷ 13 T = 4", "body", { keepCase: true });
  const cogShape = B.shape({ id: "cog", kind: "circle", x: x + mathW + gap, y: mathY + (ctx.lineHeight("body") - cog) / 2, w: cog, h: cog,
    stroke: "ink", weight: 2, at: 2.4, until: OUT }, ctx);

  // The answer on a new ground.
  const answer = B.title({ id: "answer", text: "Four turns.", role: "display", x, y: S.top + (S.bottom - S.top) * 0.38, w: W, color: "onAccent", at: GROUND + 0.2 }, ctx);
  return [...head, ...math, ...cogShape, ...figure, ...B.ground({ id: "ground", color: "accent", at: GROUND }, ctx), ...answer];
};
