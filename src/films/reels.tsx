// Phase 2 reels: one per design system, made by agents from SYSTEM.md and the blocks. Each file in
// examples/reels/<system>.ts exports `system`, `seconds` and `scene`; it records as reel-<system> (9:16).
import * as consoleReel from "../../examples/reels/console";
import * as courtside from "../../examples/reels/courtside";
import * as cutout from "../../examples/reels/cutout";
import * as graphite from "../../examples/reels/graphite";
import * as keynote from "../../examples/reels/keynote";
import * as kinetic from "../../examples/reels/kinetic";
import * as ma from "../../examples/reels/ma";
import * as manual from "../../examples/reels/manual";
import * as mark from "../../examples/reels/mark";
import * as matte from "../../examples/reels/matte";
import * as nocturne from "../../examples/reels/nocturne";
import * as noir from "../../examples/reels/noir";
import * as pop from "../../examples/reels/pop";
import * as primary from "../../examples/reels/primary";
import * as raw from "../../examples/reels/raw";
import * as riso from "../../examples/reels/riso";
import * as schematic from "../../examples/reels/schematic";
import * as spec from "../../examples/reels/spec";
import * as studio from "../../examples/reels/studio";
import * as title from "../../examples/reels/title";
import { sceneEntry, type Entry } from "./blocks/film";

const reels = { console: consoleReel, courtside, cutout, graphite, keynote, kinetic, ma, manual, mark, matte, nocturne, noir, pop, primary, raw, riso, schematic, spec, studio, title };
export const FILMS: Record<string, Entry> = Object.fromEntries(
  [
    ...Object.entries(reels).map(([id, m]) => [`reel-${id}`, sceneEntry(m.scene, m.system, m.seconds)] as const),
    // The media test: the Courtside reel without its media.
    ["reel-courtside-code", sceneEntry(courtside.sceneCodeOnly, courtside.system, courtside.seconds)] as const,
  ],
);
