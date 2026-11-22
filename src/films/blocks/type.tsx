// Demo films for the type blocks: kinetic words, captions, a lower third, a code block and a terminal.
// Each block shows in the three demo systems, a 16:9 cut and Console (the one-frame check),
// plus the systems its device belongs to.
import { DEMO_SYSTEMS, filmsFor, type Entry } from "./film";
import { scene as lowerThird } from "../../../examples/scenes/lowerThird";
import { scene as captions } from "../../../examples/scenes/captions";
import { scene as kineticWords } from "../../../examples/scenes/kineticWords";
import { scene as codeBlock } from "../../../examples/scenes/codeBlock";
import { scene as terminal } from "../../../examples/scenes/terminal";

export const FILMS: Record<string, Entry> = {
  ...filmsFor("block-lowerThird", lowerThird, 5.5, { systems: [...DEMO_SYSTEMS, "console"], wide: true }),
  ...filmsFor("block-captions", captions, 10, { systems: [...DEMO_SYSTEMS, "console"], wide: true }),
  // Calm systems hold each phrase longer (their density rules), so their films run longer.
  ...filmsFor("block-kineticWords", kineticWords, 12.5, { systems: [...DEMO_SYSTEMS, "console"], wide: true }),
  ...filmsFor("block-kineticWords", kineticWords, 7, { systems: ["kinetic"] }),
  ...filmsFor("block-kineticWords", kineticWords, 7.5, { systems: ["courtside"] }),
  ...filmsFor("block-codeBlock", codeBlock, 10.5, { systems: [...DEMO_SYSTEMS, "console", "manual"], wide: true }),
  ...filmsFor("block-terminal", terminal, 14.5, { systems: [...DEMO_SYSTEMS, "console", "manual"], wide: true }),
};
