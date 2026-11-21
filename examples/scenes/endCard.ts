// The end of a film: a word series on the beat, then the end card that lands on the last beat and holds.
// The fact: sound travels about 343 m a second in air at 20 °C, so it covers 1 km in about 2.9 s.
// The studio name is a random draw.
import type { Ctx, Node } from "../../src/system/scene/types";
import { endCardLead, type BLOCKS } from "../../src/system/scene/blocks";

export const seconds = 9.5;
const BEAT = 0.6;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  // The words leave at OUT; the end card starts its entrance only once they are gone, and lands on a beat.
  const OUT = 3.9;
  const land = Math.max(4.2, Math.ceil((OUT + ctx.dur.exit + endCardLead(ctx)) / BEAT) * BEAT);
  const S = ctx.safe, x = S.left, W = S.right - S.left;
  // The band for the words: up to three display lines tall, leaving room under it for one line of body text.
  const by = S.top + (S.bottom - S.top) * 0.25;
  const band = { x, y: by, w: W, h: Math.min(ctx.lineHeight("display") * 3, S.bottom - by - ctx.lineHeight("body") * 3) };
  return [
    ...B.text({ id: "kicker", text: "Sound in air at 20 °C", role: "label", color: "inkMuted", keepCase: true, x, y: band.y - ctx.lineHeight("label") * 2, at: 0, until: OUT }, ctx),
    ...B.wordSeries({ id: "beat", x: band.x, y: band.y, w: band.w, h: band.h, until: OUT,
      words: [{ text: "343 m", at: 0 }, { text: "every", at: BEAT }, { text: "second.", at: 2 * BEAT }] }, ctx),
    ...B.text({ id: "km", text: "1 km in 2.9 s", role: "body", keepCase: true, x, y: band.y + band.h + ctx.lineHeight("body"), at: 3 * BEAT, until: OUT }, ctx),
    ...B.endCard({ id: "end", name: "Quellmoor", line: "A film about speed", mark: "circle", place: "middle", at: land, until: seconds }, ctx),
    // The card holds still to the end on purpose: hold tells the HyperFrames check the stillness is meant.
    ...B.hold({ at: land + 0.5, until: seconds }, ctx),
  ];
};
