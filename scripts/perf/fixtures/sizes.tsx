// The size fixture: the text scene at 9:16, 16:9 and 1:1, two seconds each, and the camera-whip scenes. scripts/perf/record.test.ts records
// them and checks that every frame has the film's size.
import { scene } from "../../../examples/scenes/text";
import * as whip from "../../../examples/scenes/whip";
import * as wipeExit from "../../../examples/scenes/wipeExit";
import { sceneEntry, type Entry } from "../../../src/films/blocks/film";

export const FILMS: Record<string, Entry> = {
  "size-1080x1920": sceneEntry(scene, "spec", 2, 1080, 1920),
  "size-1920x1080": sceneEntry(scene, "spec", 2, 1920, 1080),
  "size-1080x1080": sceneEntry(scene, "spec", 2, 1080, 1080),
  // Camera whips: the camera's blur filter (layout.blurRegion) on the frames of a fast pan, and a whip to a second frame.
  "whip-1080x1920": sceneEntry(whip.scene, "courtside", whip.seconds, 1080, 1920),
  "whip-1920x1080": sceneEntry(whip.scene, "courtside", whip.seconds, 1920, 1080),
  "wipe-exit-1920x1080": sceneEntry(wipeExit.scene, "courtside", wipeExit.seconds, 1920, 1080),
};
