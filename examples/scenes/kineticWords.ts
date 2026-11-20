// The kinetic-words scene: one fact about light, cut on a 120 BPM beat.
// The facts: light travels 299,792 km in one second, and Earth's equator is 40,075 km round,
// so light could go round it 7.48 times in that second.
// The film opens on its first phrase (at 0 s it shows from frame 0) and ends on its last phrase, which
// holds to the end, so the first frame is not empty and the closing line holds long enough to read.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { holdFor } from "../../src/system/scene/blocks/kineticWords";

const BEAT = 0.5; // 120 BPM
const PHRASES: { text: string; accent: string }[] = [
  { text: "Light covers", accent: "Light" },
  { text: "299,792 km", accent: "299,792" },
  { text: "every second.", accent: "second." },
  { text: "That is 7.5", accent: "7.5" },
  { text: "laps of Earth.", accent: "Earth." },
];

/** The scene's length in this system: each phrase holds for the system's minimum, rounded up to whole beats. */
export const kineticSeconds = (ctx: Ctx) => BEAT + PHRASES.reduce((a, p) => a + holdFor(ctx, p.text.split(" ").length, BEAT), 0) + BEAT * 2;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const s = ctx.safe;
  const tall = ctx.height > ctx.width;
  const bleed = !!ctx.system.bleed?.includes("display");
  // At 9:16 the box stays above the low band, where text may use the full safe width.
  // With bleed the words may run to the foot of the safe area and past its sides (the block widens the box).
  const top = s.top, bottom = tall ? (bleed ? s.bottom : s.lowBandTop) : s.bottom;
  let t = BEAT;
  const phrases = PHRASES.map((p, i) => {
    const at = i === 0 ? 0 : t;
    t += holdFor(ctx, p.text.split(" ").length, BEAT);
    return { ...p, at };
  });
  return [...B.kineticWords({ id: "kw", x: s.left, y: top, w: s.right - s.left, h: bottom - top, phrases }, ctx)];
};
