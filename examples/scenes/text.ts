// The text scene: how long sunlight takes to reach Earth. Placed lines in several roles, right alignment within a
// box, and text that leaves (`until`) for new text. Under the text, the trip is drawn: the Sun's edge at the left,
// Earth at the right, and the light's path drawing across between them (graphics may use the lower band).
// 1 AU is 149,597,871 km. Light moves at 299,792 km/s. 149,597,871 / 299,792.458 = 499.0 s = 8 min 19 s.
import type { Ctx, Node } from "../../src/system/scene/types";
import { overflow, pictureSafe, type BLOCKS } from "../../src/system/scene/blocks";

export const seconds = 7;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe, x = S.left, W = S.right - S.left;
  const tall = ctx.height > ctx.width;
  const lhL = ctx.lineHeight("label"), lhD = ctx.lineHeight("display"), lhB = ctx.lineHeight("body");
  const yKicker = S.top + overflow(ctx, "label").top; // the glyph box stays inside the safe area too
  const yBig = yKicker + lhL * 2;
  const yBody = yBig + lhD + Math.round(ctx.size("body") * 0.4);
  // The working sits at the foot of the text-safe area, right-aligned, above the low band where text ends sooner.
  const yMath = Math.round(Math.max(yBody + lhB * 2, Math.min(S.lowBandTop, S.bottom) - lhL * 3.5));
  // The drawing: the Sun, a large disc cut by the left frame edge; Earth, a small disc at the right; the path between.
  const P = pictureSafe(ctx);
  const cy = Math.round(tall ? (S.bottom + P.y + P.h) / 2 : (yMath + S.bottom) / 2 + lhB);
  const sunR = Math.round(tall ? ctx.width * 0.28 : ctx.height * 0.22), earthR = Math.max(8, Math.round(sunR * 0.09));
  const ex = P.x + P.w - earthR * 2;
  return [
    ...B.text({ id: "kicker", text: "Sunlight, Sun to Earth", role: "label", color: "inkMuted", x, y: yKicker, at: 0 }, ctx),
    ...B.text({ id: "big", text: "8 min 19 s", role: "display", x, y: yBig, at: 0.6, until: 3.9 }, ctx),
    ...B.text({ id: "body", text: "Light's trip from the Sun.", role: "body", x, y: yBody, w: W, at: 1.0, until: 3.9 }, ctx),
    ...B.text({ id: "math", text: ["149,597,871 km", "÷ 299,792 km/s", "= 499 s"], role: "body", color: "inkMuted", align: "right", x, y: yMath, w: W, stagger: true, at: 1.8 }, ctx),
    ...B.text({ id: "big2", text: "499 s", role: "display", x, y: yBig, at: 4.3 }, ctx),
    ...B.text({ id: "body2", text: "The same trip, in seconds.", role: "body", x, y: yBody, w: W, at: 4.6 }, ctx),
    ...B.shape({ id: "sun", kind: "circle", x: -sunR, y: cy - sunR, w: sunR * 2, h: sunR * 2, fill: "accent", at: 0 }, ctx),
    ...B.rule({ id: "ray", x1: sunR + earthR, y1: cy, x2: ex - earthR, y2: cy, color: "ink", weight: 2, at: 0.6 }, ctx),
    ...B.shape({ id: "earth", kind: "circle", x: ex - earthR, y: cy - earthR, w: earthR * 2, h: earthR * 2, fill: "ink", at: 0.4 }, ctx),
  ];
};
