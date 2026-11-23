// When a 3D view shows: the frame grid of the opacity window its block gives it. Both renderers keep this grid.
import { shownFrames } from "../scene/context";
import type { Scene3D } from "./spec";

/**
 * True when a 3D scene shows on frame `frame`: the frames from frameOf(at) up to, not including, frameOf(until). The
 * product block's opacity window (`windows([[at, until]])`) uses this grid; the view must use it too. (It used t >= at
 * and t < until: at a cut at t the old view hid and the new view's opacity was still 0 on frame t * fps, so that frame
 * showed no object.)
 */
export function shownOn(spec: Pick<Scene3D, "at" | "until">, frame: number): boolean {
  const { on, off } = shownFrames(spec.at, spec.until);
  return frame >= on && frame < off;
}
