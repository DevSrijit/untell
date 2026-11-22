// Demo films for the narrative blocks: steps, split, matrix and quote.
// Each block shows in Spec, Graphite and Pop at 9:16, in Spec at 16:9, and in Console (a one-frame system).
// Quote also shows in Nocturne and Ma, the two systems built for quote cards.
import { scene as steps } from "../../../examples/scenes/steps";
import { scene as split } from "../../../examples/scenes/split";
import { scene as matrix } from "../../../examples/scenes/matrix";
import { scene as quote } from "../../../examples/scenes/quote";
import { filmsFor, type Entry } from "./film";

export const FILMS: Record<string, Entry> = {
  ...filmsFor("block-steps", steps, 13, { wide: true }),
  ...filmsFor("block-steps", steps, 13, { systems: ["console"] }),
  ...filmsFor("block-split", split, 8, { wide: true }),
  ...filmsFor("block-split", split, 8, { systems: ["console"] }),
  ...filmsFor("block-matrix", matrix, 8, { wide: true }),
  ...filmsFor("block-matrix", matrix, 8, { systems: ["console"] }),
  ...filmsFor("block-quote", quote, 10, { wide: true }),
  ...filmsFor("block-quote", quote, 10, { systems: ["console", "nocturne"] }),
  // Ma moves slowly (1.8 s entrances), so its film is longer.
  ...filmsFor("block-quote", quote, 12, { systems: ["ma"] }),
};
