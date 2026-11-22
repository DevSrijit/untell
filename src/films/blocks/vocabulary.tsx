// Films for the motion vocabulary per system (photo, shape, title, text, ground), and the blocks
// that give each system its signature (fitText, wordSeries, lockup, endCard). One scene each, shown in
// systems that fade, mask, cut and stamp, and in a system whose display type bleeds.
import * as vocab from "../../../examples/scenes/vocabulary";
import * as end from "../../../examples/scenes/endCard";
import * as crop from "../../../examples/scenes/photoCrop";
import { filmsFor } from "./film";

export const FILMS = {
  ...filmsFor("block-vocabulary", vocab.scene, vocab.seconds, { wide: true, systems: ["spec", "ma", "riso", "kinetic", "console", "nocturne"] }),
  ...filmsFor("block-endCard", end.scene, end.seconds, { wide: true, systems: ["spec", "ma", "kinetic", "riso", "console"] }),
  ...filmsFor("block-photoCrop", crop.scene, crop.seconds, { wide: true, systems: ["pop", "spec", "console"] }),
};
