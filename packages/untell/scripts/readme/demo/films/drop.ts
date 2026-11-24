// A short type film whose cut lands on the drop of its music. The track is the project's "pulse", analysed by
// untell listen. music({ peakAt }) picks where the film enters the track, so the drop lands on DROP_AT; every
// phrase enters on a beat that beats() reads from the same map. Nothing is timed by hand.
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
  // The drop, as the map places it in film time (it is DROP_AT, on the frame grid).
  const drop = g.drops[0]?.t ?? DROP_AT;
  // Two words on every second beat up to the drop, then a phrase every second beat after it.
  const before = g.beats.filter((t) => t > 0.2 && t < drop - 0.05).filter((_, i, a) => (a.length - 1 - i) % 2 === 1).slice(-3);
  const after = g.beats.filter((t) => t > drop + 0.05).filter((_, i) => i % 2 === 1);
  const words = ["Every\ncut", "waits\nfor", "the\ndrop."];
  const box = { x: S.left, y: S.top, w: S.right - S.left, h: S.bottom - S.top };
  const pop = "pop" as const;
  return [
    ...B.kineticWords({
      id: "build", ...box,
      phrases: [
        { text: "Listen.", at: 0, motion: pop },
        ...words.map((text, i) => ({ text, at: before[i]!, accent: i === 2 ? 1 : null, motion: pop })),
      ],
      until: drop,
    }, ctx),
    // The drop is the film's reveal: the frame cuts to the accent ground.
    ...B.reveal({ at: drop }, ctx),
    ...B.shape({ id: "ground", kind: "rect", x: 0, y: 0, w: ctx.width, h: ctx.height, fill: "accent", enter: "cut", layer: -1, at: drop, until: after[0]! }, ctx),
    ...B.kineticWords({ id: "drop", ...box, onAccent: true, phrases: [{ text: "Now.", at: drop, motion: pop }], until: after[0]! }, ctx),
    ...B.kineticWords({
      id: "after", ...box,
      phrases: [
        { text: "On the bar.", at: after[0]!, motion: pop },
        { text: "On the beat.", at: after[1]!, motion: pop },
        { text: "Every time.", at: after[2]!, motion: pop },
      ],
      until: seconds,
    }, ctx),
    ...B.music({ media: MEDIA, peakAt: DROP_AT, until: seconds }, ctx),
  ];
};
