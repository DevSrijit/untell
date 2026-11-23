// Real 3D models (glTF files by real artists) through the product block, each in Matte and one light
// system, and the Matte reel with a real model in place of the code-drawn pepper mill.
// The models and their licences are in assets/media.json (model-*).
import * as armchair from "../../examples/scenes/model-armchair";
import * as lantern from "../../examples/scenes/model-lantern";
import * as vase from "../../examples/scenes/model-vase";
import * as matteModel from "../../examples/reels/matte-model";
import { filmsFor, sceneEntry, type Entry } from "./blocks/film";

export const FILMS: Record<string, Entry> = {
  ...filmsFor("model-lantern", lantern.scene, lantern.seconds, { systems: ["matte", "studio"] }),
  ...filmsFor("model-armchair", armchair.scene, armchair.seconds, { systems: ["matte", "studio"] }),
  ...filmsFor("model-vase", vase.scene, vase.seconds, { systems: ["matte", "studio"] }),
  "reel-matte-model": sceneEntry(matteModel.scene, matteModel.system, matteModel.seconds),
};
