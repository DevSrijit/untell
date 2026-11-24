// The defaults scene (examples/scenes/defaults.ts) in each of the 20 systems, one film per system. build.ts records
// one frame of each (frame 60, the scene's hero moment) for the systems grid.
import { scene, seconds } from "../../../../examples/scenes/defaults";
import { SYSTEMS } from "../../../../src/system/systems";
import { sceneEntry, type Entry } from "../../../../src/films/blocks/film";

export const FILMS: Record<string, Entry> = Object.fromEntries(
  SYSTEMS.map((s) => [`readme-defaults-${s.id}`, sceneEntry(scene, s.id, seconds)] as const),
);
