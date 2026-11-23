// The defaults read-through films: the defaults scene (examples/scenes/defaults.ts) in each of the 20 systems, one
// film per system at 9:16, and the product systems at 16:9. Record one frame of each at the scene's HERO moment.
// They are demos (3 s read-throughs): the detector runs its frame rules only.
import { scene, seconds } from "../../examples/scenes/defaults";
import { SYSTEMS } from "../system/systems";
import { sceneEntry, type Entry } from "./blocks/film";

export const FILMS: Record<string, Entry> = {
  ...Object.fromEntries(SYSTEMS.map((s) => [`defaults-${s.id}`, sceneEntry(scene, s.id, seconds, 1080, 1920, { demo: true })] as const)),
  ...Object.fromEntries(SYSTEMS.map((s) => [`defaults-${s.id}-wide`, sceneEntry(scene, s.id, seconds, 1920, 1080, { demo: true })] as const)),
};
