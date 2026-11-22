// The hoist (examples/scenes/hoist.ts): a Schematic drawing made with pulley, rope and figure, no place by hand. It has
// its own module, so the checks read no declaration from another film's source.
import { sceneEntry, type Entry } from "./film";
import { scene as hoist, seconds as hoistSeconds } from "../../../examples/scenes/hoist";

export const FILMS: Record<string, Entry> = {
  "proof-hoist-after": sceneEntry(hoist, "schematic", hoistSeconds),
};
