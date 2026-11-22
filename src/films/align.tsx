// The alignment films: the kiln queue frame of the ui kit in Studio at 16:9, frozen and snapped, and
// the planted fixtures of the align/* checks. The live scene is in alignLive.tsx, so a kit change never breaks these. See scripts/snap/cli.ts and systems/playbooks/ALIGN.md.
import * as kiln from "../../scripts/snap/fixtures/kilnQueue";
import * as kilnSnapped from "../../scripts/snap/fixtures/kilnQueueSnapped";
import * as planted from "../../scripts/snap/fixtures/planted";
import * as guidesDemo from "../../scripts/snap/fixtures/guidesDemo";
import { sceneEntry, type Entry } from "./blocks/film";

export const FILMS: Record<string, Entry> = {
  // The real bad case: the frame as a person first saw it, frozen (both faults).
  "align-kiln": sceneEntry(kiln.scene, kiln.system, kiln.seconds, 1920, 1080),
  // The good case: the same frame with every proposal accepted (its SNAPS table).
  "align-kiln-snapped": sceneEntry(kilnSnapped.scene, kilnSnapped.system, kilnSnapped.seconds, 1920, 1080),
  // One planted flaw for each align/* check, and the same scene with each flaw fixed.
  "align-planted-bad": sceneEntry(planted.bad.scene, planted.system, planted.seconds, 1920, 1080),
  "align-planted-good": sceneEntry(planted.good.scene, planted.system, planted.seconds, 1920, 1080),
  // A scene that names its guides (a 6-column grid, a baseline unit, a fold line), with two planted misses on them.
  "align-guides": sceneEntry(guidesDemo.scene, guidesDemo.system, guidesDemo.seconds, 1920, 1080),
};

