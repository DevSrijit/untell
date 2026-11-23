// Films for the sound helpers and the re-timed Courtside reel.
// Record: bun scripts/record.ts --force --films src/films/sound.tsx <id>
import * as courtsideSync from "../../examples/reels/courtside-sync";
import * as soundBeats from "../../examples/scenes/sound-beats";
import { filmsFor, sceneEntry, type Entry } from "./blocks/film";

export const FILMS: Record<string, Entry> = {
  ...filmsFor("block-sound-beats", soundBeats.scene, soundBeats.seconds, { systems: ["spec", "graphite", "pop", "console"], wide: true }),
  "reel-courtside-sync": sceneEntry(courtsideSync.scene, courtsideSync.system, courtsideSync.seconds),
};
