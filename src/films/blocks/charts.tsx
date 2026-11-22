// The chart blocks of the charts group, in the demo systems, at 16:9, and in Console (a one-frame system).
// The stress films show awkward data: long names, negative and tiny values, many categories, a broken
// axis, ties, crossing lines and changes in both directions.
import { scene as barScene } from "../../../examples/scenes/barChart";
import { scene as barStress } from "../../../examples/scenes/barChartStress";
import { scene as barPaths } from "../../../examples/scenes/barChartPaths";
import { scene as slopeScene } from "../../../examples/scenes/slopeChart";
import { scene as slopeStress } from "../../../examples/scenes/slopeChartStress";
import { scene as dumbbellScene } from "../../../examples/scenes/dumbbell";
import { scene as dumbbellStress } from "../../../examples/scenes/dumbbellStress";
import { filmsFor, type Entry } from "./film";

const CONSOLE = { systems: ["console"] } as const;

export const FILMS: Record<string, Entry> = {
  ...filmsFor("block-barChart", barScene, 7, { wide: true }),
  ...filmsFor("block-barChart", barScene, 7, CONSOLE),
  ...filmsFor("block-barChart-stress", barStress, 15.5, { wide: true }),
  ...filmsFor("block-barChart-paths", barPaths, 14.5, { systems: ["spec"], wide: true }),
  ...filmsFor("block-slopeChart", slopeScene, 8, { wide: true }),
  ...filmsFor("block-slopeChart", slopeScene, 8, CONSOLE),
  ...filmsFor("block-slopeChart-stress", slopeStress, 8, { wide: true }),
  ...filmsFor("block-dumbbell", dumbbellScene, 8, { wide: true }),
  ...filmsFor("block-dumbbell", dumbbellScene, 8, CONSOLE),
  ...filmsFor("block-dumbbell-stress", dumbbellStress, 8, { wide: true }),
};
