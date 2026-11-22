// The signals group: waveform, timeline and number line. Each block shows in the demo systems,
// in Schematic (dark, hairlines) and Console (one-frame motion), and in a 16:9 cut.
import { scene as numberLine } from "../../../examples/scenes/numberLine";
import { scene as timeline } from "../../../examples/scenes/timeline";
import { scene as waveform } from "../../../examples/scenes/waveform";
import { DEMO_SYSTEMS, filmsFor, type Entry } from "./film";

const SYSTEMS = [...DEMO_SYSTEMS, "schematic", "console"];

export const FILMS: Record<string, Entry> = {
  ...filmsFor("block-waveform", waveform, 9, { systems: SYSTEMS, wide: true }),
  ...filmsFor("block-timeline", timeline, 9, { systems: SYSTEMS, wide: true }),
  ...filmsFor("block-numberLine", numberLine, 9, { systems: SYSTEMS, wide: true }),
};
