// Hold: marks a still stretch as deliberate. It draws nothing.
//
// The HyperFrames check warns when nothing on screen changes for more than 3 s (dead_stretch). A calm
// system (Ma, Nocturne, Title) often holds a frame still on purpose. A hold tells the check so: from `at`
// to `until`, the still time does not count.
//
// Rules this block enforces:
// - It draws nothing in either renderer: one empty full-frame element with `data-hold`, behind
//   everything and outside the camera. The element takes no pointer events, so it covers no text.
// - It shows exactly from `at` to `until` (in one frame each way), so it excuses only that stretch.
//   Without `until` it lasts to the end of the film.
// - Use it only where the stillness is the design. A hold does not fix a scene that forgot to move.
import { present } from "../context";
import type { Block, Node } from "../types";

export type HoldProps = {
  id?: string;
  /** When the deliberate stillness starts, in seconds. */
  at: number;
  /** When it ends. Default: the end of the film. */
  until?: number;
};

export const hold: Block<HoldProps> = (p) => [{ id: p.id ?? "hold", kind: "hold", tracks: present(p.at, p.until) } as Node];
