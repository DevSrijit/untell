// Ground: the colour of the whole frame changes on a beat. A full-frame fill in a colour role, under every
// picture and every block, from `at` until `until`. Use it for a cut to an accent ground (Kinetic: a word
// becomes the next ground), a dark beat in a light film, or a slow change of paper (Ma).
//
// Rules this block enforces:
// - The fill is flat: one colour role, no gradient. It draws in layer -2, below the photo plates (layer -1),
//   so pictures and blocks stay on top of it.
// - It changes by the system's vocabulary (scene/vocabulary.ts): a cut in one frame, or a dissolve in Ma and
//   Nocturne. `enter` and `exit` change it. A one-frame system always cuts. With `at` at 0 or before, the
//   ground is there from frame 0.
// - The fill reaches past the frame by `bleed` px on each side (default 0), so a camera move does not show
//   its edge.
// - Text that sits on the new ground must read on it: on an accent ground, set it in `onAccent`. The block
//   does not change the colour of other blocks.
import type { ColorRole } from "../roles";
import type { Block, Node } from "../types";
import { vocabulary } from "../vocabulary";
import { onOff } from "./shape";

export type GroundProps = {
  id?: string;
  /** The colour of the new ground, as a role ("accent", "ink", "surface"...). */
  color: ColorRole;
  /** "cut": one frame. "dissolve": a fade over the enter (or exit) duration. Default: the system's vocabulary. */
  enter?: "cut" | "dissolve";
  exit?: "cut" | "dissolve";
  /** px past each frame edge, for a scene with a camera. Default 0. */
  bleed?: number;
  at: number;
  until?: number;
};

export const ground: Block<GroundProps> = (p, ctx) => {
  const id = p.id ?? "ground";
  const voc = vocabulary(ctx);
  const dissolve = (m: string) => m === "dissolve" || m === "rise";
  const enter = ctx.instant ? "cut" : p.enter ?? (dissolve(voc.photo.enter) ? "dissolve" : "cut");
  const exit = ctx.instant ? "cut" : p.exit ?? (dissolve(voc.photo.exit) ? "dissolve" : "cut");
  const b = p.bleed ?? 0;
  const opacity = onOff(ctx, p.at, p.until, enter === "cut" ? "cut" : "fade", exit === "cut" ? "cut" : "fade");
  return [{ id, kind: "rect", x: b ? -b : 0, y: b ? -b : 0, w: ctx.width + 2 * b, h: ctx.height + 2 * b, fill: p.color, layer: -2, tracks: { opacity } } as Node];
};
