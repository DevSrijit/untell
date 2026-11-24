// The first draft of drop.ts, kept as it was checked: one word on each beat, no accent, the frame half empty.
// untell check finds what is wrong with it; drop.ts is the version after the fixes.
import type { Ctx, Node } from "../untell/scene/types";
import type { BLOCKS } from "../untell/scene/blocks";
import { musicFrom } from "../untell/scene/blocks";
import { beats } from "../untell/scene/beats";

export const system = "kinetic";
export const seconds = 7.4;

/** The track, as the project names it. */
const MEDIA = "pulse";
/** The film time of the drop. */
const DROP_AT = 3.7;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe;
  const from = musicFrom({ media: MEDIA, peakAt: DROP_AT, until: seconds });
  const g = beats(MEDIA, { from, at: 0, until: seconds });
  const drop = g.drops[0]?.t ?? DROP_AT;
  const before = g.beats.filter((t) => t > 0.2 && t < drop - 0.05).slice(-6);
  const after = g.beats.filter((t) => t > drop + 0.05).filter((_, i) => i % 2 === 1);
  const words = ["Every", "cut", "waits", "for", "the", "drop."];
  return [
    ...B.kineticWords({
      id: "words", x: S.left, y: S.top, w: S.right - S.left, h: S.bottom - S.top,
      phrases: [
        { text: "Listen.", at: 0, motion: "pop" },
        ...words.map((text, i) => ({ text, at: before[i]!, accent: i === 5 ? 0 : null, motion: "pop" as const })),
        { text: "Now.", at: drop, accent: 0, motion: "pop" },
        { text: "On the bar.", at: after[0]!, motion: "pop" },
        { text: "On the beat.", at: after[1]!, motion: "pop" },
        { text: "Every time.", at: after[2]!, motion: "pop" },
      ],
      until: seconds,
    }, ctx),
    ...B.music({ media: MEDIA, peakAt: DROP_AT, until: seconds }, ctx),
  ];
};
