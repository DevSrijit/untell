// The title scene: folding paper. A long headline fits its box (it takes the largest role that fits and breaks into
// even lines, with no lone last word), then a second headline replaces it. Under the type, the doubling is drawn: six
// stacks, each twice the one before, grow from the frame's foot (shapes are graphics: they may use the lower band).
// 0.1 mm x 2^42 = 439,804.65 km. The Moon is 384,400 km from Earth on average.
import type { Ctx, Node } from "../../src/system/scene/types";
import { lineAndBlock, overflow, type BLOCKS } from "../../src/system/scene/blocks";

export const seconds = 8;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe, x = S.left, W = S.right - S.left;
  const tall = ctx.height > ctx.width;
  const top = S.top + overflow(ctx, "display", true).top; // a masked line's clip box reaches above its line
  const h = Math.round((S.bottom - S.top) * (tall ? 0.42 : 0.5));
  const claim = B.title({ id: "claim", text: "Fold paper 42 times and it reaches the Moon.", x, y: top, w: W, h, maxLines: 4, at: 0, until: 4.4 }, ctx);
  const why = B.title({ id: "why", text: "Each fold doubles the stack.", x, y: top, w: W, h, maxLines: 4, at: 4.8 }, ctx);
  const bottom = (ns: Node[]) => Math.max(...ns.filter((n) => n.kind === "text").map((n) => n.y + ctx.lineHeight((n as { role: "label" }).role)));
  const factsY = Math.round(Math.max(bottom(claim), bottom(why)) + ctx.lineHeight("body") * 0.6);
  // The drawing: six stacks of 1, 2, 4, 8, 16 and 32 sheets, side by side, on one foot line.
  const G = lineAndBlock(ctx, { lineH: factsY + ctx.lineHeight("body") * 3 - S.top });
  const foot = G.graphic.y + G.graphic.h, room = foot - G.graphic.y;
  const n = 6, gap = Math.round(W * 0.04), colW = Math.floor((G.graphic.w - gap * (n - 1)) / n);
  const unit = room / 2 ** (n - 1);
  const stacks = Array.from({ length: n }, (_, k) => {
    const hk = Math.max(ctx.stroke * 2, Math.round(unit * 2 ** k));
    return B.shape({ id: `fold${k}`, kind: "rect", x: G.graphic.x + k * (colW + gap), y: foot - hk, w: colW, h: hk, fill: k === n - 1 ? "accent" : "ink", enter: "grow", from: "bottom", exact: true, at: 1.2 + k * 0.25 }, ctx);
  }).flat();
  return [
    ...claim,
    ...B.text({ id: "facts", text: ["Sheet: 0.1 mm", "42 folds: 439,805 km", "Moon: 384,400 km"], role: "body", color: "inkMuted", x, y: factsY, stagger: true, at: 1.4, until: 4.4 }, ctx),
    ...why,
    ...B.text({ id: "rate", text: ["1 fold: 0.2 mm", "10 folds: 10 cm", "20 folds: 105 m"], role: "body", color: "inkMuted", x, y: factsY, stagger: true, at: 5.4 }, ctx),
    ...stacks,
  ];
};
