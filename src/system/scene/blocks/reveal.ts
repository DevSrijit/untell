// Reveal: declares the film's reveal time, so the checks read it. It draws nothing.
//
// The checks look at the film's hero moments: the hook, the reveal and the last frame (subject-size, the music
// drop on the reveal). Without a declared reveal they guess it from the largest entrance in the last third. A
// scene states it with `B.reveal({ at })`.
//
// Rules this block enforces:
// - It draws nothing in either renderer: one anchor node with the id "reveal" and no size.
// - `at` is the reveal time in seconds, the time of the picture's change (the music `peakAt` takes the same time).
// - Declare one reveal per film. `of` names the block that is the reveal, when several things enter at its time.
// - A kineticWords phrase shown at the reveal time must be the largest type of the film: the build warns when it is not
//   (blocks/kineticWords.ts, size "hero").
import type { Block } from "../types";
import { noteReveal } from "./kineticWords";

export type RevealProps = {
  /** The time of the reveal, in seconds. */
  at: number;
  /** The block (its id) that is the reveal, when more than one thing enters then: the checks judge that one (a result
   *  line, not the chart labels that enter with it). A block that draws no text (a chart, a picture) is judged by the
   *  picture checks, not by the size of its type. */
  of?: string;
};

export const reveal: Block<RevealProps> = (p, ctx) => {
  // kineticWords holds the phrase shown at this time to be the largest type of the film, and warns when it is not.
  noteReveal(ctx, p.at);
  return [{ id: "reveal", kind: "anchor", x: 0, y: 0, w: 0, h: 0, at: p.at, ...(p.of ? { data: { of: p.of } } : {}) }];
};
