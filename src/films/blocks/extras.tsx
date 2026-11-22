// The arrow, box and camera blocks, in one scene: a pointer followed by the camera.
import { scene, seconds } from "../../../examples/scenes/pointer";
import * as shapeScene from "../../../examples/scenes/shape";
import { filmsFor } from "./film";

export const FILMS = {
  ...filmsFor("block-pointer", scene, seconds, { wide: true, systems: ["spec", "schematic", "pop", "console"] }),
  ...filmsFor("block-shape", shapeScene.scene, shapeScene.seconds, { wide: true, systems: ["primary", "spec", "pop", "console"] }),
};
