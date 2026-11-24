// The README's choices of frames, shared by build.ts and compose.ts.

/** Eight of the example reels, and the second of each frame: chosen by eye. No frame shows a person: Courtside is its
 *  hoop shot. Every picture in a frame needs no attribution (no model or photo with an attribution licence). */
export const REELS = [
  ["kinetic", 0.6], ["courtside", 11.5], ["matte", 9.5], ["keynote", 9.5],
  ["riso", 9], ["spec", 2], ["primary", 2.5], ["mark", 10.5],
] as const;

/** One bar chart in six systems, each in its own hand. */
export const HANDS = ["console", "kinetic", "riso", "schematic", "spec", "studio"] as const;
