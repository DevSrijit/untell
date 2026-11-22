// Demo films for the grammar blocks: carry, wipe, highlight, annotate and rows, and one short film
// that uses all five together.
import { filmsFor, type Entry } from "./film";
import { scene as carry } from "../../../examples/scenes/carry";
import { scene as wipe } from "../../../examples/scenes/wipe";
import { scene as highlight } from "../../../examples/scenes/highlight";
import { scene as annotate } from "../../../examples/scenes/annotate";
import { scene as rows } from "../../../examples/scenes/rows";
import { scene as demo } from "../../../examples/scenes/grammarDemo";

export const FILMS: Record<string, Entry> = {
  ...filmsFor("block-carry", carry, 8, { wide: true }),
  ...filmsFor("block-wipe", wipe, 7, { wide: true, systems: ["spec", "graphite", "pop", "cutout", "primary"] }),
  ...filmsFor("block-highlight", highlight, 12.3, { wide: true }),
  ...filmsFor("block-annotate", annotate, 7, { wide: true }),
  ...filmsFor("block-rows", rows, 5, { wide: true }),
  // All five together; Console shows the one-frame version, where the wipe is a cut.
  ...filmsFor("block-grammar", demo, 11, { wide: true, systems: ["spec", "graphite", "pop", "console"] }),
};
