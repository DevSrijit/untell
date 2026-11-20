// The fitText scene: the largest type that fits a band. Sunlight takes 499 s to reach Earth: the number fills the
// width as the subject, a label over it names the measure, and the working under it shows where it comes from.
// 1 AU is 149,597,871 km. Light moves at 299,792.458 km/s. 149,597,871 / 299,792.458 = 499.0 s.
import type { Ctx, Node } from "../../src/system/scene/types";
import { overflow, type BLOCKS } from "../../src/system/scene/blocks";

export const seconds = 6;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe, x = S.left, W = S.right - S.left;
  const lhL = ctx.lineHeight("label"), lhB = ctx.lineHeight("body");
  // The band: as tall as the width allows for a short number, on the optical centre of the text-safe area.
  const bandH = Math.round(Math.min((S.bottom - S.top) * 0.42, W * 0.62));
  const y = Math.round(S.top + (S.bottom - S.top) * 0.46 - bandH / 2);
  const kickerY = Math.max(S.top + overflow(ctx, "label").top, y - lhL * 2);
  return [
    ...B.text({ id: "kicker", text: "Sunlight, Sun to Earth, in seconds", role: "label", color: "inkMuted", x, y: kickerY, w: W, at: 0 }, ctx),
    ...B.fitText({ id: "big", text: "499", x, y, w: W, h: bandH, role: "display", at: 0.3 }, ctx),
    ...B.text({ id: "math", text: ["149 597 871 km", "÷ 299 792 km/s"], role: "body", color: "inkMuted", keepCase: true, x, y: y + bandH + lhB, w: W, stagger: true, at: 1.2 }, ctx),
  ];
};
