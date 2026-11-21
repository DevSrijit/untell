// The waffle scene: the birthday problem. In a room of 23 people, the chance that two of them share
// a birthday is 50.7 %. Of 100 such rooms, about 51 have a shared birthday. Shared by the Remotion
// films (src/films/blocks/parts.tsx) and the HyperFrames check.
//
// The chance is computed here: 1 minus the chance that all 23 birthdays differ, over 365 days.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { pictureSafe } from "../../src/system/scene/blocks/sheet";

/** The chance that at least two of n people share a birthday (365 equally likely days). */
export function shared(n: number): number {
  let allDiffer = 1;
  for (let k = 0; k < n; k++) allDiffer *= (365 - k) / 365;
  return 1 - allDiffer;
}

export const seconds = 7;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const rooms = Math.round(shared(23) * 100); // 51
  // At 9:16 the number and its sentence sit above the grid, and the grid runs down into the lower band. No line over
  // it: the number and its sentence say the point, and a line would pass the word budget (Pop: 7).
  const S = ctx.safe, P = pictureSafe(ctx), tall = ctx.height > ctx.width;
  // The title keeps clear of the top edge of the safe area (YouTube Shorts' top band): 30 px down at 9:16.
  const box = { x: S.left, y: S.top + (tall ? 30 : 0), w: S.right - S.left, h: (tall ? P.y + P.h : S.bottom) - S.top - (tall ? 30 : 0) };
  return [
    ...B.waffle({
      id: "rooms", ...box,
      title: "100 rooms, 23 people in each",
      total: 100,
      filled: rooms,
      stat: `${rooms} in 100`,
      label: "rooms share a birthday",
      unit: "Each square is one room",
      // At 0 the title stands at rest on frame 0 (the thumbnail), and the grid builds from it.
      at: 0,
    }, ctx),
    ...B.hold({ at: 4, until: seconds }, ctx),
  ];
};
