// The wordSeries scene: one word a beat, in one place and one size. Sound moves faster in denser, stiffer matter:
// about 343 m/s in air at 20 °C, 1 480 m/s in water, 5 960 m/s in steel. The word names the medium; the line under
// it gives the speed, and the last word holds with its number.
import type { Ctx, Node } from "../../src/system/scene/types";
import { overflow, type BLOCKS } from "../../src/system/scene/blocks";

export const seconds = 6;
const BEAT = 1.2;
const MEDIA = [
  { word: "Air.", speed: "343 m/s" },
  { word: "Water.", speed: "1 480 m/s" },
  { word: "Steel.", speed: "5 960 m/s" },
];

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe, x = S.left, W = S.right - S.left;
  const lhL = ctx.lineHeight("label"), lhH = ctx.lineHeight("headline");
  // The band for the words: three display lines tall at most, on the optical centre.
  const bandH = Math.round(Math.min(ctx.lineHeight("display") * 2.4, (S.bottom - S.top) * 0.36));
  const y = Math.round(S.top + (S.bottom - S.top) * 0.46 - bandH / 2);
  const kickerY = Math.max(S.top + overflow(ctx, "label").top, y - lhL * 2);
  const speedY = y + bandH + Math.round(lhH * 0.4);
  return [
    ...B.text({ id: "kicker", text: "The speed of sound in", role: "label", color: "inkMuted", x, y: kickerY, w: W, at: 0 }, ctx),
    ...B.wordSeries({ id: "medium", x, y, w: W, h: bandH, words: MEDIA.map((m, i) => ({ text: m.word, at: i * BEAT })) }, ctx),
    ...MEDIA.flatMap((m, i) => B.text({ id: `speed${i}`, text: m.speed, role: "headline", color: i === MEDIA.length - 1 ? "accentText" : "ink", keepCase: true, enter: "cut", x, y: speedY, w: W,
      at: i * BEAT + 0.3, ...(i < MEDIA.length - 1 ? { until: (i + 1) * BEAT } : {}) }, ctx)),
  ];
};
