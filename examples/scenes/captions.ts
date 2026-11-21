// The captions scene: a spoken sentence pair with word timings, captioned at the foot of the text-safe area, over the
// picture it talks about (the Moon). The last page holds to the end, so the film never ends on an empty frame.
// The facts: sunlight takes about 499 s (8 min 19 s) to cover 1 au; moonlight takes about 1.28 s to cover the Moon's
// mean distance of 384,400 km.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";

export const seconds = 10;
const SCRIPT = "Light from the Sun takes about eight minutes and twenty seconds to reach Earth. Moonlight takes just over one second.";

/** Word timings at a calm speaking rate: a word's length sets its time, and punctuation adds a pause. */
function timed(text: string, from: number) {
  let t = from;
  return text.split(" ").map((w) => {
    const d = 0.1 + 0.052 * w.replace(/[^A-Za-z]/g, "").length;
    const word = { text: w, start: Math.round(t * 100) / 100, end: Math.round((t + d) * 100) / 100 };
    t += d + 0.06 + (/[.]$/.test(w) ? 0.55 : /[,]$/.test(w) ? 0.2 : 0);
    return word;
  });
}

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const s = ctx.safe;
  const tall = ctx.height > ctx.width;
  const lh = Math.ceil(ctx.size("caption") * ctx.system.type.caption.leading);
  const h = lh * 2 + Math.round(ctx.size("caption") * 0.2);
  // The caption zone: the foot of the text-safe area. At 9:16 it is in the low band, so it ends by lowBandRight.
  const w = tall ? s.lowBandRight - s.left : Math.round(ctx.width * 0.62);
  const x = tall ? s.left : Math.round((ctx.width - w) / 2);
  // The picture: a square above the captions at 9:16 (the source stays sharp at that size), the frame's width at
  // 16:9, dimmed under the captions. It pushes in slowly while the words run.
  const side = Math.min(ctx.width, s.bottom - h - lh);
  // At 16:9 the Moon takes a square on the frame's middle, above the captions (the source stays sharp at that size).
  const wide = Math.min(ctx.height - (ctx.height - s.bottom + h + lh), ctx.width);
  const box = tall ? { x: 0, y: Math.max(0, s.bottom - h - lh - side), w: ctx.width, h: side } : { x: Math.round((ctx.width - wide) / 2), y: 0, w: wide, h: wide };
  return [
    ...B.photo({ id: "moon", media: "console-moon", box, motion: "push", amount: 0.04, at: 0 }, ctx),
    ...B.captions({ id: "cc", x, y: s.bottom - h, w, h, words: timed(SCRIPT, 0.4), until: seconds }, ctx),
  ];
};
