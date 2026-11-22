// The numbers group: counter, bigStat, meter and ranking, each in the demo systems, the 16:9 cut,
// Courtside (bleed type, fast curves) and Console (one-frame motion). Plus a stress film of awkward values.
import { scene as counter } from "../../../examples/scenes/counter";
import { scene as bigStat } from "../../../examples/scenes/bigStat";
import { scene as meter } from "../../../examples/scenes/meter";
import { scene as ranking } from "../../../examples/scenes/ranking";
import { scene as stress, STRESS_SECONDS } from "../../../examples/scenes/numbersStress";
import { DEMO_SYSTEMS, filmsFor, type Entry } from "./film";

const SYSTEMS = [...DEMO_SYSTEMS, "courtside", "console"] as const;

export const FILMS: Record<string, Entry> = {
  ...filmsFor("block-counter", counter, 6, { systems: SYSTEMS, wide: true }),
  ...filmsFor("block-bigStat", bigStat, 6, { systems: SYSTEMS, wide: true }),
  ...filmsFor("block-meter", meter, 6, { systems: SYSTEMS, wide: true }),
  ...filmsFor("block-ranking", ranking, 8, { systems: SYSTEMS, wide: true }),
  ...filmsFor("block-numbers-stress", stress, STRESS_SECONDS, { systems: ["spec", "pop"], wide: true }),
};
