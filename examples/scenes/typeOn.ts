// The typeOn scene: two shell commands typed at a human rate, and their output, set large enough to read on a phone.
// A figure label writes itself at the faster "write" pace. The two results are then drawn as two bars of one scale,
// 1,024 and 1,000, under the text: the 2.4 % gap is the point (bars are graphics: they may use the lower band).
// 2^10 = 1,024 and 10^3 = 1,000: 1,024 is 2.4 % more.
import type { Ctx, Node } from "../../src/system/scene/types";
import { lineAndBlock, overflow, typeOnEnd, type BLOCKS } from "../../src/system/scene/blocks";

export const seconds = 8;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe, x = S.left, W = S.right - S.left;
  const role = ctx.measure("$ echo $((2**10))", "headline") <= W ? "headline" : "body";
  const lh = ctx.lineHeight(role), lhL = ctx.lineHeight("label");
  const y0 = S.top + overflow(ctx, "label").top;
  const y1 = y0 + lhL * 2, y2 = y1 + lh * 2 + Math.round(lh * 0.5);
  const c1 = { text: "$ echo $((2**10))", at: 0.8, pace: "human" as const };
  const e1 = typeOnEnd(c1, ctx);
  const c2 = { text: "$ echo $((10**3))", at: e1 + 1.1, pace: "human" as const };
  const e2 = typeOnEnd(c2, ctx);
  const noteY = y2 + lh * 2 + Math.round(lh * 0.4);
  // The two bars: one scale for both, full width for 1,024, under the note.
  const G = lineAndBlock(ctx, { lineH: noteY + ctx.lineHeight("body") - S.top });
  const barH = Math.round(Math.min(G.graphic.h * 0.28, lh * 1.6)), gap = Math.round(barH * 0.35);
  const by = Math.round(G.graphic.y + Math.max(0, (G.graphic.h - (barH * 2 + gap)) * 0.3));
  const full = G.graphic.w, k = full / 1024;
  return [
    ...B.typeOn({ id: "fig", text: "Fig. 4 / Powers of two", pace: "write", x, y: y0, at: 0.2 }, ctx),
    ...B.typeOn({ id: "cmd1", ...c1, role, color: "ink", cursor: true, cursorUntil: e1 + 0.6, x, y: y1 }, ctx),
    ...B.text({ id: "out1", text: "1024", role, color: "inkMuted", enter: "cut", x, y: y1 + lh, at: e1 + 0.6 }, ctx),
    ...B.typeOn({ id: "cmd2", ...c2, role, color: "ink", cursor: true, cursorUntil: e2 + 0.6, x, y: y2 }, ctx),
    ...B.text({ id: "out2", text: "1000", role, color: "inkMuted", enter: "cut", x, y: y2 + lh, at: e2 + 0.6 }, ctx),
    ...B.text({ id: "note", text: "1,024 is 2.4 % more than 1,000", role: "body", keepCase: true, x, y: noteY, w: W, at: e2 + 1.3 }, ctx),
    ...B.shape({ id: "bar1", kind: "rect", x: G.graphic.x, y: by, w: Math.round(1024 * k), h: barH, fill: "accent", enter: "grow", from: "left", exact: true, at: e1 + 0.7 }, ctx),
    ...B.shape({ id: "bar2", kind: "rect", x: G.graphic.x, y: by + barH + gap, w: Math.round(1000 * k), h: barH, fill: "ink", enter: "grow", from: "left", exact: true, at: e2 + 0.7 }, ctx),
  ];
};
