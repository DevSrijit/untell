// The rule scene: a 3-4-5 right triangle. The legs and the hypotenuse are rules at three angles;
// dimension lines (rules with ticks) carry the lengths. 3^2 + 4^2 = 9 + 16 = 25 = 5^2.
// At 9:16 the long leg stands up, to use the tall frame; at 16:9 it lies down.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { overflow } from "../../src/system/scene/blocks/text";

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe, W = S.right - S.left;
  const tall = ctx.height > ctx.width;
  const [a, b] = tall ? [3, 4] : [4, 3]; // the horizontal and the vertical leg, in units
  const lhH = ctx.lineHeight("headline"), lhL = ctx.lineHeight("label"), lhB = ctx.lineHeight("body");
  const gap = Math.round(ctx.size("label") * 0.5);
  const d = Math.round(ctx.size("label") * 1.2); // how far a dimension line stands off its edge
  const wb = ctx.measure(String(b), "body"), w5 = ctx.measure("5", "headline");

  // Room: the equation above the triangle (9:16) or beside it (16:9), and room round it for the labels.
  const left = S.left + wb + gap + d;
  const top = tall ? S.top + overflow(ctx, "headline").top + lhH + lhL * 2.5 : S.top + gap * 2;
  const right = tall ? S.right - (w5 + gap * 3) : S.left + W * 0.58;
  const floor = S.bottom - (d + gap + lhB + overflow(ctx, "body").bottom);
  const u = Math.floor(Math.min((right - left) / a, (floor - top) / b));
  const ax = Math.round(left), ay = Math.round(top + b * u);
  const bx = ax + a * u, cy = ay - b * u;

  // The hypotenuse label stands off the midpoint, along the normal that points away from the right angle.
  const mx = (ax + bx) / 2, my = (ay + cy) / 2;
  const nx = b / 5, ny = -a / 5;
  const off = gap * 1.5 + Math.abs(nx) * (w5 / 2) + Math.abs(ny) * (lhH / 2);
  const l5 = { x: Math.round(mx + nx * off - w5 / 2), y: Math.round(my + ny * off - lhH / 2) };

  const eq = tall ? { x: S.left, y: S.top + overflow(ctx, "headline").top } : { x: Math.round(S.left + W * 0.66), y: Math.round((S.top + S.bottom) / 2 - lhH) };
  const s = Math.round(u * 0.12); // the right-angle mark
  const wa = ctx.measure(String(a), "body");
  return [
    ...B.rule({ id: "leg-h", x1: ax, y1: ay, x2: bx, y2: ay, color: "ink", at: 0.4 }, ctx),
    ...B.rule({ id: "leg-v", x1: ax, y1: ay, x2: ax, y2: cy, color: "ink", at: 0.6 }, ctx),
    ...B.rule({ id: "square-a", x1: ax + s, y1: ay, x2: ax + s, y2: ay - s, color: "inkMuted", pace: "enter", at: 1.1 }, ctx),
    ...B.rule({ id: "square-b", x1: ax + s, y1: ay - s, x2: ax, y2: ay - s, color: "inkMuted", pace: "enter", at: 1.2 }, ctx),
    ...B.rule({ id: "dim-h", x1: ax, y1: ay + d, x2: bx, y2: ay + d, color: "inkMuted", ticks: true, at: 1.4 }, ctx),
    ...B.rule({ id: "dim-v", x1: ax - d, y1: ay, x2: ax - d, y2: cy, color: "inkMuted", ticks: true, at: 1.5 }, ctx),
    ...B.text({ id: "len-h", text: String(a), role: "body", color: "inkMuted", x: Math.round(mx - wa / 2), y: ay + d + gap, at: 2.0 }, ctx),
    ...B.text({ id: "len-v", text: String(b), role: "body", color: "inkMuted", x: Math.round(ax - d - gap - wb), y: Math.round(my - lhB / 2), at: 2.1 }, ctx),
    // The hypotenuse matters: it draws last, at twice the weight, with a larger label in ink.
    ...B.rule({ id: "hyp", x1: bx, y1: ay, x2: ax, y2: cy, color: "accent", weight: 2, at: 2.6 }, ctx),
    ...B.text({ id: "len-5", text: "5", role: "headline", x: l5.x, y: l5.y, at: 3.3 }, ctx),
    ...B.text({ id: "eq", text: "3² + 4² = 5²", role: "headline", x: eq.x, y: eq.y, at: 3.9 }, ctx),
    ...B.text({ id: "sum", text: "9 + 16 = 25", role: "label", color: "inkMuted", x: eq.x, y: eq.y + lhH + gap, at: 4.3 }, ctx),
  ];
};
