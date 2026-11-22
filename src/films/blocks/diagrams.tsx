// Demo films for the diagram blocks: flow, sequence, tree and cycle. Each block shows in the three
// demo systems and a 16:9 cut. Flow also shows in Schematic and every block in Console, a one-frame system.
import { filmsFor, DEMO_SYSTEMS, type Entry } from "./film";
import { scene as sequence } from "../../../examples/scenes/sequence";
import { scene as flow } from "../../../examples/scenes/flow";
import { scene as tree } from "../../../examples/scenes/tree";
import { scene as cycle } from "../../../examples/scenes/cycle";

export const FILMS: Record<string, Entry> = {
  ...filmsFor("block-cycle", cycle, 13.5, { wide: true, systems: [...DEMO_SYSTEMS, "console"] }),
  ...filmsFor("block-tree", tree, 10.5, { wide: true, systems: [...DEMO_SYSTEMS, "console"] }),
  ...filmsFor("block-flow", flow, 14, { wide: true, systems: [...DEMO_SYSTEMS, "schematic", "console"] }),
  ...filmsFor("block-sequence", sequence, 13.5, { wide: true, systems: [...DEMO_SYSTEMS, "console"] }),
};
