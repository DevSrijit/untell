// Films for the 3D layer's own tests: shots that cut, product framing by silhouette, a product as the end's mark.
import { asDemos, sceneEntry, type Entry } from "./film";
import { scene as cut, seconds as cutSeconds } from "../../../examples/scenes/productCut";
import { frameScene, lineScene, OBJECTS, seconds as frameSeconds } from "../../../examples/scenes/productFrame";
import { scene as ends, seconds as endSeconds } from "../../../examples/scenes/ends";
import { scene as parityCuts, seconds as paritySeconds } from "../../../examples/scenes/parityCuts";
import { scene as duckBed, seconds as duckSeconds } from "../../../examples/scenes/duckBed";
import { SYSTEMS } from "../../system/systems";
import type { BLOCKS } from "../../system/scene/blocks";
import type { Ctx, Node } from "../../system/scene/types";

// Where a lamp film reads its media. The repository has no lamp model: add one with untell media add.
let lampMedia = (scene: (ctx: Ctx, B: typeof BLOCKS) => Node[]) => scene;

const framing: Record<string, Entry> = {};
for (const object of Object.keys(OBJECTS) as (keyof typeof OBJECTS)[]) {
  const scene = object === "lamp" ? lampMedia(frameScene(object)) : frameScene(object);
  for (const system of ["matte", "keynote", "studio"]) {
    framing[`three-frame-${object}-${system}`] = sceneEntry(scene, system, frameSeconds);
    framing[`three-frame-${object}-${system}-wide`] = sceneEntry(scene, system, frameSeconds, 1920, 1080);
    // The block map's "top" composition: a headline over the object, the object in the room under it.
    const line = object === "lamp" ? lampMedia(lineScene(object)) : lineScene(object);
    framing[`three-line-${object}-${system}`] = sceneEntry(line, system, frameSeconds);
  }
}

// The default end of every system (examples/scenes/ends.ts), at 9:16.
const endFilms: Record<string, Entry> = Object.fromEntries(SYSTEMS.map((s) => [`ends-${s.id}`, sceneEntry(ends, s.id, endSeconds)]));

const films: Record<string, Entry> = {
  ...endFilms,
  "parity-cuts-spec": sceneEntry(parityCuts, "spec", paritySeconds),
  "duck-bed-spec": sceneEntry(duckBed, "spec", duckSeconds),
  "three-cut-matte": sceneEntry(cut, "matte", cutSeconds),
  "three-cut-spec": sceneEntry(cut, "spec", cutSeconds),
  ...framing,
};

// The kit's own test films: short block demos (frame rules only).
export const FILMS = asDemos(films);
